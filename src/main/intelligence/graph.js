'use strict';

/**
 * Unified infrastructure graph.
 *
 * Edges are built only from data a module actually reported:
 *  - observed: Docker labels/mounts/ports, Kubernetes selectors and owners,
 *    trace parent/child spans, or a database profile recording the exact
 *    container/pod it was discovered from.
 *  - inferred: a weaker match (for example a configured hostname equal to a
 *    remote server) that is labelled as such in the UI.
 *
 * The builder never invents an edge to make the graph look complete.
 */

const LIMITS = { nodes: 3000, edges: 8000 };

const EDGE_LABELS = {
  'runs-on': 'runs on',
  'uses-image': 'uses image',
  'uses-volume': 'uses volume',
  'attached-to': 'attached to',
  contains: 'contains',
  routes: 'routes to',
  selects: 'selects',
  owns: 'owns',
  'scheduled-on': 'scheduled on',
  'connects-to': 'connects to',
  'part-of': 'part of',
  'depends-on': 'depends on',
  'observed-depends-on': 'calls',
};

function nodeFromResource(resource) {
  return {
    id: resource.id,
    label: resource.name,
    kind: resource.kind,
    module: resource.module,
    status: resource.status,
    environment: resource.environment || null,
    namespace: resource.namespace || '',
    cluster: resource.cluster || '',
    host: resource.host || '',
    href: resource.href || '',
    labels: resource.labels || {},
    degree: 0,
  };
}

function parseVolumeNames(mounts) {
  const names = [];
  for (const part of String(mounts || '').split(',')) {
    const text = part.trim();
    if (!text) continue;
    // A Windows drive path (C:\data) is a bind mount, not a named volume; check
    // the original spec before splitting on the colon.
    if (/^[A-Za-z]:[\\/]/.test(text)) continue;
    const source = text.split(':')[0].trim();
    if (!source) continue;
    if (source.startsWith('/') || source.startsWith('.')) continue;
    if (names.includes(source)) continue;
    names.push(source);
  }
  return names.slice(0, 40);
}

function buildGraph({ resources = [], topology = null, traces = [], dockerHost = '' } = {}) {
  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();

  const addNode = (resource) => {
    if (!resource || !resource.id || nodes.has(resource.id)) return nodes.get(resource.id) || null;
    if (nodes.size >= LIMITS.nodes) return null;
    const node = nodeFromResource(resource);
    nodes.set(node.id, node);
    return node;
  };

  const addEdge = (from, to, kind, confidence, evidence, extra = {}) => {
    if (!from || !to || from === to || !nodes.has(from) || !nodes.has(to)) return;
    const key = `${from}|${to}|${kind}`;
    if (edgeKeys.has(key)) {
      const existing = edges.find((edge) => edge.id === key);
      if (existing) {
        existing.weight += 1;
        if (confidence === 'observed') existing.confidence = 'observed';
      }
      return;
    }
    if (edges.length >= LIMITS.edges) return;
    edgeKeys.add(key);
    edges.push({
      id: key,
      from,
      to,
      kind,
      label: EDGE_LABELS[kind] || kind,
      confidence: confidence === 'observed' ? 'observed' : 'inferred',
      evidence: String(evidence || '').slice(0, 300),
      weight: 1,
      ...extra,
    });
  };

  const byId = new Map();
  const byNative = new Map();
  const byModuleKind = new Map();
  const byName = new Map();
  for (const resource of resources) {
    addNode(resource);
    byId.set(resource.id, resource);
    if (resource.nativeId) byNative.set(resource.nativeId, resource);
    byNative.set(resource.id, resource);
    const key = `${resource.module}:${resource.kind}`;
    if (!byModuleKind.has(key)) byModuleKind.set(key, []);
    byModuleKind.get(key).push(resource);
    const nameKey = `${resource.module}:${resource.kind}:${resource.name}`;
    byName.set(nameKey, resource);
  }

  const containers = byModuleKind.get('docker:container') || [];
  const images = byModuleKind.get('docker:image') || [];
  const networks = byModuleKind.get('docker:network') || [];
  const volumes = byModuleKind.get('docker:volume') || [];
  const composeProjects = byModuleKind.get('docker:compose-project') || [];
  const engine = (byModuleKind.get('docker:engine') || [])[0] || null;
  const localHost = (resources.find((entry) => entry.module === 'host' && entry.kind === 'host')) || null;
  const k8sPods = byModuleKind.get('kubernetes:pod') || [];
  const k8sNodes = byModuleKind.get('kubernetes:node') || [];
  const k8sWorkloads = [
    ...(byModuleKind.get('kubernetes:deployment') || []),
    ...(byModuleKind.get('kubernetes:statefulset') || []),
    ...(byModuleKind.get('kubernetes:daemonset') || []),
  ];
  const databases = byModuleKind.get('databases:database') || [];

  // Docker containment and composition.
  if (engine && localHost) addEdge(engine.id, localHost.id, 'runs-on', 'observed', 'Docker engine reported by the local daemon');

  const imageIndex = new Map();
  for (const image of images) {
    const aliases = new Set();
    aliases.add(image.id);
    aliases.add(image.name);
    if (image.metadata?.id) aliases.add(String(image.metadata.id));
    if (image.metadata?.repository && image.metadata?.tag && image.metadata.repository !== '<none>') {
      aliases.add(`${image.metadata.repository}:${image.metadata.tag}`);
      aliases.add(image.metadata.repository);
    }
    for (const alias of aliases) imageIndex.set(alias, image);
  }
  const networkIndex = new Map(networks.map((entry) => [entry.name, entry]));
  const volumeIndex = new Map(volumes.map((entry) => [entry.name, entry]));
  const projectIndex = new Map(composeProjects.map((entry) => [entry.name, entry]));

  for (const container of containers) {
    if (engine) addEdge(container.id, engine.id, 'runs-on', 'observed', 'Container listed by the Docker engine');
    const imageRef = container.metadata?.image || '';
    const image = imageIndex.get(imageRef)
      || imageIndex.get(String(imageRef).replace(/^sha256:/, ''))
      || imageIndex.get(String(container.metadata?.id || '').slice(0, 12));
    if (image) addEdge(container.id, image.id, 'uses-image', 'observed', `Container image ${imageRef}`);
    for (const network of container.metadata?.networks || []) {
      const target = networkIndex.get(network);
      if (target) addEdge(container.id, target.id, 'attached-to', 'observed', `Docker network ${network}`);
    }
    for (const name of parseVolumeNames(container.metadata?.mounts)) {
      const target = volumeIndex.get(name);
      if (target) addEdge(container.id, target.id, 'uses-volume', 'observed', `Mount ${name}`);
    }
    const project = container.metadata?.compose ? projectIndex.get(container.metadata.compose) : null;
    if (project) {
      addEdge(project.id, container.id, 'contains', 'observed', `Compose label ${container.metadata.compose}`);
      addEdge(container.id, project.id, 'part-of', 'observed', `Compose service ${container.metadata.service || container.name}`);
    }
  }

  // Kubernetes relationships come from the same topology the cluster map uses.
  if (topology && Array.isArray(topology.edges)) {
    const resolve = (native) => {
      const direct = byNative.get(native);
      if (direct) return direct.id;
      // Topology ids are `kind:namespace:name`; our resource ids add the context.
      const suffix = `/${native}`;
      for (const resource of resources) {
        if (resource.module !== 'kubernetes') continue;
        if (resource.nativeId === native) return resource.id;
        if (String(resource.id).endsWith(suffix)) return resource.id;
      }
      return null;
    };
    for (const edge of topology.edges) {
      const from = resolve(edge.from);
      const to = resolve(edge.to);
      if (from && to) {
        const kind = edge.kind === 'selects' ? 'selects' : edge.kind === 'owns' ? 'owns' : 'routes';
        addEdge(from, to, kind, 'observed', `Kubernetes ${edge.kind}`);
      }
    }
  }
  const k8sNodeByName = new Map();
  for (const node of k8sNodes) k8sNodeByName.set(`${node.cluster}:${node.name}`, node);
  for (const pod of k8sPods) {
    const nodeName = pod.metadata?.node;
    if (!nodeName) continue;
    const target = k8sNodeByName.get(`${pod.cluster}:${nodeName}`)
      || k8sNodes.find((entry) => entry.name === nodeName && entry.cluster === pod.cluster);
    if (target) addEdge(pod.id, target.id, 'scheduled-on', 'observed', `Pod spec.nodeName ${nodeName}`);
  }

  // Databases: the discovery profile records the exact runtime it came from.
  for (const database of databases) {
    const source = database.metadata?.source || {};
    let linked = false;
    if (source.containerId) {
      const container = byNative.get(source.containerId)
        || containers.find((entry) => entry.nativeId === source.containerId || entry.metadata?.id === source.containerId);
      if (container) {
        addEdge(database.id, container.id, 'runs-in', 'observed', `Discovered in container ${source.containerName || container.name}`);
        linked = true;
      }
    }
    if (source.namespace && (source.pod || source.workload)) {
      const targetName = source.pod || source.workload;
      const target = k8sPods.find((entry) => entry.namespace === source.namespace && entry.name === targetName)
        || k8sWorkloads.find((entry) => entry.namespace === source.namespace && entry.name === targetName);
      if (target) {
        addEdge(database.id, target.id, 'runs-in', 'observed', `Discovered in ${source.namespace}/${targetName}`);
        linked = true;
      }
    }
    if (source.project) {
      const project = projectIndex.get(source.project);
      if (project) {
        addEdge(database.id, project.id, 'part-of', 'observed', `Compose project ${source.project}`);
        linked = true;
      }
    }
    if (!linked) {
      // A manual profile only tells us the host and port. Match a published
      // container port on localhost before declaring anything.
      const host = String(database.metadata?.host || '').toLowerCase();
      const port = Number(database.metadata?.port);
      if (/^(127\.0\.0\.1|localhost|::1)$/.test(host) && Number.isFinite(port)) {
        const container = containers.find((entry) => (entry.metadata?.ports || [])
          .some((published) => published.hostPort === port && published.containerPort));
        if (container) {
          addEdge(database.id, container.id, 'connects-to', 'inferred', `localhost:${port} matches a published container port`);
          linked = true;
        }
      }
    }
    if (!linked && database.host) {
      const server = resources.find((entry) => entry.module === 'host' && entry.kind === 'server'
        && entry.host && entry.host.toLowerCase() === String(database.host).toLowerCase());
      if (server) addEdge(database.id, server.id, 'connects-to', 'inferred', `Profile host matches server ${server.name}`);
    }
  }

  // Service dependencies observed in traces.
  const serviceByName = new Map();
  for (const resource of byModuleKind.get('observability:service') || []) serviceByName.set(resource.name, resource);
  const spanById = new Map(traces.map((span) => [span.id, span]));
  const byTrace = new Map();
  for (const span of traces) {
    if (!byTrace.has(span.traceId)) byTrace.set(span.traceId, []);
    byTrace.get(span.traceId).push(span);
    if (span.parentId) spanById.set(span.id, span);
    if (!serviceByName.has(span.service)) {
      const resource = {
        id: `intelligence:service:${span.service}`,
        module: 'observability',
        kind: 'service',
        name: span.service,
        status: 'unknown',
        statusDetail: 'Seen in traces',
        href: '#/observability/applications',
        metadata: {},
      };
      addNode(resource);
      serviceByName.set(span.service, resource);
    }
  }
  for (const spans of byTrace.values()) {
    for (const span of spans) {
      if (!span.parentId) continue;
      const parent = spanById.get(span.parentId);
      if (!parent || parent.service === span.service) continue;
      const from = serviceByName.get(parent.service);
      const to = serviceByName.get(span.service);
      if (from && to) {
        addEdge(from.id, to.id, 'observed-depends-on', 'observed',
          `Trace ${span.traceId.slice(0, 12)}: ${parent.operation || parent.name} → ${span.operation || span.name}`,
          { latencyMs: Math.round(Number(span.durationMs) || 0) });
      }
    }
  }
  for (const span of traces) {
    if (!span.peerService || span.peerService === span.service) continue;
    const from = serviceByName.get(span.service);
    const to = serviceByName.get(span.peerService);
    if (from && to) {
      addEdge(from.id, to.id, 'observed-depends-on', 'observed', `Span attribute peer.service ${span.peerService}`);
    }
  }

  // Synthetic checks point at a configured host; that is an inference, not an
  // observation about network topology.
  for (const endpoint of byModuleKind.get('observability:endpoint') || []) {
    const host = String(endpoint.host || '').toLowerCase();
    if (!host) continue;
    const server = resources.find((entry) => entry.module === 'host' && entry.kind === 'server'
      && entry.host && entry.host.toLowerCase() === host);
    if (server) addEdge(endpoint.id, server.id, 'depends-on', 'inferred', `Check URL host ${endpoint.host} matches server`);
  }

  for (const edge of edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (from) from.degree += 1;
    if (to) to.degree += 1;
  }

  const nodeList = [...nodes.values()].sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));
  const byModule = {};
  const byKind = {};
  const byStatus = {};
  for (const node of nodeList) {
    byModule[node.module] = (byModule[node.module] || 0) + 1;
    byKind[node.kind] = (byKind[node.kind] || 0) + 1;
    byStatus[node.status] = (byStatus[node.status] || 0) + 1;
  }
  const observed = edges.filter((edge) => edge.confidence === 'observed').length;
  const inferred = edges.length - observed;
  const isolated = nodeList.filter((node) => node.degree === 0 && ['container', 'database', 'pod', 'service'].includes(node.kind)).length;
  const notes = [];
  if (isolated) notes.push(`${isolated} container/database/pod/service resource(s) have no discovered relationship.`);
  if (inferred) notes.push(`${inferred} relationship(s) are inferred from configuration values and are marked as such.`);
  if (dockerHost) notes.push(`Docker context: ${dockerHost}.`);

  return {
    ok: true,
    nodes: nodeList,
    edges,
    stats: {
      nodes: nodeList.length,
      edges: edges.length,
      observed,
      inferred,
      isolated,
      byModule,
      byKind,
      byStatus,
      truncated: resources.length > LIMITS.nodes,
    },
    notes,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildGraph, parseVolumeNames, EDGE_LABELS, __test: { parseVolumeNames } };
