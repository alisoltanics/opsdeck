'use strict';

/**
 * OpsDeck AI renderer.
 *
 * The renderer never holds an API key and never calls a provider. It asks the
 * main process for a live context snapshot and for an answer. This module owns
 * the drawer, the chat history, the configuration forms and every "Ask AI"
 * entry point in the workspace.
 */
(function () {
  const { esc, titleCase, shortId } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const api = window.opsdeck;

  const MAX_SESSIONS = 12;
  const MAX_MESSAGES = 40;
  const KINDS = new Set(['container', 'image', 'volume', 'network', 'compose', 'lesson', 'course', 'page', 'academy']);

  const state = {
    config: null,
    configError: null,
    sessions: new Map(),
    active: null,
  };

  // ------------------------------------------------------------------ targets

  function routeTarget(route) {
    if (!route) return { kind: 'page', page: 'overview' };
    if (route.name === 'academy') {
      const section = route.parts?.[0];
      if (section === 'lesson' && route.parts?.[1]) return { kind: 'lesson', id: route.parts[1] };
      if (section === 'course' && route.parts?.[1]) return { kind: 'course', id: route.parts[1] };
      return { kind: 'academy' };
    }
    return { kind: 'page', page: route.name || 'overview' };
  }

  function currentRoute() {
    return OD.store?.state?.route || null;
  }

  function targetKey(target) {
    return [target.kind || 'page', target.id || '', target.name || '', target.page || ''].join('|');
  }

  function targetTitle(target) {
    if (!target) return 'OpsDeck AI';
    if (target.name) return target.name;
    if (target.kind === 'container') return `Container ${shortId(target.id || '', 12)}`;
    if (target.kind === 'image') return `Image ${shortId(target.id || '', 12)}`;
    if (target.kind === 'volume') return `Volume ${target.id || ''}`;
    if (target.kind === 'network') return `Network ${target.id || ''}`;
    if (target.kind === 'compose') return `Compose project ${target.id || ''}`;
    if (target.kind === 'lesson') return 'Academy lesson';
    if (target.kind === 'course') return 'Academy course';
    if (target.kind === 'academy') return 'Docker Academy';
    if (target.kind === 'page') return titleCase(target.page || 'overview');
    return 'OpsDeck AI';
  }

  function targetSubtitle(target) {
    const labels = {
      container: 'Live container context',
      image: 'Live image context',
      volume: 'Live volume context',
      network: 'Live network context',
      compose: 'Live Compose context',
      lesson: 'Academy lesson · live content',
      course: 'Academy course · live content',
      academy: 'Curriculum and progress',
      page: 'Docker workspace · live page context',
    };
    return labels[target?.kind] || 'Live workspace context';
  }

  function targetAttrs(target) {
    const kind = KINDS.has(target?.kind) ? target.kind : 'page';
    const parts = [`data-ai-ask="${esc(kind)}"`];
    if (target?.id) parts.push(`data-ai-id="${esc(target.id)}"`);
    if (target?.name) parts.push(`data-ai-name="${esc(target.name)}"`);
    if (target?.page) parts.push(`data-ai-page="${esc(target.page)}"`);
    return parts.join(' ');
  }

  function targetFromElement(el) {
    const ask = el?.dataset?.aiAsk;
    if (!ask) return null;
    if (ask === 'current') return routeTarget(currentRoute());
    if (!KINDS.has(ask)) return null;
    return {
      kind: ask,
      id: el.dataset.aiId || '',
      name: el.dataset.aiName || '',
      page: el.dataset.aiPage || '',
    };
  }

  function targetFromRoute() {
    return routeTarget(currentRoute() || OD.app?.parseHash?.());
  }

  // ------------------------------------------------------------------ buttons

  function button(target, opts = {}) {
    const size = opts.size || 'sm';
    return `<button type="button" class="btn btn-ai btn-${esc(size)}${opts.class ? ` ${esc(opts.class)}` : ''}" ${targetAttrs(target)} title="${esc(opts.title || 'Ask AI about this with live context')}">${icon('sparkles', 14)}<span>${esc(opts.label || 'Ask AI')}</span></button>`;
  }

  function iconButton(target, opts = {}) {
    return `<button type="button" class="icon-btn ai-row-btn${opts.class ? ` ${esc(opts.class)}` : ''}" ${targetAttrs(target)} title="${esc(opts.title || 'Ask AI about this')}" aria-label="${esc(opts.label || 'Ask AI about this')}">${icon('sparkles', opts.size || 14)}</button>`;
  }

  function topbarButton() {
    return `<button type="button" class="btn btn-ai btn-sm ai-topbar" data-ai-ask="current" title="Ask AI about this page (Ctrl+Shift+A)" aria-label="Ask AI about this page">${icon('sparkles', 14)}<span class="ai-topbar-label">Ask AI</span></button>`;
  }

  // ------------------------------------------------------------------ config state

  async function loadConfig(force = false) {
    if (!api?.ai) {
      state.configError = 'The AI bridge is not available in this build.';
      return null;
    }
    if (state.config && !force) return state.config;
    try {
      const res = await api.ai.config();
      if (res?.ok && res.config) {
        state.config = res.config;
        state.configError = null;
        return state.config;
      }
      state.configError = res?.error || 'Could not read the AI configuration.';
    } catch (error) {
      state.configError = error.message || 'Could not read the AI configuration.';
    }
    return state.config;
  }

  async function ready(force = false) {
    return loadConfig(force);
  }

  function configBadge(config) {
    if (!config) return U.badge('Unavailable', 'slate');
    if (config.enabled === false) return U.badge('Disabled', 'slate');
    if (config.configured) return U.badge('Ready', 'green', { dot: true });
    return U.badge('Setup needed', 'amber');
  }

  function presetOptions(config) {
    const presets = config?.presets || [];
    const current = config?.baseUrl || '';
    return `<option value="">Custom provider</option>${presets.map((preset) => `<option value="${esc(preset.id)}" data-base="${esc(preset.baseUrl || '')}" data-model="${esc(preset.model || '')}" data-note="${esc(preset.note || '')}" ${preset.baseUrl === current ? 'selected' : ''}>${esc(preset.label)}</option>`).join('')}`;
  }

  function presetNote(config) {
    const presets = config?.presets || [];
    const match = presets.find((preset) => preset.baseUrl === config?.baseUrl);
    return match?.note || (config?.keyless ? 'Local provider on this machine. An API key is optional.' : 'Any OpenAI-compatible chat completions endpoint works.');
  }

  function applyPreset(select, baseInput, modelInput, noteEl) {
    const option = select?.selectedOptions?.[0];
    if (!option || !option.value) return;
    if (baseInput) baseInput.value = option.dataset.base || '';
    if (modelInput) modelInput.value = option.dataset.model || '';
    if (noteEl) noteEl.textContent = option.dataset.note || '';
  }

  function transportInfo(config, id) {
    const transports = Array.isArray(config?.transports) ? config.transports : [];
    return transports.find((item) => item.id === id)
      || { id, label: id === 'api' ? 'OpenAI-compatible API' : id, cli: id !== 'api', defaultModel: '' };
  }

  function transportOptions(config) {
    const current = config?.transport || 'api';
    const transports = Array.isArray(config?.transports) && config.transports.length
      ? config.transports
      : [{ id: 'api', label: 'OpenAI-compatible API', cli: false }];
    return transports.map((item) => `<option value="${esc(item.id)}" ${item.id === current ? 'selected' : ''}>${esc(item.label)}${item.cli ? ' · local CLI' : ''}</option>`).join('');
  }

  function transportNote(config, id) {
    return transportInfo(config, id).cli
      ? 'Runs the CLI already configured on this machine. OpsDeck never stores an API key for this transport.'
      : 'Any OpenAI-compatible chat completions endpoint works. The key stays in the main process.';
  }

  async function paintCliStatus(scope, transport) {
    const el = scope.querySelector('[data-ai-cli-status]');
    if (!el) return;
    el.innerHTML = `<span class="spinner">${icon('loader', 12)}</span><span class="ai-cli-detail">Checking the local CLI…</span>`;
    let res;
    try {
      res = await api.ai.detect({});
    } catch (error) {
      res = { error: error.message || String(error) };
    }
    if (!scope.isConnected) return;
    const tool = res?.tools?.[transport];
    if (!tool) {
      el.innerHTML = `<span class="ai-cli-detail">${esc(res?.error || 'Could not inspect the local CLI.')}</span>`;
      return;
    }
    const chips = [tool.installed ? U.badge('Installed', 'green') : U.badge('Not installed', 'red')];
    if (tool.installed && tool.authenticated === true) chips.push(U.badge('Signed in', 'green'));
    else if (tool.installed && tool.authenticated === false) chips.push(U.badge('Sign-in required', 'amber'));
    const version = tool.version ? `<span class="mono text-xs faint">${esc(tool.version)}</span>` : '';
    const login = transport === 'claude-code' ? 'claude /login' : 'opencode auth login';
    el.innerHTML = `<div class="ai-cli-row">${chips.join('')}${version}</div>
      <div class="ai-cli-detail">${esc(tool.detail || '')}</div>
      ${tool.installed && tool.authenticated === false ? `<div class="ai-cli-hint">${icon('terminal', 11)} Run <code>${esc(login)}</code> in a terminal, then test again.</div>` : ''}`;
  }

  function applyTransportForm(form, config) {
    const select = form.querySelector('[data-ai-transport]');
    const id = select?.value || config?.transport || 'api';
    const info = transportInfo(config, id);
    form.querySelectorAll('[data-ai-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.aiPanel !== (info.cli ? 'cli' : 'api');
    });
    const model = form.querySelector('[data-ai-model]');
    if (model) {
      model.placeholder = info.cli ? (info.defaultModel || 'CLI default model') : 'deepseek-chat';
      if (info.cli && !model.value.trim()) model.value = info.defaultModel || '';
    }
    const note = form.querySelector('[data-ai-transport-note]');
    if (note) note.textContent = transportNote(config, id);
    if (info.cli) paintCliStatus(form, id);
    return id;
  }

  // ------------------------------------------------------------------ settings card

  function settingsCard(config, opts = {}) {
    const c = config || state.config || {};
    const enabled = c.enabled !== false;
    const status = configBadge(c);
    const hasKey = c.hasKey === true;
    const cli = c.cli === true;
    const detail = c.configured
      ? `${esc(c.provider || 'Provider')} · ${esc(c.model || 'default model')}${c.cli ? ' · local CLI' : (c.keyless ? ' · local, keyless' : '')}`
      : 'Connect an OpenAI-compatible provider or a local AI CLI to ask questions about live resources.';
    return U.card({
      title: 'AI assistant',
      icon: 'sparkles',
      sub: 'Your provider, your key, and the live context you choose to send.',
      actions: `<span id="ai-card-status">${status}</span>`,
      body: `<div class="ai-settings" data-ai-settings>
        <div class="ai-settings-head">
          <div>
            <div class="ai-settings-title">OpsDeck AI</div>
            <div class="ai-settings-sub" id="ai-card-detail">${detail}</div>
          </div>
          <button type="button" class="btn btn-ai btn-sm" data-ai-open-chat>${icon('sparkles', 13)}<span>Open assistant</span></button>
        </div>
        <form class="ai-settings-form" autocomplete="off">
          <div class="ai-settings-grid">
            <label class="field ai-span-2"><span>Transport</span><select class="input" data-ai-transport>${transportOptions(c)}</select><small data-ai-transport-note>${esc(transportNote(c, c.transport || 'api'))}</small></label>
            <div class="ai-span-2" data-ai-panel="cli" ${cli ? '' : 'hidden'}>
              <div class="ai-cli-status" data-ai-cli-status></div>
            </div>
            <label class="field ai-span-2" data-ai-panel="api" ${cli ? 'hidden' : ''}><span>Provider preset</span><select class="input" id="ai-set-preset">${presetOptions(c)}</select><small id="ai-set-note">${esc(presetNote(c))}</small></label>
            <label class="field ai-span-2" data-ai-panel="api" ${cli ? 'hidden' : ''}><span>Base URL</span><input class="input" id="ai-set-base" type="url" placeholder="https://api.deepseek.com/v1" value="${esc(c.baseUrl || '')}" spellcheck="false" /></label>
            <label class="field"><span>Model</span><input class="input" data-ai-model id="ai-set-model" type="text" list="ai-model-options" placeholder="${esc(cli ? (c.defaultModel || 'CLI default model') : 'deepseek-chat')}" value="${esc(c.model || '')}" spellcheck="false" /><datalist id="ai-model-options"></datalist></label>
            <label class="field" data-ai-panel="api" ${cli ? 'hidden' : ''}><span>API key ${hasKey ? U.badge('saved', 'green') : ''}</span><input class="input" id="ai-set-key" type="password" placeholder="${hasKey ? 'Saved — leave blank to keep it' : 'sk-…'}" autocomplete="off" spellcheck="false" /></label>
          </div>
          <div class="row gap-3" style="align-items:center;flex-wrap:wrap">
            <label class="row gap-2" style="align-items:center"><input type="checkbox" id="ai-set-enabled" ${enabled ? 'checked' : ''} /> <span class="text-sm">Enable OpsDeck AI</span></label>
            <span class="text-xs faint">${icon('lock', 11)} API keys never leave the main process and are stored with mode 0600.</span>
          </div>
          <div class="ai-settings-actions">
            ${U.button({ label: 'Save settings', icon: 'check', variant: 'primary', size: 'sm', attrs: 'data-ai-save' })}
            ${U.button({ label: 'Test connection', icon: 'activity', variant: 'secondary', size: 'sm', attrs: 'data-ai-test' })}
            ${U.button({ label: 'Detect models', icon: 'refresh', variant: 'ghost', size: 'sm', attrs: 'data-ai-models data-ai-panel="cli"' })}
            ${hasKey ? U.button({ label: 'Clear key', icon: 'trash', variant: 'ghost', size: 'sm', attrs: 'data-ai-clear-key' }) : ''}
            <span class="ai-settings-result" id="ai-test-result"></span>
          </div>
        </form>
        <div class="ai-privacy-note">${icon('shield-check', 12)} When you ask a question, OpsDeck builds the selected live context in the main process, omits sensitive keys and environment values instead of masking them, and sends it to the transport you configured. Nothing is sent until you press Send.</div>
      </div>`,
    });
  }

  function settingsStatus(root, config) {
    const status = root.querySelector('#ai-card-status');
    if (status) status.innerHTML = configBadge(config);
    const detail = root.querySelector('#ai-card-detail');
    if (detail) {
      detail.textContent = config?.configured
        ? `${config.provider || 'Provider'} · ${config.model || 'default model'}${config.cli ? ' · local CLI' : (config.keyless ? ' · local, keyless' : '')}`
        : 'Connect an OpenAI-compatible provider or a local AI CLI to ask questions about live resources.';
    }
  }

  function settingsResult(root, tone, text) {
    const result = root.querySelector('#ai-test-result');
    if (!result) return;
    result.className = `ai-settings-result ${tone || ''}`;
    result.textContent = text || '';
  }

  function mountSettings(root) {
    const card = root.querySelector('[data-ai-settings]');
    if (!card) return;
    const form = card.querySelector('.ai-settings-form');
    const transport = card.querySelector('[data-ai-transport]');
    const select = card.querySelector('#ai-set-preset');
    const base = card.querySelector('#ai-set-base');
    const model = card.querySelector('[data-ai-model]');
    const key = card.querySelector('#ai-set-key');
    const enabled = card.querySelector('#ai-set-enabled');
    const note = card.querySelector('#ai-set-note');
    const datalist = card.querySelector('#ai-model-options');

    select?.addEventListener('change', () => applyPreset(select, base, model, note));
    transport?.addEventListener('change', () => applyTransportForm(form, state.config));
    root.querySelector('[data-ai-open-chat]')?.addEventListener('click', () => openForCurrent());
    applyTransportForm(form, state.config);

    root.querySelector('[data-ai-save]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      settingsResult(root, '', 'Saving…');
      const res = await api.ai.saveConfig({
        enabled: enabled?.checked !== false,
        transport: transport?.value || 'api',
        baseUrl: base?.value.trim() || '',
        model: model?.value.trim() || '',
        apiKey: key?.value || '',
      });
      if (!res?.ok) {
        settingsResult(root, 'error', res?.error || 'Could not save AI settings.');
        return;
      }
      state.config = res.config;
      if (key) key.value = '';
      settingsStatus(root, res.config);
      applyTransportForm(form, res.config);
      settingsResult(root, res.config.configured ? 'success' : 'warning', res.config.configured ? 'Saved. The assistant is ready.' : 'Saved. Add a model or API key to finish setup.');
      U.toast('AI settings saved', 'success');
    });

    root.querySelector('[data-ai-test]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      btn.disabled = true;
      settingsResult(root, '', 'Testing the connection…');
      try {
        const res = await api.ai.test({
          transport: transport?.value || 'api',
          baseUrl: base?.value.trim() || undefined,
          model: model?.value.trim() || undefined,
          apiKey: key?.value || undefined,
        });
        if (res?.ok) {
          settingsResult(root, 'success', res.detail || 'Connected.');
          if (transport?.value === 'opencode' || transport?.value === 'claude-code') paintCliStatus(form, transport.value);
        } else {
          settingsResult(root, 'error', res?.error || 'The provider did not answer.');
        }
      } finally {
        btn.disabled = false;
      }
    });

    root.querySelector('[data-ai-models]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      const btn = event.currentTarget;
      btn.disabled = true;
      settingsResult(root, '', 'Reading models from the CLI…');
      try {
        const res = await api.ai.models({ transport: transport?.value || 'opencode', force: true });
        if (!res?.ok) {
          settingsResult(root, 'error', res?.error || 'Could not list models.');
          return;
        }
        if (datalist) datalist.innerHTML = (res.models || []).map((item) => `<option value="${esc(item)}"></option>`).join('');
        settingsResult(root, res.models?.length ? 'success' : 'warning', res.detail || `${res.models?.length || 0} models`);
      } finally {
        btn.disabled = false;
      }
    });

    root.querySelector('[data-ai-clear-key]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      const ok = await U.confirm({
        title: 'Clear the AI API key?',
        message: 'The saved key will be removed. Questions will stop working until you add a new key or use a local keyless provider.',
        confirmLabel: 'Clear key',
        tone: 'red',
      });
      if (!ok) return;
      const res = await api.ai.clearKey();
      if (!res?.ok) {
        settingsResult(root, 'error', res?.error || 'Could not clear the key.');
        return;
      }
      state.config = res.config;
      if (key) key.value = '';
      settingsStatus(root, res.config);
      settingsResult(root, 'success', 'The saved key was removed.');
      U.toast('AI key cleared', 'success');
    });
  }

  // ------------------------------------------------------------------ context and messages

  function updateHeader(ctx) {
    if (!ctx.root) return;
    const title = ctx.context?.title || targetTitle(ctx.target);
    const subtitle = ctx.context?.subtitle || targetSubtitle(ctx.target);
    const h2 = ctx.root.querySelector('.drawer-head h2');
    if (h2) h2.textContent = title;
    const p = ctx.root.querySelector('.drawer-head p');
    if (p) p.textContent = subtitle;
    ctx.title = title;
  }

  function contextBarHtml(ctx) {
    if (ctx.contextLoading && !ctx.context) {
      return `<div class="ai-context-bar loading"><span class="spinner">${icon('loader', 14)}</span><div class="ai-context-main"><strong>Collecting live context…</strong><span>Inspect, logs, stats and related resources</span></div></div>`;
    }
    if (ctx.contextError && !ctx.context) {
      return `<div class="ai-context-error">${icon('alert-triangle', 14)}<div><strong>Live context unavailable</strong><span>${esc(ctx.contextError)}</span></div><button type="button" class="btn btn-sm btn-ghost" data-ai-context-refresh>${icon('refresh', 12)}<span>Retry</span></button></div>`;
    }
    if (!ctx.context) return '';
    const meta = ctx.context.meta || {};
    const sources = Array.isArray(meta.sources) ? meta.sources : [];
    const preview = ctx.contextOpen
      ? `<div class="ai-context-preview" id="ai-context-preview">
          <div class="ai-source-chips">${sources.map((source) => `<span class="ai-source-chip">${esc(source.label)} <i>${esc(String(source.chars || 0))}</i></span>`).join('') || '<span class="ai-source-chip">Live resource data</span>'}</div>
          <pre>${esc(ctx.context.text || '')}</pre>
          <div class="ai-context-foot">${icon('shield-check', 11)} Secret-like values are redacted before this context leaves the main process.</div>
        </div>`
      : '';
    return `<div class="ai-context-bar ${ctx.contextLoading ? 'refreshing' : ''}">
      <span class="ai-context-dot"></span>
      <div class="ai-context-main"><strong>Live context attached${meta.truncated ? ' · truncated' : ''}</strong><span>${esc(String(meta.chars || 0))} characters · ${sources.length || 1} source${sources.length === 1 ? '' : 's'}${ctx.contextLoading ? ' · refreshing' : ''}</span></div>
      <button type="button" class="btn btn-sm btn-ghost" data-ai-context-toggle>${ctx.contextOpen ? 'Hide' : 'Preview'}</button>
      <button type="button" class="icon-btn" data-ai-context-refresh title="Refresh live context" aria-label="Refresh live context">${icon('refresh', 13)}</button>
    </div>${ctx.contextError ? `<div class="ai-context-warning">${icon('alert-triangle', 11)} ${esc(ctx.contextError)}</div>` : ''}${preview}`;
  }

  function welcomeHtml(ctx) {
    const suggestions = Array.isArray(ctx.context?.suggestions) && ctx.context.suggestions.length
      ? ctx.context.suggestions.slice(0, 4)
      : ['What stands out in this context?', 'What should I check next?', 'Summarize the current state and the top three risks.'];
    const title = ctx.context?.title || targetTitle(ctx.target);
    const subtitle = ctx.context?.subtitle || targetSubtitle(ctx.target);
    return `<div class="ai-welcome">
      <div class="ai-welcome-icon">${icon('sparkles', 22)}</div>
      <h3>Ask about ${esc(title)}</h3>
      <p>${esc(subtitle)}. OpsDeck has attached a live snapshot of this resource so the answer can be specific.</p>
      <div class="ai-suggestions">${suggestions.map((question) => `<button type="button" class="ai-suggestion" data-ai-suggestion="${esc(question)}">${icon('arrow-up-right', 12)}<span>${esc(question)}</span></button>`).join('')}</div>
    </div>`;
  }

  function formatAnswer(text) {
    const source = String(text || '');
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let inCode = false;
    let code = [];
    let list = null;
    const closeList = () => {
      if (list) { out.push(`</${list}>`); list = null; }
    };
    const inline = (value) => {
      let textValue = esc(value);
      textValue = textValue.replace(/`([^`]+)`/g, '<code>$1</code>');
      textValue = textValue.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      textValue = textValue.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
      textValue = textValue.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" data-external="1" rel="noreferrer">$1</a>');
      return textValue;
    };
    for (const raw of lines) {
      if (/^```/.test(raw.trim())) {
        closeList();
        if (inCode) {
          out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
          code = [];
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) { code.push(raw); continue; }
      const line = raw.trimEnd();
      if (!line.trim()) { closeList(); continue; }
      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        closeList();
        out.push(`<h4>${inline(heading[2])}</h4>`);
        continue;
      }
      const quote = /^>\s?(.*)$/.exec(line);
      if (quote) {
        closeList();
        out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
        continue;
      }
      const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
      if (bullet) {
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        out.push(`<li>${inline(bullet[1])}</li>`);
        continue;
      }
      const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
      if (ordered) {
        if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
        out.push(`<li>${inline(ordered[1])}</li>`);
        continue;
      }
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
    if (inCode) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
    closeList();
    return out.join('');
  }

  function messagesHtml(ctx) {
    const messages = ctx.session.messages || [];
    if (!messages.length) return welcomeHtml(ctx);
    return messages.map((message, index) => {
      if (message.role === 'user') {
        return `<div class="ai-msg user"><div class="ai-bubble">${esc(message.content).replace(/\n/g, '<br>')}</div></div>`;
      }
      if (message.role === 'note') {
        return `<div class="ai-note">${icon('info', 12)}<span>${esc(message.content)}</span></div>`;
      }
      if (message.role === 'error') {
        return `<div class="ai-msg error"><span class="ai-msg-avatar error">${icon('alert-triangle', 15)}</span><div class="ai-msg-main"><div class="ai-error-card"><strong>Could not answer</strong><span>${esc(message.content)}</span></div>${ctx.lastQuestion ? `<button type="button" class="ai-msg-action" data-ai-retry>${icon('rotate-cw', 12)} Retry</button>` : ''}</div></div>`;
      }
      const meta = message.meta || {};
      const metaBits = [meta.model, meta.elapsedMs ? `${(meta.elapsedMs / 1000).toFixed(1)}s` : '', meta.chars ? `${meta.chars} chars of context` : ''].filter(Boolean);
      return `<div class="ai-msg assistant">
        <span class="ai-msg-avatar">${icon('sparkles', 15)}</span>
        <div class="ai-msg-main">
          <div class="ai-answer">${formatAnswer(message.content)}</div>
          <div class="ai-msg-meta"><span>${esc(metaBits.join(' · ') || 'OpsDeck AI')}</span><button type="button" class="ai-msg-action" data-ai-copy="${index}">${icon('copy', 11)} Copy</button></div>
        </div>
      </div>`;
    }).join('');
  }

  function chatHtml(ctx) {
    if (!state.config?.configured) return configPromptHtml();
    if (ctx.contextLoading && !ctx.context) {
      return `<div class="ai-thinking-card"><span class="spinner">${icon('loader', 16)}</span><div><strong>Reading live context</strong><span>Docker inspect, logs, stats and relationships</span></div></div>`;
    }
    return `${messagesHtml(ctx)}${ctx.busy ? `<div class="ai-thinking"><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span class="ai-thinking-dot"></span><span>Analyzing the live context…</span></div>` : ''}`;
  }

  function configPromptHtml() {
    const c = state.config || {};
    const hasKey = c.hasKey === true;
    const cli = c.cli === true;
    return `<div class="ai-config">
      <div class="ai-config-head"><span class="ai-welcome-icon small">${icon('key', 18)}</span><div><h3>Connect an AI provider</h3><p>Use an OpenAI-compatible API or a local AI CLI. Keys stay in the main process; the renderer never receives them.</p></div></div>
      <form id="ai-drawer-config" class="ai-config-form" autocomplete="off">
        <label class="field"><span>Transport</span><select class="input" data-ai-transport>${transportOptions(c)}</select><small data-ai-transport-note>${esc(transportNote(c, c.transport || 'api'))}</small></label>
        <div data-ai-panel="cli" ${cli ? '' : 'hidden'}>
          <div class="ai-cli-status" data-ai-cli-status></div>
        </div>
        <label class="field" data-ai-panel="api" ${cli ? 'hidden' : ''}><span>Provider preset</span><select class="input" id="ai-config-preset">${presetOptions(c)}</select><small id="ai-config-note">${esc(presetNote(c))}</small></label>
        <label class="field" data-ai-panel="api" ${cli ? 'hidden' : ''}><span>Base URL</span><input class="input" id="ai-config-base" type="url" placeholder="https://api.deepseek.com/v1" value="${esc(c.baseUrl || '')}" spellcheck="false" /></label>
        <label class="field"><span>Model</span><input class="input" data-ai-model id="ai-config-model" type="text" placeholder="${esc(cli ? (c.defaultModel || 'CLI default model') : 'deepseek-chat')}" value="${esc(c.model || '')}" spellcheck="false" /></label>
        <label class="field" data-ai-panel="api" ${cli ? 'hidden' : ''}><span>API key ${hasKey ? U.badge('saved', 'green') : ''}</span><input class="input" id="ai-config-key" type="password" placeholder="${hasKey ? 'Saved — leave blank to keep it' : 'sk-…'}" autocomplete="off" spellcheck="false" /></label>
        <label class="row gap-2" style="align-items:center"><input type="checkbox" id="ai-config-enabled" ${c.enabled !== false ? 'checked' : ''} /> <span class="text-sm">Enable OpsDeck AI</span></label>
        <div class="ai-config-error" id="ai-config-error" hidden></div>
        <div class="row gap-2">
          <button type="submit" class="btn btn-primary btn-sm">${icon('check', 13)}<span>Save and test</span></button>
          <button type="button" class="btn btn-ghost btn-sm" data-ai-close>${icon('x', 12)}<span>Not now</span></button>
        </div>
        <div class="ai-config-foot">${icon('info', 11)} Local CLIs use their own saved sign-in. Local API providers such as Ollama work without a key at <span class="mono">localhost</span>.</div>
      </form>
    </div>`;
  }

  function updateComposer(ctx) {
    if (!ctx.root) return;
    const input = ctx.root.querySelector('#ai-question');
    const send = ctx.root.querySelector('#ai-send');
    const stop = ctx.root.querySelector('[data-ai-stop]');
    const hint = ctx.root.querySelector('.ai-composer-hint');
    const readyState = state.config?.configured === true;
    if (input) {
      input.disabled = !readyState;
      input.placeholder = readyState
        ? `Ask about ${ctx.title || targetTitle(ctx.target)}…`
        : 'Configure a provider to ask about this resource…';
      if (ctx.draft != null && input.value !== ctx.draft) input.value = ctx.draft;
      autoGrow(input);
    }
    if (send) send.disabled = !readyState || ctx.busy || !String(ctx.draft || '').trim();
    if (stop) stop.hidden = !ctx.busy;
    if (hint) hint.textContent = readyState ? 'Enter to send · Shift+Enter for a new line' : 'Connect a provider above to start';
  }

  function autoGrow(input) {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(150, Math.max(38, input.scrollHeight))}px`;
  }

  function paintContext(ctx) {
    if (!ctx.root) return;
    const wrap = ctx.root.querySelector('#ai-context-wrap');
    if (wrap) wrap.innerHTML = contextBarHtml(ctx);
  }

  function paintChat(ctx) {
    if (!ctx.root) return;
    const chat = ctx.root.querySelector('#ai-chat');
    if (!chat) return;
    const atBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
    chat.innerHTML = chatHtml(ctx);
    const configForm = chat.querySelector('#ai-drawer-config');
    if (configForm) applyTransportForm(configForm, state.config);
    if (atBottom || ctx.forceScroll) {
      chat.scrollTop = chat.scrollHeight;
      ctx.forceScroll = false;
    }
    const preview = ctx.root.querySelector('#ai-context-preview');
    if (preview) preview.hidden = !ctx.contextOpen;
  }

  function paintDrawer(ctx) {
    updateHeader(ctx);
    paintContext(ctx);
    paintChat(ctx);
    updateComposer(ctx);
  }

  function scrollChat(ctx) {
    if (!ctx.root) return;
    const chat = ctx.root.querySelector('#ai-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  async function loadContext(ctx, force = false) {
    if (!api?.ai) return;
    ctx.contextLoading = true;
    paintContext(ctx);
    try {
      const res = await api.ai.context({ ...ctx.target, force });
      if (state.active !== ctx) return;
      if (res?.ok && res.context) {
        ctx.context = res.context;
        ctx.session.context = res.context;
        ctx.contextError = null;
      } else {
        ctx.contextError = res?.error || 'The live context could not be collected.';
      }
    } catch (error) {
      if (state.active === ctx) ctx.contextError = error.message || 'The live context could not be collected.';
    } finally {
      if (state.active === ctx) {
        ctx.contextLoading = false;
        paintDrawer(ctx);
        scrollChat(ctx);
      }
    }
  }

  // ------------------------------------------------------------------ drawer

  function pruneSessions() {
    while (state.sessions.size > MAX_SESSIONS) {
      const oldest = state.sessions.keys().next().value;
      if (oldest == null) break;
      state.sessions.delete(oldest);
    }
  }

  function getSession(target) {
    const key = targetKey(target);
    let session = state.sessions.get(key);
    if (!session) {
      session = { key, target, messages: [], context: null, lastQuestion: '', createdAt: Date.now() };
      state.sessions.set(key, session);
      pruneSessions();
    } else {
      session.target = target;
    }
    return session;
  }

  function openFor(target) {
    if (!target) return;
    const session = getSession(target);
    const key = session.key;
    if (state.active && state.active.key === key) {
      state.active.root?.querySelector('#ai-question')?.focus();
      return;
    }
    if (state.active) {
      const previous = state.active;
      previous.overlay?.close('switch');
      if (state.active === previous) state.active = null;
    }

    const ctx = {
      key,
      target,
      session,
      overlay: null,
      root: null,
      close: null,
      context: session.context,
      contextLoading: !session.context,
      contextError: null,
      contextOpen: false,
      busy: false,
      stopping: false,
      draft: '',
      title: session.context?.title || targetTitle(target),
      lastQuestion: session.lastQuestion || '',
      forceScroll: true,
    };
    state.active = ctx;

    ctx.overlay = U.drawer({
      title: ctx.title,
      subtitle: targetSubtitle(target),
      eyebrow: 'OpsDeck AI',
      icon: 'sparkles',
      width: '620px',
      body: `<div class="ai-shell">
        <div class="ai-context-wrap" id="ai-context-wrap"></div>
        <div class="ai-chat" id="ai-chat"></div>
      </div>`,
      footer: `<form class="ai-composer" id="ai-form" autocomplete="off">
        <div class="ai-composer-box">
          <textarea class="ai-input" id="ai-question" rows="2" placeholder="Ask about this resource…" aria-label="Ask OpsDeck AI about this resource"></textarea>
          <div class="ai-composer-actions">
            <span class="ai-composer-hint">Enter to send · Shift+Enter for a new line</span>
            <button type="button" class="btn btn-sm btn-ghost" data-ai-stop hidden>${icon('square', 12)}<span>Stop</span></button>
            <button type="submit" class="btn btn-primary btn-sm" id="ai-send">${icon('send', 13)}<span>Send</span></button>
          </div>
        </div>
      </form>`,
      onMount: ({ root, close, onClose }) => {
        ctx.root = root;
        ctx.close = close;
        root.querySelector('#drawer-body')?.classList.add('ai-drawer-body');
        onClose(() => {
          if (ctx.busy) {
            ctx.cancelled = true;
            try { api.ai?.cancel(); } catch { /* ignore */ }
          }
          if (state.active === ctx) state.active = null;
        });
        bindDrawer(ctx);
      },
    });

    paintDrawer(ctx);
    updateComposer(ctx);
    setTimeout(() => ctx.root?.querySelector('#ai-question')?.focus(), 60);

    (async () => {
      await loadConfig(true);
      if (state.active !== ctx) return;
      paintChat(ctx);
      updateComposer(ctx);
      await loadContext(ctx, false);
      if (state.active !== ctx) return;
      if (state.config?.configured && ctx.root) {
        ctx.forceScroll = true;
        paintDrawer(ctx);
        setTimeout(() => ctx.root?.querySelector('#ai-question')?.focus(), 30);
      }
    })();
  }

  function openForCurrent() {
    openFor(targetFromRoute());
  }

  function closeActive() {
    if (state.active?.overlay) state.active.overlay.close('button');
  }

  function bindDrawer(ctx) {
    const root = ctx.root;
    if (!root) return;
    const form = root.querySelector('#ai-form');
    const input = root.querySelector('#ai-question');
    const stop = root.querySelector('[data-ai-stop]');

    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendQuestion(ctx);
    });
    input?.addEventListener('input', () => {
      ctx.draft = input.value;
      autoGrow(input);
      updateComposer(ctx);
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendQuestion(ctx);
      }
    });
    stop?.addEventListener('click', async () => {
      ctx.stopping = true;
      stop.disabled = true;
      await api.ai.cancel();
    });

    root.addEventListener('click', async (event) => {
      const suggestion = event.target.closest('[data-ai-suggestion]');
      if (suggestion) {
        if (ctx.busy) return;
        ctx.draft = suggestion.dataset.aiSuggestion || '';
        if (input) input.value = ctx.draft;
        sendQuestion(ctx);
        return;
      }
      if (event.target.closest('[data-ai-context-toggle]')) {
        ctx.contextOpen = !ctx.contextOpen;
        paintContext(ctx);
        const preview = root.querySelector('#ai-context-preview');
        if (preview) preview.hidden = !ctx.contextOpen;
        return;
      }
      if (event.target.closest('[data-ai-context-refresh]')) {
        loadContext(ctx, true);
        return;
      }
      const copy = event.target.closest('[data-ai-copy]');
      if (copy) {
        const index = Number(copy.dataset.aiCopy);
        const message = ctx.session.messages[index];
        if (message?.content) OD.utils.copyText(message.content, 'Answer copied');
        return;
      }
      if (event.target.closest('[data-ai-retry]')) {
        const question = ctx.lastQuestion;
        if (question && !ctx.busy) sendQuestion(ctx, question);
        return;
      }
      if (event.target.closest('[data-ai-close]')) {
        closeActive();
        return;
      }
      if (event.target.closest('[data-ai-open-settings]')) {
        closeActive();
        location.hash = '#/settings';
        return;
      }
    });

    root.addEventListener('change', (event) => {
      if (event.target.id === 'ai-config-preset') {
        applyPreset(event.target, root.querySelector('#ai-config-base'), root.querySelector('#ai-config-model'), root.querySelector('#ai-config-note'));
      }
      if (event.target.matches('[data-ai-transport]')) {
        const form = event.target.closest('form');
        if (form?.id === 'ai-drawer-config') applyTransportForm(form, state.config);
      }
    });

    root.addEventListener('submit', async (event) => {
      if (event.target.id !== 'ai-drawer-config') return;
      event.preventDefault();
      const configForm = event.target;
      const errorEl = configForm.querySelector('#ai-config-error');
      const buttonEl = configForm.querySelector('button[type="submit"]');
      const base = configForm.querySelector('#ai-config-base');
      const model = configForm.querySelector('#ai-config-model');
      const key = configForm.querySelector('#ai-config-key');
      const enabled = configForm.querySelector('#ai-config-enabled');
      const transport = configForm.querySelector('[data-ai-transport]');
      if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
      if (buttonEl) { buttonEl.disabled = true; buttonEl.innerHTML = `<span class="spinner">${icon('loader', 13)}</span><span>Testing…</span>`; }
      try {
        const saved = await api.ai.saveConfig({
          enabled: enabled?.checked !== false,
          transport: transport?.value || 'api',
          baseUrl: base?.value.trim() || '',
          model: model?.value.trim() || '',
          apiKey: key?.value || '',
        });
        if (!saved?.ok) {
          if (errorEl) { errorEl.hidden = false; errorEl.textContent = saved?.error || 'Could not save the configuration.'; }
          return;
        }
        state.config = saved.config;
        const tested = await api.ai.test();
        if (!tested?.ok) {
          if (errorEl) { errorEl.hidden = false; errorEl.textContent = `Saved, but the connection test failed: ${tested?.error || 'no response'}`; }
        } else {
          U.toast('AI provider connected', 'success', { description: tested.detail || 'The assistant is ready.' });
        }
        if (state.active !== ctx) return;
        paintDrawer(ctx);
        ctx.forceScroll = true;
        paintChat(ctx);
        updateComposer(ctx);
        if (state.config?.configured) loadContext(ctx, true);
      } finally {
        if (buttonEl) { buttonEl.disabled = false; buttonEl.innerHTML = `${icon('check', 13)}<span>Save and test</span>`; }
      }
    });
  }

  async function sendQuestion(ctx, override = null) {
    if (ctx.busy) return;
    if (!state.config?.configured) {
      paintDrawer(ctx);
      return;
    }
    const question = String(override != null ? override : ctx.draft || '').trim();
    if (!question) return;
    ctx.draft = '';
    ctx.lastQuestion = question;
    ctx.session.lastQuestion = question;
    ctx.session.messages.push({ role: 'user', content: question, at: Date.now() });
    ctx.session.messages = ctx.session.messages.slice(-MAX_MESSAGES);
    ctx.busy = true;
    ctx.stopping = false;
    ctx.forceScroll = true;
    paintDrawer(ctx);
    const history = ctx.session.messages
      .slice(0, -1)
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content }));
    try {
      const res = await api.ai.ask({ target: ctx.target, question, history });
      if (state.active !== ctx) return;
      if (res?.ok) {
        ctx.session.messages.push({
          role: 'assistant',
          content: res.text,
          at: Date.now(),
          meta: {
            model: res.model,
            provider: res.provider,
            elapsedMs: res.elapsedMs,
            chars: res.context?.chars,
          },
        });
        if (res.context) {
          ctx.session.context = ctx.session.context || res.context;
        }
      } else if (res?.cancelled) {
        ctx.session.messages.push({ role: 'note', content: 'Request stopped. You can edit the question and send it again.' });
        ctx.draft = question;
      } else {
        ctx.session.messages.push({ role: 'error', content: res?.error || 'The provider did not return an answer.' });
        if (res?.unconfigured) {
          await loadConfig(true);
          ctx.forceScroll = true;
        }
      }
    } catch (error) {
      if (state.active === ctx) ctx.session.messages.push({ role: 'error', content: error.message || 'The request failed.' });
    } finally {
      if (state.active === ctx) {
        ctx.busy = false;
        ctx.stopping = false;
        ctx.session.messages = ctx.session.messages.slice(-MAX_MESSAGES);
        ctx.forceScroll = true;
        paintDrawer(ctx);
        updateComposer(ctx);
        scrollChat(ctx);
      }
    }
  }

  // ------------------------------------------------------------------ global capture

  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-ai-ask]');
    if (!el) return;
    const target = targetFromElement(el);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    openFor(target);
  }, true);

  document.addEventListener('keydown', (event) => {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      openForCurrent();
    }
  });

  window.OD = window.OD || {};
  OD.ai = {
    ready,
    loadConfig,
    button,
    iconButton,
    topbarButton,
    settingsCard,
    mountSettings,
    openFor,
    openForCurrent,
    closeActive,
    routeTarget,
    targetFromElement,
    formatAnswer,
    configBadge,
  };
})();
