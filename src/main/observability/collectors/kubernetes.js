'use strict';

/**
 * Kubernetes collector.
 *
 * Reuses the existing KubernetesService (kubectl discovery, context selection
 * and the read-only kubeJson runner). Real usage metrics come from
 * `kubectl top`, which requires metrics-server. When it is unavailable the
 * collector reports usage as absent instead of substituting fake values.
 */

const { metric } = require('../metrics');
const { sanitizeText } = require('../util');

const MAX_POD_METRICS = 300;
const TOP_REFRESH = 20e3;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cpuMillicores(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.endsWith('m')) return num(text.slice(0, -1));
  if (text.endsWith('n')) return num(text.slice(0, -1)) / 1e6;
  if (text.endsWith('u')) return num(text.slice(0, -1)) / 1e3;
  return num(text) * 1000;
}

function memoryBytes(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const match = /^([\d.]+)\s*([KMGTPE]i?)?/.exec(text);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = String(match[2] || '').toLowerCase();
  const mult = {
    '': 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12, p: 1e15,
    ki: 1024, mi: 1024 ** 2, gi: 1024 ** 3, ti: 1024 ** 4, pi: 1024 ** 5,
  }[unit] || 1;
  return base * mult;
}

function parseTopRows(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^NAME\s/.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    rows.push({ name: parts[0], namespace: parts[1], cpu: parts[2], memory: parts[3] || '' });
  }
  return rows;
}

function containerStatuses(pod) {
  const status = pod?.status || {};
  const statuses = status.containerStatuses || [];
  const restarts = statuses.reduce((sum, entry) => sum + num(entry.restartCount, 0), 0);
  const waiting = statuses.map((entry) => entry.state?.waiting?.reason).filter(Boolean);
  const terminated = statuses.map((entry) => entry.state?.terminated?.reason).filter(Boolean);
  const ready = statuses.filter((entry) => entry.ready).length;
  return {
    restarts,
    ready,
    total: (pod?.spec?.containers || []).length,
    waiting: waiting[0] || '',
    terminated: terminated[0] || '',
    oomKilled: statuses.some((entry) => entry.lastState?.terminated?.reason === 'OOMKilled' || entry.state?.terminated?.reason === 'OOMKilled'),
  };
}

class KubernetesCollector {
  constructor({ kubernetes }) {
    this.name = 'kubernetes';
    this.label = 'Kubernetes';
    this.source = 'kubernetes';
    this.kubernetes = kubernetes;
    this.topCache = { at: 0, pods: [], nodes: [], error: '' };
    this.lastDetails = null;
    this.lastAt = 0;
    this.lastError = '';
  }

  async collect() {
    const started = Date.now();
    const timestamp = started;
    const metrics = [];
    const errors = [];

    if (!this.kubernetes) {
      return this.unavailable('The Kubernetes service is not available.', started);
    }

    let dashboard;
    try {
      dashboard = await this.kubernetes.dashboard();
    } catch (error) {
      return this.unavailable(error.message || String(error), started);
    }
    if (!dashboard?.connection?.connected) {
      const reason = dashboard?.connection?.reason || 'No Kubernetes cluster is connected.';
      this.lastAt = timestamp;
      this.lastError = reason;
      this.lastDetails = {
        at: new Date(timestamp).toISOString(), available: false, reason,
        context: dashboard?.selected || null, clusters: dashboard?.contexts || [],
        nodes: [], pods: [], workloads: [], events: [], topAvailable: false, errors: [reason],
      };
      return { ok: true, available: false, reason, metrics: [], details: this.lastDetails, errors: [reason], durationMs: Date.now() - started, at: new Date(timestamp).toISOString() };
    }

    const context = dashboard.selected;
    const [nodeRes, podRes, deployRes, statefulRes, daemonRes, eventRes] = await Promise.all([
      this.kubernetes.kubeJson(['get', 'nodes', '-o', 'json'], { timeout: 15000, context }),
      this.kubernetes.kubeJson(['get', 'pods', '--all-namespaces', '-o', 'json'], { timeout: 25000, context }),
      this.kubernetes.kubeJson(['get', 'deployments', '--all-namespaces', '-o', 'json'], { timeout: 20000, context }),
      this.kubernetes.kubeJson(['get', 'statefulsets', '--all-namespaces', '-o', 'json'], { timeout: 20000, context }),
      this.kubernetes.kubeJson(['get', 'daemonsets', '--all-namespaces', '-o', 'json'], { timeout: 20000, context }),
      this.kubernetes.kubeJson(['get', 'events', '--all-namespaces', '--field-selector=type=Warning', '-o', 'json'], { timeout: 15000, context }),
    ].map((promise) => promise.catch((error) => ({ ok: false, error: error.message }))));

    const nodeItems = nodeRes.ok && Array.isArray(nodeRes.data?.items) ? nodeRes.data.items : [];
    const podItems = podRes.ok && Array.isArray(podRes.data?.items) ? podRes.data.items : [];
    const deploymentItems = deployRes.ok && Array.isArray(deployRes.data?.items) ? deployRes.data.items : [];
    const statefulItems = statefulRes.ok && Array.isArray(statefulRes.data?.items) ? statefulRes.data.items : [];
    const daemonItems = daemonRes.ok && Array.isArray(daemonRes.data?.items) ? daemonRes.data.items : [];
    const eventItems = eventRes.ok && Array.isArray(eventRes.data?.items) ? eventRes.data.items : [];
    for (const [label, result] of [['Nodes', nodeRes], ['Pods', podRes], ['Deployments', deployRes], ['StatefulSets', statefulRes], ['DaemonSets', daemonRes], ['Events', eventRes]]) {
      if (!result.ok) errors.push(`${label}: ${sanitizeText(result.error || result.stderr || 'request failed', 300)}`);
    }

    const nodes = nodeItems.map((node) => {
      const conditions = node?.status?.conditions || [];
      const ready = conditions.find((entry) => entry.type === 'Ready')?.status === 'True';
      const pressure = (type) => conditions.find((entry) => entry.type === type)?.status === 'True';
      return {
        name: node?.metadata?.name || '',
        ready,
        unschedulable: node?.spec?.unschedulable === true,
        version: node?.status?.nodeInfo?.kubeletVersion || '',
        os: node?.status?.nodeInfo?.operatingSystem || '',
        arch: node?.status?.nodeInfo?.architecture || '',
        internalIP: (node?.status?.addresses || []).find((entry) => entry.type === 'InternalIP')?.address || '',
        cpuCapacity: cpuMillicores(node?.status?.capacity?.cpu),
        memoryCapacity: memoryBytes(node?.status?.capacity?.memory),
        podCapacity: num(node?.status?.capacity?.pods, 0),
        cpuAllocatable: cpuMillicores(node?.status?.allocatable?.cpu),
        memoryAllocatable: memoryBytes(node?.status?.allocatable?.memory),
        diskPressure: pressure('DiskPressure'),
        memoryPressure: pressure('MemoryPressure'),
        pidPressure: pressure('PIDPressure'),
        createdAt: node?.metadata?.creationTimestamp || null,
      };
    });

    let pods = podItems.map((pod) => {
      const info = containerStatuses(pod);
      const phase = pod?.status?.phase || 'Unknown';
      const waiting = info.waiting;
      let status = phase;
      if (phase === 'Succeeded') status = 'Succeeded';
      else if (info.oomKilled) status = 'OOMKilled';
      else if (waiting) status = waiting;
      else if (phase === 'Running' && info.ready < info.total) status = 'NotReady';
      return {
        name: pod?.metadata?.name || '',
        namespace: pod?.metadata?.namespace || '',
        node: pod?.spec?.nodeName || '',
        phase,
        status,
        ready: info.ready,
        total: info.total,
        restarts: info.restarts,
        crashLoop: waiting === 'CrashLoopBackOff' || info.terminated === 'CrashLoopBackOff',
        imagePull: waiting === 'ImagePullBackOff' || waiting === 'ErrImagePull',
        oomKilled: info.oomKilled,
        createdAt: pod?.metadata?.creationTimestamp || null,
        labels: pod?.metadata?.labels || {},
        containers: (pod?.spec?.containers || []).map((container) => ({
          name: container.name,
          image: container.image,
          requests: container.resources?.requests || {},
          limits: container.resources?.limits || {},
        })),
      };
    });

    const top = await this.top(context);
    if (top.error) noteTopError(errors, top.error);
    const topPods = new Map(top.pods.map((row) => [`${row.namespace}/${row.name}`, row]));
    const topNodes = new Map(top.nodes.map((row) => [row.name, row]));

    for (const pod of pods) {
      const usage = topPods.get(`${pod.namespace}/${pod.name}`);
      pod.cpuMillicores = usage ? cpuMillicores(usage.cpu) : null;
      pod.memoryBytes = usage ? memoryBytes(usage.memory) : null;
      pod.cpuLabel = usage?.cpu || null;
      pod.memoryLabel = usage?.memory || null;
    }
    for (const node of nodes) {
      const usage = topNodes.get(node.name);
      node.cpuMillicores = usage ? cpuMillicores(usage.cpu) : null;
      node.memoryBytes = usage ? memoryBytes(usage.memory) : null;
      node.cpuLabel = usage?.cpu || null;
      node.memoryLabel = usage?.memory || null;
    }

    // Keep the stored series bounded on large clusters while still returning
    // the full table to the UI.
    const scored = [...pods].sort((a, b) => ((b.cpuMillicores || 0) + (b.memoryBytes || 0) / 1e7) - ((a.cpuMillicores || 0) + (a.memoryBytes || 0) / 1e7));
    for (const pod of scored.slice(0, MAX_POD_METRICS)) {
      const labels = { cluster: context, namespace: pod.namespace, pod: pod.name, node: pod.node, phase: pod.phase };
      const resource = `k8s:${pod.namespace}/${pod.name}`;
      metrics.push(metric('k8s.pod.restarts', pod.restarts, { unit: 'count', source: this.source, resource, labels, timestamp }));
      metrics.push(metric('k8s.pod.ready', pod.ready, { unit: 'count', source: this.source, resource, labels, timestamp }));
      metrics.push(metric('k8s.pod.running', pod.phase === 'Running' ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
      if (pod.cpuMillicores != null) metrics.push(metric('k8s.pod.cpu.millicores', pod.cpuMillicores, { unit: 'count', source: this.source, resource, labels, timestamp }));
      if (pod.memoryBytes != null) metrics.push(metric('k8s.pod.memory.bytes', pod.memoryBytes, { unit: 'bytes', source: this.source, resource, labels, timestamp }));
    }

    const workloads = [];
    const addWorkload = (kind, items, readyField, desiredField, availableField) => {
      for (const item of items) {
        const desired = num(item?.spec?.replicas, 1);
        const ready = num(item?.status?.[readyField], 0);
        const available = num(item?.status?.[availableField], ready);
        const entry = {
          kind,
          name: item?.metadata?.name || '',
          namespace: item?.metadata?.namespace || '',
          desired,
          ready,
          available,
          status: desired > 0 && ready >= desired ? 'Healthy' : (ready > 0 ? 'Degraded' : 'Unavailable'),
          createdAt: item?.metadata?.creationTimestamp || null,
          images: (item?.spec?.template?.spec?.containers || []).map((container) => container.image),
        };
        workloads.push(entry);
        const labels = { cluster: context, namespace: entry.namespace, workload: entry.name, kind };
        const resource = `k8s:${kind}/${entry.namespace}/${entry.name}`;
        metrics.push(metric('k8s.workload.desired', desired, { unit: 'count', source: this.source, resource, labels, timestamp }));
        metrics.push(metric('k8s.workload.ready', ready, { unit: 'count', source: this.source, resource, labels, timestamp }));
        metrics.push(metric('k8s.workload.available', available, { unit: 'count', source: this.source, resource, labels, timestamp }));
      }
    };
    addWorkload('Deployment', deploymentItems, 'readyReplicas', 'replicas', 'availableReplicas');
    addWorkload('StatefulSet', statefulItems, 'readyReplicas', 'replicas', 'currentReplicas');
    addWorkload('DaemonSet', daemonItems, 'numberReady', 'desiredNumberScheduled', 'numberAvailable');

    const podCounts = { total: pods.length, running: 0, pending: 0, failed: 0, succeeded: 0, unknown: 0, crashLoop: 0, imagePull: 0, oomKilled: 0 };
    for (const pod of pods) {
      const phase = String(pod.phase).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(podCounts, phase)) podCounts[phase] += 1;
      else podCounts.unknown += 1;
      if (pod.crashLoop) podCounts.crashLoop += 1;
      if (pod.imagePull) podCounts.imagePull += 1;
      if (pod.oomKilled) podCounts.oomKilled += 1;
    }

    const readyNodes = nodes.filter((node) => node.ready).length;
    const clusterId = context || 'default';
    const clusterLabels = { cluster: clusterId };
    metrics.push(metric('k8s.nodes.total', nodes.length, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.nodes.ready', readyNodes, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.nodes.not_ready', nodes.length - readyNodes, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.namespaces.total', dashboard.dashboard?.namespaceCount || 0, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.pods.total', podCounts.total, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.pods.running', podCounts.running, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.pods.pending', podCounts.pending, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.pods.failed', podCounts.failed, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.pods.crashloop', podCounts.crashLoop, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.pods.oom_killed', podCounts.oomKilled, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.workloads.total', workloads.length, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));
    metrics.push(metric('k8s.workloads.degraded', workloads.filter((w) => w.status !== 'Healthy').length, { unit: 'count', source: this.source, resource: `k8s:${clusterId}`, labels: clusterLabels, timestamp }));

    for (const node of nodes) {
      const labels = { cluster: context, node: node.name };
      const resource = `k8s:node/${node.name}`;
      metrics.push(metric('k8s.node.ready', node.ready ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
      metrics.push(metric('k8s.node.disk_pressure', node.diskPressure ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
      metrics.push(metric('k8s.node.memory_pressure', node.memoryPressure ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
      metrics.push(metric('k8s.node.pid_pressure', node.pidPressure ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
      if (node.cpuCapacity) metrics.push(metric('k8s.node.cpu.capacity.millicores', node.cpuCapacity, { unit: 'count', source: this.source, resource, labels, timestamp }));
      if (node.memoryCapacity) metrics.push(metric('k8s.node.memory.capacity.bytes', node.memoryCapacity, { unit: 'bytes', source: this.source, resource, labels, timestamp }));
      if (node.cpuMillicores != null) metrics.push(metric('k8s.node.cpu.usage.millicores', node.cpuMillicores, { unit: 'count', source: this.source, resource, labels, timestamp }));
      if (node.memoryBytes != null) metrics.push(metric('k8s.node.memory.usage.bytes', node.memoryBytes, { unit: 'bytes', source: this.source, resource, labels, timestamp }));
    }

    const events = eventItems.slice(-200).reverse().map((item) => ({
      namespace: item?.metadata?.namespace || '',
      type: item?.type || 'Warning',
      reason: item?.reason || '',
      object: item?.involvedObject?.name || '',
      kind: item?.involvedObject?.kind || '',
      message: sanitizeText(item?.message || '', 600),
      count: num(item?.count, 1),
      last: item?.lastTimestamp || item?.eventTime || item?.metadata?.creationTimestamp || null,
    }));

    this.lastAt = timestamp;
    this.lastError = errors.join('; ');
    this.lastDetails = {
      at: new Date(timestamp).toISOString(),
      available: true,
      context,
      clusterVersion: dashboard.connection?.version || null,
      clusters: dashboard.contexts || [],
      nodes,
      pods,
      workloads,
      events,
      podCounts,
      nodeSummary: { total: nodes.length, ready: readyNodes },
      topAvailable: !top.error,
      topError: top.error || '',
      errors,
    };

    return { ok: true, available: true, metrics, details: this.lastDetails, errors, durationMs: Date.now() - started, at: new Date(timestamp).toISOString() };
  }

  unavailable(reason, started) {
    this.lastAt = started;
    this.lastError = reason;
    this.lastDetails = {
      at: new Date(started).toISOString(), available: false, reason,
      nodes: [], pods: [], workloads: [], events: [], topAvailable: false,
      errors: [reason],
    };
    return { ok: true, available: false, reason, metrics: [], details: this.lastDetails, errors: [reason], durationMs: Date.now() - started, at: new Date(started).toISOString() };
  }

  async top(context) {
    const now = Date.now();
    if (now - this.topCache.at < TOP_REFRESH) return this.topCache;
    const podRes = await this.kubernetes.kube(['top', 'pods', '--all-namespaces', '--no-headers'], { timeout: 20000, context }).catch((error) => ({ ok: false, stderr: error.message }));
    const nodeRes = await this.kubernetes.kube(['top', 'nodes', '--no-headers'], { timeout: 20000, context }).catch((error) => ({ ok: false, stderr: error.message }));
    const error = podRes.ok && nodeRes.ok ? '' : sanitizeText(podRes.stderr || nodeRes.stderr || 'kubectl top is unavailable.', 300);
    this.topCache = {
      at: now,
      pods: podRes.ok ? parseTopRows(podRes.stdout) : [],
      nodes: nodeRes.ok ? parseTopRows(nodeRes.stdout) : [],
      error,
    };
    return this.topCache;
  }
}

function noteTopError(errors, message) {
  if (!errors.some((entry) => entry.startsWith('Usage metrics:'))) errors.push(`Usage metrics: ${message}`);
}

module.exports = { KubernetesCollector, __test: { cpuMillicores, memoryBytes, parseTopRows, containerStatuses } };
