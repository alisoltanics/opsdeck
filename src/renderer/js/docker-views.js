'use strict';

/**
 * Docker workspace views. Each view renders to an HTML string and then mounts
 * delegated handlers on the fresh view root created by app.js.
 */
(function () {
  const { esc, fmtBytes, fmtNumber, timeAgo, shortId, titleCase, debounce } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const api = window.opsdeck;
  const rerender = () => (OD.app && OD.app.rerender ? OD.app.rerender() : location.reload());

  const state = {
    containerFilter: { q: '', status: 'all', project: 'all', grouped: null },
    imageFilter: { q: '', kind: 'all' },
    eventFilter: { since: 3600, type: 'all' },
    terminal: { history: [], consent: false, pending: null, busy: false },
    registry: { query: '', items: null, error: null, loading: false },
    last: {},
  };
  let cleanup = [];
  function onCleanup(fn) { cleanup.push(fn); }
  function dispose() {
    for (const fn of cleanup) { try { fn(); } catch { /* ignore */ } }
    cleanup = [];
  }
  function timer(fn, ms) { const id = setInterval(fn, ms); onCleanup(() => clearInterval(id)); return id; }

  // ------------------------------------------------------------------ helpers

  function pageHead(opts) {
    const actions = opts.actions || '';
    return `<div class="page-head">
      <div class="page-head-left">
        ${opts.eyebrow ? `<div class="eyebrow">${icon(opts.iconName || 'sparkles', 12)}${esc(opts.eyebrow)}</div>` : ''}
        <h1 class="page-title">${esc(opts.title)}</h1>
        ${opts.sub ? `<p class="page-sub">${esc(opts.sub)}</p>` : ''}
      </div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ''}
    </div>`;
  }

  function learnLink(lessonId, label) {
    if (!lessonId || !OD.store.lessonById(lessonId)) return '';
    return `<a class="btn btn-sm btn-ghost" href="#/academy/lesson/${esc(lessonId)}">${icon('graduation-cap', 13)}<span>${esc(label || 'Learn this')}</span></a>`;
  }

  function parseSize(label) {
    const m = /^([\d.]+)\s*(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB|bytes?)/i.exec(String(label || ''));
    if (!m) return Number(label) || 0;
    const mult = { b: 1, byte: 1, bytes: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 }[m[2].toLowerCase()] || 1;
    return Number(m[1]) * mult;
  }

  function engineDown(reason, extra) {
    const guide = OD.store.guideForText(reason || '');
    return `<div class="page">
      <div class="hero">
        <div>
          <div class="eyebrow">${icon('alert-triangle', 12)}Engine offline</div>
          <h1 class="hero-title">Docker is not reachable</h1>
          <p class="hero-sub">${esc(reason || 'The Docker engine did not respond. Start Docker Desktop or the Docker service, then retry. OpsDeck never falls back to a shell, so no partial state is shown.')}</p>
          <div class="hero-actions">
            ${U.button({ label: 'Retry connection', icon: 'refresh', variant: 'primary', attrs: 'data-action="retry-engine"' })}
            <a class="btn btn-secondary btn-md" href="#/academy/troubleshooting">${icon('wrench', 14)}<span>Troubleshooting</span></a>
            <a class="btn btn-ghost btn-md" href="#/academy/course/docker-fundamentals">${icon('graduation-cap', 14)}<span>Docker fundamentals</span></a>
          </div>
        </div>
        <div class="hero-side">
          <div class="engine-panel">
            <div class="engine-status"><span class="pulse bad"></span><div><div class="engine-name">Engine unavailable</div><div class="engine-reason">${esc(guide ? guide.summary : 'The client could not complete a request to the daemon.')}</div></div></div>
          </div>
        </div>
      </div>
      ${extra || ''}
      ${guide ? U.card({
        title: guide.title,
        icon: 'wrench',
        sub: guide.summary,
        actions: `<a class="btn btn-sm btn-secondary" href="#/academy/troubleshooting/${esc(guide.id)}">Open guide</a>`,
        body: `<div class="guide-list">${(guide.steps || []).slice(0, 4).map((s) => `<li>${icon('chevron-right', 13)}<span><strong>${esc(s.title)}</strong> — ${esc(s.detail)}</span></li>`).join('')}</div>`,
      }) : ''}
    </div>`;
  }

  function engineOfflineStatus() {
    const status = OD.store.state.status;
    return !status || status.available !== true;
  }

  function badgeFor(kind) {
    return { engine: 'accent', compose: 'violet', dockerfile: 'green', property: 'cyan' }[kind] || 'slate';
  }

  // ------------------------------------------------------------------ overview

  async function renderOverview() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const [ov, list] = await Promise.all([api.docker.overview(), api.docker.containers()]);
    if (ov && ov.ok === false) return engineDown(ov.error);
    state.last.overview = { ov, list };
    const c = ov.containers || {};
    const memHost = ov.status?.memory || 1;
    const memPercent = Math.min(100, ((c.memory || 0) / memHost) * 100);
    OD.store.pushSample({ cpu: c.cpu || 0, mem: memPercent, net: c.running || 0 });
    const running = (list.items || []).filter((x) => x.state === 'running');
    const recent = (list.items || []).slice(0, 6);
    const diskMax = Math.max(1, ...(ov.disk || []).map((d) => d.size || 0));
    const reclaim = (ov.disk || []).reduce((sum, d) => sum + (d.reclaimable || 0), 0);
    const next = OD.store.nextLesson();
    const academy = OD.store.overallStats();
    const greeting = OD.store.greet();

    const stats = `<div class="stat-grid">
      ${U.statCard({ label: 'Containers running', value: `${c.running || 0}`, sub: `${c.total || 0} total · ${c.stopped || 0} stopped`, icon: 'box', tone: 'green', spark: OD.charts.spark(OD.store.state.history.cpu, { color: 'var(--green)' }) })}
      ${U.statCard({ label: 'Images', value: fmtNumber(ov.status?.images || 0), sub: 'local image store', icon: 'layers', tone: 'violet' })}
      ${U.statCard({ label: 'Aggregate CPU', value: `${(c.cpu || 0).toFixed(1)}%`, sub: 'across running containers', icon: 'cpu', tone: 'accent', spark: OD.charts.spark(OD.store.state.history.cpu) })}
      ${U.statCard({ label: 'Memory in use', value: fmtBytes(c.memory || 0), sub: `${memPercent.toFixed(1)}% of ${fmtBytes(memHost)}`, icon: 'hard-drive', tone: 'cyan', spark: OD.charts.spark(OD.store.state.history.mem, { color: 'var(--cyan)' }) })}
    </div>`;

    const hero = `<div class="hero">
      <div>
        <div class="eyebrow">${icon('layout-dashboard', 12)}${esc(greeting)} · ${esc(OD.store.state.info?.hostname || 'local machine')}</div>
        <h1 class="hero-title">Your Docker workspace is ready.</h1>
        <p class="hero-sub">${c.running || 0} containers are running across ${ov.status?.context || 'default'} with Docker ${ov.status?.serverVersion || ''}. Jump into a workflow or continue where the Academy left off.</p>
        <div class="hero-actions">
          ${U.button({ label: 'New container', icon: 'plus', variant: 'primary', attrs: 'data-action="run-container"' })}
          <a class="btn btn-secondary btn-md" href="#/terminal">${icon('terminal', 14)}<span>Open terminal</span></a>
          <a class="btn btn-ghost btn-md" href="${next ? `#/academy/lesson/${esc(next.id)}` : '#/academy'}">${icon('graduation-cap', 14)}<span>Continue learning</span></a>
        </div>
        <div class="hero-meta">
          <span>${icon('clock', 12)}Engine checked ${esc(timeAgo(ov.checkedAt))}</span>
          <span>${icon('shield-check', 12)}ExecFile only · no shell</span>
          <span>${icon('activity', 12)}${esc(OD.store.state.progress.streak?.current || 0)} day streak</span>
        </div>
      </div>
      <div class="hero-side">
        <div class="engine-panel">
          <div class="engine-status"><span class="pulse"></span><div><div class="engine-name">Docker Engine ${esc(ov.status?.serverVersion || '')}</div><div class="engine-reason">Daemon reachable over ${esc(ov.status?.context || 'default')} context${ov.status?.compose && ov.status.compose !== 'unavailable' ? ` · Compose ${esc(ov.status.compose)}` : ''}.</div></div></div>
          <div class="engine-facts">
            <div class="engine-fact"><span>API</span><strong>${esc(ov.status?.apiVersion || '—')}</strong></div>
            <div class="engine-fact"><span>Platform</span><strong>${esc(ov.status?.os || '—')} / ${esc(ov.status?.arch || '—')}</strong></div>
            <div class="engine-fact"><span>CPUs</span><strong>${esc(ov.status?.cpus || '—')}</strong></div>
            <div class="engine-fact"><span>Logging</span><strong>${esc(ov.status?.loggingDriver || '—')}</strong></div>
          </div>
        </div>
      </div>
    </div>`;

    const activity = U.card({
      title: 'Engine load',
      icon: 'activity',
      sub: 'Aggregate CPU and memory pressure sampled while OpsDeck is open',
      actions: `<span class="badge tone-green">Live</span>`,
      body: `<div class="split-2">
        <div><div class="rail-progress-label"><span>CPU</span><span>${(c.cpu || 0).toFixed(1)}%</span></div>${OD.charts.area(OD.store.state.history.cpu, { height: 150, label: 'Aggregate CPU', labels: ['60s', 'now'] })}</div>
        <div><div class="rail-progress-label"><span>Memory</span><span>${memPercent.toFixed(1)}%</span></div>${OD.charts.area(OD.store.state.history.mem, { height: 150, color: 'var(--cyan)', label: 'Memory percent', labels: ['60s', 'now'], format: (v) => `${Math.round(v)}%` })}</div>
      </div>`,
    });

    const events = U.card({
      title: 'Recent engine events',
      icon: 'list',
      sub: 'Last hour of Docker activity',
      actions: `<a class="btn btn-sm btn-ghost" href="#/events">All events</a>`,
      body: (ov.events || []).length
        ? `<div class="event-feed">${(ov.events || []).slice(0, 8).map((e) => {
          const ic = /container/.test(e.type) ? 'box' : /image/.test(e.type) ? 'layers' : /network/.test(e.type) ? 'network' : /volume/.test(e.type) ? 'database' : 'activity';
          const name = e.attributes?.name || e.attributes?.image || shortId(e.id);
          return `<div class="event-row"><span class="event-icon">${icon(ic, 13)}</span><div class="event-main"><div class="event-title">${esc(e.action)} ${esc(name)}</div><div class="event-meta">${esc(e.type)}${e.attributes?.image && e.attributes?.name ? ` · ${esc(e.attributes.image)}` : ''}</div></div><span class="event-time">${esc(timeAgo(e.time))}</span></div>`;
        }).join('')}</div>`
        : U.empty({ compact: true, icon: 'list', title: 'No recent events', body: 'Docker events appear here as containers, images and networks change.' }),
    });

    const disk = U.card({
      title: 'Disk usage',
      icon: 'hard-drive',
      sub: `${fmtBytes(reclaim)} reclaimable`,
      actions: `<a class="btn btn-sm btn-ghost" href="#/settings">Manage</a>`,
      body: `<div class="disk-list">${(ov.disk || []).map((d) => `<div class="disk-row">
        <span class="label">${esc(d.type)}</span>
        <div>${U.meter(d.size, diskMax, /image/i.test(d.type) ? 'violet' : /volume/i.test(d.type) ? 'orange' : 'accent', { label: `${d.count} items`, showLabel: false })}</div>
        <span class="value"><strong>${esc(d.sizeLabel || fmtBytes(d.size))}</strong>${d.reclaimable ? `<br>${esc(d.reclaimableLabel || fmtBytes(d.reclaimable))} free` : ''}</span>
      </div>`).join('') || '<div class="muted text-sm">No disk usage data.</div>'}</div>`,
    });

    const continueCard = next ? `<a class="continue-card" href="#/academy/lesson/${esc(next.id)}">
      <span class="continue-icon">${icon('play', 18)}</span>
      <span class="continue-body">
        <span class="continue-label">Continue learning</span>
        <span class="continue-title">${esc(next.title)}</span>
        <span class="continue-meta">${esc(next.course.title)} · ${esc(next.duration)} · ${academy.percent}% complete</span>
      </span>
      ${icon('arrow-right', 16)}
    </a>` : '';

    const quick = U.card({
      title: 'Quick actions',
      icon: 'zap',
      body: `<div class="quick-grid">
        <a class="quick-link" href="#/containers">${icon('box', 15)}<span>Containers</span></a>
        <a class="quick-link" href="#/compose">${icon('boxes', 15)}<span>Compose projects</span></a>
        <a class="quick-link" href="#/images">${icon('layers', 15)}<span>Images</span></a>
        <a class="quick-link" href="#/monitoring">${icon('activity', 15)}<span>Live monitoring</span></a>
        <a class="quick-link" href="#/academy/labs">${icon('flask', 15)}<span>Guided labs</span></a>
        <a class="quick-link" href="#/academy/reference">${icon('terminal', 15)}<span>CLI reference</span></a>
      </div>`,
    });

    const runningCard = U.card({
      title: 'Running containers',
      icon: 'box',
      sub: `${running.length} active`,
      actions: `<a class="btn btn-sm btn-ghost" href="#/containers">Open manager</a>`,
      body: (recent.length
        ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Container</th><th>State</th><th>Ports</th><th>CPU</th><th>Created</th></tr></thead><tbody>${recent.map((x) => `<tr class="clickable" data-open-container="${esc(x.id)}"><td><div class="cell-main"><span class="dot-indicator ${esc(x.state)}"></span><div><div class="cell-title">${esc(x.name)}</div><div class="cell-sub mono">${esc(x.image)}</div></div></div></td><td>${U.stateBadge(x.state)}</td><td class="cell-mono">${esc((x.ports || []).slice(0, 2).join(' · ') || '—')}</td><td class="cell-mono">${(x.cpuPercent || 0).toFixed(1)}%</td><td class="cell-nowrap">${esc(timeAgo(x.createdAt))}</td></tr>`).join('')}</tbody></table></div>`
        : U.empty({ compact: true, icon: 'box', title: 'No containers yet', body: 'Run your first container or start a Compose project.', action: U.button({ label: 'Run a container', icon: 'play', variant: 'primary', size: 'sm', attrs: 'data-action="run-container"' }) })),
    });

    return `<div class="page">
      ${hero}${stats}
      <div class="section-head"><div><div class="section-eyebrow">${icon('activity', 12)}Operations</div><h2 class="section-title">Workspace health</h2></div></div>
      <div class="split-wide">
        <div class="stack-3">${activity}${runningCard}${events}</div>
        <div class="stack-3">${disk}${continueCard}${quick}</div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------ containers

  function projectKey(item) {
    return item.compose || '__standalone';
  }

  function projectLabel(key) {
    return key === '__standalone' ? 'Standalone' : key;
  }

  function publishedTcpPorts(item) {
    const seen = new Set();
    for (const raw of item?.ports || []) {
      const match = /^(?:.*:)?(\d+)(?:-(\d+))?->(\d+)(?:-(\d+))?\/(tcp|udp)$/.exec(String(raw).trim());
      if (!match || match[5] !== 'tcp') continue;
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 64) continue;
      for (let port = start; port <= end; port += 1) {
        if (port > 0 && port < 65536) seen.add(port);
      }
    }
    return [...seen].sort((a, b) => a - b);
  }

  function containerUrl(port) {
    const protocol = port === 443 || port === 8443 ? 'https' : 'http';
    return `${protocol}://localhost:${port}`;
  }

  function containerMatches(x) {
    const f = state.containerFilter;
    if (f.status !== 'all' && x.state !== f.status) return false;
    if (f.project && f.project !== 'all' && projectKey(x) !== f.project) return false;
    const q = f.q.trim().toLowerCase();
    if (!q) return true;
    return `${x.name} ${x.image} ${x.id} ${x.compose || ''} ${x.service || ''}`.toLowerCase().includes(q);
  }

  function containerProjects(items) {
    const map = new Map();
    for (const item of items) {
      const key = projectKey(item);
      const entry = map.get(key) || { key, total: 0, running: 0, services: new Set() };
      entry.total += 1;
      if (item.state === 'running') entry.running += 1;
      if (item.service) entry.services.add(item.service);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === '__standalone') return 1;
      if (b.key === '__standalone') return -1;
      return a.key.localeCompare(b.key);
    });
  }

  function containerRow(x) {
    const ports = (x.ports || []).slice(0, 2).join(' · ');
    const extra = (x.ports || []).length - 2;
    const published = publishedTcpPorts(x);
    return `<tr class="clickable" data-open-container="${esc(x.id)}" data-container-name="${esc(x.name)}">
      <td><div class="cell-main"><span class="dot-indicator ${esc(x.state)}"></span><div><div class="cell-title">${esc(x.name)}</div><div class="cell-sub mono">${esc(x.image)}</div></div></div></td>
      <td>${U.stateBadge(x.state, x.status)}</td>
      <td class="cell-mono">${esc(ports || '—')}${extra > 0 ? ` <span class="badge mono">+${extra}</span>` : ''}</td>
      <td class="cell-mono">${(x.cpuPercent || 0).toFixed(1)}%<div class="cell-sub">${fmtBytes(x.memoryBytes || 0)}</div></td>
      <td class="cell-nowrap">${esc(x.runningFor || timeAgo(x.createdAt))}</td>
      <td>${x.compose ? `<button type="button" class="badge tone-violet badge-btn" data-project-only="${esc(x.compose)}" title="Show every container in this project">${esc(x.compose)}${x.service ? `/${esc(x.service)}` : ''}</button>` : '<span class="faint">—</span>'}</td>
      <td><div class="row-actions" onclick="event.stopPropagation()">
        ${x.state === 'running'
          ? U.iconButton({ icon: 'pause', label: 'Pause', attrs: `data-caction="pause" data-cid="${esc(x.id)}"` })
          : U.iconButton({ icon: 'play', label: 'Start', attrs: `data-caction="start" data-cid="${esc(x.id)}"` })}
        ${x.state === 'running' ? U.iconButton({ icon: 'rotate-cw', label: 'Restart', attrs: `data-caction="restart" data-cid="${esc(x.id)}"` }) : ''}
        ${published.length ? U.iconButton({
          icon: 'globe',
          label: x.state === 'running' ? `Open in Firefox — ${containerUrl(published[0])}` : 'Start the container to open its address',
          attrs: `data-caction="firefox" data-cid="${esc(x.id)}" data-cname="${esc(x.name)}" data-cports="${published.join(',')}"${x.state === 'running' ? '' : ' disabled'}`,
        }) : ''}
        ${U.iconButton({
          icon: 'terminal',
          label: x.state === 'running' ? 'Open shell' : 'Start the container to open a shell',
          attrs: `data-caction="exec" data-cid="${esc(x.id)}" data-cname="${esc(x.name)}"${x.state === 'running' ? '' : ' disabled'}`,
        })}
        ${U.iconButton({ icon: 'file-code', label: 'Logs', attrs: `data-caction="logs" data-cid="${esc(x.id)}" data-cname="${esc(x.name)}"` })}
        ${U.iconButton({ icon: 'trash', tone: 'red', label: 'Remove', attrs: `data-caction="remove" data-cid="${esc(x.id)}" data-cname="${esc(x.name)}"` })}
      </div></td>
    </tr>`;
  }

  function containerRows(items) {
    const filtered = items.filter(containerMatches);
    if (!filtered.length) {
      return `<tr><td colspan="7">${U.empty({ compact: true, icon: 'search', title: 'No matching containers', body: 'Adjust the search, project or state filter.' })}</td></tr>`;
    }
    if (!state.containerFilter.grouped) return filtered.map(containerRow).join('');

    const groups = new Map();
    for (const item of filtered) {
      const key = projectKey(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      if (a === '__standalone') return 1;
      if (b === '__standalone') return -1;
      return a.localeCompare(b);
    });
    return keys.map((key) => {
      const groupItems = groups.get(key).sort((a, b) => {
        const service = String(a.service || a.name).localeCompare(String(b.service || b.name));
        return service !== 0 ? service : String(a.name).localeCompare(String(b.name));
      });
      const running = groupItems.filter((x) => x.state === 'running').length;
      const services = new Set(groupItems.map((x) => x.service).filter(Boolean)).size;
      return `<tr class="container-group-row" data-group-row="${esc(key)}"><td colspan="7">
        <div class="container-group-inner">
          <span class="container-group-icon">${icon(key === '__standalone' ? 'box' : 'boxes', 13)}</span>
          <span class="container-group-name">${esc(projectLabel(key))}</span>
          <span class="badge mono">${groupItems.length} container${groupItems.length === 1 ? '' : 's'}</span>
          ${services ? `<span class="badge mono tone-slate">${services} service${services === 1 ? '' : 's'}</span>` : ''}
          <span class="container-group-meta"><span class="dot-indicator ${running ? 'running' : 'exited'}"></span>${running} running</span>
          ${key !== '__standalone' ? `<button type="button" class="btn btn-sm btn-ghost" data-project-only="${esc(key)}">${icon('filter', 11)}<span>Show only this project</span></button>` : ''}
          <span class="container-group-spacer"></span>
        </div>
      </td></tr>${groupItems.map(containerRow).join('')}`;
    }).join('');
  }

  async function renderContainers() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const [res, stats] = await Promise.all([api.docker.containers(), api.docker.stats().catch(() => ({ items: [] }))]);
    if (!res.ok) return engineDown(res.error);
    const statMap = new Map((stats.items || []).map((s) => [s.name, s]));
    const items = (res.items || []).map((x) => {
      const s = statMap.get(x.name);
      return s ? { ...x, cpuPercent: s.cpuPercent, memoryBytes: s.memoryUsed } : x;
    });
    state.last.containers = items;
    if (state.containerFilter.grouped == null) {
      state.containerFilter.grouped = OD.store.state.settings?.groupContainers === true;
    }
    if (state.containerFilter.project !== 'all') {
      const keys = new Set(items.map(projectKey));
      if (!keys.has(state.containerFilter.project)) state.containerFilter.project = 'all';
    }
    const counts = { all: items.length, running: 0, exited: 0, paused: 0, created: 0 };
    for (const x of items) counts[x.state] = (counts[x.state] || 0) + 1;
    const projects = containerProjects(items);
    const grouped = state.containerFilter.grouped === true;
    const projectName = state.containerFilter.project === 'all' ? '' : projectLabel(state.containerFilter.project);
    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'box', title: 'Containers',
        sub: 'Inspect state, stream logs, and control lifecycle operations without leaving the keyboard.',
        actions: `${U.button({ label: 'Run container', icon: 'play', variant: 'primary', attrs: 'data-action="run-container"' })}${U.button({ label: 'Refresh', icon: 'refresh', variant: 'secondary', attrs: 'data-action="refresh"' })}`,
      })}
      <div class="toolbar">
        <label class="search-box">${icon('search', 14)}<input id="container-search" type="search" placeholder="Search name, image, project, service…" value="${esc(state.containerFilter.q)}" /><span class="kbd">/</span></label>
        <div class="filter-row">
          ${['all', 'running', 'exited', 'paused', 'created'].map((s) => `<button type="button" class="chip ${state.containerFilter.status === s ? 'active' : ''}" data-cstate="${s}">${esc(titleCase(s))}<span class="chip-count">${counts[s] || 0}</span></button>`).join('')}
        </div>
        <div class="toolbar-spacer"></div>
        ${projects.length > 1 ? `<label class="field toolbar-field"><span>Project</span><select class="input" id="container-project">
          <option value="all" ${state.containerFilter.project === 'all' ? 'selected' : ''}>All projects (${items.length})</option>
          ${projects.map((p) => `<option value="${esc(p.key)}" ${state.containerFilter.project === p.key ? 'selected' : ''}>${esc(projectLabel(p.key))} (${p.total})</option>`).join('')}
        </select></label>` : ''}
        ${projects.length > 1 ? `<button type="button" class="btn ${grouped ? 'btn-primary' : 'btn-secondary'} btn-sm" data-container-group-toggle>${icon('boxes', 14)}<span>${grouped ? 'Grouped' : 'Group by project'}</span></button>` : ''}
        <span class="muted text-xs">${projectName ? `${projectName} · ` : ''}${items.length} containers</span>
      </div>
      <div class="card flush">
        <div class="table-wrap">
          <table class="data-table containers-table">
            <thead><tr><th>Container</th><th>State</th><th>Ports</th><th>CPU / memory</th><th>Uptime</th><th>Project</th><th></th></tr></thead>
            <tbody id="container-tbody">${containerRows(items)}</tbody>
          </table>
        </div>
      </div>
      <div class="mt-4">${U.infoBanner('Context-aware learning', 'Every container links to the Academy lesson that explains its lifecycle, networking or storage behaviour.', 'info', learnLink('run-exec-logs', 'Open container lessons'))}</div>
    </div>`;
  }

  async function showLogs(item) {
    const tail = { value: 300 };
    const drawer = U.drawer({
      title: item.name,
      subtitle: item.id,
      eyebrow: 'Container logs',
      icon: 'terminal',
      width: '760px',
      body: `<div class="row gap-2 mb-2"><label class="field" style="width:130px"><span>Tail</span><select class="input" id="log-tail">${[100, 300, 600, 1200].map((n) => `<option value="${n}" ${n === 300 ? 'selected' : ''}>${n} lines</option>`).join('')}</select></label><div class="toolbar-spacer"></div>${U.button({ label: 'Refresh', icon: 'refresh', size: 'sm', attrs: 'data-action="reload-logs"' })}</div>
        <div class="log-view" id="log-view">${U.loader('Reading logs…')}</div>`,
      footer: `<span class="faint text-xs mono">docker logs --tail 300 --timestamps ${esc(item.id)}</span><div class="row gap-2">${OD.store.lessonById('logs-and-debugging') ? `<a class="btn btn-sm btn-ghost" href="#/academy/lesson/logs-and-debugging">${icon('graduation-cap', 13)}<span>Debugging lesson</span></a>` : ''}${U.button({ label: 'Copy command', icon: 'copy', size: 'sm', attrs: `data-copy-text="docker logs --tail 300 --timestamps ${esc(item.id)}"` })}</div>`,
      onMount: ({ root, close, onClose }) => {
        const view = root.querySelector('#log-view');
        const select = root.querySelector('#log-tail');
        let stopped = false;
        onClose(() => { stopped = true; });
        const load = async () => {
          if (stopped) return;
          view.innerHTML = U.loader('Reading logs…');
          const res = await api.docker.containerLogs(item.id, Number(select.value) || 300);
          if (stopped) return;
          async function refreshLogs() { await load(); }
          root.querySelector('[data-action="reload-logs"]')?.addEventListener('click', refreshLogs, { once: true });
          const text = [res.stdout, res.stderr].filter(Boolean).join('\n');
          view.innerHTML = text
            ? `<pre>${esc(text)}</pre>`
            : U.empty({ compact: true, icon: 'terminal', title: 'No log output', body: 'The container has not written to stdout or stderr.' });
        };
        load();
        select.addEventListener('change', load);
        const interval = setInterval(load, 6000);
        onClose(() => clearInterval(interval));
      },
    });
    return drawer;
  }

  function showExec(item) {
    if (item.state !== 'running') {
      U.toast('Container is not running', 'warning', { description: 'Start it first to open an interactive shell.' });
      return;
    }
    const short = shortId(item.id, 12);
    const MAX_OUTPUT = 250000;
    U.drawer({
      title: item.name,
      subtitle: `${short} · docker exec`,
      eyebrow: 'Container shell',
      icon: 'terminal',
      width: '880px',
      body: `<div class="terminal-shell terminal-drawer" id="exec-shell">
        <div class="term-head">
          <div class="term-lights"><i></i><i></i><i></i></div>
          <span class="term-title" id="exec-title">${esc(item.name)} · starting shell</span>
          <span id="exec-state">connecting</span>
        </div>
        <div class="term-body" id="exec-output">
          <div class="term-block" id="exec-starting"><div class="meta">${icon('loader', 11)}<span>Starting a shell inside ${esc(item.name)}…</span></div></div>
        </div>
        <form class="term-input-row" id="exec-form" autocomplete="off">
          <span class="p">$</span>
          <input id="exec-input" type="text" autocomplete="off" spellcheck="false" placeholder="Type a command and press Enter" disabled />
          <button class="btn btn-sm btn-primary" type="submit" disabled>Run</button>
        </form>
        <div class="term-hint">Enter runs inside the container · ↑/↓ history · Ctrl+L clears · closing this panel ends the session</div>
      </div>`,
      footer: `<span class="faint text-xs mono">docker exec -it ${esc(short)} bash</span><div class="row gap-2">${learnLink('run-exec-logs', 'Exec and logs lesson')}${U.button({ label: 'Copy command', icon: 'copy', size: 'sm', attrs: `data-copy-text="docker exec -it ${esc(short)} bash"` })}${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}</div>`,
      onMount: ({ root, onClose }) => {
        const output = root.querySelector('#exec-output');
        const form = root.querySelector('#exec-form');
        const input = root.querySelector('#exec-input');
        const runBtn = form.querySelector('button[type="submit"]');
        const titleEl = root.querySelector('#exec-title');
        const stateEl = root.querySelector('#exec-state');
        const starting = root.querySelector('#exec-starting');
        let sessionId = null;
        let closed = false;
        let ended = false;
        let stick = true;
        const history = [];
        let histIndex = 0;
        const pending = [];

        output.addEventListener('scroll', () => {
          stick = output.scrollHeight - output.scrollTop - output.clientHeight < 48;
        });

        const scroll = (force) => { if (force || stick) output.scrollTop = output.scrollHeight; };

        const appendText = (text) => {
          if (!text) return;
          let pre = output.lastElementChild;
          if (!pre || pre.tagName !== 'PRE') {
            pre = document.createElement('pre');
            pre.className = 'term-stream';
            output.appendChild(pre);
          }
          pre.appendChild(document.createTextNode(text));
          while (output.textContent.length > MAX_OUTPUT && output.firstChild) output.removeChild(output.firstChild);
          scroll();
        };

        const appendEcho = (command) => {
          const line = document.createElement('div');
          line.className = 'term-line';
          const prompt = document.createElement('span');
          prompt.className = 'p';
          prompt.textContent = '$';
          const cmd = document.createElement('span');
          cmd.className = 'cmd';
          cmd.textContent = command;
          line.append(prompt, cmd);
          output.appendChild(line);
          stick = true;
          scroll();
        };

        const appendNotice = (text, tone) => {
          const block = document.createElement('div');
          block.className = 'term-block';
          const meta = document.createElement('div');
          meta.className = 'meta';
          const code = document.createElement('span');
          code.className = `code ${tone || ''}`.trim();
          code.textContent = tone === 'error' ? 'error' : 'opsdeck';
          const message = document.createElement('span');
          message.textContent = text;
          meta.append(code, message);
          block.appendChild(meta);
          output.appendChild(block);
          scroll(true);
        };

        const setRunning = (running) => {
          input.disabled = !running;
          runBtn.disabled = !running;
          if (running) input.focus();
        };

        const handleExit = (payload) => {
          if (ended) return;
          ended = true;
          setRunning(false);
          stateEl.textContent = payload.code === 0 ? 'exited' : 'ended';
          const detail = payload.signal ? `Session closed (${payload.signal}).` : `Session ended with exit code ${payload.code ?? '?'}.`;
          appendNotice(detail, payload.code === 0 ? 'ok' : 'error');
        };

        const unsubscribeData = api.events.execData((payload) => {
          if (!payload) return;
          if (!sessionId) { pending.push({ type: 'data', payload }); return; }
          if (payload.sessionId === sessionId) appendText(payload.data);
        });
        const unsubscribeExit = api.events.execExit((payload) => {
          if (!payload) return;
          if (!sessionId) { pending.push({ type: 'exit', payload }); return; }
          if (payload.sessionId === sessionId) handleExit(payload);
        });

        onClose(() => {
          closed = true;
          unsubscribeData();
          unsubscribeExit();
          if (sessionId && !ended) api.docker.execStop(sessionId);
        });

        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!sessionId || ended) return;
          const command = input.value;
          input.value = '';
          if (!command.trim()) return;
          appendEcho(command);
          history.push(command);
          if (history.length > 120) history.shift();
          histIndex = history.length;
          const res = await api.docker.execInput(sessionId, `${command}\n`);
          if (!res.ok && !ended) {
            ended = true;
            setRunning(false);
            appendNotice(res.error || 'The session has ended.', 'error');
          }
        });

        input.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!history.length) return;
            histIndex = Math.max(0, histIndex - 1);
            input.value = history[histIndex] || '';
            input.setSelectionRange(input.value.length, input.value.length);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!history.length) return;
            histIndex = Math.min(history.length, histIndex + 1);
            input.value = histIndex >= history.length ? '' : history[histIndex];
          } else if (event.key.toLowerCase() === 'l' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            output.innerHTML = '';
            stick = true;
          }
        });

        (async () => {
          const res = await api.docker.execStart(item.id);
          if (closed) {
            if (res.ok) api.docker.execStop(res.sessionId);
            return;
          }
          if (!res.ok) {
            starting?.remove();
            ended = true;
            stateEl.textContent = 'unavailable';
            appendNotice(res.error || 'Could not open a shell in this container.', 'error');
            return;
          }
          sessionId = res.sessionId;
          titleEl.textContent = `${item.name} · ${res.shellLabel || res.shell}`;
          stateEl.textContent = 'connected';
          starting?.remove();
          output.innerHTML = '';
          appendNotice(`Connected with ${res.shellLabel || res.shell}. Commands run inside the container.`, 'ok');
          for (const entry of pending.splice(0)) {
            if (entry.type === 'data') appendText(entry.payload.data);
            else handleExit(entry.payload);
          }
          if (!ended) setRunning(true);
        })();
      },
    });
  }

  async function launchFirefox(url) {
    const res = await api.app.openInFirefox(url);
    if (res?.ok) U.toast('Opening in Firefox', 'success', { description: url });
    else U.toast('Could not open Firefox', 'error', { description: res?.error || 'Unknown error' });
  }

  function openContainerInFirefox(item, rawPorts) {
    const ports = (typeof rawPorts === 'string' ? rawPorts.split(',') : [])
      .map((value) => Number(value))
      .filter((port) => Number.isInteger(port) && port > 0 && port < 65536);
    const unique = [...new Set(ports)].sort((a, b) => a - b);
    if (!unique.length) {
      U.toast('No published address', 'info', { description: 'This container does not publish any TCP ports.' });
      return;
    }
    if (unique.length === 1) {
      launchFirefox(containerUrl(unique[0]));
      return;
    }
    U.modal({
      title: 'Open container address',
      subtitle: `${item.name} publishes ${unique.length} TCP ports. Choose the one to open in Firefox.`,
      eyebrow: 'Published ports',
      icon: 'globe',
      width: '540px',
      body: `<div class="quick-grid">${unique.map((port) => `<button type="button" class="quick-link" data-open-port="${port}">
        ${icon('external-link', 14)}
        <span class="mono">localhost:${port}</span>
        <span class="badge mono">${port === 443 || port === 8443 ? 'https' : 'http'}</span>
      </button>`).join('')}</div>
        <div class="muted text-xs mt-3">${icon('info', 12)} Addresses use localhost because the ports are published on this machine.</div>`,
      actions: [{ id: 'cancel', label: 'Cancel', variant: 'ghost' }],
      onMount: ({ root, close }) => {
        root.querySelectorAll('[data-open-port]').forEach((button) => {
          button.addEventListener('click', () => {
            close('open');
            launchFirefox(containerUrl(Number(button.dataset.openPort)));
          });
        });
      },
    });
  }

  async function showInspect(item) {
    const res = await api.docker.inspectContainer(item.id);
    if (!res.ok) {
      U.toast(res.error || 'Could not inspect container', 'error');
      return;
    }
    const d = res.item;
    const lesson = OD.store.contextLesson('container', item);
    const mounts = (d.mounts || []).map((m) => `<tr><td class="mono">${esc(m.Destination)}</td><td>${esc(m.Type)}</td><td class="mono">${esc(m.Name || m.Source || '')}</td><td>${m.RW ? 'rw' : 'ro'}</td></tr>`).join('');
    const networks = Object.entries(d.networks || {}).map(([name, n]) => `<tr><td>${esc(name)}</td><td class="mono">${esc(n.IPAddress || '—')}</td><td class="mono">${esc(n.Gateway || '—')}</td><td>${esc(n.MacAddress || '—')}</td></tr>`).join('');
    const env = (d.env || []).map((e) => `<tr><td class="mono">${esc(e.key)}</td><td class="mono">${esc(e.value)}</td></tr>`).join('');
    const published = publishedTcpPorts(item);
    const firefoxAction = published.length && item.state === 'running'
      ? U.button({ label: 'Open in Firefox', icon: 'globe', size: 'sm', variant: 'secondary', attrs: `data-open-firefox="${published.join(',')}"` })
      : '';
    U.drawer({
      title: d.name || item.name,
      subtitle: d.id,
      eyebrow: 'Container detail',
      icon: 'box',
      width: '820px',
      body: `<div class="detail-hero">
        <span class="icon-chip tone-green" style="--chip-size:42px">${icon('box', 20)}</span>
        <div style="flex:1;min-width:0"><div class="name">${esc(d.name)}</div><div class="sub">${esc(d.image)}</div></div>
        ${U.stateBadge(d.state?.Status || item.state, d.state?.Status || item.state)}
      </div>
      <div class="detail-grid">
        <div class="detail-section"><h4>Runtime</h4>${U.kvRows([
          ['Created', esc(timeAgo(d.createdAt)), false],
          ['Started', esc(timeAgo(d.state?.StartedAt)), false],
          ['Exit code', esc(d.state?.ExitCode ?? '—'), true],
          ['Restart policy', esc(d.restartPolicy?.Name || 'no'), true],
          ['PID', esc(d.state?.Pid ?? '—'), true],
          ['Platform', esc(d.platform || '—'), true],
        ])}</div>
        <div class="detail-section"><h4>Command</h4>${U.kvRows([
          ['Entrypoint', `<span class="mono">${esc((d.entrypoint || []).join(' ') || '—')}</span>`, false],
          ['Cmd', `<span class="mono">${esc((d.cmd || []).join(' ') || '—')}</span>`, false],
          ['Working dir', esc(d.workingDir || '—'), true],
          ['User', esc(d.user || 'root'), true],
        ])}</div>
      </div>
      <div class="section-head"><div><h2 class="section-title">Environment</h2></div><span class="muted text-xs">${(d.env || []).length} variables</span></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${env || '<tr><td colspan="2" class="muted">No environment variables.</td></tr>'}</tbody></table></div>
      <div class="section-head"><div><h2 class="section-title">Mounts</h2></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Destination</th><th>Type</th><th>Source / name</th><th>Mode</th></tr></thead><tbody>${mounts || '<tr><td colspan="4" class="muted">No mounts.</td></tr>'}</tbody></table></div>
      <div class="section-head"><div><h2 class="section-title">Networks</h2></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Network</th><th>IP</th><th>Gateway</th><th>MAC</th></tr></thead><tbody>${networks || '<tr><td colspan="4" class="muted">No networks.</td></tr>'}</tbody></table></div>
      <div class="section-head"><div><h2 class="section-title">Labels</h2></div></div>
      <div class="tag-row">${Object.entries(d.labels || {}).map(([k, v]) => `<span class="badge mono">${esc(k)}=${esc(v)}</span>`).join('') || '<span class="muted text-sm">No labels.</span>'}</div>`,
      footer: `<div class="row gap-2">${learnLink(lesson?.id, 'Explain this container')}${firefoxAction}${U.button({ label: 'Copy inspect command', icon: 'copy', size: 'sm', attrs: `data-copy-text="docker inspect ${esc(item.id)}"` })}</div>${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}`,
      onMount: ({ root }) => {
        root.querySelector('[data-open-firefox]')?.addEventListener('click', (event) => {
          openContainerInFirefox(item, event.currentTarget.dataset.openFirefox);
        });
      },
    });
  }

  function openRunContainer() {
    U.modal({
      title: 'Run a container',
      subtitle: 'The command is executed through the main process with an argument array, never a shell.',
      icon: 'play',
      width: '560px',
      body: `<div class="stack-3">
        <label class="field"><span>Image</span><input class="input" id="run-image" value="alpine:3.20" placeholder="nginx:1.27-alpine" autofocus /></label>
        <div class="split-2">
          <label class="field"><span>Name (optional)</span><input class="input" id="run-name" placeholder="my-container" /></label>
          <label class="field"><span>Port mapping</span><input class="input" id="run-ports" placeholder="127.0.0.1:8080:80" /></label>
        </div>
        <label class="field"><span>Environment</span><input class="input" id="run-env" placeholder="LOG_LEVEL=info, TZ=UTC" /></label>
        <label class="field"><span>Command (optional)</span><input class="input" id="run-cmd" placeholder="sh -c 'echo hello'" /></label>
        <div class="command-line"><span class="prompt">$</span><code id="run-preview">docker run -d alpine:3.20</code></div>
        <div class="muted text-xs">${icon('shield-check', 12)} Ports default to loopback if you provide a host address. Do not publish databases to 0.0.0.0.</div>
      </div>`,
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        { id: 'run', label: 'Run in terminal', variant: 'primary', icon: 'play', close: false, onClick: async ({ root, close }) => {
          const image = root.querySelector('#run-image').value.trim();
          if (!image) { U.toast('An image is required', 'error'); return; }
          const name = root.querySelector('#run-name').value.trim();
          const ports = root.querySelector('#run-ports').value.trim();
          const env = root.querySelector('#run-env').value.trim();
          const cmd = root.querySelector('#run-cmd').value.trim();
          const command = ['docker', 'run', '-d', name ? `--name ${name}` : '', ports ? `-p ${ports}` : '', env ? env.split(',').map((v) => `-e ${v.trim()}`).join(' ') : '', image, cmd].filter(Boolean).join(' ');
          const ok = await U.confirm({ title: 'Execute Docker command', message: 'OpsDeck will execute this command against your local Docker engine.', detail: command, confirmLabel: 'Run command', tone: 'accent' });
          if (!ok) return;
          const res = await api.docker.runTerminal(command, true);
          if (res.ok) U.toast('Container started', 'success', { description: String(res.stdout || '').slice(0, 140) || command });
          else U.toast('Command failed', 'error', { description: res.error || res.stderr || command });
          close('run');
          rerender();
        } },
      ],
      onMount: ({ root }) => {
        const preview = root.querySelector('#run-preview');
        const update = () => {
          const image = root.querySelector('#run-image').value.trim() || '<image>';
          const name = root.querySelector('#run-name').value.trim();
          const ports = root.querySelector('#run-ports').value.trim();
          const env = root.querySelector('#run-env').value.trim();
          const cmd = root.querySelector('#run-cmd').value.trim();
          preview.textContent = ['docker', 'run', '-d', name ? `--name ${name}` : '', ports ? `-p ${ports}` : '', env ? env.split(',').map((v) => `-e ${v.trim()}`).join(' ') : '', image, cmd].filter(Boolean).join(' ');
        };
        root.querySelectorAll('input').forEach((input) => input.addEventListener('input', update));
      },
    });
  }

  // ------------------------------------------------------------------ images

  function imageMatches(x) {
    const f = state.imageFilter;
    if (f.kind === 'dangling' && !x.dangling) return false;
    if (f.kind === 'used' && x.dangling) return false;
    const q = f.q.trim().toLowerCase();
    if (!q) return true;
    return `${x.name} ${x.id} ${x.registry}`.toLowerCase().includes(q);
  }

  async function renderImages() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.images();
    if (!res.ok) return engineDown(res.error);
    const items = res.items || [];
    state.last.images = items;
    const total = items.reduce((sum, x) => sum + parseSize(x.size), 0);
    const dangling = items.filter((x) => x.dangling).length;
    const used = items.filter((x) => !x.dangling && String(x.containers || '') !== '0' && x.containers !== 'N/A').length;
    const filtered = items.filter(imageMatches);
    const rows = filtered.map((x) => `<tr>
      <td><div class="cell-main"><span class="icon-chip tone-${x.dangling ? 'slate' : 'violet'}" style="--chip-size:28px">${icon('layers', 14)}</span><div><div class="cell-title mono">${esc(x.repository)}:${esc(x.tag)}</div><div class="cell-sub mono">${esc(shortId(x.id, 19))}</div></div></div></td>
      <td class="cell-mono">${esc(x.size)}</td>
      <td class="cell-nowrap">${esc(x.createdSince || timeAgo(x.createdAt))}</td>
      <td class="cell-mono">${esc(x.containers ?? '—')}</td>
      <td>${x.dangling ? U.badge('dangling', 'slate') : `<span class="badge tone-cyan">${esc(x.registry)}</span>`}</td>
      <td><div class="row-actions">
        ${U.iconButton({ icon: 'history', label: 'History', attrs: `data-iact="history" data-iid="${esc(x.id)}" data-iname="${esc(x.name)}"` })}
        ${U.iconButton({ icon: 'tag', label: 'Tag', attrs: `data-iact="tag" data-iid="${esc(x.id)}" data-iname="${esc(x.name)}"` })}
        ${U.iconButton({ icon: 'trash', tone: 'red', label: 'Remove', attrs: `data-iact="remove" data-iid="${esc(x.id)}" data-iname="${esc(x.name)}"` })}
      </div></td>
    </tr>`).join('');

    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'layers', title: 'Images',
        sub: 'Understand layer composition, tags and registry provenance before you build or prune.',
        actions: `${U.button({ label: 'Pull image', icon: 'download', variant: 'primary', attrs: 'data-action="pull-image"' })}${U.button({ label: 'Prune dangling', icon: 'trash', variant: 'secondary', attrs: 'data-action="prune-images"' })}${U.button({ label: 'Refresh', icon: 'refresh', variant: 'ghost', attrs: 'data-action="refresh"' })}`,
      })}
      <div class="stat-grid">
        ${U.statCard({ label: 'Local images', value: items.length, sub: `${dangling} dangling`, icon: 'layers', tone: 'violet' })}
        ${U.statCard({ label: 'On-disk size', value: fmtBytes(total), sub: 'shared layers counted per image', icon: 'hard-drive', tone: 'cyan' })}
        ${U.statCard({ label: 'In use', value: used, sub: 'referenced by containers', icon: 'box', tone: 'green' })}
        ${U.statCard({ label: 'Registries', value: new Set(items.map((x) => x.registry)).size, sub: 'distinct sources', icon: 'cloud', tone: 'accent' })}
      </div>
      <div class="toolbar mt-4">
        <label class="search-box">${icon('search', 14)}<input id="image-search" type="search" placeholder="Search repository, tag or digest…" value="${esc(state.imageFilter.q)}" /></label>
        <div class="filter-row">${[['all', 'All'], ['used', 'In use'], ['dangling', 'Dangling']].map(([k, label]) => `<button type="button" class="chip ${state.imageFilter.kind === k ? 'active' : ''}" data-ikind="${k}">${label}</button>`).join('')}</div>
        <div class="toolbar-spacer"></div>
        <span class="muted text-xs">${filtered.length} of ${items.length}</span>
      </div>
      <div class="card flush"><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Image</th><th>Size</th><th>Created</th><th>Containers</th><th>Registry</th><th></th></tr></thead>
        <tbody id="image-tbody">${rows || `<tr><td colspan="6">${U.empty({ compact: true, icon: 'layers', title: 'No matching images', body: 'Pull an image or adjust the filter.' })}</td></tr>`}</tbody>
      </table></div></div>
      <div class="mt-4">${U.infoBanner('Context-aware learning', 'Open the image anatomy lesson to understand digests, shared layers and why image history is not a secret store.', 'info', learnLink('image-anatomy', 'Image anatomy lesson'))}</div>
    </div>`;
  }

  async function showImageHistory(item) {
    const res = await api.docker.imageAction(item.id, 'history');
    if (!res.ok) { U.toast(res.error || 'Could not read image history', 'error'); return; }
    const rows = (res.data || []).map((h) => `<tr><td class="mono">${esc(shortId(h.ID || '', 12))}</td><td class="cell-nowrap">${esc(h.CreatedSince || '—')}</td><td class="cell-mono" style="max-width:360px;overflow-wrap:anywhere">${esc(h.CreatedBy || '—')}</td><td class="cell-mono">${esc(h.Size || '—')}</td></tr>`).join('');
    U.drawer({
      title: item.name,
      subtitle: item.id,
      eyebrow: 'Image history',
      icon: 'history',
      width: '880px',
      body: `<div class="banner banner-info"><div class="banner-icon">${icon('shield', 16)}</div><div class="banner-text"><strong>History is not a secret store</strong><span>Build arguments and commands appear in layer history. Never bake credentials into an image.</span></div></div>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Layer</th><th>Created</th><th>Created by</th><th>Size</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">No history returned.</td></tr>'}</tbody></table></div>`,
      footer: `<div class="row gap-2">${learnLink('image-anatomy', 'Explain layers')}${U.button({ label: 'Copy command', icon: 'copy', size: 'sm', attrs: `data-copy-text="docker image history --no-trunc ${esc(item.id)}"` })}</div>${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}`,
    });
  }

  async function pullImage() {
    const ref = await U.prompt({ title: 'Pull an image', label: 'Image reference', placeholder: 'nginx:1.27-alpine', hint: 'Pin a version or digest for reproducible environments.', confirmLabel: 'Pull image' });
    if (!ref) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,220}$/.test(ref)) { U.toast('That image reference is not valid', 'error'); return; }
    const ok = await U.confirm({ title: 'Pull image', message: `OpsDeck will run docker pull for this reference.`, detail: `docker pull ${ref}`, confirmLabel: 'Pull', tone: 'accent' });
    if (!ok) return;
    U.toast('Pulling image…', 'info', { description: ref });
    const res = await api.docker.runTerminal(`docker pull ${ref}`, true);
    if (res.ok) { U.toast('Image pulled', 'success', { description: ref }); rerender(); }
    else U.toast('Pull failed', 'error', { description: res.error || res.stderr || 'Check the reference and network access.' });
  }

  // ------------------------------------------------------------------ compose

  async function renderCompose() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.composeList();
    if (!res.ok) return engineDown(res.error);
    const items = res.items || [];
    state.last.compose = items;
    const totalRunning = items.reduce((sum, p) => sum + (p.running || 0), 0);

    const cards = items.map((p) => `<section class="card project-card">
      <div class="project-head">
        <div style="min-width:0">
          <div class="project-name">${icon('boxes', 15)}<span>${esc(p.name)}</span>${/running/i.test(p.status) ? U.badge('running', 'green', { dot: true }) : U.badge(p.status || 'stopped', 'slate')}</div>
          <div class="project-file" title="${esc(p.files[0] || '')}">${esc(p.files[0] || 'No config file')}</div>
        </div>
        <div class="row gap-1">
          ${U.iconButton({ icon: 'file-code', label: 'Resolved config', attrs: `data-pact="config" data-project="${esc(p.name)}"` })}
          ${U.iconButton({ icon: 'terminal', label: 'Logs', attrs: `data-pact="logs" data-project="${esc(p.name)}"` })}
        </div>
      </div>
      <div class="project-stats">
        <div class="project-stat"><span>Running</span><strong>${p.running || 0}</strong></div>
        <div class="project-stat"><span>Files</span><strong>${(p.files || []).length}</strong></div>
        <div class="project-stat"><span>Status</span><strong style="font-size:11px">${esc(p.status || '—')}</strong></div>
      </div>
      <div class="project-actions">
        ${U.button({ label: 'Up', icon: 'play', size: 'sm', variant: 'primary', attrs: `data-pact="up" data-project="${esc(p.name)}"` })}
        ${U.button({ label: 'Restart', icon: 'rotate-cw', size: 'sm', attrs: `data-pact="restart" data-project="${esc(p.name)}"` })}
        ${U.button({ label: 'Stop', icon: 'square', size: 'sm', attrs: `data-pact="stop" data-project="${esc(p.name)}"` })}
        ${U.button({ label: 'Down', icon: 'power', size: 'sm', variant: 'danger', attrs: `data-pact="down" data-project="${esc(p.name)}"` })}
        <div class="toolbar-spacer"></div>
        ${learnLink('compose-architecture')}
      </div>
    </section>`).join('');

    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'boxes', title: 'Compose',
        sub: 'Manage multi-service projects with resolved configuration, logs and lifecycle controls.',
        actions: `${U.button({ label: 'Refresh', icon: 'refresh', variant: 'secondary', attrs: 'data-action="refresh"' })}${U.button({ label: 'Compose docs', variant: 'primary', icon: 'book-open', attrs: 'data-goto="#/academy/course/docker-compose"' })}`,
      })}
      ${items.length ? `<div class="summary-strip mb-4">
        <div class="summary-item"><span>Projects</span><strong>${items.length}</strong></div>
        <div class="summary-item"><span>Running services</span><strong>${totalRunning}</strong></div>
        <div class="summary-item"><span>Compose engine</span><strong style="font-size:12px">${esc(OD.store.state.status?.compose || '—')}</strong></div>
        <div class="summary-item"><span>Academy lessons</span><strong>${OD.store.courseById('docker-compose')?.lessonCount || 0}</strong></div>
      </div>` : ''}
      ${items.length ? `<div class="project-grid">${cards}</div>` : U.card({ body: U.empty({ icon: 'boxes', title: 'No Compose projects found', body: 'Start a project from a directory with a compose.yaml, or run the Academy lab to build one step by step.', action: `<div class="row gap-2">${U.button({ label: 'Open Compose Academy', icon: 'graduation-cap', variant: 'primary', attrs: 'data-goto="#/academy/course/docker-compose"' })}${U.button({ label: 'Guided Compose lab', icon: 'flask', variant: 'secondary', attrs: 'data-goto="#/academy/labs/lab-compose"' })}</div>` }) })}
      <div class="mt-4">${U.infoBanner('Compose project names matter', 'OpsDeck uses the project name to find the config file and to run scoped lifecycle commands. Sandbox labs prefix every project with opsdeck-lab-.', 'info', learnLink('compose-architecture', 'Compose architecture'))}</div>
    </div>`;
  }

  async function showComposeConfig(project) {
    const res = await api.docker.composeConfig(project);
    if (!res.ok) { U.toast(res.error || 'Could not resolve Compose config', 'error'); return; }
    const pretty = res.config ? JSON.stringify(res.config, null, 2) : String(res.raw || '');
    const services = res.config?.services ? Object.keys(res.config.services) : [];
    U.drawer({
      title: project,
      subtitle: res.file || '',
      eyebrow: 'Resolved Compose configuration',
      icon: 'file-code',
      width: '780px',
      body: `<div class="pill-row mb-3">${services.map((s) => `<span class="badge tone-violet">${esc(s)}</span>`).join('') || '<span class="muted text-sm">No services reported.</span>'}</div>
        <div class="config-view"><div class="config-toolbar"><span class="path">${esc(res.file || '')}</span>${U.button({ label: 'Copy', icon: 'copy', size: 'sm', attrs: `data-copy-text="${esc(pretty)}"` })}</div><pre>${esc(pretty)}</pre></div>`,
      footer: `<div class="row gap-2">${learnLink('compose-services', 'Compose services lesson')}${U.button({ label: 'Copy path', icon: 'copy', size: 'sm', attrs: `data-copy-text="${esc(res.file || '')}"` })}</div>${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}`,
    });
  }

  async function showComposeLogs(project) {
    U.drawer({
      title: project,
      eyebrow: 'Compose logs',
      icon: 'terminal',
      width: '780px',
      body: `<div class="row gap-2 mb-2"><span class="muted text-xs">Last 200 lines, ANSI stripped</span><div class="toolbar-spacer"></div>${U.button({ label: 'Reload', icon: 'refresh', size: 'sm', attrs: 'data-action="reload-compose-logs"' })}</div><div class="log-view" id="compose-log-view">${U.loader('Reading logs…')}</div>`,
      footer: `<span class="mono faint text-xs">docker compose -p ${esc(project)} logs --tail 200</span>${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}`,
      onMount: ({ root, onClose }) => {
        const view = root.querySelector('#compose-log-view');
        const load = async () => {
          view.innerHTML = U.loader('Reading logs…');
          const res = await api.docker.composeAction(project, 'logs', { tail: 200 });
          const text = res.stdout || res.error || '';
          view.innerHTML = text ? `<pre>${esc(text)}</pre>` : U.empty({ compact: true, icon: 'terminal', title: 'No log output', body: 'Services may not have written logs yet.' });
        };
        load();
        root.querySelector('[data-action="reload-compose-logs"]').addEventListener('click', load);
        onClose(() => {});
      },
    });
  }

  // ------------------------------------------------------------------ volumes

  async function renderVolumes() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.volumes();
    if (!res.ok) return engineDown(res.error);
    const items = res.items || [];
    state.last.volumes = items;
    const rows = items.map((v) => `<tr>
      <td><div class="cell-main"><span class="icon-chip tone-orange" style="--chip-size:28px">${icon('database', 14)}</span><div><div class="cell-title mono">${esc(v.name)}</div><div class="cell-sub">${esc(v.scope || 'local')} scope</div></div></div></td>
      <td class="cell-mono">${esc(v.driver || '—')}</td>
      <td class="cell-nowrap">${esc(v.createdAt ? timeAgo(v.createdAt) : '—')}</td>
      <td>${Object.entries(v.labels || {}).slice(0, 2).map(([k, val]) => `<span class="badge mono">${esc(k)}=${esc(val)}</span>`).join(' ') || '<span class="faint">—</span>'}</td>
      <td><div class="row-actions">
        ${U.iconButton({ icon: 'eye', label: 'Inspect', attrs: `data-vact="inspect" data-vname="${esc(v.name)}"` })}
        ${U.iconButton({ icon: 'trash', tone: 'red', label: 'Remove', attrs: `data-vact="remove" data-vname="${esc(v.name)}"` })}
      </div></td>
    </tr>`).join('');
    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'database', title: 'Volumes',
        sub: 'Persistent storage managed by Docker. Named volumes survive container removal and are never host bind mounts.',
        actions: `${U.button({ label: 'Create volume', icon: 'plus', variant: 'primary', attrs: 'data-action="create-volume"' })}${U.button({ label: 'Prune unused', icon: 'trash', variant: 'secondary', attrs: 'data-action="prune-volumes"' })}${U.button({ label: 'Refresh', icon: 'refresh', variant: 'ghost', attrs: 'data-action="refresh"' })}`,
      })}
      <div class="summary-strip mb-4">
        <div class="summary-item"><span>Volumes</span><strong>${items.length}</strong></div>
        <div class="summary-item"><span>Drivers</span><strong>${new Set(items.map((v) => v.driver)).size}</strong></div>
        <div class="summary-item"><span>Compose-managed</span><strong>${items.filter((v) => Object.keys(v.labels || {}).some((k) => k.includes('compose'))).length}</strong></div>
        <div class="summary-item"><span>Storage lesson</span><strong>${OD.store.courseById('docker-volumes')?.lessonCount || 0} lessons</strong></div>
      </div>
      <div class="card flush"><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Volume</th><th>Driver</th><th>Created</th><th>Labels</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">${U.empty({ compact: true, icon: 'database', title: 'No volumes', body: 'Named volumes appear here once a container or Compose project creates one.', action: U.button({ label: 'Create volume', size: 'sm', variant: 'primary', attrs: 'data-action="create-volume"' }) })}</td></tr>`}</tbody>
      </table></div></div>
      <div class="mt-4">${U.infoBanner('Volumes are not backups', 'A volume survives container removal, but it still lives on this host. Back up data explicitly and document restore steps.', 'warning', learnLink('storage-and-volumes', 'Storage lesson'))}</div>
    </div>`;
  }

  async function createVolume() {
    const name = await U.prompt({ title: 'Create a volume', label: 'Volume name', placeholder: 'app-data', hint: 'Lowercase letters, digits, underscores, dots and dashes.', confirmLabel: 'Create' });
    if (!name) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) { U.toast('Invalid volume name', 'error'); return; }
    const res = await api.docker.volumeAction(name, 'create', {});
    if (res.ok) { U.toast('Volume created', 'success', { description: `docker volume create ${name}` }); rerender(); }
    else U.toast('Could not create volume', 'error', { description: res.error });
  }

  // ------------------------------------------------------------------ networks

  async function renderNetworks() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.networks();
    if (!res.ok) return engineDown(res.error);
    const items = res.items || [];
    state.last.networks = items;
    const rows = items.map((n) => `<tr>
      <td><div class="cell-main"><span class="icon-chip tone-cyan" style="--chip-size:28px">${icon('network', 14)}</span><div><div class="cell-title mono">${esc(n.name)}</div><div class="cell-sub mono">${esc(shortId(n.id, 12))}</div></div></div></td>
      <td>${U.badge(n.driver || 'bridge', n.driver === 'bridge' ? 'accent' : n.driver === 'overlay' ? 'violet' : 'cyan')}</td>
      <td class="cell-nowrap">${esc(n.scope || '—')}</td>
      <td>${n.internal ? U.badge('internal', 'amber') : '<span class="faint">—</span>'}</td>
      <td>${n.ipv6 ? U.badge('IPv6', 'cyan') : '<span class="faint">—</span>'}</td>
      <td class="cell-nowrap">${esc(n.createdAt ? timeAgo(n.createdAt) : '—')}</td>
      <td><div class="row-actions">
        ${U.iconButton({ icon: 'eye', label: 'Inspect', attrs: `data-nact="inspect" data-nname="${esc(n.name)}"` })}
        ${U.iconButton({ icon: 'trash', tone: 'red', label: 'Remove', attrs: `data-nact="remove" data-nname="${esc(n.name)}"` })}
      </div></td>
    </tr>`).join('');
    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'network', title: 'Networks',
        sub: 'User-defined bridge networks provide embedded DNS and isolation. Prefer them over the default bridge.',
        actions: `${U.button({ label: 'Create network', icon: 'plus', variant: 'primary', attrs: 'data-action="create-network"' })}${U.button({ label: 'Prune unused', icon: 'trash', variant: 'secondary', attrs: 'data-action="prune-networks"' })}${U.button({ label: 'Refresh', icon: 'refresh', variant: 'ghost', attrs: 'data-action="refresh"' })}`,
      })}
      <div class="summary-strip mb-4">
        <div class="summary-item"><span>Networks</span><strong>${items.length}</strong></div>
        <div class="summary-item"><span>User-defined bridge</span><strong>${items.filter((n) => n.driver === 'bridge' && !['bridge', 'host', 'none'].includes(n.name)).length}</strong></div>
        <div class="summary-item"><span>Overlay</span><strong>${items.filter((n) => n.driver === 'overlay').length}</strong></div>
        <div class="summary-item"><span>Internal only</span><strong>${items.filter((n) => n.internal).length}</strong></div>
      </div>
      <div class="card flush"><div class="table-wrap"><table class="data-table">
        <thead><tr><th>Network</th><th>Driver</th><th>Scope</th><th>Internal</th><th>IPv6</th><th>Created</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${U.empty({ compact: true, icon: 'network', title: 'No networks', body: 'Create a user-defined bridge network to get name resolution between services.' })}</td></tr>`}</tbody>
      </table></div></div>
      <div class="mt-4">${U.infoBanner('Name resolution needs a user-defined network', 'Containers on the default bridge do not resolve each other by name. Compose creates a user-defined network per project automatically.', 'info', learnLink('bridge-dns', 'Networking lesson'))}</div>
    </div>`;
  }

  async function createNetwork() {
    const form = `<div class="stack-3">
      <label class="field"><span>Network name</span><input class="input" id="net-name" placeholder="app-net" autofocus /></label>
      <div class="split-2">
        <label class="field"><span>Driver</span><select class="input" id="net-driver"><option value="bridge">bridge</option><option value="overlay">overlay</option><option value="macvlan">macvlan</option></select></label>
        <label class="field"><span>Subnet (optional)</span><input class="input" id="net-subnet" placeholder="172.28.0.0/16" /></label>
      </div>
      <label class="row gap-2" style="align-items:center"><input type="checkbox" id="net-internal" /> <span class="text-sm">Internal network (no external access)</span></label>
    </div>`;
    U.modal({
      title: 'Create a network',
      icon: 'network',
      width: '500px',
      body: form,
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        { id: 'create', label: 'Create network', variant: 'primary', icon: 'plus', close: false, onClick: async ({ root, close }) => {
          const name = root.querySelector('#net-name').value.trim();
          const driver = root.querySelector('#net-driver').value;
          const subnet = root.querySelector('#net-subnet').value.trim();
          const internal = root.querySelector('#net-internal').checked;
          if (!name) { U.toast('A network name is required', 'error'); return; }
          const res = await api.docker.networkAction(name, 'create', { driver, subnet, internal });
          if (res.ok) { U.toast('Network created', 'success', { description: name }); close('create'); rerender(); }
          else U.toast('Could not create network', 'error', { description: res.error });
        } },
      ],
    });
  }

  // ------------------------------------------------------------------ builds

  async function renderBuilds() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.builds();
    if (!res.ok) return engineDown(res.error);
    const items = res.items || [];
    const cache = res.cache;
    const cards = items.map((b) => `<section class="card builder-card">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">
        <div class="builder-title">${icon('hammer', 15)}<span>${esc(b.name)}</span>${b.current ? U.badge('current', 'green', { dot: true }) : ''}</div>
        <span class="badge tone-cyan">${esc(b.driver)}</span>
      </div>
      <div class="builder-meta">
        <span class="badge tone-slate">${b.dynamic ? 'dynamic' : 'static'}</span>
        <span class="badge tone-slate">${(b.nodes || []).length} nodes</span>
        <span class="badge tone-slate">active ${esc(b.lastActivity || '—')}</span>
      </div>
      <div class="section-head" style="margin:12px 0 6px"><div><h2 class="section-title" style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint)">Nodes</h2></div></div>
      ${(b.nodes || []).map((n) => `<div class="stack-2" style="margin-bottom:8px">
        <div class="row" style="justify-content:space-between;gap:8px"><span class="mono text-xs">${esc(n.name)}</span>${U.badge(n.status || 'unknown', /running/i.test(n.status || '') ? 'green' : 'slate')}</div>
        <div class="platform-list">${(n.platforms || []).map((p) => `<span class="platform-pill">${esc(p)}</span>`).join('') || '<span class="faint text-xs">No platforms reported</span>'}</div>
      </div>`).join('')}
    </section>`).join('');

    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'hammer', title: 'Builds',
        sub: 'Buildx builders, node platforms and build cache. Reproducible images start with pinned inputs.',
        actions: `${U.button({ label: 'Build an image', icon: 'play', variant: 'primary', attrs: 'data-action="build-image"' })}${U.button({ label: 'Refresh', icon: 'refresh', variant: 'secondary', attrs: 'data-action="refresh"' })}`,
      })}
      ${items.length ? `<div class="builder-grid">${cards}</div>` : U.card({ body: U.empty({ icon: 'hammer', title: 'No buildx builders', body: 'Create a builder or use the default Docker build driver. The academy build lesson walks through the full pipeline.', action: U.button({ label: 'Open build academy', icon: 'graduation-cap', variant: 'primary', attrs: 'data-goto="#/academy/course/docker-build-buildkit"' }) }) })}
      <div class="split-2 mt-4">
        ${U.card({
          title: 'Build cache', icon: 'hard-drive', sub: cache ? `${cache.sizeLabel || ''} reclaimable ${cache.reclaimableLabel || ''}` : 'No build cache reported',
          body: cache ? `<div class="stack-3"><div class="disk-row"><span class="label">Cache</span><div>${U.meter(cache.size, Math.max(cache.size, 1), 'violet', { hideLabel: true, label: '' })}</div><span class="value"><strong>${esc(cache.sizeLabel || '')}</strong></span></div><div class="muted text-xs">${esc(String(cache.count || 0))} cache records. Prune with <span class="mono">docker builder prune</span> when the daemon is idle.</div></div>` : U.empty({ compact: true, icon: 'hard-drive', title: 'No cache data', body: 'BuildKit reports cache usage after a build.' }),
        })}
        ${U.card({
          title: 'Reproducible build recipe', icon: 'shield-check', sub: 'The shape of a reviewable build command',
          body: `<div class="command-line mb-2"><span class="prompt">$</span><code>docker buildx build --platform linux/amd64,linux/arm64 -t registry.example.com/app:1.4.0 --push .</code></div>${U.kvRows([
            ['Pin bases', 'Use a version tag or digest, never latest alone.'],
            ['One concern', 'Separate build and runtime stages.'],
            ['Cache', 'Use --cache-from/--cache-to in CI.'],
            ['Provenance', 'Attach SBOM and provenance attestations.'],
          ])}<div class="mt-3">${learnLink('buildkit-architecture', 'BuildKit lesson')}</div>`,
        })}
      </div>
    </div>`;
  }

  function openBuildImage() {
    U.modal({
      title: 'Build an image',
      subtitle: 'Build a Dockerfile into a tagged image. The command is passed as arguments to the Docker CLI.',
      icon: 'hammer',
      width: '560px',
      body: `<div class="stack-3">
        <label class="field"><span>Image tag</span><input class="input" id="build-tag" value="opsdeck/app:dev" autofocus /></label>
        <div class="split-2">
          <label class="field"><span>Dockerfile</span><input class="input" id="build-file" placeholder="Dockerfile" /></label>
          <label class="field"><span>Platform</span><input class="input" id="build-platform" placeholder="linux/amd64" /></label>
        </div>
        <label class="field"><span>Build context (absolute path)</span><input class="input" id="build-context" placeholder="/home/you/project" /></label>
        <label class="row gap-2" style="align-items:center"><input type="checkbox" id="build-nocache" /> <span class="text-sm">Disable cache</span></label>
        <div class="command-line"><span class="prompt">$</span><code id="build-preview">docker build -t opsdeck/app:dev .</code></div>
      </div>`,
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'ghost' },
        { id: 'build', label: 'Run build', variant: 'primary', icon: 'play', close: false, onClick: async ({ root, close }) => {
          const tag = root.querySelector('#build-tag').value.trim();
          const file = root.querySelector('#build-file').value.trim();
          const platform = root.querySelector('#build-platform').value.trim();
          const ctx = root.querySelector('#build-context').value.trim() || '.';
          const nocache = root.querySelector('#build-nocache').checked;
          if (!tag) { U.toast('An image tag is required', 'error'); return; }
          const command = ['docker', 'build', `-t ${tag}`, file ? `-f ${file}` : '', platform ? `--platform ${platform}` : '', nocache ? '--no-cache' : '', ctx].filter(Boolean).join(' ');
          const ok = await U.confirm({ title: 'Run image build', message: 'Building can take several minutes and consumes CPU and disk. The command runs against your local engine.', detail: command, confirmLabel: 'Start build', tone: 'accent' });
          if (!ok) return;
          close('build');
          U.toast('Build started', 'info', { description: tag });
          const res = await api.docker.runTerminal(command, true);
          if (res.ok) { U.toast('Build completed', 'success', { description: tag }); rerender(); }
          else U.toast('Build failed', 'error', { description: (res.error || res.stderr || '').slice(0, 220) });
        } },
      ],
      onMount: ({ root }) => {
        const preview = root.querySelector('#build-preview');
        const update = () => {
          const tag = root.querySelector('#build-tag').value.trim() || '<tag>';
          const file = root.querySelector('#build-file').value.trim();
          const platform = root.querySelector('#build-platform').value.trim();
          const ctx = root.querySelector('#build-context').value.trim() || '.';
          const nocache = root.querySelector('#build-nocache').checked;
          preview.textContent = ['docker', 'build', `-t ${tag}`, file ? `-f ${file}` : '', platform ? `--platform ${platform}` : '', nocache ? '--no-cache' : '', ctx].filter(Boolean).join(' ');
        };
        root.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
      },
    });
  }

  // ------------------------------------------------------------------ registries

  async function renderRegistries() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.registries();
    if (!res.ok) return engineDown(res.error);
    const auth = res.authenticated || [];
    const usage = res.imageRegistries || [];
    const max = Math.max(1, ...usage.map((u) => u.count));
    const search = state.registry;

    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'cloud', title: 'Registries',
        sub: 'Authenticated endpoints, image provenance and Docker Hub search. Credentials stay in the Docker config, never in OpsDeck.',
        actions: `${U.button({ label: 'Refresh', icon: 'refresh', variant: 'secondary', attrs: 'data-action="refresh"' })}${learnLink('registry-auth', 'Registry lesson')}`,
      })}
      <div class="split-2">
        ${U.card({
          title: 'Authenticated registries', icon: 'key', sub: res.credsStore ? `Credential store: ${res.credsStore}` : 'Credentials are read from the Docker config',
          body: auth.length ? `<div class="stack-2">${auth.map((a) => `<div class="registry-row"><span class="icon-chip tone-green" style="--chip-size:26px">${icon('key', 12)}</span><span class="host">${esc(a.host)}</span><span class="badge tone-slate">${esc(a.username || 'token')}</span></div>`).join('')}</div>` : U.empty({ compact: true, icon: 'lock', title: 'No registry logins', body: 'Run docker login in a terminal to add credentials. OpsDeck never asks for or stores your password.' }),
          footer: `<span class="mono text-xs faint" title="${esc(res.configPath || '')}">${esc(res.configPath || '')}</span>`,
        })}
        ${U.card({
          title: 'Image sources', icon: 'cloud', sub: 'Local image count by registry',
          body: usage.length ? `<div class="registry-usage">${usage.map((u) => `<div class="registry-row"><span class="host">${esc(u.host)}</span><span class="count">${u.count}</span><div style="width:110px">${U.meter(u.count, max, 'cyan', { label: '', showLabel: false, size: 'sm' })}</div></div>`).join('')}</div>` : U.empty({ compact: true, icon: 'layers', title: 'No images yet', body: 'Pull an image to see registry usage.' }),
        })}
      </div>
      ${U.card({
        title: 'Docker Hub search', icon: 'search', sub: 'Search public repositories. Verify the publisher before pulling.',
        body: `<form id="registry-form" class="row gap-2 mb-3"><label class="search-box">${icon('search', 14)}<input id="registry-query" type="search" placeholder="Search Docker Hub, e.g. postgres" value="${esc(search.query)}" /></label>${U.button({ label: 'Search', icon: 'search', variant: 'primary', attrs: 'type="submit"' })}</form>
        <div id="registry-results">${search.loading ? U.loader('Searching Docker Hub…') : search.error ? U.errorBanner('Search failed', search.error) : search.items ? registryResults(search.items) : U.empty({ compact: true, icon: 'search', title: 'Search public images', body: 'Results include stars, official status and a copyable pull command.' })}</div>`,
      })}
      <div class="mt-4">${U.infoBanner('Verify before you pull', 'Official images are maintained by Docker; verified publishers are marked by Docker Hub. Pin a digest in production so a tag cannot move under you.', 'warning', learnLink('registry-auth', 'Registry authentication'))}</div>
    </div>`;
  }

  function registryResults(items) {
    if (!items.length) return U.empty({ compact: true, icon: 'search', title: 'No repositories found', body: 'Try a broader term or check the spelling.' });
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Repository</th><th>Description</th><th>Stars</th><th>Trust</th><th></th></tr></thead><tbody>${items.map((r) => `<tr>
      <td><div class="cell-title mono">${esc(r.name)}</div></td>
      <td><div class="cell-sub" style="max-width:440px;white-space:normal">${esc(r.description || 'No description')}</div></td>
      <td class="cell-mono">${fmtNumber(r.stars || 0)}</td>
      <td>${r.official ? U.badge('official', 'green', { dot: true }) : r.automated ? U.badge('automated', 'cyan') : U.badge('community', 'slate')}</td>
      <td><div class="row-actions">${U.iconButton({ icon: 'copy', label: 'Copy pull command', attrs: `data-copy-text="docker pull ${esc(r.name)}"` })}${U.iconButton({ icon: 'play', label: 'Run in terminal', attrs: `data-run-command="docker pull ${esc(r.name)}"` })}</div></td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  // ------------------------------------------------------------------ monitoring

  function monitoringRows(items) {
    if (!items.length) return `<tr><td colspan="7">${U.empty({ compact: true, icon: 'activity', title: 'No running containers', body: 'Start a container to collect live resource samples.' })}</td></tr>`;
    return items.map((s) => `<tr>
      <td><div class="cell-main"><span class="dot-indicator running"></span><div><div class="cell-title">${esc(s.name)}</div><div class="cell-sub mono">${esc(s.id)}</div></div></div></td>
      <td style="min-width:130px">${U.meter(s.cpuPercent, Math.max(100, s.cpuPercent), s.cpuPercent > 80 ? 'red' : s.cpuPercent > 50 ? 'amber' : 'green', { label: `${s.cpuPercent.toFixed(1)}%`, showLabel: true })}</td>
      <td style="min-width:150px">${U.meter(s.memoryUsed, Math.max(s.memoryLimit, s.memoryUsed), s.memoryPercent > 80 ? 'red' : 'cyan', { label: s.memoryLabel || fmtBytes(s.memoryUsed), showLabel: true })}</td>
      <td class="cell-mono">${fmtBytes(s.netIn)} ↓ / ${fmtBytes(s.netOut)} ↑</td>
      <td class="cell-mono">${fmtBytes(s.blockRead)} / ${fmtBytes(s.blockWrite)}</td>
      <td class="cell-mono">${s.pids}</td>
      <td>${learnLink(OD.store.contextLesson('container', { image: s.name })?.id, '')}</td>
    </tr>`).join('');
  }

  async function renderMonitoring() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const res = await api.docker.stats();
    if (!res.ok) return engineDown(res.error);
    const items = res.items || [];
    state.last.stats = items;
    const totalCpu = items.reduce((sum, s) => sum + s.cpuPercent, 0);
    const memUsed = items.reduce((sum, s) => sum + s.memoryUsed, 0);
    const memHost = OD.store.state.status?.memory || 1;
    const memPercent = Math.min(100, (memUsed / memHost) * 100);
    OD.store.pushSample({ cpu: totalCpu, mem: memPercent, net: items.length });

    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'activity', title: 'Monitoring',
        sub: 'Live per-container CPU, memory, network and block I/O sampled from docker stats.',
        actions: `${U.button({ label: 'Refresh now', icon: 'refresh', variant: 'secondary', attrs: 'data-action="refresh"' })}<span class="badge tone-green" id="mon-live-badge"><i class="badge-dot"></i>Live · 4s</span>`,
      })}
      <div class="stat-grid">
        ${U.statCard({ label: 'Aggregate CPU', value: `${totalCpu.toFixed(1)}%`, sub: `${items.length} running containers`, icon: 'cpu', tone: 'accent' })}
        ${U.statCard({ label: 'Memory', value: fmtBytes(memUsed), sub: `${memPercent.toFixed(1)}% of ${fmtBytes(memHost)}`, icon: 'hard-drive', tone: 'cyan' })}
        ${U.statCard({ label: 'Highest CPU', value: items.length ? `${Math.max(...items.map((s) => s.cpuPercent)).toFixed(1)}%` : '—', sub: items.length ? items.slice().sort((a, b) => b.cpuPercent - a.cpuPercent)[0].name : 'no samples', icon: 'zap', tone: 'amber' })}
        ${U.statCard({ label: 'Processes', value: fmtNumber(items.reduce((sum, s) => sum + s.pids, 0)), sub: 'PIDs across containers', icon: 'server', tone: 'violet' })}
      </div>
      <div class="split-2 mt-4">
        ${U.card({ title: 'CPU pressure', icon: 'cpu', sub: 'Aggregate across running containers', body: `<div id="mon-cpu-chart">${OD.charts.area(OD.store.state.history.cpu, { height: 170, labels: ['60s', 'now'], label: 'Aggregate CPU' })}</div>` })}
        ${U.card({ title: 'Memory pressure', icon: 'hard-drive', sub: 'Percentage of host memory', body: `<div id="mon-mem-chart">${OD.charts.area(OD.store.state.history.mem, { height: 170, color: 'var(--cyan)', format: (v) => `${Math.round(v)}%`, labels: ['60s', 'now'], label: 'Memory percent' })}</div>` })}
      </div>
      <div class="section-head"><div><div class="section-eyebrow">${icon('server', 12)}Containers</div><h2 class="section-title">Per-container telemetry</h2></div><span class="muted text-xs" id="mon-sample-time">sampled ${esc(new Date().toLocaleTimeString('en-US', { hour12: false }))}</span></div>
      <div class="card flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>Container</th><th>CPU</th><th>Memory</th><th>Network</th><th>Block I/O</th><th>PIDs</th><th></th></tr></thead><tbody id="mon-tbody">${monitoringRows(items)}</tbody></table></div></div>
      <div class="mt-4">${U.infoBanner('Learn to read the numbers', 'CPU percentage can exceed 100% when a container uses multiple cores. Memory limits are the ceiling, not the working set.', 'info', learnLink('resource-limits', 'Resource limits lesson'))}</div>
    </div>`;
  }

  // ------------------------------------------------------------------ events

  async function renderEvents() {
    if (engineOfflineStatus()) return engineDown(OD.store.state.status?.reason);
    const f = state.eventFilter;
    const res = await api.docker.events(f.since);
    if (!res.ok) return engineDown(res.error);
    const all = res.items || [];
    const items = f.type === 'all' ? all : all.filter((e) => e.type === f.type);
    const types = ['all', ...new Set(all.map((e) => e.type).filter(Boolean))];
    const rows = items.map((e) => {
      const name = e.attributes?.name || e.attributes?.image || e.attributes?.container || shortId(e.id);
      const attrs = Object.entries(e.attributes || {}).filter(([k]) => !['name', 'image'].includes(k)).slice(0, 3).map(([k, v]) => `<span class="badge mono">${esc(k)}=${esc(v)}</span>`).join(' ');
      return `<tr><td class="cell-nowrap mono text-xs">${esc(new Date(e.time).toLocaleTimeString('en-US', { hour12: false }))}</td><td>${U.badge(e.type || 'event', /container/.test(e.type) ? 'accent' : /image/.test(e.type) ? 'violet' : /network/.test(e.type) ? 'cyan' : 'orange')}</td><td><span class="cell-title">${esc(e.action)}</span></td><td><div class="cell-title mono" style="font-size:11px">${esc(name)}</div><div class="cell-sub mono">${esc(shortId(e.id, 16))}</div></td><td><div class="tag-row">${attrs || '<span class="faint">—</span>'}</div></td><td class="cell-nowrap">${esc(timeAgo(e.time))}</td></tr>`;
    }).join('');

    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'list', title: 'Events',
        sub: 'A structured view of engine activity. Use it to correlate a failure with the operation that caused it.',
        actions: `${U.button({ label: 'Refresh', icon: 'refresh', variant: 'secondary', attrs: 'data-action="refresh"' })}`,
      })}
      <div class="toolbar">
        <div class="filter-row">${types.map((t) => `<button type="button" class="chip ${f.type === t ? 'active' : ''}" data-etype="${esc(t)}">${esc(titleCase(t))}</button>`).join('')}</div>
        <div class="toolbar-spacer"></div>
        <label class="field" style="flex-direction:row;align-items:center;gap:7px"><span class="text-xs muted">Window</span><select class="input" id="event-since" style="height:30px">${[[300, '5 minutes'], [3600, '1 hour'], [86400, '24 hours'], [604800, '7 days']].map(([v, l]) => `<option value="${v}" ${f.since === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="card flush"><div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Type</th><th>Action</th><th>Actor</th><th>Attributes</th><th>When</th></tr></thead><tbody>${rows || `<tr><td colspan="6">${U.empty({ compact: true, icon: 'list', title: 'No events in this window', body: 'Perform a Docker operation or widen the time window.' })}</td></tr>`}</tbody></table></div></div>
      <div class="mt-4">${U.infoBanner('Events are not logs', 'Events describe state transitions such as create, start, die and destroy. Container output lives in docker logs.', 'info', learnLink('logs-and-debugging', 'Logs and debugging'))}</div>
    </div>`;
  }

  // ------------------------------------------------------------------ terminal

  function terminalBody() {
    const t = state.terminal;
    if (!t.history.length && !t.busy) {
      return `<div class="term-block"><div class="meta">${icon('terminal', 12)}<span>OpsDeck terminal · Docker CLI only</span></div><pre>Commands run through execFile with an argument array. Shell operators, pipes and redirection are rejected. Type a Docker command below, or pick a starter.</pre></div>`;
    }
    return t.history.map((h) => {
      const out = h.res.ok ? (h.res.stdout || '') : (h.res.stderr || h.res.error || '');
      return `<div class="term-block">
        <div class="term-line"><span class="p">$</span><span class="cmd">${esc(h.command)}</span></div>
        <div class="meta"><span class="code ${h.res.ok ? 'ok' : ''}">${h.res.ok ? 'exit 0' : `exit ${h.res.code ?? 'error'}`}</span><span>${esc(new Date(h.at).toLocaleTimeString('en-US', { hour12: false }))}</span>${h.res.timedOut ? '<span>timed out</span>' : ''}</div>
        ${out ? `<pre>${esc(out)}</pre>` : ''}
        ${h.res.blocked ? `<pre>Blocked by the command validator: ${esc(h.res.error || '')}</pre>` : ''}
      </div>`;
    }).join('') + (t.busy ? `<div class="term-block"><div class="meta">${icon('loader', 11)}<span>Running…</span></div></div>` : '');
  }

  function renderTerminal() {
    const t = state.terminal;
    return `<div class="page">
      ${pageHead({
        eyebrow: 'Docker workspace', iconName: 'terminal', title: 'Terminal',
        sub: 'A constrained Docker console. It is not a host shell: shell operators, pipes and host paths are rejected before execution.',
        actions: `${U.button({ label: 'Clear', icon: 'trash', variant: 'secondary', attrs: 'data-action="clear-terminal"' })}<span class="badge tone-${t.consent ? 'green' : 'amber'}">${t.consent ? 'Consent granted' : 'Consent required'}</span>`,
      })}
      ${!t.consent ? `<div id="term-consent">${U.infoBanner('Explicit consent is required', 'Running commands affects your local Docker engine. OpsDeck validates every command, rejects privileged and host-level options, and never uses a shell. Review the command before you run it.', 'warning', U.button({ label: 'Review consent', icon: 'shield-check', size: 'sm', variant: 'primary', attrs: 'data-action="terminal-consent"' }))}</div>` : ''}
      <div class="terminal-shell">
        <div class="term-head"><div class="term-lights"><i></i><i></i><i></i></div><span class="term-title">opsdeck — docker</span><span>${esc(OD.store.state.status?.context || 'default')}</span></div>
        <div class="term-body" id="term-body">${terminalBody()}</div>
        <form class="term-input-row" id="term-form"><span class="p">$</span><input id="term-input" type="text" autocomplete="off" spellcheck="false" placeholder="docker ps -a" value="${esc(t.pending || '')}" /><button class="btn btn-sm btn-primary" type="submit">Run</button></form>
        <div class="term-hint">↑/↓ history · commands are validated · Docker CLI only</div>
      </div>
      <div class="section-head"><div><div class="section-eyebrow">${icon('zap', 12)}Starters</div><h2 class="section-title">Safe commands</h2></div></div>
      <div class="pill-row">${['docker ps -a', 'docker images', 'docker compose ls', 'docker system df', 'docker version', 'docker info'].map((c) => `<button type="button" class="chip" data-fill-command="${esc(c)}">${icon('terminal', 11)}${esc(c)}</button>`).join('')}</div>
      <div class="mt-4">${U.infoBanner('Why no shell?', 'A shell would allow pipes, redirects and command substitution. OpsDeck tokenizes the command and passes it directly to the Docker binary, which removes an entire class of injection risk.', 'info', learnLink('cli-anatomy', 'CLI anatomy lesson'))}</div>
    </div>`;
  }

  function paintTerminal(root) {
    const body = root.querySelector('#term-body');
    if (body) {
      body.innerHTML = terminalBody();
      body.scrollTop = body.scrollHeight;
    }
    const consent = root.querySelector('#term-consent');
    if (consent) consent.hidden = state.terminal.consent;
    const badge = root.querySelector('.page-actions .badge');
    if (badge) {
      badge.className = `badge tone-${state.terminal.consent ? 'green' : 'amber'}`;
      badge.textContent = state.terminal.consent ? 'Consent granted' : 'Consent required';
    }
    const input = root.querySelector('#term-input');
    if (input && state.terminal.pending) { input.value = state.terminal.pending; state.terminal.pending = null; }
  }

  async function ensureTerminalConsent() {
    if (state.terminal.consent) return true;
    const ok = await U.confirm({
      title: 'Run Docker commands',
      message: 'OpsDeck will execute validated Docker CLI commands against your local engine. Commands can create, stop and remove containers and images. You are responsible for what you run.',
      detail: 'Safety: no shell, no privileged mode, no host networking, no Docker socket mounts, no capability additions.',
      confirmLabel: 'I understand, continue',
      tone: 'warning',
    });
    if (ok) state.terminal.consent = true;
    return ok;
  }

  async function runTerminalCommand(root, raw) {
    const command = String(raw || '').trim();
    if (!command || state.terminal.busy) return;
    if (!(await ensureTerminalConsent())) return;
    state.terminal.busy = true;
    paintTerminal(root);
    const res = await api.docker.runTerminal(command, true);
    state.terminal.history.push({ command, res, at: Date.now() });
    if (state.terminal.history.length > 60) state.terminal.history.shift();
    state.terminal.busy = false;
    paintTerminal(root);
    if (!res.ok && res.blocked) U.toast('Command blocked', 'warning', { description: res.error });
  }

  function terminalPending(command) {
    state.terminal.pending = String(command || '');
    if (OD.store.state.route?.name === 'terminal') rerender();
  }

  // ------------------------------------------------------------------ settings

  function renderSettings() {
    const s = OD.store.state.settings || {};
    const info = OD.store.state.info || {};
    const a = OD.store.overallStats();
    const goal = Number(s.dailyGoalMinutes || OD.store.state.academy.meta?.dailyGoalMinutes || 20);
    const themes = [['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['system', 'System', 'monitor']];
    return `<div class="page">
      ${pageHead({
        eyebrow: 'OpsDeck', iconName: 'settings', title: 'Settings',
        sub: 'Appearance, learning goals, local data and the security model behind every operation.',
        actions: `${U.button({ label: 'Reload content', icon: 'refresh', variant: 'secondary', attrs: 'data-action="reload-content"' })}`,
      })}
      <div class="split-2">
        <div class="stack-3">
          ${U.card({
            title: 'Appearance', icon: 'palette', sub: 'Dark is the default. Light mode is designed, not inverted.',
            body: `<div class="stack-3">
              <div><div class="rail-progress-label"><span>Theme</span></div><div class="filter-row">${themes.map(([v, label, ic]) => `<button type="button" class="chip ${(s.theme || 'dark') === v ? 'active' : ''}" data-theme-set="${v}">${icon(ic, 13)}${label}</button>`).join('')}</div></div>
              <div>
                <div class="rail-progress-label"><span>Interface scale</span><span class="mono text-xs" data-zoom-value>${Math.round((OD.store.state.zoomFactor || 1) * 100)}%</span></div>
                <div class="row gap-2" style="align-items:center">
                  <button type="button" class="btn btn-sm btn-secondary" data-action="zoom-out" title="Zoom out (Ctrl −)">${icon('zoom-out', 14)}<span>Smaller</span></button>
                  <button type="button" class="btn btn-sm btn-secondary" data-action="zoom-in" title="Zoom in (Ctrl +)">${icon('zoom-in', 14)}<span>Larger</span></button>
                  <button type="button" class="btn btn-sm btn-ghost" data-action="zoom-reset" title="Reset to 100% (Ctrl 0)">${icon('rotate-ccw', 13)}<span>Reset</span></button>
                </div>
                <div class="text-xs faint mt-2">Ctrl + / Ctrl − / Ctrl 0, or hold Ctrl and scroll. The scale is remembered between launches.</div>
              </div>
              <label class="row gap-2" style="align-items:center"><input type="checkbox" id="set-motion" ${s.motion === 'reduced' ? 'checked' : ''} /> <span class="text-sm">Reduce motion</span></label>
              <label class="row gap-2" style="align-items:center"><input type="checkbox" id="set-transparency" ${s.reduceTransparency ? 'checked' : ''} /> <span class="text-sm">Reduce transparency and blur</span></label>
              <label class="row gap-2" style="align-items:center"><input type="checkbox" id="set-collapse" ${s.sidebarCollapsed ? 'checked' : ''} /> <span class="text-sm">Collapse the sidebar by default</span></label>
            </div>`,
          })}
          ${U.card({
            title: 'Learning', icon: 'graduation-cap', sub: 'Academy goals and local progress',
            body: `<div class="stack-3">
              <div class="split-2">
                <div class="summary-item"><span>Lessons complete</span><strong>${a.completed}<small> / ${a.lessons}</small></strong></div>
                <div class="summary-item"><span>Current streak</span><strong>${a.streak.current}<small> days</small></strong></div>
              </div>
              <label class="field" style="max-width:220px"><span>Daily goal</span><select class="input" id="set-goal">${[10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${goal === m ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></label>
              <div class="row gap-2">${U.button({ label: 'Reset all progress', icon: 'rotate-ccw', variant: 'danger', size: 'sm', attrs: 'data-action="reset-progress"' })}<span class="text-xs muted">Progress lives only on this device.</span></div>
            </div>`,
          })}
          ${U.card({
            title: 'Security model', icon: 'shield-check', sub: 'What OpsDeck will and will not do',
            body: `<div class="guide-list">
              <li class="ok">${icon('check', 13)}<span>Docker is invoked with <span class="mono">execFile</span> and an argument array. There is no shell.</span></li>
              <li class="ok">${icon('check', 13)}<span>Commands are tokenized and checked for privileged mode, host namespaces, device passthrough and socket mounts.</span></li>
              <li class="ok">${icon('check', 13)}<span>API credentials stay in the Docker config. OpsDeck never stores registry passwords.</span></li>
              <li class="ok">${icon('check', 13)}<span>Renderer is isolated: context isolation, sandbox, no Node integration, strict CSP.</span></li>
              <li>${icon('x', 13)}<span>OpsDeck cannot protect you from a Docker daemon that is already root-equivalent. Treat daemon access as admin access.</span></li>
            </div>`,
          })}
        </div>
        <div class="stack-3">
          ${U.card({
            title: 'Application', icon: 'deck', sub: `${info.name || 'OpsDeck'} ${info.version || ''}`,
            body: U.kvRows([
              ['Product', 'OpsDeck — Operations Studio', false],
              ['Version', esc(info.version || '—'), true],
              ['Electron', esc(info.electron || '—'), true],
              ['Chromium', esc(info.chrome || '—'), true],
              ['Node', esc(info.node || '—'), true],
              ['Platform', `${esc(info.platform || '—')} / ${esc(info.arch || '—')}`, true],
              ['Host', esc(info.hostname || '—'), true],
              ['Content version', esc(info.contentVersion || '—'), true],
            ]),
            footer: `<span class="text-xs faint">Docker is the first workspace, not the product limit.</span>`,
          })}
          ${U.card({
            title: 'Workspaces', icon: 'layout-dashboard', sub: 'The platform is designed to grow beyond Docker',
            body: `<div class="stack-2">
              <div class="registry-row"><span class="icon-chip tone-accent" style="--chip-size:26px">${icon('box', 12)}</span><span class="host">Docker</span>${U.badge('active', 'green', { dot: true })}</div>
              <div class="registry-row"><span class="icon-chip tone-violet" style="--chip-size:26px">${icon('cloud', 12)}</span><span class="host">Kubernetes</span>${U.badge('planned', 'slate')}</div>
              <div class="registry-row"><span class="icon-chip tone-orange" style="--chip-size:26px">${icon('database', 12)}</span><span class="host">Databases</span>${U.badge('planned', 'slate')}</div>
              <div class="registry-row"><span class="icon-chip tone-cyan" style="--chip-size:26px">${icon('activity', 12)}</span><span class="host">Observability</span>${U.badge('planned', 'slate')}</div>
            </div>`,
          })}
          ${U.card({
            title: 'Keyboard', icon: 'keyboard', sub: 'Move without the mouse',
            body: U.kvRows([
              ['Command palette', '<span class="kbd">Ctrl</span> <span class="kbd">K</span>', false],
              ['Toggle sidebar', '<span class="kbd">Ctrl</span> <span class="kbd">B</span>', false],
              ['Academy search', '<span class="kbd">Ctrl</span> <span class="kbd">Shift</span> <span class="kbd">F</span>', false],
              ['Close overlay', '<span class="kbd">Esc</span>', false],
              ['Focus search', '<span class="kbd">/</span>', false],
            ]),
          })}
          ${U.card({
            title: 'About the origin', icon: 'book-open', sub: 'Built as an independent studio',
            body: `<p class="text-sm muted" style="line-height:1.65">OpsDeck is an independent operations studio. The Docker Academy content is authored for this application and validated at build time. Docker and the Docker logo are trademarks of Docker, Inc. OpsDeck is not affiliated with Docker, Inc.</p><div class="mt-3"><a class="btn btn-sm btn-ghost" href="#/academy/glossary">${icon('book-open', 13)}<span>Glossary</span></a></div>`,
          })}
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------ mounting

  function bindCommon(root) {
    root.addEventListener('click', async (event) => {
      const goto = event.target.closest('[data-goto]');
      if (goto) { location.hash = goto.dataset.goto; return; }
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'retry-engine') {
        actionEl.disabled = true;
        await OD.store.refreshStatus();
        rerender();
      } else if (action === 'refresh') {
        rerender();
      } else if (action === 'run-container') {
        openRunContainer();
      }
    });
  }

  function mountContainers(root) {
    const tbody = root.querySelector('#container-tbody');
    const search = root.querySelector('#container-search');
    const projectSelect = root.querySelector('#container-project');
    const items = state.last.containers || [];
    const repaint = () => {
      if (!tbody) return;
      tbody.innerHTML = containerRows(items);
    };
    search?.addEventListener('input', debounce(() => { state.containerFilter.q = search.value; repaint(); }, 120));
    root.querySelectorAll('[data-cstate]').forEach((chip) => chip.addEventListener('click', () => {
      state.containerFilter.status = chip.dataset.cstate;
      root.querySelectorAll('[data-cstate]').forEach((c) => c.classList.toggle('active', c === chip));
      repaint();
    }));
    projectSelect?.addEventListener('change', () => {
      state.containerFilter.project = projectSelect.value || 'all';
      repaint();
    });
    root.querySelector('[data-container-group-toggle]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      const grouped = state.containerFilter.grouped !== true;
      state.containerFilter.grouped = grouped;
      button.classList.toggle('btn-primary', grouped);
      button.classList.toggle('btn-secondary', !grouped);
      button.querySelector('span').textContent = grouped ? 'Grouped' : 'Group by project';
      OD.store.setSetting('groupContainers', grouped).catch(() => {});
      repaint();
    });

    root.addEventListener('click', async (event) => {
      const projectOnly = event.target.closest('[data-project-only]');
      if (projectOnly) {
        event.stopPropagation();
        state.containerFilter.project = projectOnly.dataset.projectOnly;
        if (projectSelect) projectSelect.value = state.containerFilter.project;
        repaint();
        return;
      }
      const actionBtn = event.target.closest('[data-caction]');
      if (actionBtn) {
        event.stopPropagation();
        const id = actionBtn.dataset.cid;
        const name = actionBtn.dataset.cname || id;
        const action = actionBtn.dataset.caction;
        const item = items.find((x) => x.id === id) || { id, name, state: '' };
        if (action === 'exec') { showExec(item); return; }
        if (action === 'firefox') { openContainerInFirefox(item, actionBtn.dataset.cports); return; }
        if (action === 'logs') { showLogs(item); return; }
        if (action === 'remove') {
          const ok = await U.confirm({ title: `Remove ${name}?`, message: 'The container and its writable layer are deleted. Named volumes are not removed unless you request it.', detail: `docker rm -f ${id}`, confirmLabel: 'Remove container', tone: 'red' });
          if (!ok) return;
          const res = await api.docker.containerAction(id, 'remove', { force: true });
          if (res.ok) { U.toast('Container removed', 'success', { description: name }); rerender(); }
          else U.toast('Could not remove container', 'error', { description: res.error });
          return;
        }
        const res = await api.docker.containerAction(id, action);
        if (res.ok) { U.toast(`Container ${action}`, 'success', { description: name }); rerender(); }
        else U.toast(`${action} failed`, 'error', { description: res.error });
        return;
      }
      const row = event.target.closest('[data-open-container]');
      if (row) {
        const item = items.find((x) => x.id === row.dataset.openContainer);
        if (item) showInspect(item);
      }
    });
  }

  function mountImages(root) {
    const tbody = root.querySelector('#image-tbody');
    const search = root.querySelector('#image-search');
    const items = state.last.images || [];
    const repaint = () => {
      if (!tbody) return;
      const filtered = items.filter(imageMatches);
      tbody.innerHTML = filtered.map((x) => imageRow(x)).join('') || `<tr><td colspan="6">${U.empty({ compact: true, icon: 'layers', title: 'No matching images', body: 'Adjust the filter or pull an image.' })}</td></tr>`;
      bindImageRows(root);
    };
    search?.addEventListener('input', debounce(() => { state.imageFilter.q = search.value; repaint(); }, 120));
    root.querySelectorAll('[data-ikind]').forEach((chip) => chip.addEventListener('click', () => {
      state.imageFilter.kind = chip.dataset.ikind;
      root.querySelectorAll('[data-ikind]').forEach((c) => c.classList.toggle('active', c === chip));
      repaint();
    }));
    bindImageRows(root);

    root.addEventListener('click', async (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (actionEl?.dataset.action === 'pull-image') { pullImage(); return; }
      if (actionEl?.dataset.action === 'prune-images') {
        const ok = await U.confirm({ title: 'Prune dangling images?', message: 'Dangling images are untagged layers with no references. This is usually safe, but the operation is irreversible.', detail: 'docker image prune --force', confirmLabel: 'Prune images', tone: 'warning' });
        if (!ok) return;
        const res = await api.docker.imageAction(null, 'prune');
        if (res.ok) { U.toast('Images pruned', 'success', { description: String(res.stdout || '').slice(0, 140) }); rerender(); }
        else U.toast('Prune failed', 'error', { description: res.error });
        return;
      }
      const act = event.target.closest('[data-iact]');
      if (!act) return;
      const item = items.find((x) => x.id === act.dataset.iid) || { id: act.dataset.iid, name: act.dataset.iname };
      if (act.dataset.iact === 'history') { showImageHistory(item); return; }
      if (act.dataset.iact === 'tag') {
        const target = await U.prompt({ title: 'Tag image', label: 'New reference', value: item.name, hint: 'Example: registry.example.com/app:1.4.0', confirmLabel: 'Apply tag' });
        if (!target) return;
        const res = await api.docker.imageAction(item.id, 'tag', { target });
        if (res.ok) { U.toast('Image tagged', 'success', { description: target }); rerender(); }
        else U.toast('Tag failed', 'error', { description: res.error });
        return;
      }
      if (act.dataset.iact === 'remove') {
        const ok = await U.confirm({ title: `Remove ${item.name}?`, message: 'Container references to this image must be removed first, or use force to override.', detail: `docker image rm ${item.id}`, confirmLabel: 'Remove image', tone: 'red' });
        if (!ok) return;
        const res = await api.docker.imageAction(item.id, 'remove', { force: true });
        if (res.ok) { U.toast('Image removed', 'success', { description: item.name }); rerender(); }
        else U.toast('Could not remove image', 'error', { description: res.error });
      }
    });
  }

  function imageRow(x) {
    return `<tr>
      <td><div class="cell-main"><span class="icon-chip tone-${x.dangling ? 'slate' : 'violet'}" style="--chip-size:28px">${icon('layers', 14)}</span><div><div class="cell-title mono">${esc(x.repository)}:${esc(x.tag)}</div><div class="cell-sub mono">${esc(shortId(x.id, 19))}</div></div></div></td>
      <td class="cell-mono">${esc(x.size)}</td>
      <td class="cell-nowrap">${esc(x.createdSince || timeAgo(x.createdAt))}</td>
      <td class="cell-mono">${esc(x.containers ?? '—')}</td>
      <td>${x.dangling ? U.badge('dangling', 'slate') : `<span class="badge tone-cyan">${esc(x.registry)}</span>`}</td>
      <td><div class="row-actions">
        ${U.iconButton({ icon: 'history', label: 'History', attrs: `data-iact="history" data-iid="${esc(x.id)}" data-iname="${esc(x.name)}"` })}
        ${U.iconButton({ icon: 'tag', label: 'Tag', attrs: `data-iact="tag" data-iid="${esc(x.id)}" data-iname="${esc(x.name)}"` })}
        ${U.iconButton({ icon: 'trash', tone: 'red', label: 'Remove', attrs: `data-iact="remove" data-iid="${esc(x.id)}" data-iname="${esc(x.name)}"` })}
      </div></td>
    </tr>`;
  }

  function bindImageRows() { /* rows use delegated handlers */ }

  function mountCompose(root) {
    root.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-pact]');
      if (!btn) return;
      const project = btn.dataset.project;
      const action = btn.dataset.pact;
      if (action === 'config') { showComposeConfig(project); return; }
      if (action === 'logs') { showComposeLogs(project); return; }
      if (action === 'down' || action === 'downv') {
        const volumes = action === 'downv';
        const ok = await U.confirm({
          title: `Stop ${project}?`,
          message: volumes ? 'The project is stopped and its named volumes are deleted. This cannot be undone.' : 'The project is stopped and its containers and network are removed. Named volumes are kept.',
          detail: `docker compose -p ${project} down${volumes ? ' --volumes' : ''}`,
          confirmLabel: volumes ? 'Down and delete volumes' : 'Down project',
          tone: 'red',
        });
        if (!ok) return;
        const res = await api.docker.composeAction(project, 'down', { volumes });
        if (res.ok) { U.toast('Project stopped', 'success', { description: project }); rerender(); }
        else U.toast('Compose down failed', 'error', { description: res.error });
        return;
      }
      const res = await api.docker.composeAction(project, action, { build: action === 'up' });
      if (res.ok) { U.toast(`Compose ${action} complete`, 'success', { description: project }); rerender(); }
      else U.toast(`Compose ${action} failed`, 'error', { description: res.error });
    });
  }

  function mountVolumes(root) {
    root.addEventListener('click', async (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (actionEl?.dataset.action === 'create-volume') { createVolume(); return; }
      if (actionEl?.dataset.action === 'prune-volumes') {
        const ok = await U.confirm({ title: 'Prune unused volumes?', message: 'Volumes not referenced by any container are deleted. Data in them is lost.', detail: 'docker volume prune --force', confirmLabel: 'Prune volumes', tone: 'red' });
        if (!ok) return;
        const res = await api.docker.volumeAction(null, 'prune');
        if (res.ok) { U.toast('Volumes pruned', 'success', { description: String(res.stdout || '').slice(0, 140) }); rerender(); }
        else U.toast('Prune failed', 'error', { description: res.error });
        return;
      }
      const act = event.target.closest('[data-vact]');
      if (!act) return;
      const name = act.dataset.vname;
      if (act.dataset.vact === 'remove') {
        const ok = await U.confirm({ title: `Remove volume ${name}?`, message: 'Any data stored in this volume is permanently deleted.', detail: `docker volume rm ${name}`, confirmLabel: 'Remove volume', tone: 'red' });
        if (!ok) return;
        const res = await api.docker.volumeAction(name, 'remove', { force: true });
        if (res.ok) { U.toast('Volume removed', 'success', { description: name }); rerender(); }
        else U.toast('Could not remove volume', 'error', { description: res.error });
        return;
      }
      if (act.dataset.vact === 'inspect') {
        const res = await api.docker.volumeAction(name, 'inspect');
        U.drawer({
          title: name, eyebrow: 'Volume detail', icon: 'database', width: '640px',
          body: res.ok ? `<div class="config-view"><pre>${esc(res.stdout || '')}</pre></div>` : U.errorBanner('Inspect failed', res.error || 'Unknown error'),
          footer: `<div class="row gap-2">${learnLink('storage-and-volumes', 'Storage lesson')}${U.button({ label: 'Copy command', icon: 'copy', size: 'sm', attrs: `data-copy-text="docker volume inspect ${esc(name)}"` })}</div>${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}`,
        });
      }
    });
  }

  function mountNetworks(root) {
    root.addEventListener('click', async (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (actionEl?.dataset.action === 'create-network') { createNetwork(); return; }
      if (actionEl?.dataset.action === 'prune-networks') {
        const ok = await U.confirm({ title: 'Prune unused networks?', message: 'Networks not used by any container are removed. Built-in networks are preserved.', detail: 'docker network prune --force', confirmLabel: 'Prune networks', tone: 'warning' });
        if (!ok) return;
        const res = await api.docker.networkAction(null, 'prune');
        if (res.ok) { U.toast('Networks pruned', 'success', { description: String(res.stdout || '').slice(0, 140) }); rerender(); }
        else U.toast('Prune failed', 'error', { description: res.error });
        return;
      }
      const act = event.target.closest('[data-nact]');
      if (!act) return;
      const name = act.dataset.nname;
      if (act.dataset.nact === 'remove') {
        const ok = await U.confirm({ title: `Remove network ${name}?`, message: 'Containers attached to this network must be disconnected or removed first.', detail: `docker network rm ${name}`, confirmLabel: 'Remove network', tone: 'red' });
        if (!ok) return;
        const res = await api.docker.networkAction(name, 'remove');
        if (res.ok) { U.toast('Network removed', 'success', { description: name }); rerender(); }
        else U.toast('Could not remove network', 'error', { description: res.error });
        return;
      }
      if (act.dataset.nact === 'inspect') {
        const res = await api.docker.networkAction(name, 'inspect');
        const data = res.data?.[0] || res.data;
        const attached = data?.Containers ? Object.values(data.Containers) : [];
        U.drawer({
          title: name, eyebrow: 'Network detail', icon: 'network', width: '760px',
          body: res.ok ? `<div class="detail-grid"><div class="detail-section"><h4>Network</h4>${U.kvRows([
            ['Driver', esc(data?.Driver || '—'), true],
            ['Scope', esc(data?.Scope || '—'), true],
            ['Subnet', esc(data?.IPAM?.Config?.[0]?.Subnet || '—'), true],
            ['Gateway', esc(data?.IPAM?.Config?.[0]?.Gateway || '—'), true],
            ['Internal', data?.Internal ? 'yes' : 'no', false],
            ['IPv6', data?.EnableIPv6 ? 'yes' : 'no', false],
          ])}</div><div class="detail-section"><h4>Attached containers</h4>${attached.length ? attached.map((c) => `<div class="registry-row"><span class="host">${esc(c.Name)}</span><span class="badge mono">${esc(c.IPv4Address || '')}</span></div>`).join('') : '<span class="muted text-sm">No containers attached.</span>'}</div></div>` : U.errorBanner('Inspect failed', res.error || 'Unknown error'),
          footer: `<div class="row gap-2">${learnLink('bridge-dns', 'DNS lesson')}${U.button({ label: 'Copy command', icon: 'copy', size: 'sm', attrs: `data-copy-text="docker network inspect ${esc(name)}"` })}</div>${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}`,
        });
      }
    });
  }

  function mountBuilds(root) {
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="build-image"]')) {
        if (!state.terminal.consent) {
          ensureTerminalConsent().then((ok) => { if (ok) openBuildImage(); });
        } else openBuildImage();
      }
    });
  }

  function mountRegistries(root) {
    const form = root.querySelector('#registry-form');
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const query = root.querySelector('#registry-query').value.trim();
      if (!query) return;
      const results = root.querySelector('#registry-results');
      state.registry = { ...state.registry, query, loading: true, error: null };
      results.innerHTML = U.loader('Searching Docker Hub…');
      const res = await api.docker.searchRegistry(query);
      state.registry = { ...state.registry, loading: false, items: res.ok ? res.items : null, error: res.ok ? null : res.error };
      results.innerHTML = res.ok ? registryResults(res.items || []) : U.errorBanner('Search failed', res.error || 'The registry did not respond.');
    });
  }

  function mountMonitoring(root) {
    const update = async () => {
      const res = await api.docker.stats().catch(() => null);
      if (!res || !res.ok) return;
      const items = res.items || [];
      state.last.stats = items;
      const totalCpu = items.reduce((sum, s) => sum + s.cpuPercent, 0);
      const memUsed = items.reduce((sum, s) => sum + s.memoryUsed, 0);
      const memHost = OD.store.state.status?.memory || 1;
      OD.store.pushSample({ cpu: totalCpu, mem: Math.min(100, (memUsed / memHost) * 100), net: items.length });
      const tbody = root.querySelector('#mon-tbody');
      if (tbody) tbody.innerHTML = monitoringRows(items);
      const cpu = root.querySelector('#mon-cpu-chart');
      if (cpu) cpu.innerHTML = OD.charts.area(OD.store.state.history.cpu, { height: 170, labels: ['60s', 'now'], label: 'Aggregate CPU' });
      const mem = root.querySelector('#mon-mem-chart');
      if (mem) mem.innerHTML = OD.charts.area(OD.store.state.history.mem, { height: 170, color: 'var(--cyan)', format: (v) => `${Math.round(v)}%`, labels: ['60s', 'now'], label: 'Memory percent' });
      const stamp = root.querySelector('#mon-sample-time');
      if (stamp) stamp.textContent = `sampled ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
    };
    timer(update, 4000);
  }

  function mountEvents(root) {
    root.querySelectorAll('[data-etype]').forEach((chip) => chip.addEventListener('click', () => {
      state.eventFilter.type = chip.dataset.etype;
      rerender();
    }));
    root.querySelector('#event-since')?.addEventListener('change', (event) => {
      state.eventFilter.since = Number(event.target.value) || 3600;
      rerender();
    });
  }

  function mountTerminal(root) {
    const form = root.querySelector('#term-form');
    const input = root.querySelector('#term-input');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value;
      input.value = '';
      runTerminalCommand(root, value);
    });
    let cursor = state.terminal.history.length;
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        cursor = Math.max(0, cursor - 1);
        const item = state.terminal.history[cursor];
        if (item) input.value = item.command;
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        cursor = Math.min(state.terminal.history.length, cursor + 1);
        input.value = state.terminal.history[cursor]?.command || '';
      }
    });
    root.querySelectorAll('[data-fill-command]').forEach((chip) => chip.addEventListener('click', () => {
      input.value = chip.dataset.fillCommand;
      input.focus();
    }));
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="clear-terminal"]')) {
        state.terminal.history = [];
        paintTerminal(root);
      } else if (event.target.closest('[data-action="terminal-consent"]')) {
        ensureTerminalConsent().then(() => paintTerminal(root));
      }
    });
    onCleanup(() => { cursor = 0; });
    const body = root.querySelector('#term-body');
    if (body) body.scrollTop = body.scrollHeight;
    if (state.terminal.pending) { input.value = state.terminal.pending; state.terminal.pending = null; }
    if (state.terminal.history.length) setTimeout(() => input?.focus(), 60);
  }

  function mountSettings(root) {
    root.querySelectorAll('[data-theme-set]').forEach((chip) => chip.addEventListener('click', async () => {
      await OD.store.setSetting('theme', chip.dataset.themeSet);
      root.querySelectorAll('[data-theme-set]').forEach((c) => c.classList.toggle('active', c === chip));
      OD.app?.refreshChrome?.();
    }));
    root.querySelector('#set-motion')?.addEventListener('change', async (event) => {
      await OD.store.setSetting('motion', event.target.checked ? 'reduced' : 'full');
    });
    root.querySelector('#set-transparency')?.addEventListener('change', async (event) => {
      await OD.store.setSetting('reduceTransparency', event.target.checked);
    });
    root.querySelector('#set-collapse')?.addEventListener('change', async (event) => {
      await OD.store.setSetting('sidebarCollapsed', event.target.checked);
      OD.app?.applySidebar?.();
    });
    root.querySelector('#set-goal')?.addEventListener('change', async (event) => {
      await OD.store.setSetting('dailyGoalMinutes', Number(event.target.value));
      U.toast('Daily goal updated', 'success');
    });
    root.addEventListener('click', async (event) => {
      if (event.target.closest('[data-action="reset-progress"]')) {
        const ok = await U.confirm({ title: 'Reset Academy progress?', message: 'Lesson progress, quiz scores, bookmarks, notes, achievements and activity are deleted. This cannot be undone.', confirmLabel: 'Reset everything', tone: 'red' });
        if (!ok) return;
        await OD.store.resetProgress();
        U.toast('Progress reset', 'success');
        rerender();
      } else if (event.target.closest('[data-action="reload-content"]')) {
        const ok = await OD.store.refreshAcademy(true);
        U.toast(ok ? 'Academy content reloaded' : 'Reload failed', ok ? 'success' : 'error');
        rerender();
      }
    });
  }

  // ------------------------------------------------------------------ dispatch

  async function render(route) {
    switch (route.name) {
      case 'containers': return renderContainers();
      case 'images': return renderImages();
      case 'compose': return renderCompose();
      case 'volumes': return renderVolumes();
      case 'networks': return renderNetworks();
      case 'builds': return renderBuilds();
      case 'registries': return renderRegistries();
      case 'monitoring': return renderMonitoring();
      case 'events': return renderEvents();
      case 'terminal': return renderTerminal();
      case 'settings': return renderSettings();
      case 'overview':
      default: return renderOverview();
    }
  }

  function mount(root, route) {
    bindCommon(root);
    switch (route.name) {
      case 'containers': mountContainers(root); break;
      case 'images': mountImages(root); break;
      case 'compose': mountCompose(root); break;
      case 'volumes': mountVolumes(root); break;
      case 'networks': mountNetworks(root); break;
      case 'builds': mountBuilds(root); break;
      case 'registries': mountRegistries(root); break;
      case 'monitoring': mountMonitoring(root); break;
      case 'events': mountEvents(root); break;
      case 'terminal': mountTerminal(root); break;
      case 'settings': mountSettings(root); break;
      default: break;
    }
  }

  window.OD = window.OD || {};
  OD.views = OD.views || {};
  OD.views.docker = {
    render, mount, dispose, terminalPending,
    openRunContainer,
  };
})();
