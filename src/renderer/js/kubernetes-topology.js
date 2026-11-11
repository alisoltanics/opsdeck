'use strict';

/**
 * Cluster map — renderer.
 *
 * Draws the real cluster topology as namespace swimlanes:
 * Ingress → Service → Workload → Pod, with a node health rail, an inventory of
 * resources outside the request flow, filters, pan/zoom and a click-through
 * action drawer that reuses the Kubernetes detail, logs and shell actions.
 *
 * This module only renders data produced by the main-process topology builder.
 * It never reads kubeconfig files, Secret values or ConfigMap values.
 */
(function () {
  const { esc, timeAgo } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;

  const CARD_W = 198;
  const CARD_H = 52;
  const CHIP_W = 164;
  const CHIP_H = 34;
  const GAP_X = 54;
  const ROW_GAP = 8;
  const POD_GAP_X = 6;
  const POD_COLS = 2;
  const BAND_X = 12;
  const RAIL_W = 118;
  const START_X = BAND_X + RAIL_W + 18;
  const BAND_HEADER = 42;
  const BAND_PAD = 12;
  const BAND_GAP = 14;
  const COLUMN_X = [0, 1, 2, 3].map((index) => START_X + index * (CARD_W + GAP_X));
  const MAP_WIDTH = COLUMN_X[3] + CHIP_W * POD_COLS + POD_GAP_X * (POD_COLS - 1) + 24;
  const COLUMNS = ['ingresses', 'services', 'workloads', 'pods'];

  const KIND_META = {
    Ingress: { icon: 'globe', tone: 'cyan', section: 'ingresses' },
    Service: { icon: 'network', tone: 'accent', section: 'services' },
    Deployment: { icon: 'layers', tone: 'violet', section: 'deployments' },
    StatefulSet: { icon: 'database', tone: 'violet', section: 'statefulsets' },
    DaemonSet: { icon: 'server', tone: 'green', section: 'daemonsets' },
    Pod: { icon: 'box', tone: 'slate', section: 'pods' },
    Node: { icon: 'server', tone: 'accent', section: 'nodes' },
    Namespace: { icon: 'layers', tone: 'slate', section: 'namespaces' },
  };

  const WARNING_SECTIONS = {
    Pod: 'pods', Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets',
    Service: 'services', Ingress: 'ingresses', Node: 'nodes', Namespace: 'namespaces',
    Job: 'jobs', CronJob: 'cronjobs', PersistentVolumeClaim: 'persistentvolumeclaims',
  };

  const TONES = ['accent', 'cyan', 'violet', 'green', 'orange', 'amber'];

  let current = null;
  let index = new Map();
  let state = freshState();

  function freshState() {
    return {
      search: '',
      problems: false,
      namespace: '',
      zoom: 1,
      panX: 0,
      panY: 0,
      userZoomed: false,
      selected: '',
    };
  }

  function namespaceId(name) {
    return `namespace:_:${name}`;
  }

  function short(value, max = 34) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function statusTone(item) {
    return item?.tone || KIND_META[item?.kind]?.tone || 'slate';
  }

  function nodeTone(node) {
    if (!node) return 'slate';
    if (!node.ready) return 'red';
    if (node.pods && node.podsAllocatable && node.pods > Number(node.podsAllocatable) * 0.85) return 'amber';
    return 'green';
  }

  function itemProblem(item) {
    if (!item) return false;
    if (item.kind === 'Pod') return !item.healthy && item.phase !== 'Succeeded';
    if (['Deployment', 'StatefulSet', 'DaemonSet'].includes(item.kind)) return item.healthy === false;
    return false;
  }

  function indexModel(model) {
    const map = new Map();
    for (const node of model.nodes || []) map.set(node.id, { ...node, __type: 'node' });
    for (const band of model.namespaces || []) {
      map.set(namespaceId(band.name), {
        ...band,
        id: namespaceId(band.name),
        kind: 'Namespace',
        name: band.name,
        __type: 'namespace',
      });
      for (const key of COLUMNS) {
        for (const item of band[key] || []) {
          map.set(item.id, { ...item, namespace: item.namespace || band.name, band: band.name, __type: 'item' });
        }
      }
    }
    return map;
  }

  function filteredBands(model) {
    const q = String(state.search || '').trim().toLowerCase();
    const bands = [];
    for (const band of model.namespaces || []) {
      if (state.namespace && band.name !== state.namespace) continue;
      const namespaceMatches = !q || band.name.toLowerCase().includes(q);
      const next = {
        ...band,
        ingresses: band.ingresses || [],
        services: band.services || [],
        workloads: band.workloads || [],
        pods: band.pods || [],
      };
      for (const key of COLUMNS) {
        next[key] = next[key].filter((item) => {
          if (state.problems && !itemProblem(item)) return false;
          if (namespaceMatches) return true;
          const haystack = [
            item.name, item.namespace, item.node, item.status, item.type, item.class,
            item.hostText, item.portText, item.selectorText, item.ownerName,
            ...(item.hosts || []), ...(item.images || []), ...(item.containers || []),
          ].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(q);
        });
      }
      const itemCount = COLUMNS.reduce((sum, key) => sum + next[key].length, 0);
      if (!itemCount) {
        const onlyWarnings = state.problems && !q && band.totals?.warnings > 0;
        if (!onlyWarnings) continue;
      }
      bands.push(next);
    }
    return bands;
  }

  function visibleEdges(model, bands) {
    const ids = new Set();
    for (const band of bands) {
      for (const key of COLUMNS) {
        for (const item of band[key]) ids.add(item.id);
      }
    }
    return (model.edges || []).filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  }

  function columnMetrics(band) {
    const counts = COLUMNS.map((key) => band[key].length);
    const podRows = Math.ceil(counts[3] / POD_COLS);
    const heights = [
      counts[0] * CARD_H + Math.max(0, counts[0] - 1) * ROW_GAP,
      counts[1] * CARD_H + Math.max(0, counts[1] - 1) * ROW_GAP,
      counts[2] * CARD_H + Math.max(0, counts[2] - 1) * ROW_GAP,
      podRows * CHIP_H + Math.max(0, podRows - 1) * ROW_GAP,
    ];
    return { rows: Math.max(1, counts[0], counts[1], counts[2], podRows), contentH: Math.max(1, ...heights), empty: counts.every((count) => count === 0) };
  }

  function layoutFor(bands, edges) {
    let y = 4;
    const positions = new Map();
    const laidOut = [];
    for (const band of bands) {
      const metrics = columnMetrics(band);
      const height = metrics.empty ? 58 : BAND_HEADER + BAND_PAD * 2 + metrics.contentH;
      const box = { x: BAND_X, y, width: MAP_WIDTH - BAND_X * 2, height, empty: metrics.empty };
      const contentTop = y + BAND_HEADER + BAND_PAD;
      COLUMNS.forEach((key, col) => {
        const list = band[key];
        const isPods = key === 'pods';
        const w = isPods ? CHIP_W : CARD_W;
        const h = isPods ? CHIP_H : CARD_H;
        const perRow = isPods ? POD_COLS : 1;
        const rows = Math.ceil(list.length / perRow);
        const listH = rows * h + Math.max(0, rows - 1) * ROW_GAP;
        const startY = contentTop + Math.max(0, (metrics.contentH - listH) / 2);
        list.forEach((item, i) => {
          const sub = isPods ? i % POD_COLS : 0;
          const row = isPods ? Math.floor(i / POD_COLS) : i;
          const pos = {
            x: isPods ? COLUMN_X[3] + sub * (CHIP_W + POD_GAP_X) : COLUMN_X[col],
            y: startY + row * (h + ROW_GAP),
            w,
            h,
            col,
            item,
            band,
          };
          positions.set(item.id, pos);
        });
      });
      laidOut.push({ band, box });
      y += height + BAND_GAP;
    }
    return { width: MAP_WIDTH, height: Math.max(180, y + 4), bands: laidOut, positions, edges };
  }

  function edgePath(from, to) {
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const bend = Math.max(24, Math.abs(x2 - x1) * 0.45);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1 + bend).toFixed(1)},${y1.toFixed(1)} ${(x2 - bend).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }

  function cardMeta(item) {
    switch (item.kind) {
      case 'Ingress': return `${item.class || 'no class'} · ${item.paths?.length || 0} backend${item.paths?.length === 1 ? '' : 's'}`;
      case 'Service': return `${item.type || 'ClusterIP'}${item.clusterIP && item.clusterIP !== 'None' ? ` · ${item.clusterIP}` : item.headless ? ' · headless' : ''}`;
      case 'Deployment':
      case 'StatefulSet':
      case 'DaemonSet': return `${item.ready || 0}/${item.desired || 0} ready${item.images?.[0] ? ` · ${item.images[0].split('/').pop()}` : ''}`;
      case 'Pod': return `${item.node || 'unscheduled'} · ${item.ready || 0}/${item.total || 0} ready`;
      default: return '';
    }
  }

  function cardBadge(item) {
    switch (item.kind) {
      case 'Ingress': return item.paths?.length ? `${item.paths.length} route${item.paths.length === 1 ? '' : 's'}` : 'no backend';
      case 'Service': return item.ports?.[0] ? `${item.ports[0].port}` : (item.headless ? 'headless' : 'no port');
      default: return item.status || 'unknown';
    }
  }

  function cardTone(item) {
    if (item.kind === 'Pod' || item.kind === 'Deployment' || item.kind === 'StatefulSet' || item.kind === 'DaemonSet') {
      return statusTone(item);
    }
    return KIND_META[item.kind]?.tone || 'slate';
  }

  function cardHtml(pos) {
    const item = pos.item;
    const meta = KIND_META[item.kind] || KIND_META.Pod;
    const tone = cardTone(item);
    const badge = cardBadge(item);
    const chip = item.kind === 'Pod';
    const label = `${item.kind} ${item.name}${item.namespace ? ` in ${item.namespace}` : ''} · ${badge}`;
    const nodeAttr = chip ? ` data-topo-node-name="${esc(item.node || '')}"` : '';
    const side = chip
      ? `<span class="topo-card-side"><i class="topo-card-dot"></i></span>`
      : `<span class="topo-card-side"><i class="topo-card-dot"></i><span class="topo-card-badge">${esc(short(badge, 15))}</span></span>`;
    const metaLine = chip
      ? `<span class="topo-card-meta">${esc(short(`${item.status || item.phase || 'Unknown'} · ${item.node || 'unscheduled'}`, 30))}</span>`
      : `<span class="topo-card-meta">${esc(short(cardMeta(item), 34))}</span>`;
    return `<foreignObject x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" class="topo-card-slot">
      <div xmlns="http://www.w3.org/1999/xhtml" class="topo-card${chip ? ' is-chip' : ''} topo-tone-${esc(tone)}" data-topo-id="${esc(item.id)}" data-topo-kind="${esc(item.kind)}" data-topo-name="${esc(item.name)}" data-topo-namespace="${esc(item.namespace || '')}"${nodeAttr} role="button" tabindex="0" aria-label="${esc(label)}" title="${esc(label)}">
        <span class="topo-card-icon">${icon(meta.icon, chip ? 12 : 14)}</span>
        <span class="topo-card-main">
          <span class="topo-card-name">${esc(item.name)}</span>
          ${metaLine}
        </span>
        ${side}
      </div>
    </foreignObject>`;
  }

  function bandHealth(band) {
    const podProblems = band.pods.filter((pod) => itemProblem(pod)).length;
    const workloadProblems = band.workloads.filter((workload) => itemProblem(workload)).length;
    const warnings = band.totals?.warnings || 0;
    if (podProblems || workloadProblems || warnings) return 'amber';
    return 'green';
  }

  function bandLabelHtml(entry) {
    const { band, box } = entry;
    const health = bandHealth(band);
    const warnings = band.totals?.warnings || 0;
    if (box.empty) {
      return `<foreignObject x="${box.x + 14}" y="${box.y + 8}" width="${RAIL_W}" height="${box.height - 16}">
      <div xmlns="http://www.w3.org/1999/xhtml" class="topo-band-label is-empty" data-topo-id="${esc(namespaceId(band.name))}" data-topo-kind="Namespace" data-topo-name="${esc(band.name)}" role="button" tabindex="0" aria-label="Namespace ${esc(band.name)}">
        <span class="topo-band-name">${esc(short(band.name, 18))}</span>
        <span class="topo-band-meta">no runnable components</span>
      </div>
    </foreignObject>`;
    }
    return `<foreignObject x="${box.x + 14}" y="${box.y + 10}" width="${RAIL_W}" height="${box.height - 20}">
      <div xmlns="http://www.w3.org/1999/xhtml" class="topo-band-label" data-topo-id="${esc(namespaceId(band.name))}" data-topo-kind="Namespace" data-topo-name="${esc(band.name)}" role="button" tabindex="0" aria-label="Namespace ${esc(band.name)}">
        <span class="topo-band-name">${esc(short(band.name, 18))}</span>
        <span class="topo-band-meta">${band.workloads.length} wl · ${band.pods.length} pods</span>
        <span class="topo-band-flags">
          <span class="topo-band-health topo-tone-${health}"><i></i>${health === 'green' ? 'healthy' : warnings ? `${warnings} warn` : 'degraded'}</span>
          <span class="topo-band-route">${band.ingresses.length} in · ${band.services.length} svc</span>
        </span>
      </div>
    </foreignObject>`;
  }

  function svgMarkup(layout) {
    const bands = layout.bands.map((entry) => {
      const { band, box } = entry;
      const health = bandHealth(band);
      return `<g class="topo-band-group" data-topo-band="${esc(band.name)}">
        <rect class="topo-band-bg" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="16" />
        <rect class="topo-band-bar topo-tone-${health}" x="${box.x}" y="${box.y + 16}" width="2.5" height="${box.height - 32}" rx="1.25" />
        ${bandLabelHtml(entry)}
      </g>`;
    }).join('');

    const edges = layout.edges.map((edge) => {
      const from = layout.positions.get(edge.from);
      const to = layout.positions.get(edge.to);
      if (!from || !to) return '';
      return `<path class="topo-edge ${esc(edge.kind)}" data-topo-edge="${esc(edge.id)}" data-topo-from="${esc(edge.from)}" data-topo-to="${esc(edge.to)}" d="${edgePath(from, to)}" />`;
    }).join('');

    const cards = [...layout.positions.values()].map(cardHtml).join('');

    return `<svg class="topo-svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cluster topology graph">
      <rect class="topo-bg" x="0" y="0" width="${layout.width}" height="${layout.height}" rx="16" />
      <ellipse class="topo-ambient" cx="${layout.width * 0.18}" cy="${layout.height * 0.12}" rx="${layout.width * 0.36}" ry="${layout.height * 0.4}" />
      <g class="topo-bands">${bands}</g>
      <g class="topo-edges">${edges}</g>
      <g class="topo-cards">${cards}</g>
    </svg>`;
  }

  function emptyMapHtml() {
    const hasFilters = state.search || state.problems || state.namespace;
    if (state.problems) {
      return `<div class="topo-empty">${icon('circle-check', 22)}<strong>No problems detected</strong><span>The visible cluster components are healthy.</span><button type="button" class="btn btn-sm btn-ghost" data-topo-clear>Clear filters</button></div>`;
    }
    if (hasFilters) {
      return `<div class="topo-empty">${icon('filter', 22)}<strong>No matching components</strong><span>Try a different search or clear the namespace filter.</span><button type="button" class="btn btn-sm btn-ghost" data-topo-clear>Clear filters</button></div>`;
    }
    return `<div class="topo-empty">${icon('map', 22)}<strong>No runnable components</strong><span>The selected context returned no pods, workloads, services or ingresses.</span></div>`;
  }

  function countVisible(bands) {
    return bands.reduce((sum, band) => sum + COLUMNS.reduce((inner, key) => inner + band[key].length, 0), 0);
  }

  function paintMap(root) {
    if (!current) return;
    const viewport = root.querySelector('[data-topo-viewport]');
    if (!viewport) return;
    const bands = filteredBands(current);
    const edges = visibleEdges(current, bands);
    const layout = layoutFor(bands, edges);
    viewport.innerHTML = bands.length
      ? `<div class="topo-canvas" data-topo-canvas>${svgMarkup(layout)}</div>`
      : emptyMapHtml();
    const canvas = viewport.querySelector('[data-topo-canvas]');
    if (canvas) {
      canvas.style.width = `${layout.width}px`;
      canvas.style.height = `${layout.height}px`;
    }
    const count = root.querySelector('[data-topo-count]');
    if (count) {
      const shown = countVisible(bands);
      const total = current.stats.pods + current.stats.workloads + current.stats.services + current.stats.ingresses;
      count.textContent = `${shown} of ${total} components`;
    }
    const ns = root.querySelector('[data-topo-namespace]');
    if (ns) ns.value = state.namespace;
    const problems = root.querySelector('[data-topo-problems]');
    if (problems) problems.classList.toggle('is-active', state.problems);
    applyTransform(root);
  }

  function applyTransform(root) {
    const canvas = root.querySelector('[data-topo-canvas]');
    if (!canvas) return;
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }

  function fitMap(root) {
    const viewport = root.querySelector('[data-topo-viewport]');
    const canvas = root.querySelector('[data-topo-canvas]');
    if (!viewport || !canvas) return;
    const width = canvas.offsetWidth || MAP_WIDTH;
    const height = canvas.offsetHeight || 400;
    const availableW = Math.max(200, viewport.clientWidth - 20);
    const availableH = Math.max(180, viewport.clientHeight - 20);
    const zoom = Math.min(1.05, availableW / width, availableH / height);
    state.zoom = Math.max(0.22, zoom);
    state.panX = Math.max(8, (viewport.clientWidth - width * state.zoom) / 2);
    state.panY = Math.max(8, (viewport.clientHeight - height * state.zoom) / 2);
    state.userZoomed = false;
    applyTransform(root);
  }

  function zoomBy(root, factor, cx = null, cy = null) {
    const viewport = root.querySelector('[data-topo-viewport]');
    if (!viewport) return;
    const next = Math.min(2.4, Math.max(0.32, state.zoom * factor));
    const rect = viewport.getBoundingClientRect();
    const px = cx == null ? rect.width / 2 : cx;
    const py = cy == null ? rect.height / 2 : cy;
    const wx = (px - state.panX) / state.zoom;
    const wy = (py - state.panY) / state.zoom;
    state.panX = px - wx * next;
    state.panY = py - wy * next;
    state.zoom = next;
    state.userZoomed = true;
    applyTransform(root);
  }

  function clearHighlight(map) {
    map.classList.remove('has-focus');
    for (const node of map.querySelectorAll('.is-related, .is-focused')) node.classList.remove('is-related', 'is-focused');
    for (const node of map.querySelectorAll('.is-related-band')) node.classList.remove('is-related-band');
  }

  function highlightCard(map, id) {
    clearHighlight(map);
    const direct = new Set([id]);
    const related = new Set([id]);
    const edges = new Set();
    for (const edge of current.edges || []) {
      if (edge.from === id || edge.to === id) {
        edges.add(edge.id);
        related.add(edge.from);
        related.add(edge.to);
      }
    }
    map.classList.add('has-focus');
    for (const card of map.querySelectorAll('[data-topo-id]')) {
      if (card.dataset.topoId === id) card.classList.add('is-focused');
      else if (related.has(card.dataset.topoId)) card.classList.add('is-related');
    }
    for (const edge of map.querySelectorAll('[data-topo-edge]')) {
      if (edges.has(edge.dataset.topoEdge)) edge.classList.add('is-related');
    }
    for (const card of map.querySelectorAll('[data-topo-id]')) {
      if (direct.has(card.dataset.topoId)) {
        const band = card.closest('.topo-band-group');
        if (band) band.classList.add('is-related-band');
      }
    }
  }

  function highlightNode(map, nodeName) {
    clearHighlight(map);
    if (!nodeName) return;
    const pods = new Set();
    for (const band of current.namespaces || []) {
      for (const pod of band.pods || []) {
        if (pod.node === nodeName) pods.add(pod.id);
      }
    }
    const related = new Set(pods);
    for (const edge of current.edges || []) {
      if (pods.has(edge.from)) related.add(edge.to);
      if (pods.has(edge.to)) related.add(edge.from);
    }
    map.classList.add('has-focus');
    for (const card of map.querySelectorAll('[data-topo-id]')) {
      const id = card.dataset.topoId;
      if (related.has(id)) card.classList.add('is-related');
      if (pods.has(id)) card.classList.add('is-focused');
    }
    for (const edge of map.querySelectorAll('[data-topo-edge]')) {
      if (pods.has(edge.dataset.topoFrom) || pods.has(edge.dataset.topoTo)) edge.classList.add('is-related');
    }
  }

  function relatedLinks(item) {
    if (!item || !current) return [];
    const links = [];
    const seen = new Set();
    const push = (id) => {
      if (!id || seen.has(id)) return;
      const target = index.get(id);
      if (!target) return;
      seen.add(id);
      links.push(target);
    };
    for (const edge of current.edges || []) {
      if (edge.from === item.id) push(edge.to);
      if (edge.to === item.id) push(edge.from);
    }
    if (item.kind === 'Pod') {
      if (item.ownerId) push(item.ownerId);
      for (const band of current.namespaces || []) {
        for (const service of band.services || []) {
          if ((service.pods || []).some((pod) => pod.id === item.id) || (service.workloads || []).some((workload) => workload.id === item.ownerId)) push(service.id);
        }
      }
    }
    return links.slice(0, 14);
  }

  function relatedPills(links) {
    if (!links.length) return '<span class="faint text-xs">No graph links</span>';
    return `<div class="topo-related">${links.map((link) => `<button type="button" class="topo-related-pill topo-tone-${esc(cardTone(link))}" data-topo-jump="${esc(link.id)}">${icon(KIND_META[link.kind]?.icon || 'box', 11)}<span>${esc(short(link.name, 28))}</span></button>`).join('')}</div>`;
  }

  function podList(pods, limit = 12) {
    if (!pods?.length) return '';
    const list = pods.slice(0, limit);
    return `<div class="detail-section topo-pod-section">
      <h4>Pods <span class="faint">${pods.length}</span></h4>
      <div class="topo-pod-list">${list.map((pod) => `<div class="topo-pod-row">
        <i class="topo-card-dot topo-tone-${esc(statusTone(pod))}"></i>
        <div class="topo-pod-text">
          <span class="mono">${esc(pod.name)}</span>
          <span class="faint">${esc(pod.status || pod.phase)} · ${esc(pod.node || 'unscheduled')} · ${pod.ready || 0}/${pod.total || 0} ready</span>
        </div>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-topo-pod-logs="${esc(pod.name)}" data-topo-pod-namespace="${esc(pod.namespace || '')}" title="Logs" aria-label="Open logs">${icon('file', 13)}</button>
          <button type="button" class="icon-btn" data-topo-pod-shell="${esc(pod.name)}" data-topo-pod-namespace="${esc(pod.namespace || '')}" title="Shell" aria-label="Open shell">${icon('terminal', 13)}</button>
          <button type="button" class="icon-btn" data-topo-pod-open="${esc(pod.name)}" data-topo-pod-namespace="${esc(pod.namespace || '')}" title="Details" aria-label="Open details">${icon('info', 13)}</button>
        </div>
      </div>`).join('')}</div>
      ${pods.length > limit ? `<div class="faint text-xs" style="margin-top:6px">Showing ${limit} of ${pods.length} pods in this drawer; open the workload for the full list.</div>` : ''}
    </div>`;
  }

  function rowsFor(item) {
    const rows = [];
    const value = (key, val, mono = true) => rows.push([key, esc(val ?? '—'), mono]);
    if (item.kind === 'Pod') {
      value('Status', item.status || item.phase);
      value('Node', item.node || 'unscheduled');
      value('Ready', `${item.ready || 0}/${item.total || 0}`);
      value('Restarts', String(item.restarts || 0));
      value('Owner', item.ownerKind ? `${item.ownerKind}/${item.ownerName}` : 'standalone');
      value('Containers', (item.containers || []).join(', ') || '—');
      value('Images', (item.images || []).join(', ') || '—');
    } else if (['Deployment', 'StatefulSet', 'DaemonSet'].includes(item.kind)) {
      value('Status', item.status);
      value('Replicas', `${item.ready || 0}/${item.desired || 0} ready`);
      value('Available', String(item.available ?? '—'));
      value('Selector', item.selector || '—');
      value('Containers', (item.containers || []).join(', ') || '—');
      value('Images', (item.images || []).join(', ') || '—');
      value('Created', item.created ? timeAgo(item.created) : '—');
    } else if (item.kind === 'Service') {
      value('Type', item.type);
      value('Cluster IP', item.clusterIP || (item.headless ? 'None (headless)' : '—'));
      value('Ports', item.portText || '—');
      value('Selector', item.selectorText || 'none');
      value('External name', item.externalName || '—');
      value('Created', item.created ? timeAgo(item.created) : '—');
    } else if (item.kind === 'Ingress') {
      value('Class', item.class || 'default controller');
      value('Hosts', (item.hosts || []).join(', ') || '*');
      value('TLS', item.tls ? 'enabled' : 'not configured');
      value('Backends', (item.paths || []).map((path) => `${path.host || '*'}${path.path} → ${path.service}${path.port ? `:${path.port}` : ''}`).join(' · ') || '—');
      value('Created', item.created ? timeAgo(item.created) : '—');
    } else if (item.kind === 'Node') {
      value('Status', item.ready ? 'Ready' : item.readyReason || 'Not ready');
      value('Roles', (item.roles || []).join(', '));
      value('Internal IP', item.internalIP || '—');
      value('Kubelet', item.version || '—');
      value('OS', item.os || '—');
      value('Allocatable', `${item.cpu || '—'} CPU · ${item.memory || '—'} memory · ${item.podsAllocatable || '—'} pods`);
      value('Scheduled pods', `${item.pods || 0} (${item.podsReady || 0} healthy)`);
      value('Created', item.created ? timeAgo(item.created) : '—');
    } else if (item.kind === 'Namespace') {
      value('Status', item.status || 'Active');
      value('Workloads', String(item.totals?.workloads ?? item.workloads?.length ?? 0));
      value('Pods', String(item.totals?.pods ?? item.pods?.length ?? 0));
      value('Services', String(item.totals?.services ?? item.services?.length ?? 0));
      value('Ingresses', String(item.totals?.ingresses ?? item.ingresses?.length ?? 0));
      value('Warnings', String(item.totals?.warnings ?? 0));
      value('Created', item.created ? timeAgo(item.created) : '—');
    }
    return U.kvRows(rows);
  }

  function sectionFor(item) {
    return KIND_META[item.kind]?.section || '';
  }

  function openComponent(root, id) {
    const actions = root.__topoActions || {};
    const item = index.get(id);
    if (!item) return;
    state.selected = id;
    const section = sectionFor(item);
    const pods = item.kind === 'Pod'
      ? [item]
      : item.kind === 'Namespace'
        ? (item.pods || [])
        : item.kind === 'Node'
          ? (current.namespaces || []).flatMap((band) => band.pods || []).filter((pod) => pod.node === item.name)
          : item.kind === 'Service'
            ? (item.pods || [])
            : (item.pods || []);
    const links = relatedLinks(item);
    const namespace = item.namespace || '';
    const ai = OD.ai && section && item.kind !== 'Namespace'
      ? OD.ai.button({ kind: 'k8s-resource', section, name: item.name, namespace }, { label: 'Ask AI', size: 'sm' })
      : '';
    const footer = `<div class="row gap-2" style="width:100%">
      ${ai}
      <span class="toolbar-spacer"></span>
      ${item.kind === 'Pod' ? U.button({ label: 'Logs', icon: 'file', size: 'sm', attrs: `data-topo-logs="${esc(item.name)}" data-topo-logs-namespace="${esc(namespace)}"` }) : ''}
      ${item.kind === 'Pod' ? U.button({ label: 'Shell', icon: 'terminal', size: 'sm', attrs: `data-topo-shell="${esc(item.name)}" data-topo-shell-namespace="${esc(namespace)}"` }) : ''}
      ${U.button({ label: 'Details & commands', icon: 'info', size: 'sm', variant: 'primary', attrs: `data-topo-details="${esc(item.name)}" data-topo-details-section="${esc(section)}" data-topo-details-namespace="${esc(namespace)}"` })}
      ${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}
    </div>`;
    const body = `<div class="topo-drawer">
      <div class="topo-drawer-status">
        <span class="icon-chip tone-${esc(cardTone(item))}">${icon(KIND_META[item.kind]?.icon || 'box', 16)}</span>
        <div>
          <div class="row gap-2">${U.badge(item.status || item.phase || item.type || (item.ready ? 'Ready' : 'Not ready'), statusTone(item), { dot: true })}${item.kind === 'Node' ? U.badge((item.roles || []).join(', ') || 'node', 'slate') : ''}</div>
          <div class="faint text-xs">${esc(item.kind)}${namespace ? ` · namespace ${namespace}` : ''}${item.created ? ` · created ${timeAgo(item.created)}` : ''}</div>
        </div>
      </div>
      ${rowsFor(item)}
      <div class="detail-section"><h4>Graph links</h4>${relatedPills(links)}</div>
      ${podList(pods)}
      <div class="topo-drawer-note">${icon('shield-check', 11)} Built from live cluster objects. Secret values and ConfigMap values are never loaded into the map.</div>
    </div>`;

    U.drawer({
      eyebrow: item.kind === 'Namespace' ? 'Cluster map · namespace' : 'Cluster map',
      title: item.name,
      subtitle: [item.kind, namespace, current.context].filter(Boolean).join(' · '),
      icon: KIND_META[item.kind]?.icon || 'box',
      width: '640px',
      body,
      footer,
      onMount: ({ root: drawerRoot, close }) => {
        drawerRoot.querySelectorAll('[data-topo-jump]').forEach((button) => {
          button.addEventListener('click', () => {
            const next = button.dataset.topoJump;
            close('jump');
            if (next) openComponent(root, next);
          });
        });
        drawerRoot.querySelectorAll('[data-topo-details]').forEach((button) => {
          button.addEventListener('click', () => {
            const name = button.dataset.topoDetails;
            const targetSection = button.dataset.topoDetailsSection;
            const targetNamespace = button.dataset.topoDetailsNamespace || '';
            close('details');
            if (targetSection && actions.openResourceDrawer) actions.openResourceDrawer(targetSection, name, targetNamespace);
          });
        });
        drawerRoot.querySelectorAll('[data-topo-logs]').forEach((button) => {
          button.addEventListener('click', () => {
            const name = button.dataset.topoLogs;
            const targetNamespace = button.dataset.topoLogsNamespace || '';
            close('logs');
            if (actions.openPodLogs) actions.openPodLogs(name, targetNamespace);
          });
        });
        drawerRoot.querySelectorAll('[data-topo-shell]').forEach((button) => {
          button.addEventListener('click', () => {
            const name = button.dataset.topoShell;
            const targetNamespace = button.dataset.topoShellNamespace || '';
            close('shell');
            if (actions.showPodShell) actions.showPodShell({ name, namespace: targetNamespace });
          });
        });
        drawerRoot.querySelectorAll('[data-topo-pod-logs]').forEach((button) => {
          button.addEventListener('click', () => {
            close('pod-logs');
            if (actions.openPodLogs) actions.openPodLogs(button.dataset.topoPodLogs, button.dataset.topoPodNamespace || '');
          });
        });
        drawerRoot.querySelectorAll('[data-topo-pod-shell]').forEach((button) => {
          button.addEventListener('click', () => {
            close('pod-shell');
            if (actions.showPodShell) actions.showPodShell({ name: button.dataset.topoPodShell, namespace: button.dataset.topoPodNamespace || '' });
          });
        });
        drawerRoot.querySelectorAll('[data-topo-pod-open]').forEach((button) => {
          button.addEventListener('click', () => {
            close('pod-details');
            if (actions.openResourceDrawer) actions.openResourceDrawer('pods', button.dataset.topoPodOpen, button.dataset.topoPodNamespace || '');
          });
        });
      },
    });
  }

  function nodeRailHtml(model) {
    const nodes = model.nodes || [];
    if (!nodes.length) {
      return `<section class="card topo-nodes"><div class="card-body">${U.empty({ compact: true, icon: 'server', title: 'No nodes returned', body: 'The cluster answered, but did not return node objects.' })}</div></section>`;
    }
    return `<section class="card topo-nodes">
      <header class="card-head">
        <div class="card-head-text">
          <h2 class="card-title">${icon('server', 15)}Nodes</h2>
          <p class="card-sub">Live schedulable hosts · hover a node to highlight its pods</p>
        </div>
        <div class="card-actions">${U.badge(`${model.stats.nodesReady}/${model.stats.nodes} ready`, model.stats.nodesReady === model.stats.nodes ? 'green' : 'amber', { dot: true })}</div>
      </header>
      <div class="card-body">
        <div class="topo-node-list">${nodes.map((node) => {
          const tone = nodeTone(node);
          const allocatable = Number(node.podsAllocatable);
          const pct = allocatable > 0 ? Math.min(100, Math.round((node.pods / allocatable) * 100)) : 0;
          return `<button type="button" class="topo-node topo-tone-${tone}" data-topo-node-id="${esc(node.id)}" data-topo-node-resource="${esc(node.name)}" title="Open node ${esc(node.name)}">
            <span class="topo-node-head"><i class="topo-card-dot"></i><span class="topo-node-name">${esc(node.name)}</span>${U.badge(node.ready ? 'Ready' : node.readyReason || 'Not ready', node.ready ? 'green' : 'red')}</span>
            <span class="topo-node-meta">${esc((node.roles || []).join(', ') || 'worker')} · ${esc(node.version || 'version unknown')}</span>
            <span class="topo-node-meter"><i style="width:${pct}%"></i></span>
            <span class="topo-node-stats"><span>${node.pods || 0} pods</span><span>${esc(node.cpu || '—')} CPU</span><span>${esc(node.memory || '—')} mem</span><span class="mono">${esc(node.internalIP || '—')}</span></span>
          </button>`;
        }).join('')}</div>
      </div>
    </section>`;
  }

  function inventoryHtml(model) {
    const items = (model.inventory || []).slice();
    if (!items.length) return '';
    return `<section class="card topo-inventory-card">
      <header class="card-head">
        <div class="card-head-text">
          <h2 class="card-title">${icon('boxes', 15)}Resources outside the flow</h2>
          <p class="card-sub">${model.inventoryError ? esc(model.inventoryError) : 'Counts from the same live context · click to open the list'}</p>
        </div>
      </header>
      <div class="card-body"><div class="topo-inventory">
        ${items.map((item, i) => `<a class="topo-inv ${item.count ? '' : 'is-empty'}" href="#/kubernetes/${esc(item.id)}" title="${esc(item.label)}">
          <span class="icon-chip tone-${TONES[i % TONES.length]}">${icon(item.icon || 'box', 13)}</span>
          <span class="topo-inv-text"><strong>${item.count}</strong><small>${esc(item.label)}</small></span>
        </a>`).join('')}
      </div></div>
    </section>`;
  }

  function warningsHtml(model) {
    const warnings = model.warnings || [];
    return `<section class="card topo-warnings-card">
      <header class="card-head">
        <div class="card-head-text">
          <h2 class="card-title">${icon('alert-triangle', 15)}Warnings</h2>
          <p class="card-sub">Recent warning events across all namespaces</p>
        </div>
        <div class="card-actions">${warnings.length ? U.badge(`${model.stats.warnings || warnings.length} total`, 'amber') : U.badge('clear', 'green', { dot: true })}</div>
      </header>
      <div class="card-body">${warnings.length
        ? `<div class="topo-warning-list">${warnings.slice(0, 6).map((warning) => {
          const section = WARNING_SECTIONS[warning.kind] || '';
          const attrs = section && warning.object
            ? ` data-topo-warning-section="${esc(section)}" data-topo-warning-name="${esc(warning.object)}" data-topo-warning-namespace="${esc(warning.namespace || '')}"`
            : '';
          return `<button type="button" class="topo-warning"${attrs} ${section && warning.object ? '' : 'disabled'}>
            <span class="topo-warning-icon">${icon('flame', 12)}</span>
            <span class="topo-warning-text">
              <span><strong>${esc(warning.reason)}</strong> <span class="faint">${esc(warning.kind)}/${esc(warning.object)} · ${esc(warning.namespace || 'cluster')}</span></span>
              <span class="faint">${esc(short(warning.message, 120))}</span>
            </span>
            <span class="topo-warning-time">${esc(warning.count > 1 ? `${warning.count}×` : '')}<span>${esc(timeAgo(warning.last))}</span></span>
          </button>`;
        }).join('')}</div>`
        : U.empty({ compact: true, icon: 'circle-check', title: 'No warnings', body: 'The cluster has not reported a Warning event in the current window.' })}</div>
    </section>`;
  }

  function body(model) {
    current = model;
    index = indexModel(model);
    state = freshState();
    const stats = model.stats || {};
    const bands = filteredBands(model);
    const edges = visibleEdges(model, bands);
    const layout = layoutFor(bands, edges);
    const totalComponents = (stats.pods || 0) + (stats.workloads || 0) + (stats.services || 0) + (stats.ingresses || 0);
    const shown = countVisible(bands);
    const errorText = (model.errors || []).map((entry) => `${entry.resource}: ${entry.error}`).join(' · ');
    const problems = stats.totalUnhealthy || 0;
    const healthTone = problems ? 'amber' : 'green';
    const namespaceOptions = (model.namespaces || []).map((band) => `<option value="${esc(band.name)}">${esc(band.name)}</option>`).join('');
    const emptyNamespaces = (model.namespaces || []).filter((band) => {
      const totals = band.totals || {};
      return !totals.ingresses && !totals.services && !totals.workloads && !totals.pods;
    });
    const hasMap = bands.length > 0;

    return `<div class="stat-grid topo-stats">
      ${U.statCard({ label: 'Namespaces', value: stats.namespaces ?? 0, sub: `${stats.shownNamespaces ?? 0} in the map`, icon: 'layers', tone: 'violet' })}
      ${U.statCard({ label: 'Nodes ready', value: `${stats.nodesReady ?? 0}/${stats.nodes ?? 0}`, sub: `${stats.nodesUnhealthy ? `${stats.nodesUnhealthy} unhealthy` : 'all schedulable'}`, icon: 'server', tone: stats.nodesReady === stats.nodes && stats.nodes ? 'green' : 'amber' })}
      ${U.statCard({ label: 'Pods', value: `${stats.healthyPods ?? 0}/${stats.pods ?? 0}`, sub: `${stats.pending || 0} pending · ${stats.failed || 0} failed · ${stats.succeeded || 0} completed`, icon: 'box', tone: stats.pending || stats.failed ? 'amber' : 'accent' })}
      ${U.statCard({ label: 'Workloads', value: stats.workloads ?? 0, sub: `${stats.deployments || 0} deploy · ${stats.statefulsets || 0} stateful · ${stats.daemonsets || 0} daemon`, icon: 'layers', tone: 'cyan' })}
    </div>
    ${errorText ? `<div class="mt-4">${U.infoBanner('Some cluster data is unavailable', short(errorText, 520), 'warning')}</div>` : ''}
    ${nodeRailHtml(model)}
    <section class="card topo-map" data-topo-map>
      <header class="card-head topo-map-head">
        <div class="card-head-text">
          <h2 class="card-title">${icon('map', 15)}Cluster map</h2>
          <p class="card-sub">Ingress → Service → Workload → Pod · namespace swimlanes from live cluster objects</p>
        </div>
        <div class="card-actions">
          ${U.badge(problems ? `${problems} issue${problems === 1 ? '' : 's'}` : 'All healthy', healthTone, { dot: true })}
          <span class="topo-count" data-topo-count>${shown} of ${totalComponents} components</span>
        </div>
      </header>
      <div class="topo-toolbar">
        <label class="topo-search">
          ${icon('search', 13)}
          <input class="input" type="search" data-topo-search placeholder="Filter by name, host, image, node…" autocomplete="off" spellcheck="false" aria-label="Filter cluster map" />
        </label>
        <label class="field toolbar-field topo-ns-field"><span>Namespace</span><select class="input" data-topo-namespace><option value="">All namespaces</option>${namespaceOptions}</select></label>
        <button type="button" class="btn btn-sm btn-ghost topo-problem-btn" data-topo-problems title="Show only unhealthy components">${icon('alert-triangle', 12)}<span>Problems</span></button>
        <div class="toolbar-spacer"></div>
        <div class="topo-legend" aria-label="Graph legend">
          <span class="topo-legend-item"><i class="topo-legend-line routes"></i>route</span>
          <span class="topo-legend-item"><i class="topo-legend-line selects"></i>selects</span>
          <span class="topo-legend-item"><i class="topo-legend-line owns"></i>owns</span>
        </div>
        <div class="topo-zoom">
          ${U.iconButton({ icon: 'zoom-out', label: 'Zoom out', attrs: 'data-topo-zoom-out' })}
          ${U.iconButton({ icon: 'zoom-in', label: 'Zoom in', attrs: 'data-topo-zoom-in' })}
          ${U.iconButton({ icon: 'target', label: 'Fit to view', attrs: 'data-topo-fit' })}
          ${U.iconButton({ icon: 'maximize', label: 'Expand map', attrs: 'data-topo-expand' })}
        </div>
      </div>
      <div class="topo-viewport" data-topo-viewport>${hasMap ? `<div class="topo-canvas" data-topo-canvas>${svgMarkup(layout)}</div>` : emptyMapHtml()}</div>
      <div class="topo-hint">
        <span class="topo-hint-main">${icon('compass', 11)} Drag to pan · scroll to zoom · click a component for logs, shell, details and Ask AI</span>
        ${emptyNamespaces.length ? `<span class="topo-hint-empty">Empty namespaces ${emptyNamespaces.map((band) => `<button type="button" class="topo-ns-pill" data-topo-empty-ns="${esc(band.name)}">${esc(band.name)}</button>`).join('')}</span>` : ''}
      </div>
    </section>
    <div class="split-2 topo-bottom">${inventoryHtml(model)}${warningsHtml(model)}</div>`;
  }

  function mount(root, actions = {}) {
    root.__topoActions = actions;
    const map = root.querySelector('[data-topo-map]');
    if (!map || !current) return;

    const viewport = map.querySelector('[data-topo-viewport]');
    // Fit after layout so the whole graph is visible without a horizontal scroll.
    requestAnimationFrame(() => fitMap(root));

    // ------------------------------------------------------------ filters
    let searchTimer = null;
    const search = map.querySelector('[data-topo-search]');
    search?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = search.value || '';
        paintMap(root);
        requestAnimationFrame(() => fitMap(root));
      }, 110);
    });
    map.querySelector('[data-topo-namespace]')?.addEventListener('change', (event) => {
      state.namespace = event.target.value || '';
      paintMap(root);
      requestAnimationFrame(() => fitMap(root));
    });
    map.querySelector('[data-topo-problems]')?.addEventListener('click', () => {
      state.problems = !state.problems;
      paintMap(root);
      requestAnimationFrame(() => fitMap(root));
    });
    map.addEventListener('click', (event) => {
      if (event.target.closest('[data-topo-clear]')) {
        state.search = '';
        state.problems = false;
        state.namespace = '';
        if (search) search.value = '';
        const ns = map.querySelector('[data-topo-namespace]');
        if (ns) ns.value = '';
        paintMap(root);
        requestAnimationFrame(() => fitMap(root));
      }
    });

    // ------------------------------------------------------------- zoom/pan
    map.querySelector('[data-topo-zoom-in]')?.addEventListener('click', () => zoomBy(root, 1.18));
    map.querySelector('[data-topo-zoom-out]')?.addEventListener('click', () => zoomBy(root, 1 / 1.18));
    map.querySelector('[data-topo-fit]')?.addEventListener('click', () => fitMap(root));
    map.querySelector('[data-topo-expand]')?.addEventListener('click', () => {
      map.classList.toggle('is-expanded');
      requestAnimationFrame(() => fitMap(root));
    });

    viewport?.addEventListener('wheel', (event) => {
      if (!viewport.querySelector('[data-topo-canvas]')) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomBy(root, factor, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    let drag = null;
    let moved = false;
    viewport?.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('[data-topo-id]')) return;
      drag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
      moved = false;
      viewport.setPointerCapture?.(event.pointerId);
      viewport.classList.add('is-panning');
    });
    viewport?.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      state.panX = drag.panX + dx;
      state.panY = drag.panY + dy;
      state.userZoomed = true;
      applyTransform(root);
    });
    const endDrag = (event) => {
      if (!drag) return;
      drag = null;
      viewport.classList.remove('is-panning');
      viewport.releasePointerCapture?.(event?.pointerId);
      setTimeout(() => { moved = false; }, 0);
    };
    viewport?.addEventListener('pointerup', endDrag);
    viewport?.addEventListener('pointercancel', endDrag);

    // ------------------------------------------------------------- hover
    map.addEventListener('pointerover', (event) => {
      const card = event.target.closest('[data-topo-id]');
      if (card) {
        highlightCard(map, card.dataset.topoId);
        return;
      }
      const band = event.target.closest('[data-topo-band]');
      if (band) {
        const label = band.querySelector('[data-topo-id]');
        if (label) highlightCard(map, label.dataset.topoId);
      }
    });
    map.addEventListener('pointerout', (event) => {
      const related = event.relatedTarget;
      if (related && map.contains(related) && related.closest?.('[data-topo-id]')) return;
      if (related && map.contains(related) && related.closest?.('[data-topo-band]')) return;
      clearHighlight(map);
    });
    map.addEventListener('focusin', (event) => {
      const card = event.target.closest('[data-topo-id]');
      if (card) highlightCard(map, card.dataset.topoId);
    });
    map.addEventListener('focusout', () => clearHighlight(map));
    map.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      map.classList.remove('is-expanded');
      requestAnimationFrame(() => fitMap(root));
    });

    // ------------------------------------------------------------ click
    map.addEventListener('click', (event) => {
      const card = event.target.closest('[data-topo-id]');
      if (card) {
        if (moved) return;
        openComponent(root, card.dataset.topoId);
        return;
      }
      const warning = event.target.closest('[data-topo-warning-section]');
      if (warning) {
        actions.openResourceDrawer?.(warning.dataset.topoWarningSection, warning.dataset.topoWarningName, warning.dataset.topoWarningNamespace || '');
      }
      const emptyNs = event.target.closest('[data-topo-empty-ns]');
      if (emptyNs) openComponent(root, namespaceId(emptyNs.dataset.topoEmptyNs));
    });
    map.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('[data-topo-id]');
      if (!card) return;
      event.preventDefault();
      openComponent(root, card.dataset.topoId);
    });

    // Node rail: hover highlights pods, click opens the node drawer.
    root.querySelectorAll('[data-topo-node-resource]').forEach((nodeCard) => {
      nodeCard.addEventListener('pointerenter', () => highlightNode(map, nodeCard.dataset.topoNodeResource));
      nodeCard.addEventListener('pointerleave', () => clearHighlight(map));
      nodeCard.addEventListener('focus', () => highlightNode(map, nodeCard.dataset.topoNodeResource));
      nodeCard.addEventListener('blur', () => clearHighlight(map));
      nodeCard.addEventListener('click', () => openComponent(root, nodeCard.dataset.topoNodeId));
    });
    root.querySelectorAll('[data-topo-warning-section]').forEach((warning) => {
      warning.addEventListener('click', () => {
        actions.openResourceDrawer?.(warning.dataset.topoWarningSection, warning.dataset.topoWarningName, warning.dataset.topoWarningNamespace || '');
      });
    });

    const observer = new ResizeObserver(() => {
      if (!state.userZoomed) fitMap(root);
    });
    if (viewport) observer.observe(viewport);
  }

  OD.kubernetesTopology = { body, mount, _test: { filteredBands, layoutFor, freshState } };
})();
