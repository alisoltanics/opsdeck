'use strict';

/**
 * Cluster topology builder.
 *
 * Turns raw Kubernetes API objects into a small, renderer-safe graph:
 * namespace bands, ingress → service → workload → pod edges, a node rail and
 * an inventory of the remaining resource types.
 *
 * The builder is pure and never reads Secret or ConfigMap values. It keeps
 * names, labels, status, images, selectors and container names only.
 */

const LIMITS = {
  namespaces: 14,
  ingressesPerNamespace: 6,
  servicesPerNamespace: 10,
  workloadsPerNamespace: 12,
  podsPerNamespace: 16,
  nodes: 40,
  warnings: 10,
  labels: 24,
};

const INVENTORY = [
  { id: 'configmaps', label: 'ConfigMaps', icon: 'file', resource: 'configmap' },
  { id: 'secrets', label: 'Secrets', icon: 'key', resource: 'secret' },
  { id: 'persistentvolumeclaims', label: 'Volume claims', icon: 'folder', resource: 'persistentvolumeclaim' },
  { id: 'persistentvolumes', label: 'Volumes', icon: 'database', resource: 'persistentvolume' },
  { id: 'storageclasses', label: 'Storage classes', icon: 'layers', resource: 'storageclass' },
  { id: 'serviceaccounts', label: 'Service accounts', icon: 'user', resource: 'serviceaccount' },
  { id: 'roles', label: 'Roles', icon: 'shield', resource: 'role' },
  { id: 'rolebindings', label: 'Role bindings', icon: 'link', resource: 'rolebinding' },
  { id: 'networkpolicies', label: 'Network policies', icon: 'lock', resource: 'networkpolicy' },
  { id: 'resourcequotas', label: 'Resource quotas', icon: 'filter', resource: 'resourcequota' },
  { id: 'limitranges', label: 'Limit ranges', icon: 'target', resource: 'limitrange' },
  { id: 'jobs', label: 'Jobs', icon: 'play', resource: 'job' },
  { id: 'cronjobs', label: 'CronJobs', icon: 'clock', resource: 'cronjob' },
];

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeLabels(input) {
  const labels = input && typeof input === 'object' ? input : {};
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(labels)) {
    if (count >= LIMITS.labels) break;
    if (typeof value !== 'string' || !key) continue;
    out[text(key).slice(0, 120)] = text(value).slice(0, 160);
    count += 1;
  }
  return out;
}

function selectorText(selector) {
  const matchLabels = selector?.matchLabels || (selector && !selector.matchExpressions ? selector : {});
  const entries = Object.entries(matchLabels || {});
  if (!entries.length && !(selector?.matchExpressions || []).length) return '';
  const parts = entries.slice(0, 4).map(([key, value]) => `${key}=${value}`);
  const expressions = (selector?.matchExpressions || []).slice(0, 3).map((expr) => {
    const op = text(expr.operator);
    if (op === 'In' || op === 'NotIn') return `${expr.key} ${op.toLowerCase()} (${(expr.values || []).join(',')})`;
    return `${expr.key} ${op.toLowerCase()}`;
  });
  return [...parts, ...expressions].join(', ');
}

function matchesSelector(labels, selector) {
  if (!selector || typeof selector !== 'object') return false;
  const entries = Object.entries(selector);
  if (!entries.length) return false;
  return entries.every(([key, value]) => labels[key] === value);
}

function matchesLabelSelector(labels, selector) {
  if (!selector || typeof selector !== 'object') return false;
  const matchLabels = selector.matchLabels && typeof selector.matchLabels === 'object' ? selector.matchLabels : {};
  const expressions = Array.isArray(selector.matchExpressions) ? selector.matchExpressions : [];
  if (!Object.keys(matchLabels).length && !expressions.length) {
    // A plain equality map is also accepted for convenience.
    return matchesSelector(labels, selector);
  }
  for (const [key, value] of Object.entries(matchLabels)) {
    if (labels[key] !== value) return false;
  }
  for (const expr of expressions) {
    const key = text(expr?.key);
    if (!key) continue;
    const values = Array.isArray(expr.values) ? expr.values.map(text) : [];
    switch (expr.operator) {
      case 'In':
        if (!values.includes(text(labels[key]))) return false;
        break;
      case 'NotIn':
        if (values.includes(text(labels[key]))) return false;
        break;
      case 'Exists':
        if (!(key in labels)) return false;
        break;
      case 'DoesNotExist':
        if (key in labels) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

function imagesOf(spec) {
  const containers = [
    ...(Array.isArray(spec?.containers) ? spec.containers : []),
    ...(Array.isArray(spec?.initContainers) ? spec.initContainers : []),
  ];
  return [...new Set(containers.map((entry) => text(entry?.image)).filter(Boolean))].slice(0, 4);
}

function containerNames(spec) {
  return [
    ...(Array.isArray(spec?.containers) ? spec.containers : []),
    ...(Array.isArray(spec?.initContainers) ? spec.initContainers : []),
  ].map((entry) => text(entry?.name)).filter(Boolean).slice(0, 8);
}

function objectId(kind, namespace, name) {
  return `${String(kind).toLowerCase()}:${namespace || '_'}:${name}`;
}

function shortImage(image) {
  const value = text(image);
  if (!value) return '';
  const withoutDigest = value.split('@')[0];
  const parts = withoutDigest.split('/');
  const last = parts.pop() || withoutDigest;
  return last.replace(/:([^:]*)$/, (_match, tag) => (tag === 'latest' ? '' : `:${tag}`));
}

function ageIso(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function trimNode(item) {
  const metadata = item?.metadata || {};
  const status = item?.status || {};
  const labels = metadata.labels || {};
  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const ready = conditions.find((entry) => entry.type === 'Ready');
  const roles = Object.keys(labels)
    .filter((key) => key.startsWith('node-role.kubernetes.io/'))
    .map((key) => key.slice('node-role.kubernetes.io/'.length))
    .filter(Boolean);
  const addresses = Array.isArray(status.addresses) ? status.addresses : [];
  const internal = addresses.find((entry) => entry.type === 'InternalIP');
  const info = status.nodeInfo || {};
  const allocatable = status.allocatable || {};
  return {
    kind: 'Node',
    id: objectId('Node', '', text(metadata.name)),
    name: text(metadata.name),
    ready: ready?.status === 'True',
    readyReason: text(ready?.reason || (ready?.status === 'True' ? 'Ready' : 'Not ready')),
    roles: roles.length ? roles : ['worker'],
    internalIP: text(internal?.address),
    version: text(info.kubeletVersion),
    os: text(info.osImage),
    cpu: text(allocatable.cpu),
    memory: text(allocatable.memory),
    podsAllocatable: text(allocatable.pods),
    pods: 0,
    podsReady: 0,
    created: ageIso(metadata.creationTimestamp),
  };
}

function trimNamespace(item) {
  const metadata = item?.metadata || {};
  return {
    kind: 'Namespace',
    id: objectId('Namespace', '', text(metadata.name)),
    name: text(metadata.name),
    status: text(item?.status?.phase || 'Active'),
    created: ageIso(metadata.creationTimestamp),
  };
}

function trimPod(item, workloadsByUid, workloadsByOwner) {
  const metadata = item?.metadata || {};
  const spec = item?.spec || {};
  const status = item?.status || {};
  const containerStatuses = Array.isArray(status.containerStatuses) ? status.containerStatuses : [];
  const total = Array.isArray(spec.containers) ? spec.containers.length : 0;
  const ready = containerStatuses.filter((entry) => entry.ready).length;
  const restarts = containerStatuses.reduce((sum, entry) => sum + num(entry.restartCount), 0);
  const phase = text(status.phase || 'Unknown');
  const deleting = Boolean(metadata.deletionTimestamp);
  const ownerRef = (Array.isArray(metadata.ownerReferences) ? metadata.ownerReferences : [])
    .find((entry) => entry?.controller) || (Array.isArray(metadata.ownerReferences) ? metadata.ownerReferences[0] : null);
  const ownerKind = text(ownerRef?.kind);
  const ownerName = text(ownerRef?.name);
  const ownerUid = text(ownerRef?.uid);
  const ownerWorkload = workloadsByUid.get(`${text(metadata.namespace)}|${ownerUid}`)
    || workloadsByOwner.get(`${text(metadata.namespace)}|${ownerKind}|${ownerName}`)
    || null;

  let statusText = phase;
  let tone = 'slate';
  if (deleting) { statusText = 'Terminating'; tone = 'amber'; }
  else if (phase === 'Running') {
    if (total > 0 && ready < total) { statusText = `Not ready ${ready}/${total}`; tone = 'amber'; }
    else { statusText = 'Running'; tone = 'green'; }
  } else if (phase === 'Succeeded') { statusText = 'Completed'; tone = 'cyan'; }
  else if (phase === 'Failed') { statusText = 'Failed'; tone = 'red'; }
  else if (phase === 'Pending') { statusText = 'Pending'; tone = 'amber'; }

  return {
    kind: 'Pod',
    id: objectId('Pod', text(metadata.namespace), text(metadata.name)),
    name: text(metadata.name),
    namespace: text(metadata.namespace),
    node: text(spec.nodeName),
    phase,
    status: statusText,
    tone,
    ready,
    total,
    restarts,
    healthy: phase === 'Running' && (total === 0 || ready === total) && !deleting,
    ownerKind,
    ownerName,
    ownerUid,
    ownerId: ownerWorkload ? ownerWorkload.id : '',
    images: imagesOf(spec),
    containers: containerNames(spec),
    labels: safeLabels(metadata.labels),
    created: ageIso(metadata.creationTimestamp),
  };
}

function trimWorkload(item, kind) {
  const metadata = item?.metadata || {};
  const spec = item?.spec || {};
  const status = item?.status || {};
  const desired = num(spec.replicas, kind === 'DaemonSet' ? num(status.desiredNumberScheduled) : 0);
  const ready = kind === 'DaemonSet' ? num(status.numberReady) : num(status.readyReplicas);
  const available = kind === 'DaemonSet' ? num(status.numberAvailable) : num(status.availableReplicas);
  const updated = kind === 'DaemonSet' ? num(status.updatedNumberScheduled) : num(status.updatedReplicas);
  const podSpec = spec.template?.spec || {};
  const podLabels = safeLabels(spec.template?.metadata?.labels || metadata.labels);
  let statusText = 'Ready';
  let tone = 'green';
  if (kind === 'DaemonSet' && desired === 0) { statusText = 'No nodes'; tone = 'slate'; }
  else if (desired === 0) { statusText = 'Scaled to zero'; tone = 'slate'; }
  else if (ready >= desired) { statusText = 'Ready'; tone = 'green'; }
  else if (ready === 0) { statusText = 'Unavailable'; tone = 'red'; }
  else { statusText = 'Degraded'; tone = 'amber'; }
  return {
    kind,
    id: objectId(kind, text(metadata.namespace), text(metadata.name)),
    name: text(metadata.name),
    namespace: text(metadata.namespace),
    desired,
    ready,
    available,
    updated,
    status: statusText,
    tone,
    healthy: desired === 0 || ready >= desired,
    selector: selectorText(spec.selector),
    selectorRaw: spec.selector && typeof spec.selector === 'object' ? spec.selector : null,
    podLabels,
    labels: safeLabels(metadata.labels),
    images: imagesOf(podSpec),
    containers: containerNames(podSpec),
    created: ageIso(metadata.creationTimestamp),
    pods: [],
  };
}

function trimService(item) {
  const metadata = item?.metadata || {};
  const spec = item?.spec || {};
  const selector = spec.selector && typeof spec.selector === 'object' ? spec.selector : {};
  const ports = (Array.isArray(spec.ports) ? spec.ports : []).slice(0, 4).map((port) => ({
    name: text(port.name),
    port: num(port.port),
    target: num(port.targetPort, port.port),
    protocol: text(port.protocol || 'TCP'),
  }));
  return {
    kind: 'Service',
    id: objectId('Service', text(metadata.namespace), text(metadata.name)),
    name: text(metadata.name),
    namespace: text(metadata.namespace),
    type: text(spec.type || 'ClusterIP'),
    clusterIP: text(spec.clusterIP),
    externalName: text(spec.externalName),
    selector,
    selectorText: selectorText(selector),
    ports,
    portText: ports.map((port) => `${port.port}/${port.protocol}`).join(', '),
    headless: spec.clusterIP === 'None',
    created: ageIso(metadata.creationTimestamp),
    workloads: [],
    pods: [],
  };
}

function trimIngress(item) {
  const metadata = item?.metadata || {};
  const spec = item?.spec || {};
  const rules = Array.isArray(spec.rules) ? spec.rules : [];
  const paths = [];
  for (const rule of rules) {
    const host = text(rule.host);
    for (const path of (Array.isArray(rule.http?.paths) ? rule.http.paths : [])) {
      const service = path?.backend?.service;
      const serviceName = text(service?.name);
      if (!serviceName) continue;
      const port = service?.port?.number ?? service?.port?.name;
      paths.push({
        host,
        path: text(path.path || '/'),
        service: serviceName,
        port: text(port),
      });
    }
  }
  const hosts = [...new Set([...rules.map((rule) => text(rule.host)).filter(Boolean), ...paths.map((entry) => entry.host).filter(Boolean)])];
  const tls = Array.isArray(spec.tls) ? spec.tls : [];
  return {
    kind: 'Ingress',
    id: objectId('Ingress', text(metadata.namespace), text(metadata.name)),
    name: text(metadata.name),
    namespace: text(metadata.namespace),
    class: text(spec.ingressClassName || metadata.annotations?.['kubernetes.io/ingress.class']),
    hosts,
    paths,
    hostText: hosts.length ? hosts.slice(0, 3).join(', ') : '*',
    tls: tls.length > 0,
    created: ageIso(metadata.creationTimestamp),
  };
}

function trimWarning(item) {
  const involved = item?.involvedObject || {};
  return {
    namespace: text(involved.namespace || item?.metadata?.namespace),
    reason: text(item?.reason || 'Warning'),
    kind: text(involved.kind || 'Object'),
    object: text(involved.name),
    message: text(item?.message).slice(0, 300),
    count: num(item?.count, 1),
    last: ageIso(item?.lastTimestamp || item?.eventTime || item?.metadata?.creationTimestamp),
  };
}

function groupByNamespace(items) {
  const map = new Map();
  for (const item of items || []) {
    const namespace = text(item?.namespace || item?.metadata?.namespace);
    if (!namespace) continue;
    if (!map.has(namespace)) map.set(namespace, []);
    map.get(namespace).push(item);
  }
  return map;
}

function buildTopology(raw = {}, opts = {}) {
  const namespacesRaw = Array.isArray(raw.namespaces) ? raw.namespaces : [];
  const nodesRaw = Array.isArray(raw.nodes) ? raw.nodes : [];
  const podsRaw = Array.isArray(raw.pods) ? raw.pods : [];
  const deploymentsRaw = Array.isArray(raw.deployments) ? raw.deployments : [];
  const statefulsetsRaw = Array.isArray(raw.statefulsets) ? raw.statefulsets : [];
  const daemonsetsRaw = Array.isArray(raw.daemonsets) ? raw.daemonsets : [];
  const servicesRaw = Array.isArray(raw.services) ? raw.services : [];
  const ingressesRaw = Array.isArray(raw.ingresses) ? raw.ingresses : [];
  const warningsRaw = Array.isArray(raw.warnings) ? raw.warnings : [];
  const errors = (Array.isArray(raw.errors) ? raw.errors : []).map((entry) => ({
    resource: text(entry?.resource),
    error: text(entry?.error).slice(0, 400),
  })).filter((entry) => entry.error);

  const workloadsRaw = [];
  const workloadsByUid = new Map();
  const workloadsByOwner = new Map();
  const addWorkloads = (items, kind) => {
    for (const item of items) {
      const workload = trimWorkload(item, kind);
      workloadsRaw.push(workload);
      const uid = text(item?.metadata?.uid);
      if (uid) workloadsByUid.set(`${workload.namespace}|${uid}`, workload);
      workloadsByOwner.set(`${workload.namespace}|${workload.kind}|${workload.name}`, workload);
    }
  };
  addWorkloads(deploymentsRaw, 'Deployment');
  addWorkloads(statefulsetsRaw, 'StatefulSet');
  addWorkloads(daemonsetsRaw, 'DaemonSet');

  const pods = podsRaw.map((item) => trimPod(item, workloadsByUid, workloadsByOwner));
  // Deployment pods are owned by ReplicaSets, not directly by the Deployment.
  // Resolve those through the Deployment's pod selector so the graph shows the
  // real controller instead of an unowned pod.
  for (const pod of pods) {
    if (pod.ownerId) continue;
    const candidates = workloadsRaw.filter((workload) =>
      workload.namespace === pod.namespace
      && workload.kind === 'Deployment'
      && workload.selectorRaw
      && matchesLabelSelector(pod.labels, workload.selectorRaw));
    if (candidates.length) pod.ownerId = candidates[0].id;
  }
  const nodes = nodesRaw.map(trimNode);
  const services = servicesRaw.map(trimService);
  const ingresses = ingressesRaw.map(trimIngress);
  const namespaces = namespacesRaw.map(trimNamespace);
  const warnings = warningsRaw.map(trimWarning)
    .sort((a, b) => (Date.parse(b.last || '') || 0) - (Date.parse(a.last || '') || 0))
    .slice(0, LIMITS.warnings);

  const podsByNamespace = groupByNamespace(pods);
  const servicesByNamespace = groupByNamespace(services);
  const ingressesByNamespace = groupByNamespace(ingresses);

  const workloadNamespaces = new Map();
  for (const workload of workloadsRaw) {
    if (!workloadNamespaces.has(workload.namespace)) workloadNamespaces.set(workload.namespace, []);
    workloadNamespaces.get(workload.namespace).push(workload);
  }

  const nodeByName = new Map(nodes.map((node) => [node.name, node]));
  for (const pod of pods) {
    const node = nodeByName.get(pod.node);
    if (!node) continue;
    node.pods += 1;
    if (pod.healthy) node.podsReady += 1;
  }

  const warningsByNamespace = new Map();
  for (const warning of warnings) {
    if (!warning.namespace) continue;
    warningsByNamespace.set(warning.namespace, (warningsByNamespace.get(warning.namespace) || 0) + 1);
  }

  const namespaceBands = [];
  const candidates = [...new Set([
    ...namespaces.map((ns) => ns.name),
    ...pods.map((pod) => pod.namespace),
    ...workloadsRaw.map((workload) => workload.namespace),
    ...services.map((service) => service.namespace),
    ...ingresses.map((ingress) => ingress.namespace),
  ])].filter(Boolean);

  const bandScore = (name) => {
    const workloadCount = workloadNamespaces.get(name)?.length || 0;
    const serviceCount = servicesByNamespace.get(name)?.length || 0;
    const ingressCount = ingressesByNamespace.get(name)?.length || 0;
    return workloadCount * 4 + serviceCount * 2 + ingressCount;
  };
  candidates.sort((a, b) => {
    if (a === 'default' && b !== 'default') return -1;
    if (b === 'default' && a !== 'default') return 1;
    const scoreDiff = bandScore(b) - bandScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.localeCompare(b);
  });

  const shownNodes = nodes.slice(0, LIMITS.nodes);
  const includedNodeNames = new Set(shownNodes.map((node) => node.name));
  const edges = [];
  const edgeKeys = new Set();
  const addEdge = (from, to, kind) => {
    if (!from || !to || from === to) return;
    const key = `${kind}|${from}|${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: key, from, to, kind });
  };

  const allPodsByOwner = new Map();
  for (const pod of pods) {
    if (!pod.ownerId) continue;
    if (!allPodsByOwner.has(pod.ownerId)) allPodsByOwner.set(pod.ownerId, []);
    allPodsByOwner.get(pod.ownerId).push(pod);
  }
  for (const workload of workloadsRaw) {
    workload.pods = (allPodsByOwner.get(workload.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  const allEdges = [];
  const allEdgeKeys = new Set();
  const pushEdge = (from, to, kind) => {
    if (!from || !to || from === to) return;
    const key = `${kind}|${from}|${to}`;
    if (allEdgeKeys.has(key)) return;
    allEdgeKeys.add(key);
    allEdges.push({ id: key, from, to, kind });
  };

  // Service → workload / standalone pod, based on real pod labels. A workload
  // with zero replicas still connects through its pod-template labels.
  for (const service of services) {
    const selector = service.selector || {};
    if (!Object.keys(selector).length) continue;
    const matching = (podsByNamespace.get(service.namespace) || []).filter((pod) => matchesSelector(pod.labels, selector));
    const owners = new Set();
    for (const pod of matching) {
      if (pod.ownerId) {
        owners.add(pod.ownerId);
        service.pods.push(pod);
      } else {
        pushEdge(service.id, pod.id, 'selects');
        service.pods.push(pod);
      }
    }
    for (const ownerId of owners) {
      const workload = workloadsRaw.find((entry) => entry.id === ownerId);
      if (workload) {
        pushEdge(service.id, workload.id, 'selects');
        service.workloads.push(workload);
      }
    }
    if (!owners.size && !matching.some((pod) => !pod.ownerId)) {
      for (const workload of workloadNamespaces.get(service.namespace) || []) {
        if (workload.selectorRaw && matchesLabelSelector(workload.podLabels, selector)) {
          pushEdge(service.id, workload.id, 'selects');
          service.workloads.push(workload);
        }
      }
    }
  }

  // Ingress → service through every backend declared on every path.
  for (const ingress of ingresses) {
    const known = new Set();
    for (const path of ingress.paths) {
      const service = services.find((entry) => entry.namespace === ingress.namespace && entry.name === path.service);
      if (!service || known.has(service.id)) continue;
      known.add(service.id);
      pushEdge(ingress.id, service.id, 'routes');
    }
  }

  for (const workload of workloadsRaw) {
    for (const pod of workload.pods) pushEdge(workload.id, pod.id, 'owns');
  }

  for (const name of candidates) {
    if (namespaceBands.length >= LIMITS.namespaces) break;
    const namespaceWorkloads = (workloadNamespaces.get(name) || []).slice()
      .sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
    const namespacePods = (podsByNamespace.get(name) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const namespaceServices = (servicesByNamespace.get(name) || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const namespaceIngresses = (ingressesByNamespace.get(name) || []).slice().sort((a, b) => a.name.localeCompare(b.name));

    const workloadIds = new Set(namespaceWorkloads.map((workload) => workload.id));
    const ownedPods = [];
    const standalonePods = [];
    for (const pod of namespacePods) {
      if (pod.ownerId && workloadIds.has(pod.ownerId)) ownedPods.push(pod);
      else if (!pod.ownerId) standalonePods.push(pod);
      // Pods owned by a workload outside this view are counted as truncated.
    }

    const total = {
      ingresses: ingressesByNamespace.get(name)?.length || 0,
      services: servicesByNamespace.get(name)?.length || 0,
      workloads: namespaceWorkloads.length,
      pods: namespacePods.length,
      warnings: warningsByNamespace.get(name) || 0,
    };
    const includedIngresses = namespaceIngresses.slice(0, LIMITS.ingressesPerNamespace);
    const includedServices = namespaceServices.slice(0, LIMITS.servicesPerNamespace);
    const includedWorkloads = namespaceWorkloads.slice(0, LIMITS.workloadsPerNamespace);
    const includedWorkloadIds = new Set(includedWorkloads.map((workload) => workload.id));
    const includedOwned = ownedPods
      .filter((pod) => includedWorkloadIds.has(pod.ownerId))
      .slice(0, LIMITS.podsPerNamespace);
    const podsRoom = Math.max(0, LIMITS.podsPerNamespace - includedOwned.length);
    const includedStandalone = standalonePods.slice(0, podsRoom);
    const includedPods = [...includedOwned, ...includedStandalone]
      .sort((a, b) => a.name.localeCompare(b.name));
    const includedPodIds = new Set(includedPods.map((pod) => pod.id));
    const includedIds = new Set([
      ...includedIngresses.map((item) => item.id),
      ...includedServices.map((item) => item.id),
      ...includedWorkloads.map((item) => item.id),
      ...includedPodIds,
    ]);

    for (const edge of allEdges) {
      if (includedIds.has(edge.from) && includedIds.has(edge.to)) addEdge(edge.from, edge.to, edge.kind);
    }

    const namespaceInfo = namespaces.find((entry) => entry.name === name);
    namespaceBands.push({
      name,
      status: namespaceInfo?.status || 'Active',
      created: namespaceInfo?.created || null,
      totals: total,
      running: namespacePods.filter((pod) => pod.healthy).length,
      ingresses: includedIngresses,
      services: includedServices,
      workloads: includedWorkloads,
      pods: includedPods,
      standalone: includedStandalone.length,
      truncated: {
        ingresses: total.ingresses - includedIngresses.length,
        services: total.services - includedServices.length,
        workloads: total.workloads - includedWorkloads.length,
        pods: total.pods - includedPods.length,
      },
    });
  }

  // Edges may reference a namespace that was not included; drop them.
  const visible = new Set();
  for (const band of namespaceBands) {
    for (const item of [...band.ingresses, ...band.services, ...band.workloads, ...band.pods]) visible.add(item.id);
  }
  const visibleEdges = edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));

  const nodesReady = nodes.filter((node) => node.ready).length;
  const running = pods.filter((pod) => pod.phase === 'Running').length;
  const healthyPods = pods.filter((pod) => pod.healthy).length;
  const pending = pods.filter((pod) => pod.phase === 'Pending').length;
  const failed = pods.filter((pod) => pod.phase === 'Failed').length;
  const succeeded = pods.filter((pod) => pod.phase === 'Succeeded').length;
  const unhealthyPods = pods.filter((pod) => !pod.healthy && pod.phase !== 'Succeeded').length;
  const degradedWorkloads = workloadsRaw.filter((workload) => !workload.healthy).length;

  const inventory = INVENTORY.map((entry) => {
    const count = raw.inventory && raw.inventory[entry.id] !== undefined
      ? num(raw.inventory[entry.id])
      : 0;
    return { ...entry, count };
  });

  const shownPods = namespaceBands.reduce((sum, band) => sum + band.pods.length, 0);
  const shownWorkloads = namespaceBands.reduce((sum, band) => sum + band.workloads.length, 0);

  return {
    ok: true,
    context: text(opts.context || raw.context),
    namespace: text(opts.namespace || raw.namespace),
    collectedAt: text(raw.collectedAt) || new Date().toISOString(),
    stats: {
      namespaces: namespaces.length || candidates.length,
      shownNamespaces: namespaceBands.length,
      nodes: nodes.length,
      nodesReady,
      workloads: workloadsRaw.length,
      deployments: deploymentsRaw.length,
      statefulsets: statefulsetsRaw.length,
      daemonsets: daemonsetsRaw.length,
      pods: pods.length,
      running,
      healthyPods,
      pending,
      failed,
      succeeded,
      unhealthyPods,
      degradedWorkloads,
      services: services.length,
      ingresses: ingresses.length,
      warnings: warningsRaw.length,
      nodesUnhealthy: nodes.length - nodesReady,
      totalUnhealthy: unhealthyPods + degradedWorkloads + (nodes.length - nodesReady),
    },
    nodes: shownNodes,
    namespaces: namespaceBands,
    edges: visibleEdges,
    inventory,
    inventoryError: text(raw.inventoryError).slice(0, 300),
    warnings,
    errors,
    truncation: {
      namespaces: Math.max(0, candidates.length - namespaceBands.length),
      nodes: Math.max(0, nodes.length - shownNodes.length),
      pods: Math.max(0, pods.length - shownPods),
      workloads: Math.max(0, workloadsRaw.length - shownWorkloads),
    },
  };
}

module.exports = {
  buildTopology,
  __test: {
    matchesSelector,
    matchesLabelSelector,
    selectorText,
    trimPod,
    trimNode,
    trimWorkload,
    trimService,
    trimIngress,
    shortImage,
    LIMITS,
    INVENTORY,
  },
};
