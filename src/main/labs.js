'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateLab, validateComposeFile, tokenize } = require('./security');
const docker = require('./docker');

const LAB_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const LAB_FILE = /^(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|\.env|[A-Za-z0-9][A-Za-z0-9_.-]{0,60}\.(?:conf|html|js|json|txt|sh|css))$/;

class LabService {
  constructor(app, emit) {
    this.app = app;
    this.emit = emit || (() => {});
    this.baseDir = path.join(app.getPath('userData'), 'labs');
    this.consented = false;
  }

  dir(labId) {
    if (!LAB_ID.test(String(labId || ''))) throw new Error('Invalid lab id');
    return path.join(this.baseDir, labId);
  }

  ensureDir(labId) {
    const dir = this.dir(labId);
    fs.mkdirSync(dir, { recursive: true });
    const readme = path.join(dir, 'README.txt');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, 'OpsDeck lab workspace. Files here are isolated to this lab.\nCommands are constrained: no privileged mode, host networking, host bind mounts, or Docker socket access.\n');
    }
    return dir;
  }

  async status() {
    const st = await docker.status();
    let containers = 0;
    let networks = 0;
    let volumes = 0;
    if (st.available) {
      const [c, n, v] = await Promise.all([
        docker.runRaw(['ps', '-a', '--filter', 'label=opsdeck.lab=1', '--format', '{{.ID}}']),
        docker.runRaw(['network', 'ls', '--filter', 'label=opsdeck.lab=1', '--format', '{{.ID}}']),
        docker.runRaw(['volume', 'ls', '--filter', 'label=opsdeck.lab=1', '--format', '{{.Name}}']),
      ]);
      containers = c.ok ? c.stdout.trim().split('\n').filter(Boolean).length : 0;
      networks = n.ok ? n.stdout.trim().split('\n').filter(Boolean).length : 0;
      volumes = v.ok ? v.stdout.trim().split('\n').filter(Boolean).length : 0;
    }
    return {
      available: st.available,
      reason: st.reason || null,
      containers,
      networks,
      volumes,
      baseDir: this.baseDir,
      consentRequired: !this.consented,
    };
  }

  consent() {
    this.consented = true;
    return { ok: true };
  }

  async run({ labId, command, consent }) {
    if (!this.consented && !consent) {
      return { ok: false, needsConsent: true, error: 'Explicit consent is required before running lab commands.' };
    }
    this.consented = true;
    const dir = this.ensureDir(labId);
    const validation = validateLab(command, { labDir: dir });
    if (!validation.ok) return { ok: false, error: validation.threats.join(' '), blocked: true };

    let tokens = validation.tokens;
    tokens = this.harden(tokens, labId, dir);

    // Validate any compose files in the lab before Compose reads them.
    if (tokens[1] === 'compose') {
      const files = fs.readdirSync(dir).filter((f) => /^(docker-)?compose\.ya?ml$/i.test(f));
      for (const file of files) {
        const check = validateComposeFile(fs.readFileSync(path.join(dir, file), 'utf8'));
        if (!check.ok) return { ok: false, error: check.threats.join(' '), blocked: true };
      }
    }

    this.emit({ type: 'lab:run', labId, command: tokens.join(' ') });
    const res = await docker.runRaw(tokens.slice(1), { timeout: 180000 });
    return {
      ok: res.ok,
      stdout: res.stdout.slice(-120000),
      stderr: res.stderr.slice(-60000),
      code: res.code,
      timedOut: !!res.timedOut,
      command: tokens.join(' '),
      blocked: false,
    };
  }

  harden(tokens, labId, dir) {
    const out = [...tokens];
    const sub = out[1];
    const service = out[2];

    if (sub === 'run' || sub === 'create') {
      const constraints = [
        '--label', 'opsdeck.lab=1',
        '--label', `opsdeck.lab.id=${labId}`,
        '--cap-drop', 'ALL',
        '--cap-add', 'CHOWN', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'SETGID',
        '--cap-add', 'SETUID', '--cap-add', 'NET_BIND_SERVICE',
        '--security-opt', 'no-new-privileges',
        '--pids-limit', '128',
        '--memory', '256m', '--memory-swap', '256m',
        '--cpus', '0.5',
      ];
      out.splice(2, 0, ...constraints);
    } else if (sub === 'build') {
      out.splice(2, 0, '--label', 'opsdeck.lab=1', '--label', `opsdeck.lab.id=${labId}`);
    } else if (sub === 'volume' && service === 'create') {
      out.splice(3, 0, '--label', 'opsdeck.lab=1', '--label', `opsdeck.lab.id=${labId}`);
    } else if (sub === 'network' && service === 'create') {
      out.splice(3, 0, '--label', 'opsdeck.lab=1', '--label', `opsdeck.lab.id=${labId}`);
    } else if (sub === 'compose') {
      const project = `opsdeck-lab-${labId}`;
      if (!out.includes('-p') && !out.includes('--project-name')) {
        out.splice(2, 0, '-p', project, '--project-directory', dir);
      }
      // Compose up with a project prefix guarantees reset can find every resource.
      const action = out.find((t, i) => i > 2 && !t.startsWith('-'));
      if (action === 'up' && !out.includes('-d') && !out.includes('--detach')) out.push('-d');
    }
    return out;
  }

  writeFile({ labId, name, content }) {
    if (!LAB_FILE.test(String(name || ''))) throw new Error('That filename is not allowed in labs.');
    const dir = this.ensureDir(labId);
    const text = String(content ?? '');
    if (text.length > 64 * 1024) throw new Error('Lab files are limited to 64 KB.');
    if (/\.ya?ml$/i.test(name)) {
      const check = validateComposeFile(text);
      if (!check.ok) return { ok: false, error: check.threats.join(' '), blocked: true };
    }
    fs.writeFileSync(path.join(dir, name), text, 'utf8');
    return { ok: true, path: path.join(dir, name) };
  }

  readFile({ labId, name }) {
    const dir = this.ensureDir(labId);
    if (!name || name.includes('/') || name.includes('\\')) throw new Error('Invalid lab file name');
    const target = path.join(dir, name);
    if (!target.startsWith(dir + path.sep)) throw new Error('Invalid lab path');
    if (!fs.existsSync(target)) return { ok: false, error: 'File not found' };
    return { ok: true, content: fs.readFileSync(target, 'utf8'), path: target };
  }

  listFiles(labId) {
    const dir = this.ensureDir(labId);
    return fs.readdirSync(dir).filter((f) => f !== 'README.txt').map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  }

  async reset(labId) {
    const dir = this.dir(labId);
    const project = `opsdeck-lab-${labId}`;
    const results = [];

    if (await docker.status().then((s) => s.available).catch(() => false)) {
      const composeDown = await docker.runRaw(['compose', '-p', project, 'down', '-v', '--remove-orphans'], { timeout: 60000 });
      results.push({ step: 'compose down', ok: composeDown.ok });

      const ids = await docker.runRaw(['ps', '-aq', '--filter', `label=opsdeck.lab.id=${labId}`]);
      if (ids.ok && ids.stdout.trim()) {
        const rm = await docker.runRaw(['rm', '-f', ...ids.stdout.trim().split('\n').filter(Boolean)], { timeout: 60000 });
        results.push({ step: 'remove containers', ok: rm.ok });
      }
      const nets = await docker.runRaw(['network', 'ls', '-q', '--filter', `label=opsdeck.lab.id=${labId}`]);
      if (nets.ok && nets.stdout.trim()) {
        const rm = await docker.runRaw(['network', 'rm', ...nets.stdout.trim().split('\n').filter(Boolean)], { timeout: 30000 });
        results.push({ step: 'remove networks', ok: rm.ok });
      }
      const vols = await docker.runRaw(['volume', 'ls', '-q', '--filter', `label=opsdeck.lab.id=${labId}`]);
      if (vols.ok && vols.stdout.trim()) {
        const rm = await docker.runRaw(['volume', 'rm', '-f', ...vols.stdout.trim().split('\n').filter(Boolean)], { timeout: 30000 });
        results.push({ step: 'remove volumes', ok: rm.ok });
      }
      const stale = await docker.runRaw(['ps', '-aq', '--filter', `label=opsdeck.lab=1`]);
      if (stale.ok && stale.stdout.trim()) {
        await docker.runRaw(['rm', '-f', ...stale.stdout.trim().split('\n').filter(Boolean)], { timeout: 60000 });
      }
    }

    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    docker.invalidate('containers');
    docker.invalidate('networks');
    docker.invalidate('volumes');
    docker.invalidate('overview');
    this.emit({ type: 'lab:reset', labId });
    return { ok: true, results };
  }
}

module.exports = { LabService };
