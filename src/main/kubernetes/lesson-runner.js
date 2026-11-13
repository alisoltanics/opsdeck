'use strict';

/**
 * Runs the commands shown in Academy lessons against the selected cluster.
 *
 * Still shell-free: a lesson snippet is parsed into statements (`&&`, pipes,
 * heredocs, redirects), each stage is an argv executed with spawn, and the few
 * text filters lessons use (grep, head, base64 -d ...) are implemented here.
 * The selected context is enforced; kubeconfig edits stay blocked.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { tokenize, parseKubectl } = require('./kubectl-runner');
const { scrub } = require('./exec');

const MAX_OUT = 200000;
const MAX_STATEMENTS = 40;

function joinLines(script) {
  const out = [];
  const lines = String(script || '').replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    let body = null;
    if (heredoc) {
      body = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== heredoc[2]) { body.push(lines[i]); i += 1; }
      line = line.replace(heredoc[0], '').trim();
    }
    while (/\\\s*$/.test(line) && i + 1 < lines.length) { i += 1; line = `${line.replace(/\\\s*$/, '')} ${lines[i].trim()}`; }
    out.push({ line: line.trim(), stdin: body ? `${body.join('\n')}\n` : null });
  }
  return out;
}

function splitOutside(text, separator) {
  const parts = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { current += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (text.startsWith(separator, i) && !(separator === '|' && (text[i + 1] === '|' || text[i - 1] === '|'))) {
      parts.push(current.trim());
      current = '';
      i += separator.length - 1;
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

function proc(command, args, { input = null, timeout = 30000, env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { env: { ...process.env, NO_COLOR: '1', ...env }, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) { resolve({ ok: false, code: 1, stdout: '', stderr: error.message }); return; }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.on('data', (d) => { if (stdout.length < MAX_OUT) stdout += d; });
    child.stderr.on('data', (d) => { if (stderr.length < 20000) stderr += d; });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, code: 1, stdout, stderr: error.code === 'ENOENT' ? `${command} is not installed.` : error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? 1, stdout, stderr, timedOut });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input == null ? undefined : input);
  });
}

function filterStage(tokens, input) {
  const [name, ...rest] = tokens;
  const lines = String(input).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const flags = rest.filter((a) => a.startsWith('-') && a !== '-');
  const values = rest.filter((a) => !a.startsWith('-'));
  if (name === 'grep' || name === 'egrep') {
    const re = new RegExp(values[0] || '', flags.some((f) => /i/.test(f)) ? 'i' : '');
    const invert = flags.some((f) => /v/.test(f));
    return `${lines.filter((l) => re.test(l) !== invert).join('\n')}\n`;
  }
  if (name === 'head' || name === 'tail') {
    const n = Number((flags.find((f) => /^-\d+$/.test(f)) || '').slice(1)) || Number(values[0]) || Number(rest[rest.indexOf('-n') + 1]) || 10;
    return `${(name === 'head' ? lines.slice(0, n) : lines.slice(-n)).join('\n')}\n`;
  }
  if (name === 'base64') {
    if (!flags.some((f) => /d|decode/.test(f))) return Buffer.from(input).toString('base64');
    return Buffer.from(String(input).trim(), 'base64').toString('utf8');
  }
  if (name === 'wc') return `${lines.length}\n`;
  if (name === 'less' || name === 'more' || name === 'cat') return input;
  if (name === 'sort') return `${[...lines].sort().join('\n')}\n`;
  if (name === 'uniq') return `${lines.filter((l, i) => l !== lines[i - 1]).join('\n')}\n`;
  if (name === 'sed' && flags.includes('-n') && values[0]) {
    const m = /^\/(.+?)\/,\/(.+?)\/p$/.exec(values[0]);
    if (m) {
      const start = new RegExp(m[1]);
      const end = new RegExp(m[2]);
      const out = [];
      let on = false;
      for (const l of lines) {
        if (!on && start.test(l)) on = true;
        if (on) out.push(l);
        if (on && end.test(l)) on = false;
      }
      return `${out.join('\n')}\n`;
    }
    const p = /^\/(.+?)\/p$/.exec(values[0]);
    if (p) return `${lines.filter((l) => new RegExp(p[1]).test(l)).join('\n')}\n`;
  }
  throw new Error(`The "${name}" filter is not supported here. Run the kubectl part and filter the output yourself.`);
}

function resolveFile(name, yamls) {
  const base = path.basename(name);
  const stem = base.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const byTitle = yamls.find((y) => path.basename(String(y.title || '')) === base);
  if (byTitle) return byTitle.code;
  const byKind = yamls.find((y) => {
    const kind = (/kind:\s*(\w+)/.exec(y.code) || [])[1];
    const hay = `${y.title || ''} ${kind || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    return stem && hay && (hay.includes(stem) || stem.includes(hay));
  });
  if (byKind) return byKind.code;
  return yamls.length === 1 ? yamls[0].code : null;
}

async function runLessonScript({ script, yamls = [], context, namespace, env = {} }) {
  const statements = joinLines(script).slice(0, MAX_STATEMENTS);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-lesson-'));
  const steps = [];
  const store = new Map();
  try {
    const materialize = (tokens) => {
      for (let i = 0; i < tokens.length; i += 1) {
        const t = tokens[i];
        let file = null;
        if ((t === '-f' || t === '--filename') && tokens[i + 1] && tokens[i + 1] !== '-') file = tokens[i + 1];
        else if (/^--(filename|from-file)=/.test(t)) file = t.slice(t.indexOf('=') + 1);
        else if (t === '--from-file' && tokens[i + 1]) file = tokens[i + 1];
        if (!file) continue;
        if (/^[a-z]+:\/\//i.test(file) || path.isAbsolute(file) || file.includes('..')) throw new Error(`Only the example files from this lesson can be used (${file}).`);
        const target = path.join(dir, path.basename(file));
        if (!fs.existsSync(target)) {
          const content = store.get(path.basename(file)) ?? resolveFile(file, yamls);
          if (content == null) throw new Error(`${file} does not exist. Run the YAML block that defines it first.`);
          fs.writeFileSync(target, content);
        }
      }
    };

    for (const st of statements) {
      const chain = splitOutside(st.line, '&&');
      let failed = false;
      for (const part of chain) {
        if (failed) break;
        const stages = splitOutside(part, '|');
        const redirect = /\s>\s*([^\s>]+)\s*$/.exec(stages[stages.length - 1] || '');
        if (redirect) stages[stages.length - 1] = stages[stages.length - 1].slice(0, redirect.index).trim();
        const shown = part;
        let data = st.stdin;
        const step = { command: shown, ok: true, stdout: '', stderr: '', code: 0 };
        try {
          for (let s = 0; s < stages.length; s += 1) {
            const stage = stages[s];
            let tokens = tokenize(stage);
            if (s === 0 && tokens[0] === 'cat' && data != null && stages.length > 1) { continue; }
            if (s > 0 && !['kubectl', 'helm'].includes(tokens[0])) { data = filterStage(tokens, data || ''); continue; }
            if (tokens[0] === 'kubectl') {
              tokens = tokens.slice(1);
              let timeout = 45000;
              if (/^(rollout|wait)$/.test(tokens[0]) || tokens.includes('--wait')) timeout = 120000;
              const watching = tokens.some((a) => a === '-w' || a === '--watch');
              if (watching) timeout = 6000;
              // Interactive flags cannot work without a terminal; run non-interactively.
              const verb = tokens[0];
              let drop = tokens.filter((a) => !['-it', '-ti', '-i', '-t', '--stdin', '--tty'].includes(a));
              const hadTty = drop.length !== tokens.length;
              if (verb === 'run' && drop.includes('--rm') && hadTty) drop = [...drop, '--attach'];
              if (hadTty) {
                const tail = drop.slice(drop.indexOf('--') + 1);
                if (drop.includes('--') && /^(sh|bash|ash)$/.test(tail[0]) && tail.length === 1) throw new Error('This opens an interactive shell. Use the Shell button on the pod, or run a single command instead.');
              }
              materialize(drop);
              const asIdx = drop.findIndex((a) => a === '--as' || a.startsWith('--as=') || a.startsWith('--as-group'));
              const impersonate = verb === 'auth' ? drop.filter((a, i) => a === '--as' || a.startsWith('--as=') || (drop[i - 1] === '--as')) : [];
              const clean = asIdx >= 0 && verb === 'auth' ? drop.filter((a, i) => !(a === '--as' || a.startsWith('--as=') || drop[i - 1] === '--as')) : drop;
              const parsed = parseKubectl(`kubectl ${clean.map((a) => JSON.stringify(a)).join(' ')}`, { context, namespace, allowContext: context, lesson: true });
              const res = await proc('kubectl', [...parsed.args, ...impersonate], { input: data, timeout, env, cwd: dir });
              data = res.stdout;
              step.stderr = scrub(res.stderr || '', 6000);
              step.code = res.code;
              step.ok = res.ok || (watching && res.timedOut);
              step.context = context;
              step.namespace = parsed.namespace;
              if (watching && res.timedOut) step.stderr = 'Stopped watching after a few seconds. Run it in a terminal to keep following.';
              if (!step.ok) break;
            } else if (tokens[0] === 'helm') {
              const args = tokens.slice(1);
              if (args.some((a) => /^--(kubeconfig|kube-context|kube-token|kube-as-user|kube-apiserver)/.test(a))) throw new Error('The kube context is controlled by OpsDeck.');
              materialize(args);
              const res = await proc('helm', [...args, '--kube-context', context], { input: data, timeout: 120000, env, cwd: dir });
              data = res.stdout;
              step.stderr = scrub(res.stderr || '', 6000);
              step.code = res.code;
              step.ok = res.ok;
              if (!step.ok) break;
            } else {
              step.skipped = true;
              step.stderr = `Skipped: "${tokens[0]}" runs inside a pod or on your machine, not against the cluster.`;
              data = '';
              break;
            }
          }
          step.stdout = String(data || '').slice(0, MAX_OUT);
          if (redirect && step.ok && !step.skipped) {
            const name = path.basename(redirect[1]);
            fs.writeFileSync(path.join(dir, name), step.stdout);
            store.set(name, step.stdout);
            step.stdout = '';
            step.stderr = `${step.stderr}${step.stderr ? '\n' : ''}Saved to ${name} for later steps.`.trim();
          }
        } catch (error) {
          step.ok = false;
          step.code = 1;
          step.stderr = error.message;
        }
        steps.push(step);
        if (!step.ok && !step.skipped) failed = true;
      }
      if (failed) break;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { ok: steps.length > 0 && steps.every((s) => s.ok || s.skipped), steps, context, namespace };
}

module.exports = { runLessonScript, joinLines, splitOutside };
