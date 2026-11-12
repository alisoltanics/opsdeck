'use strict';

/**
 * Unified resource model.
 *
 * Every workspace already knows its own objects. This module projects them into
 * one small, comparable shape so search, the infrastructure graph, incidents
 * and automations can reason across modules without importing any UI code.
 *
 * Rules:
 *  - Read-only. Nothing here starts, stops or mutates a resource.
 *  - No secrets. Profiles expose host/port/name only; Kubernetes Secret values
 *    are never requested.
 *  - Errors are isolated per source, so a missing Docker engine or an
 *    unreachable cluster only removes that source from the result.
 */

const os = require('node:os');
const { clean, num, resourceId } = require('./util');

const CACHE_TTL = 8000;
const LIMITS = {
  containers: 600,
  images: 600,
  volumes: 600,
  networks: 300,
  compose: 200,
  pods: 800,
  workloads: 400,
  services: 400,
  ingresses: 300,
  nodes: 200,
  namespaces: 200,
  databases: 300,
  servers: 200,
  targets: 300,
  servicesApm: 200,
};

function statusOfContainer(item) {
  const text = `${item.state || ''} ${item.status || ''}`.toLowerCase();
  if (/restarting|dead/.test(text)) return { status: 'degraded', detail: item.status || 'restarting' };
  if (/unhealthy/.test(text)) return { status: 'unhealthy', detail: item.status || 'unhealthy' };
  if (/paused/.test(text)) return { status: 'degraded', detail: item.status || 'paused' };
  if (/created/.test(text)) return { status: 'unknown', detail: 'created' };
  if (/exited|stopped/.test(text)) return { status: 'stopped', detail: item.status || 'exited' };
  if (/running|up\b/.test(text)) return { status: 'healthy', detail: item.status || 'running' };
  return { status: 'unknown', detail: item.status || item.state || 'unknown' };
}

function statusOfK8s(tone) {
  if (tone === 'green' || tone === 'cyan') return 'healthy';
  if (tone === 'amber' || tone === 'orange') return 'degraded';
  if (tone === 'red') return 'unhealthy';
  return 'unknown';
}

function statusOfTone(tone) {
  if (tone === 'green' || tone === 'cyan') return 'healthy';
  if (tone === 'amber' || tone === 'orange' || tone === 'violet') return 'degraded';
  if (tone === 'red') return 'unhealthy';
  return 'unknown';
}

function publishedPorts(ports) {
  const out = [];
  for (const entry of (Array.isArray(ports) ? ports : []).slice(0, 20)) {
    const text = typeof entry === 'string' ? entry : '';
    const match = /(?:(?:[\d.]+|\[::\]|:::?):)?(\d+)->(\d+)\/(tcp|udp)/i.exec(text);
    if (match) out.push({ hostPort: Number(match[1]), containerPort: Number(match[2]), protocol: match[3].toLowerCase(), raw: clean(text, 120) });
    else out.push({ hostPort: null, containerPort: null, protocol: '', raw: clean(text, 120) });
  }
  return out;
}

function pickLabels(input, max = 14) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= max) break;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    const label = clean(key, 80);
    if (!label) continue;
    out[label] = clean(value, 160);
    count += 1;
  }
  return out;
}

function base(module, kind, key, input = {}) {
  return {
    id: resourceId(module, kind, key),
    module,
    kind,
    name: clean(input.name, 240) || clean(key, 240),
    status: input.status || 'unknown',
    statusDetail: clean(input.statusDetail, 240),
    host: clean(input.host, 240),
    namespace: clean(input.namespace, 200),
    cluster: clean(input.cluster, 160),
    environment: null,
    labels: pickLabels(input.labels),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    nativeId: clean(input.nativeId, 200),
    href: clean(input.href, 400),
    observedAt: new Date().toISOString(),
  };
}

class ResourceCollector {
  constructor({ docker, kubernetes, databases, observability, localHost }) {
    this.docker = docker;
    this.kubernetes = kubernetes;
    this.databases = databases;
    this.observability = observability;
    this.localHost = localHost || os.hostname();
    this.cache = null;
    this.cacheAt = 0;
    this.lastTopology = null;
  }

  async collect(options = {}) {
    const force = options.force === true;
    if (!force && this.cache && Date.now() - this.cacheAt < CACHE_TTL) return this.cache;
    const started = Date.now();
    const items = [];
    const sources = {};
    const collect = async (key, fn) => {
      try {
        const result = await fn();
        sources[key] = { ok: true, at: new Date().toISOString(), ...(result?.meta || {}) };
        if (Array.isArray(result?.items)) items.push(...result.items);
      } catch (error) {
        sources[key] = { ok: false, at: new Date().toISOString(), error: clean(error.message || error, 300) };
      }
    };

    await Promise.all([
      collect('host', () => this.hosts()),
      collect('docker', () => this.dockerResources()),
      collect('kubernetes', () => this.kubernetesResources()),
      collect('databases', () => this.databaseResources()),
      collect('observability', () => this.observabilityResources()),
    ]);

    const seen = new Set();
    const resources = [];
    for (const item of items) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      resources.push(item);
    }
    resources.sort((a, b) => a.module.localeCompare(b.module) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    this.cache = { items: resources, sources, collectedAt: new Date().toISOString(), durationMs: Date.now() - started };
    this.cacheAt = Date.now();
    return this.cache;
  }

  // ------------------------------------------------------------------- hosts

  async hosts() {
    const items = [];
    const cpus = os.cpus();
    items.push(base('host', 'host', 'local', {
      name: this.localHost || os.hostname() || 'local',
      status: 'healthy',
      statusDetail: `${os.type()} ${os.release()}`,
      host: this.localHost,
      href: '#/observability/infrastructure',
      metadata: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        uptimeSeconds: Math.round(os.uptime()),
        cpus: cpus.length,
        cpuModel: clean(cpus[0]?.model || '', 160),
        memoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        local: true,
      },
    }));
    const servers = this.observability && typeof this.observability.listServers === 'function'
      ? this.observability.listServers()
      : [];
    for (const server of servers.slice(0, LIMITS.servers)) {
      const status = server.status;
      const ok = status?.ok === true;
      items.push(base('host', 'server', server.id || server.name, {
        name: server.name || server.host || server.id,
        status: !status ? 'unknown' : ok ? 'healthy' : 'unhealthy',
        statusDetail: !status ? 'Not probed yet' : ok ? 'Reachable' : (status.error || 'Unreachable'),
        host: server.host,
        href: '#/observability/infrastructure',
        metadata: {
          host: server.host,
          port: server.port,
          username: server.username,
          tags: Array.isArray(server.tags) ? server.tags.slice(0, 10) : [],
          agent: server.agent?.id || null,
          lastProbe: status?.at || null,
          missing: Array.isArray(status?.missing) ? status.missing.slice(0, 10) : [],
          cpu: status?.cpu ?? null,
          memory: status?.memory ?? null,
        },
      }));
    }
    return { items };
  }

  // ------------------------------------------------------------------ docker

  async dockerResources() {
    if (!this.docker) return { items: [], meta: { available: false, reason: 'Docker service is not wired.' } };
    const status = await this.docker.status();
    const available = status?.available === true;
    if (!available) {
      return { items: [], meta: { available: false, reason: status?.reason || 'Docker is not reachable.' } };
    }
    const items = [];
    const hostName = status.context || 'docker';
    items.push(base('docker', 'engine', hostName, {
      name: hostName,
      status: 'healthy',
      statusDetail: `Docker ${status.serverVersion || ''} on ${status.os || ''}`.trim(),
      host: this.localHost,
      href: '#/overview',
      metadata: {
        context: status.context || '',
        serverVersion: status.serverVersion || '',
        apiVersion: status.apiVersion || '',
        os: status.os || '',
        arch: status.arch || '',
        cpus: status.cpus ?? null,
        memoryBytes: status.memory ?? null,
        containersRunning: status.containersRunning ?? null,
        containers: status.containers ?? null,
        images: status.images ?? null,
      },
    }));

    const [containers, images, volumes, networks, compose] = await Promise.allSettled([
      this.docker.containersList(),
      this.docker.imagesList(),
      this.docker.volumesList(),
      this.docker.networksList(),
      this.docker.composeList(),
    ]);

    for (const result of [containers, images, volumes, networks, compose]) {
      if (result.status === 'rejected') continue;
      const data = result.value;
      if (data && data.ok === false) continue;
      for (const entry of (data?.items || [])) {
        if (!entry) continue;
        if (result === containers) {
          const state = statusOfContainer(entry);
          items.push(base('docker', 'container', entry.id, {
            name: entry.name,
            status: state.status,
            statusDetail: state.detail,
            host: hostName,
            href: '#/containers',
            labels: entry.labels,
            nativeId: entry.id,
            metadata: {
              id: entry.id,
              shortId: entry.shortId,
              image: entry.image,
              state: entry.state,
              status: entry.status,
              compose: entry.compose || null,
              service: entry.service || null,
              ports: publishedPorts(entry.ports),
              networks: Array.isArray(entry.networks) ? entry.networks.slice(0, 10) : [],
              mounts: clean(entry.mounts, 600),
              startedAt: entry.runningFor || null,
            },
          }));
        } else if (result === images) {
          items.push(base('docker', 'image', entry.id, {
            name: entry.name,
            status: 'healthy',
            statusDetail: entry.dangling ? 'Dangling' : (entry.size || ''),
            host: hostName,
            href: '#/images',
            labels: {},
            nativeId: entry.id,
            metadata: {
              id: entry.id,
              repository: entry.repository,
              tag: entry.tag,
              digest: entry.digest,
              size: entry.size,
              uniqueSize: entry.uniqueSize,
              createdAt: entry.createdAt,
              containers: num(entry.containers, null),
              registry: entry.registry,
              dangling: entry.dangling === true,
              protected: entry.protected === true,
            },
          }));
        } else if (result === volumes) {
          items.push(base('docker', 'volume', entry.name, {
            name: entry.name,
            status: 'healthy',
            statusDetail: entry.driver || 'volume',
            host: hostName,
            href: '#/volumes',
            labels: entry.labels,
            metadata: {
              driver: entry.driver,
              scope: entry.scope,
              mountpoint: entry.mountpoint,
              createdAt: entry.createdAt,
              inUse: entry.inUse,
            },
          }));
        } else if (result === networks) {
          items.push(base('docker', 'network', entry.name, {
            name: entry.name,
            status: 'healthy',
            statusDetail: `${entry.driver || 'bridge'}${entry.internal ? ' · internal' : ''}`,
            host: hostName,
            href: '#/networks',
            labels: entry.labels,
            metadata: {
              id: entry.id,
              driver: entry.driver,
              scope: entry.scope,
              ipv6: entry.ipv6 === true,
              internal: entry.internal === true,
              createdAt: entry.createdAt,
            },
          }));
        } else if (result === compose) {
          items.push(base('docker', 'compose-project', entry.name, {
            name: entry.name,
            status: /running/i.test(entry.status || '') ? 'healthy' : /exited|stopped/i.test(entry.status || '') ? 'stopped' : 'unknown',
            statusDetail: entry.status,
            host: hostName,
            href: '#/compose',
            metadata: {
              running: entry.running,
              status: entry.status,
              files: Array.isArray(entry.files) ? entry.files.slice(0, 10) : [],
              directory: entry.directory || '',
            },
          }));
        }
      }
    }

    const trim = (kind, max) => {
      const list = items.filter((entry) => entry.kind === kind);
      if (list.length <= max) return;
      const drop = new Set(list.slice(max).map((entry) => entry.id));
      for (let i = items.length - 1; i >= 0; i -= 1) if (drop.has(items[i].id)) items.splice(i, 1);
    };
    trim('container', LIMITS.containers);
    trim('image', LIMITS.images);
    trim('volume', LIMITS.volumes);
    trim('network', LIMITS.networks);
    trim('compose-project', LIMITS.compose);
    return { items, meta: { available: true, host: hostName } };
  }

  // -------------------------------------------------------------- kubernetes

  async kubernetesResources() {
    if (!this.kubernetes || typeof this.kubernetes.topology !== 'function') {
      return { items: [], meta: { available: false, reason: 'Kubernetes service is not wired.' } };
    }
    const topology = await this.kubernetes.topology();
    if (topology && topology.ok !== false) this.lastTopology = topology;
    if (!topology || topology.ok === false) {
      return { items: [], meta: { available: false, reason: clean(topology?.error || 'No cluster is reachable.', 300) } };
    }
    const cluster = topology.context || 'kubernetes';
    const items = [];
    const push = (kind, key, input) => {
      items.push(base('kubernetes', kind, `${cluster}/${key}`, {
        ...input,
        cluster,
        nativeId: input.nativeId || key,
        href: input.href || '#/kubernetes/overview',
      }));
    };

    push('cluster', cluster, {
      name: cluster,
      status: topology.connection?.ok === false ? 'unhealthy' : 'healthy',
      statusDetail: topology.connection?.ok === false ? (topology.connection.error || 'API unavailable') : 'API reachable',
      metadata: {
        context: cluster,
        namespace: topology.namespace || '',
        stats: topology.stats || {},
        collectedAt: topology.collectedAt,
        connection: topology.connection || null,
      },
      href: '#/kubernetes/overview',
    });

    for (const node of (topology.nodes || []).slice(0, LIMITS.nodes)) {
      push('node', node.name, {
        nativeId: node.id || node.name,
        name: node.name,
        status: statusOfK8s(node.tone),
        statusDetail: node.status || (node.ready ? 'Ready' : 'Not ready'),
        labels: node.labels,
        metadata: {
          ready: node.ready === true,
          roles: Array.isArray(node.roles) ? node.roles.slice(0, 8) : [],
          version: node.version || '',
          cpu: node.cpu ?? null,
          memory: node.memory ?? null,
          created: node.created || null,
        },
        href: '#/kubernetes/nodes',
      });
    }

    for (const band of (topology.namespaces || []).slice(0, LIMITS.namespaces)) {
      push('namespace', band.name, {
        name: band.name,
        namespace: band.name,
        status: band.status === 'Active' ? 'healthy' : 'unknown',
        statusDetail: `${band.running} healthy pod(s)`,
        metadata: { totals: band.totals || {}, created: band.created || null },
        href: '#/kubernetes/namespaces',
      });

      for (const item of band.ingresses || []) {
        push('ingress', item.id || item.name, {
          name: item.name,
          namespace: item.namespace || band.name,
          status: statusOfK8s(item.tone),
          statusDetail: item.status || 'Ingress',
          labels: item.labels,
          metadata: {
            hosts: item.hostText || '',
            tls: item.tls === true,
            paths: Array.isArray(item.paths) ? item.paths.slice(0, 10) : [],
          },
          href: '#/kubernetes/ingresses',
        });
      }
      for (const item of band.services || []) {
        push('service', item.id || item.name, {
          name: item.name,
          namespace: item.namespace || band.name,
          status: statusOfK8s(item.tone),
          statusDetail: item.portText || 'Service',
          labels: item.labels,
          metadata: {
            type: item.type || '',
            clusterIP: item.clusterIP || '',
            ports: Array.isArray(item.ports) ? item.ports.slice(0, 8) : [],
            selector: item.selector || '',
          },
          href: '#/kubernetes/services',
        });
      }
      for (const item of band.workloads || []) {
        const kind = String(item.kind || 'Workload').toLowerCase();
        push(kind, item.id || `${band.name}/${item.name}`, {
          name: item.name,
          namespace: item.namespace || band.name,
          status: statusOfK8s(item.tone),
          statusDetail: item.status || `${item.ready}/${item.desired} ready`,
          labels: item.labels,
          metadata: {
            kind: item.kind,
            ready: item.ready,
            desired: item.desired,
            available: item.available,
            updated: item.updated,
            images: Array.isArray(item.images) ? item.images.slice(0, 8) : [],
            selector: item.selector || '',
            created: item.created || null,
          },
          href: `#/kubernetes/${kind === 'daemonset' ? 'daemonsets' : kind === 'statefulset' ? 'statefulsets' : 'deployments'}`,
        });
      }
      for (const item of band.pods || []) {
        push('pod', item.id || `${band.name}/${item.name}`, {
          name: item.name,
          namespace: item.namespace || band.name,
          status: item.healthy ? 'healthy' : item.tone === 'red' ? 'unhealthy' : 'degraded',
          statusDetail: item.status || item.phase || 'Pod',
          labels: item.labels,
          metadata: {
            phase: item.phase,
            node: item.node || '',
            ready: item.ready,
            total: item.total,
            restarts: item.restarts,
            ownerKind: item.ownerKind || '',
            ownerName: item.ownerName || '',
            images: Array.isArray(item.images) ? item.images.slice(0, 6) : [],
          },
          href: '#/kubernetes/pods',
        });
      }
    }

    return { items, meta: { available: true, context: cluster, truncated: topology.truncation || null } };
  }

  // --------------------------------------------------------------- databases

  async databaseResources() {
    if (!this.databases || typeof this.databases.listConnections !== 'function') {
      return { items: [], meta: { available: false, reason: 'Database service is not wired.' } };
    }
    const connections = this.databases.listConnections() || [];
    const items = [];
    for (const connection of connections.slice(0, LIMITS.databases)) {
      const state = connection.status?.state || 'idle';
      const connected = state === 'connected';
      items.push(base('databases', 'database', connection.id, {
        name: connection.name,
        status: connected ? 'healthy' : 'unknown',
        statusDetail: connected ? 'Connected' : 'Not connected',
        host: connection.host,
        href: '#/databases/connections',
        nativeId: connection.id,
        metadata: {
          engine: connection.engine,
          engineLabel: connection.engineMeta?.label || connection.engine,
          host: connection.host,
          port: connection.port,
          database: connection.database,
          group: connection.group || '',
          readOnly: connection.readOnly === true,
          source: connection.source || null,
          state,
          updatedAt: connection.updatedAt || null,
          connectedAt: connection.status?.connectedAt || null,
          tunnel: connection.status?.tunnel || null,
          favorite: connection.favorite === true,
        },
      }));
    }
    return { items, meta: { available: true, connections: connections.length } };
  }

  // ------------------------------------------------------------ observability

  async observabilityResources() {
    if (!this.observability) return { items: [], meta: { available: false, reason: 'Observability service is not wired.' } };
    const items = [];
    for (const target of (this.observability.listTargets?.() || []).slice(0, LIMITS.targets)) {
      const last = target.last || null;
      items.push(base('observability', 'endpoint', target.id, {
        name: target.name || target.url || target.id,
        status: !last ? 'unknown' : last.ok ? 'healthy' : 'unhealthy',
        statusDetail: !last ? 'Not checked yet' : last.ok ? `${Math.round(last.latencyMs ?? 0)} ms` : (last.error || 'Check failed'),
        host: clean(String(target.url || '').replace(/^https?:\/\//, '').split('/')[0], 240),
        href: '#/observability/synthetic',
        metadata: {
          type: target.type,
          url: target.url,
          intervalSec: target.intervalSec,
          lastOk: last?.ok ?? null,
          latencyMs: last?.latencyMs ?? null,
          statusCode: last?.statusCode ?? null,
          expiresAt: last?.tls?.expiresAt || null,
          checkedAt: last?.at || null,
        },
      }));
    }
    const services = this.observability.traceManager && typeof this.observability.traceManager.services === 'function'
      ? this.observability.traceManager.services()
      : [];
    for (const service of services.slice(0, LIMITS.servicesApm)) {
      const errorRate = num(service.errorRate, 0);
      items.push(base('observability', 'service', service.name, {
        name: service.name,
        status: errorRate >= 5 ? 'degraded' : errorRate > 0 ? 'degraded' : 'healthy',
        statusDetail: `${service.spans} span(s) · ${errorRate.toFixed(1)}% errors`,
        href: '#/observability/applications',
        metadata: {
          spans: service.spans,
          errors: service.errors,
          errorRate,
          lastSeen: service.lastSeen,
        },
      }));
    }
    return { items, meta: { available: true } };
  }
}

module.exports = { ResourceCollector, LIMITS, __test: { statusOfContainer, statusOfK8s, pickLabels, publishedPorts } };
