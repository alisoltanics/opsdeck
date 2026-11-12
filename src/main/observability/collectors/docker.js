'use strict';

/**
 * Docker collector built on the existing Docker service.
 *
 * OpsDeck already owns Docker lifecycle and the command runner; this collector
 * only reads `docker stats`, container metadata, disk usage, networks, volumes
 * and Compose projects. Nothing here starts, stops or mutates a container.
 */

const { metric, percent } = require('../metrics');
const { sanitizeText } = require('../util');

const MAX_INSPECT = 120;
const INSPECT_TTL = 60e3;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function healthOf(inspect) {
  const health = inspect?.health;
  if (!health) return 'none';
  return String(health.Status || 'unknown').toLowerCase();
}

function restartCount(inspect) {
  return num(inspect?.state?.RestartCount, 0);
}

function startedAt(inspect) {
  const value = inspect?.state?.StartedAt;
  if (!value || String(value).startsWith('0001-')) return null;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : null;
}

class DockerCollector {
  constructor({ docker }) {
    this.name = 'docker';
    this.label = 'Docker';
    this.source = 'docker';
    this.docker = docker;
    this.inspectCache = new Map();
    this.lastDetails = null;
    this.lastAt = 0;
    this.lastError = '';
    this.available = null;
  }

  async inspect(id) {
    const key = String(id || '');
    const cached = this.inspectCache.get(key);
    if (cached && Date.now() - cached.at < INSPECT_TTL) return cached.item;
    try {
      const result = await this.docker.inspectContainer(key);
      if (!result.ok) return null;
      const item = result.item;
      this.inspectCache.set(key, { at: Date.now(), item });
      return item;
    } catch {
      return null;
    }
  }

  async collect() {
    const started = Date.now();
    const timestamp = started;
    const metrics = [];
    const errors = [];

    const status = await this.docker.status().catch((error) => ({ available: false, reason: error.message }));
    this.available = status.available === true;
    if (!this.available) {
      this.lastAt = timestamp;
      this.lastError = status.reason || 'Docker is not available.';
      this.lastDetails = {
        at: new Date(timestamp).toISOString(),
        available: false,
        reason: this.lastError,
        containers: [], projects: [], networks: [], volumes: [], disk: [],
        errors: [this.lastError],
      };
      return {
        ok: false,
        available: false,
        reason: this.lastError,
        metrics: [],
        details: this.lastDetails,
        errors: [this.lastError],
        durationMs: Date.now() - started,
        at: new Date(timestamp).toISOString(),
      };
    }

    const [containersRes, statsRes, dfRes, networksRes, volumesRes, composeRes] = await Promise.allSettled([
      this.docker.containersList(),
      this.docker.stats(),
      this.docker.systemDf(),
      this.docker.networksList(),
      this.docker.volumesList(),
      this.docker.composeList(),
    ]);

    const settle = (result, label) => {
      if (result.status === 'rejected') {
        errors.push(`${label}: ${result.reason?.message || result.reason}`);
        return null;
      }
      if (!result.value?.ok) {
        if (result.value?.error) errors.push(`${label}: ${sanitizeText(result.value.error, 300)}`);
        return null;
      }
      return result.value;
    };

    const containers = settle(containersRes, 'Containers');
    const stats = settle(statsRes, 'Container stats');
    const df = settle(dfRes, 'Docker disk usage');
    const networks = settle(networksRes, 'Docker networks');
    const volumes = settle(volumesRes, 'Docker volumes');
    const compose = settle(composeRes, 'Docker Compose');

    const statsById = new Map();
    const statsByName = new Map();
    for (const entry of stats?.items || []) {
      statsById.set(String(entry.id || ''), entry);
      statsById.set(String(entry.id || '').slice(0, 12), entry);
      statsByName.set(entry.name || '', entry);
    }

    const inspectTargets = (containers?.items || [])
      .filter((container) => String(container.state).toLowerCase() === 'running')
      .slice(0, MAX_INSPECT);
    const inspections = new Map();
    await Promise.all(inspectTargets.map(async (container) => {
      const item = await this.inspect(container.id);
      if (item) inspections.set(container.id, item);
    }));

    let running = 0;
    let unhealthy = 0;
    let restarting = 0;
    let stopped = 0;
    let totalRestarts = 0;
    let cpuTotal = 0;
    let memoryTotal = 0;

    const rows = [];
    for (const container of containers?.items || []) {
      const state = String(container.state || 'unknown').toLowerCase();
      const inspect = inspections.get(container.id) || null;
      const live = statsById.get(container.id) || statsById.get(String(container.id).slice(0, 12)) || statsByName.get(container.name) || null;
      const health = healthOf(inspect);
      const restarts = restartCount(inspect);
      const started = startedAt(inspect);
      const cpu = live ? num(live.cpuPercent, 0) : null;
      const memory = live ? num(live.memoryUsed, 0) : null;
      const memoryLimit = live ? num(live.memoryLimit, 0) : null;
      const memoryPercent = memoryLimit > 0 && memory != null ? percent(memory, memoryLimit) : (live ? num(live.memoryPercent, 0) : null);

      if (state === 'running') running += 1;
      if (state === 'restarting') restarting += 1;
      if (state !== 'running') stopped += 1;
      if (health === 'unhealthy') unhealthy += 1;
      totalRestarts += restarts;
      if (cpu != null) cpuTotal += cpu;
      if (memory != null) memoryTotal += memory;

      const labels = {
        host: 'local',
        container: container.name,
        id: String(container.id || '').slice(0, 12),
        image: container.image || '',
        compose_project: container.compose || '',
        compose_service: container.service || '',
        state,
        health,
      };
      if (cpu != null) {
        metrics.push(metric('docker.container.cpu.usage', cpu, { unit: 'percent', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
      }
      if (memory != null) {
        metrics.push(metric('docker.container.memory.bytes', memory, { unit: 'bytes', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
      }
      if (memoryLimit) {
        metrics.push(metric('docker.container.memory.limit.bytes', memoryLimit, { unit: 'bytes', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
      }
      if (memoryPercent != null) {
        metrics.push(metric('docker.container.memory.usage', memoryPercent, { unit: 'percent', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
      }
      if (live) {
        metrics.push(metric('docker.container.network.rx.bytes_total', num(live.netIn, 0), { unit: 'bytes', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
        metrics.push(metric('docker.container.network.tx.bytes_total', num(live.netOut, 0), { unit: 'bytes', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
        metrics.push(metric('docker.container.block.read.bytes_total', num(live.blockRead, 0), { unit: 'bytes', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
        metrics.push(metric('docker.container.block.write.bytes_total', num(live.blockWrite, 0), { unit: 'bytes', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
        metrics.push(metric('docker.container.pids', num(live.pids, 0), { unit: 'count', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
      }
      metrics.push(metric('docker.container.restarts', restarts, { unit: 'count', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));
      metrics.push(metric('docker.container.running', state === 'running' ? 1 : 0, { unit: 'count', source: this.source, resource: `docker:${container.name}`, labels, timestamp }));

      rows.push({
        id: container.id,
        shortId: container.shortId || String(container.id || '').slice(0, 12),
        name: container.name,
        image: container.image,
        state,
        status: container.status,
        health,
        compose: container.compose || null,
        service: container.service || null,
        cpuPercent: cpu,
        memoryBytes: memory,
        memoryLimit,
        memoryPercent,
        netIn: live ? num(live.netIn, 0) : null,
        netOut: live ? num(live.netOut, 0) : null,
        blockRead: live ? num(live.blockRead, 0) : null,
        blockWrite: live ? num(live.blockWrite, 0) : null,
        pids: live ? num(live.pids, 0) : null,
        restarts,
        startedAt: started ? new Date(started).toISOString() : null,
        createdAt: container.createdAt || inspect?.createdAt || null,
        ports: container.ports || [],
        networks: container.networks || [],
        labels: container.labels || {},
      });
    }

    for (const container of rows) {
      if (container.compose) {
        const labels = {
          host: 'local', project: container.compose, service: container.service || '',
          container: container.name,
        };
        if (container.cpuPercent != null) {
          metrics.push(metric('docker.compose.cpu.usage', container.cpuPercent, { unit: 'percent', source: this.source, resource: `compose:${container.compose}`, labels, timestamp }));
        }
        if (container.memoryBytes != null) {
          metrics.push(metric('docker.compose.memory.bytes', container.memoryBytes, { unit: 'bytes', source: this.source, resource: `compose:${container.compose}`, labels, timestamp }));
        }
      }
    }

    metrics.push(metric('docker.containers.total', rows.length, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.running', running, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.stopped', stopped, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.unhealthy', unhealthy, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.restarting', restarting, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.restarts', totalRestarts, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.cpu.usage', cpuTotal, { unit: 'percent', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.containers.memory.bytes', memoryTotal, { unit: 'bytes', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));

    const disk = [];
    for (const entry of df?.items || []) {
      const labels = { host: 'local', type: String(entry.type || '') };
      metrics.push(metric('docker.storage.bytes', num(entry.size, 0), { unit: 'bytes', source: this.source, resource: 'docker', labels, timestamp }));
      metrics.push(metric('docker.storage.reclaimable.bytes', num(entry.reclaimable, 0), { unit: 'bytes', source: this.source, resource: 'docker', labels, timestamp }));
      metrics.push(metric('docker.storage.items', num(entry.count, 0), { unit: 'count', source: this.source, resource: 'docker', labels, timestamp }));
      disk.push({ type: entry.type, count: entry.count, active: entry.active, size: entry.size, sizeLabel: entry.sizeLabel, reclaimable: entry.reclaimable, reclaimableLabel: entry.reclaimableLabel });
    }

    metrics.push(metric('docker.networks.total', (networks?.items || []).length, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.volumes.total', (volumes?.items || []).length, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('docker.compose.projects', (compose?.items || []).length, { unit: 'count', source: this.source, resource: 'docker', labels: { host: 'local' }, timestamp }));

    const projectRows = [];
    for (const project of compose?.items || []) {
      const members = rows.filter((row) => row.compose === project.name);
      let cpu = 0;
      let memory = 0;
      let projectRunning = 0;
      let projectUnhealthy = 0;
      for (const member of members) {
        if (member.state === 'running') projectRunning += 1;
        if (member.health === 'unhealthy') projectUnhealthy += 1;
        if (member.cpuPercent != null) cpu += member.cpuPercent;
        if (member.memoryBytes != null) memory += member.memoryBytes;
      }
      const labels = { host: 'local', project: project.name };
      metrics.push(metric('docker.compose.running', projectRunning, { unit: 'count', source: this.source, resource: `compose:${project.name}`, labels, timestamp }));
      metrics.push(metric('docker.compose.containers', members.length, { unit: 'count', source: this.source, resource: `compose:${project.name}`, labels, timestamp }));
      metrics.push(metric('docker.compose.unhealthy', projectUnhealthy, { unit: 'count', source: this.source, resource: `compose:${project.name}`, labels, timestamp }));
      projectRows.push({
        name: project.name, status: project.status, running: projectRunning,
        total: members.length, unhealthy: projectUnhealthy, cpu, memory,
        directory: project.directory, files: project.files,
        services: members.map((member) => ({ name: member.name, service: member.service, state: member.state, health: member.health, restarts: member.restarts, cpuPercent: member.cpuPercent, memoryBytes: member.memoryBytes })),
      });
    }

    const networkRows = [];
    for (const network of networks?.items || []) {
      const attached = rows.filter((row) => (row.networks || []).includes(network.name)).length;
      metrics.push(metric('docker.networks.containers', attached, { unit: 'count', source: this.source, resource: `network:${network.name}`, labels: { host: 'local', network: network.name, driver: network.driver || '' }, timestamp }));
      networkRows.push({ ...network, containers: attached });
    }

    const volumeRows = [];
    for (const volume of volumes?.items || []) {
      volumeRows.push({
        ...volume,
        // Docker reports volume metadata, not a measured byte usage. Keep the
        // storage value explicitly absent rather than inventing a size.
        sizeBytes: null,
        usage: 'unavailable',
      });
    }

    const details = {
      at: new Date(timestamp).toISOString(),
      available: true,
      version: status.serverVersion || null,
      os: status.os || null,
      arch: status.arch || null,
      containers: rows,
      projects: projectRows,
      networks: networkRows,
      volumes: volumeRows,
      disk,
      summary: { total: rows.length, running, stopped, unhealthy, restarting, restarts: totalRestarts, cpu: cpuTotal, memory: memoryTotal },
      errors,
    };

    this.lastAt = timestamp;
    this.lastError = errors.join('; ');
    this.lastDetails = details;

    return {
      ok: true,
      available: true,
      metrics,
      details,
      errors,
      durationMs: Date.now() - started,
      at: new Date(timestamp).toISOString(),
    };
  }
}

module.exports = { DockerCollector };
