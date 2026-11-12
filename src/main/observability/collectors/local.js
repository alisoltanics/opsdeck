'use strict';

/**
 * Local system collector.
 *
 * Cross-platform where Node exposes the data, with native read-only probes for
 * the richer Linux metrics (per-core CPU, PSI pressure, disk IO, per-process
 * users and start times). No metric is fabricated: unsupported values are
 * returned as null with a reason so the UI can say why.
 */

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { metric, percent } = require('../metrics');
const {
  run, which, readFileSafe, readDirSafe, powershell, parseJsonLines, parseJson,
  safeNumber, userMap, hostname,
} = require('../util');

const MAX_PROCESSES = 800;
const TOP_PROCESS_SERIES = 12;
const CPU_TICKS_PER_SECOND = 100;

function diff(current, previous) {
  if (previous == null) return 0;
  return Math.max(0, current - previous);
}

function parseMeminfo(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const match = /^([^:]+):\s+(\d+)(?:\s+(\w+))?/.exec(line);
    if (match) out[match[1]] = Number(match[2]) * (match[3] === 'kB' ? 1024 : 1);
  }
  return out;
}

function parsePressure(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const match = /^(some|full)\s+avg10=([\d.]+)\s+avg60=([\d.]+)\s+avg300=([\d.]+)/.exec(line);
    if (match) out[match[1]] = { avg10: Number(match[2]), avg60: Number(match[3]), avg300: Number(match[4]) };
  }
  return out;
}

function parseOsRelease(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

class LocalCollector {
  constructor() {
    this.name = 'local';
    this.label = 'Local system';
    this.source = 'local';
    this.previousCpu = null;
    this.previousNet = new Map();
    this.previousDisk = new Map();
    this.previousProcessCpu = new Map();
    this.previousWinProcessCpu = new Map();
    this.previousWinProcessAt = 0;
    this.processConnections = new Map();
    this.connectionTick = 0;
    this.lastDetails = null;
    this.lastAt = 0;
    this.lastError = '';
  }

  async collect() {
    const started = Date.now();
    const timestamp = started;
    const metrics = [];
    const errors = [];
    const platform = process.platform;
    const [procCount, connections] = [0, null];
    void procCount; void connections;

    let processes = [];
    try {
      processes = await this.collectProcesses(timestamp);
    } catch (error) {
      errors.push(`Processes: ${error.message}`);
    }

    // A probe that fails on one platform must never take the whole collector
    // down: each section degrades to an empty result plus an explicit error.
    const section = async (label, probe, fallback) => {
      try {
        return await probe();
      } catch (error) {
        errors.push(`${label}: ${error.message || error}`);
        return typeof fallback === 'function' ? fallback() : fallback;
      }
    };

    const cpu = await section('CPU', () => this.collectCpu(metrics, timestamp, platform, errors), {});
    const memory = await section('Memory', () => this.collectMemory(metrics, timestamp, platform, errors), {});
    const disks = await section('Disks', () => this.collectDisks(metrics, timestamp, platform, errors), []);
    const network = await section('Network', () => this.collectNetwork(metrics, timestamp, platform, errors), { interfaces: [] });
    const info = await section('Host information', () => this.collectInfo(platform, cpu, memory, disks), {
      hostname: hostname(), platform, os: os.type(), uptimeSeconds: os.uptime(), logicalProcessors: os.cpus().length, memory: { total: os.totalmem() },
    });

    metrics.push(metric('system.process.count', processes.length, {
      unit: 'count', source: this.source, resource: 'local', labels: { host: info.hostname }, timestamp,
    }));
    metrics.push(metric('system.uptime.seconds', Math.round(os.uptime()), {
      unit: 'seconds', source: this.source, resource: 'local', labels: { host: info.hostname }, timestamp,
    }));

    for (const entry of processes.slice(0, TOP_PROCESS_SERIES)) {
      metrics.push(metric('system.process.cpu.usage', entry.cpuPercent, {
        unit: 'percent', source: this.source, resource: 'local', timestamp,
        labels: { host: info.hostname, process: entry.name, pid: entry.pid },
      }));
      metrics.push(metric('system.process.memory.bytes', entry.memoryBytes, {
        unit: 'bytes', source: this.source, resource: 'local', timestamp,
        labels: { host: info.hostname, process: entry.name, pid: entry.pid },
      }));
    }

    this.lastAt = timestamp;
    this.lastError = errors.join('; ');
    const details = {
      at: new Date(timestamp).toISOString(),
      info,
      cpu,
      memory,
      disks,
      network,
      processes: processes.slice(0, MAX_PROCESSES),
      errors,
      availability: {
        temperature: cpu.temperatureCelsius != null ? 'measured' : 'unavailable',
        loadAverage: cpu.load?.one != null ? 'measured' : 'unavailable',
        diskIo: disks.some((disk) => disk.readBytesPerSecond != null) ? 'measured' : 'unavailable',
        processConnections: processes.some((p) => p.connections != null) ? 'measured' : 'unavailable',
      },
    };
    this.lastDetails = details;
    return {
      ok: true,
      metrics,
      details,
      errors,
      durationMs: Date.now() - started,
      at: new Date(timestamp).toISOString(),
    };
  }

  collectCpu(metrics, timestamp, platform, errors) {
    const cpus = os.cpus();
    const current = cpus.map((cpu) => {
      const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
      return { total, idle: cpu.times.idle, speed: cpu.speed || 0, model: cpu.model };
    });
    const totalCurrent = current.reduce((sum, core) => sum + core.total, 0);
    const idleCurrent = current.reduce((sum, core) => sum + core.idle, 0);
    const overall = this.previousCpu
      ? percent(diff(totalCurrent, this.previousCpu.total) - diff(idleCurrent, this.previousCpu.idle), diff(totalCurrent, this.previousCpu.total))
      : percent(totalCurrent - idleCurrent, totalCurrent);
    const perCore = current.map((core, index) => {
      const previous = this.previousCpu?.cores?.[index];
      const usage = previous
        ? percent(diff(core.total, previous.total) - diff(core.idle, previous.idle), diff(core.total, previous.total))
        : percent(core.total - core.idle, core.total);
      return usage == null ? 0 : usage;
    });
    this.previousCpu = { total: totalCurrent, idle: idleCurrent, cores: current };

    const host = hostname();
    metrics.push(metric('system.cpu.usage', overall ?? 0, {
      unit: 'percent', source: this.source, resource: 'local', labels: { host, core: 'all' }, timestamp,
    }));
    perCore.forEach((usage, index) => {
      metrics.push(metric('system.cpu.usage', usage, {
        unit: 'percent', source: this.source, resource: 'local', labels: { host, core: String(index) }, timestamp,
      }));
    });

    const frequency = current.length ? current.reduce((sum, core) => sum + core.speed, 0) / current.length : null;
    if (frequency) {
      metrics.push(metric('system.cpu.frequency.mhz', frequency, {
        unit: 'mhz', source: this.source, resource: 'local', labels: { host }, timestamp,
      }));
    }

    const load = process.platform === 'win32' ? null : os.loadavg();
    if (load && load.some((value) => value > 0)) {
      metrics.push(metric('system.load.1', load[0] || 0, { unit: 'count', source: this.source, resource: 'local', labels: { host }, timestamp }));
      metrics.push(metric('system.load.5', load[1] || 0, { unit: 'count', source: this.source, resource: 'local', labels: { host }, timestamp }));
      metrics.push(metric('system.load.15', load[2] || 0, { unit: 'count', source: this.source, resource: 'local', labels: { host }, timestamp }));
    }

    const thermal = this.cpuTemperature(platform);
    if (thermal != null) {
      metrics.push(metric('system.cpu.temperature.celsius', thermal, {
        unit: 'celsius', source: this.source, resource: 'local', labels: { host }, timestamp,
      }));
    }

    return {
      usage: overall ?? 0,
      perCore,
      frequencyMhz: frequency,
      load: load && load.some((value) => value > 0) ? { one: load[0], five: load[1], fifteen: load[2] } : null,
      temperatureCelsius: thermal,
      model: current[0]?.model || 'Unknown',
      architecture: os.arch(),
      logicalProcessors: current.length,
      physicalCores: this.physicalCores(platform),
      speedMhz: current[0]?.speed || null,
    };
  }

  cpuTemperature(platform) {
    if (platform === 'linux') {
      let best = null;
      for (const zone of readDirSafe('/sys/class/thermal').filter((name) => name.startsWith('thermal_zone'))) {
        const base = path.join('/sys/class/thermal', zone);
        const type = readFileSafe(path.join(base, 'type'), 200).trim();
        const raw = safeNumber(readFileSafe(path.join(base, 'temp'), 100).trim(), null);
        if (raw == null) continue;
        const value = raw > 1000 ? raw / 1000 : raw;
        if (!Number.isFinite(value) || value <= 0 || value > 150) continue;
        if (!best || /x86_pkg_temp|coretemp|k10temp|cpu/i.test(type)) best = value;
      }
      return best;
    }
    if (platform === 'darwin') {
      // `powermetrics` needs root; do not silently pretend a value exists.
      return null;
    }
    return null;
  }

  physicalCores(platform) {
    if (platform === 'linux') {
      const text = readFileSafe('/proc/cpuinfo', 1024 * 1024);
      const pairs = new Set();
      let physical = null;
      let core = null;
      for (const line of text.split('\n')) {
        const [key, value] = line.split(':').map((part) => part?.trim());
        if (key === 'physical id') physical = value;
        if (key === 'core id') core = value;
        if (key === '' && physical != null && core != null) {
          pairs.add(`${physical}:${core}`);
          physical = null;
          core = null;
        }
      }
      return pairs.size || null;
    }
    if (platform === 'darwin') {
      try {
        const result = require('node:child_process').execFileSync('sysctl', ['-n', 'hw.physicalcpu'], { timeout: 2000, encoding: 'utf8' });
        return safeNumber(result.trim(), null);
      } catch { return null; }
    }
    return null;
  }

  collectMemory(metrics, timestamp, platform, errors) {
    const host = hostname();
    const total = os.totalmem();
    let free = os.freemem();
    let available = free;
    let used = total - free;
    let swapTotal = 0;
    let swapFree = 0;
    let pressure = null;
    let cached = null;
    let buffers = null;

    if (platform === 'linux') {
      const mem = parseMeminfo(readFileSafe('/proc/meminfo', 512 * 1024));
      if (mem.MemTotal) {
        available = mem.MemAvailable ?? mem.MemFree ?? available;
        free = mem.MemFree ?? free;
        used = Math.max(0, mem.MemTotal - available);
        swapTotal = mem.SwapTotal || 0;
        swapFree = mem.SwapFree || 0;
        cached = mem.Cached ?? null;
        buffers = mem.Buffers ?? null;
      }
      pressure = parsePressure(readFileSafe('/proc/pressure/memory', 64 * 1024)) || null;
    } else if (platform === 'darwin') {
      // os.freemem() on macOS only counts completely free pages, which reports
      // far more usage than the OS itself. vm_stat exposes the page breakdown,
      // so "used" is computed the same way Activity Monitor does.
      const vm = vmStat();
      if (vm) {
        const mac = macMemoryUsage(vm, total);
        used = mac.used; free = mac.free; available = mac.available; cached = mac.cached;
      }
      const swap = macSwapUsage();
      if (swap) { swapTotal = swap.total; swapFree = swap.free; }
    } else if (platform === 'win32') {
      // os.freemem on Windows already reflects available physical memory.
      available = free;
      used = total - free;
    }

    const usage = percent(used, total) ?? 0;
    const swapUsed = Math.max(0, swapTotal - swapFree);
    const labels = { host };
    metrics.push(metric('system.memory.total.bytes', total, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
    metrics.push(metric('system.memory.used.bytes', used, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
    metrics.push(metric('system.memory.available.bytes', available, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
    metrics.push(metric('system.memory.free.bytes', free, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
    metrics.push(metric('system.memory.usage', usage, { unit: 'percent', source: this.source, resource: 'local', labels, timestamp }));
    if (swapTotal) {
      metrics.push(metric('system.swap.total.bytes', swapTotal, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
      metrics.push(metric('system.swap.used.bytes', swapUsed, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
      metrics.push(metric('system.swap.usage', percent(swapUsed, swapTotal) ?? 0, { unit: 'percent', source: this.source, resource: 'local', labels, timestamp }));
    }
    if (pressure?.some) {
      metrics.push(metric('system.memory.pressure.avg10', pressure.some.avg10, { unit: 'percent', source: this.source, resource: 'local', labels, timestamp }));
    }
    void errors;
    return {
      total, used, available, free, usage,
      swapTotal, swapUsed, swapFree,
      cached, buffers,
      pressure,
      percent: usage,
    };
  }

  async collectDisks(metrics, timestamp, platform, errors) {
    let disks = [];
    if (platform === 'win32') {
      const result = await powershell('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace | ConvertTo-Json -Compress', 12000);
      const parsed = parseJson(result.stdout, []);
      const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      disks = list.map((disk) => {
        const total = safeNumber(disk.Size, 0) || 0;
        const free = safeNumber(disk.FreeSpace, 0) || 0;
        return {
          device: String(disk.DeviceID || ''), mount: `${disk.DeviceID || ''}\\`,
          filesystem: String(disk.FileSystem || ''), type: 'fixed', total, used: Math.max(0, total - free), free,
          percent: percent(total - free, total) ?? 0, label: String(disk.VolumeName || ''),
        };
      });
    } else {
      const args = platform === 'darwin' ? ['-kP'] : ['-PT', '-k'];
      const result = await run('df', args, { timeout: 8000 });
      if (!result.ok) errors.push(`Disk capacity: ${result.stderr || result.error}`);
      const lines = result.stdout.split(/\r?\n/).slice(1);
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        let filesystem; let type; let blocks; let used; let free; let capacity; let mount;
        if (platform === 'darwin') {
          [filesystem, blocks, used, free, capacity] = parts;
          mount = parts.slice(5).join(' ') || '';
          type = 'unknown';
        } else {
          [filesystem, type, blocks, used, free, capacity] = parts;
          mount = parts.slice(6).join(' ') || '';
        }
        if (!mount || !blocks) continue;
        if (/^(proc|sysfs|devtmpfs|devpts|tmpfs|securityfs|cgroup|cgroup2|pstore|bpf|tracefs|debugfs|configfs|fusectl|mqueue|hugetlbfs|ramfs|autofs|nsfs|binfmt_misc|efivarfs)$/i.test(type)) continue;
        const total = Number(blocks) * 1024;
        const usedBytes = Number(used) * 1024;
        const freeBytes = Number(free) * 1024;
        if (!Number.isFinite(total) || total <= 0) continue;
        disks.push({
          device: filesystem, mount, filesystem: type || 'unknown', type,
          total, used: usedBytes, free: freeBytes, percent: percent(usedBytes, total) ?? 0,
        });
      }
    }

    const io = platform === 'linux' ? this.diskIo(timestamp) : new Map();
    const byDevice = new Map();
    for (const disk of disks) {
      const base = disk.device ? path.basename(String(disk.device)) : '';
      const ioEntry = io.get(base) || null;
      const labels = { host: hostname(), mount: disk.mount, device: disk.device, filesystem: disk.filesystem };
      metrics.push(metric('system.disk.total.bytes', disk.total, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
      metrics.push(metric('system.disk.used.bytes', disk.used, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
      metrics.push(metric('system.disk.free.bytes', disk.free, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
      metrics.push(metric('system.disk.usage', disk.percent, { unit: 'percent', source: this.source, resource: 'local', labels, timestamp }));
      if (ioEntry) {
        metrics.push(metric('system.disk.read.bytes_per_second', ioEntry.readBytesPerSecond, { unit: 'bytes_per_second', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.disk.write.bytes_per_second', ioEntry.writeBytesPerSecond, { unit: 'bytes_per_second', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.disk.iops', ioEntry.iops, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.disk.latency_ms', ioEntry.latencyMs, { unit: 'milliseconds', source: this.source, resource: 'local', labels, timestamp }));
      }
      byDevice.set(disk.device, { ...disk, ...(ioEntry || {}) });
    }
    return disks.map((disk) => ({ ...disk, ...(byDevice.get(disk.device) || {}) }));
  }

  diskIo(timestamp) {
    const text = readFileSafe('/proc/diskstats', 512 * 1024);
    if (!text) return new Map();
    const previous = this.previousDisk;
    const next = new Map();
    const result = new Map();
    const fields = this.previousDiskAt ? Math.max(1, (timestamp - this.previousDiskAt) / 1000) : 0;
    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 14) continue;
      const name = parts[2];
      if (!name || /^(loop|ram|zram|fd|sr)/.test(name)) continue;
      const reads = Number(parts[3]) || 0;
      const sectorsRead = Number(parts[5]) || 0;
      const readMs = Number(parts[6]) || 0;
      const writes = Number(parts[7]) || 0;
      const sectorsWritten = Number(parts[9]) || 0;
      const writeMs = Number(parts[10]) || 0;
      const entry = { reads, writes, sectorsRead, sectorsWritten, readMs, writeMs };
      const before = previous.get(name);
      if (before && fields > 0) {
        const readDelta = Math.max(0, sectorsRead - before.sectorsRead);
        const writeDelta = Math.max(0, sectorsWritten - before.sectorsWritten);
        const ioCount = Math.max(1, (reads - before.reads) + (writes - before.writes));
        const busyMs = Math.max(0, (readMs - before.readMs) + (writeMs - before.writeMs));
        result.set(name, {
          readBytesPerSecond: Math.round((readDelta * 512) / fields),
          writeBytesPerSecond: Math.round((writeDelta * 512) / fields),
          iops: Math.round(ioCount / fields),
          latencyMs: Math.min(10000, busyMs / ioCount),
        });
      }
      next.set(name, entry);
    }
    this.previousDisk = next;
    this.previousDiskAt = timestamp;
    return result;
  }

  async collectNetwork(metrics, timestamp, platform, errors) {
    const host = hostname();
    const interfaces = os.networkInterfaces();
    const addresses = {};
    for (const [name, entries] of Object.entries(interfaces)) {
      addresses[name] = (entries || []).map((entry) => ({
        address: entry.address, netmask: entry.netmask, family: entry.family,
        mac: entry.mac, internal: entry.internal, cidr: entry.cidr || null,
      }));
    }
    const counters = await this.networkCounters(platform, errors);
    const at = this.previousNetAt ? Math.max(1, (timestamp - this.previousNetAt) / 1000) : 0;
    const details = [];
    for (const [name, entries] of Object.entries(addresses)) {
      const counter = counters.get(name) || {};
      const previous = this.previousNet.get(name);
      const rxRate = previous && at > 0 ? Math.max(0, (counter.rxBytes - previous.rxBytes) / at) : null;
      const txRate = previous && at > 0 ? Math.max(0, (counter.txBytes - previous.txBytes) / at) : null;
      const labels = { host, interface: name };
      if (counter.rxBytes != null) {
        metrics.push(metric('system.network.rx.bytes_total', counter.rxBytes, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.tx.bytes_total', counter.txBytes || 0, { unit: 'bytes', source: this.source, resource: 'local', labels, timestamp }));
      }
      if (rxRate != null && !name.startsWith('lo')) {
        metrics.push(metric('system.network.rx.bytes_per_second', rxRate, { unit: 'bytes_per_second', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.tx.bytes_per_second', txRate, { unit: 'bytes_per_second', source: this.source, resource: 'local', labels, timestamp }));
      }
      if (counter.rxDropped != null) {
        metrics.push(metric('system.network.rx.dropped_total', counter.rxDropped, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.tx.dropped_total', counter.txDropped || 0, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.rx.errors_total', counter.rxErrors || 0, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.tx.errors_total', counter.txErrors || 0, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.rx.packets_total', counter.rxPackets || 0, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
        metrics.push(metric('system.network.tx.packets_total', counter.txPackets || 0, { unit: 'count', source: this.source, resource: 'local', labels, timestamp }));
      }
      details.push({
        name, ...counter, addresses: entries || [],
        state: entries?.some((entry) => !entry.internal) ? 'up' : 'loopback',
        rxBytesPerSecond: rxRate, txBytesPerSecond: txRate,
      });
      if (counter.rxBytes != null) this.previousNet.set(name, counter);
    }
    this.previousNetAt = timestamp;

    const physical = details.filter((entry) => !entry.name.startsWith('lo'));
    return {
      interfaces: details,
      totalRxBytesPerSecond: physical.reduce((sum, entry) => sum + (entry.rxBytesPerSecond || 0), 0),
      totalTxBytesPerSecond: physical.reduce((sum, entry) => sum + (entry.txBytesPerSecond || 0), 0),
      totalRxBytes: physical.reduce((sum, entry) => sum + (entry.rxBytes || 0), 0),
      totalTxBytes: physical.reduce((sum, entry) => sum + (entry.txBytes || 0), 0),
      connections: null,
    };
  }

  async networkCounters(platform, errors) {
    const map = new Map();
    if (platform === 'linux') {
      const text = readFileSafe('/proc/net/dev', 1024 * 1024);
      for (const line of text.split('\n')) {
        const match = /^\s*([^:]+):\s*(.+)$/.exec(line);
        if (!match) continue;
        const values = match[2].trim().split(/\s+/).map(Number);
        if (values.length < 16) continue;
        map.set(match[1].trim(), {
          rxBytes: values[0], rxPackets: values[1], rxErrors: values[2], rxDropped: values[3],
          txBytes: values[8], txPackets: values[9], txErrors: values[10], txDropped: values[11],
        });
      }
      return map;
    }
    if (platform === 'darwin') {
      const result = await run('netstat', ['-ibn'], { timeout: 8000 });
      if (!result.ok) errors.push(`Network counters: ${result.stderr || result.error}`);
      for (const line of result.stdout.split('\n').slice(1)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const name = parts[0];
        const ibytes = safeNumber(parts[6], null);
        const obytes = safeNumber(parts[9], null);
        if (!name || ibytes == null || obytes == null) continue;
        map.set(name, { rxBytes: ibytes, txBytes: obytes, rxPackets: null, txPackets: null, rxDropped: null, txDropped: null, rxErrors: null, txErrors: null });
      }
      return map;
    }
    if (platform === 'win32') {
      const result = await powershell('Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,ReceivedUnicastPackets,ReceivedDiscardedPackets,ReceivedPacketErrors,SentBytes,SentUnicastPackets,SentDiscardedPackets,OutboundPacketErrors | ConvertTo-Json -Compress', 12000);
      const parsed = parseJson(result.stdout, []);
      const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      for (const entry of list) {
        map.set(String(entry.Name || ''), {
          rxBytes: safeNumber(entry.ReceivedBytes, 0), txBytes: safeNumber(entry.SentBytes, 0),
          rxPackets: safeNumber(entry.ReceivedUnicastPackets, 0), txPackets: safeNumber(entry.SentUnicastPackets, 0),
          rxDropped: safeNumber(entry.ReceivedDiscardedPackets, 0), txDropped: safeNumber(entry.SentDiscardedPackets, 0),
          rxErrors: safeNumber(entry.ReceivedPacketErrors, 0), txErrors: safeNumber(entry.OutboundPacketErrors, 0),
        });
      }
    }
    return map;
  }

  async collectProcesses(timestamp) {
    let processes = [];
    if (process.platform === 'linux' && fs.existsSync('/proc')) {
      processes = this.linuxProcesses(timestamp);
    } else {
      processes = await this.psProcesses(timestamp);
    }
    if (process.platform === 'linux' && this.connectionTick % 4 === 0) {
      this.connectionTick = 0;
      await this.loadConnections();
    }
    this.connectionTick += 1;
    if (this.processConnections.size) {
      for (const entry of processes) {
        const conns = this.processConnections.get(entry.pid);
        if (conns) {
          entry.connections = conns.count;
          entry.listeners = conns.listeners;
        }
      }
    }
    return processes.sort((a, b) => (b.cpuPercent - a.cpuPercent) || (b.memoryBytes - a.memoryBytes)).slice(0, MAX_PROCESSES);
  }

  linuxProcesses(timestamp) {
    const users = userMap();
    const uptime = os.uptime();
    const cpus = os.cpus();
    const totalDelta = cpus.reduce((sum, cpu) => sum + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);
    const previousTotal = this.previousProcessTotal;
    const totalTicks = previousTotal ? Math.max(1, totalDelta - previousTotal) : 0;
    const nextCpu = new Map();
    const out = [];
    for (const pidName of readDirSafe('/proc')) {
      if (!/^\d+$/.test(pidName)) continue;
      const pid = Number(pidName);
      const base = `/proc/${pidName}`;
      const stat = readFileSafe(`${base}/stat`, 16 * 1024);
      if (!stat) continue;
      const close = stat.lastIndexOf(')');
      const name = close > 0 ? stat.slice(stat.indexOf('(') + 1, close) : pidName;
      const rest = stat.slice(close + 2).split(/\s+/);
      if (rest.length < 20) continue;
      const state = rest[0];
      const ppid = Number(rest[1]);
      const utime = Number(rest[11]) || 0;
      const stime = Number(rest[12]) || 0;
      const startTicks = Number(rest[19]) || 0;
      const totalTicksProcess = utime + stime;
      const previous = this.previousProcessCpu.get(pid);
      let cpuPercent = 0;
      if (previous != null && totalTicks > 0) cpuPercent = (Math.max(0, totalTicksProcess - previous) / totalTicks) * 100 * (cpus.length || 1);
      nextCpu.set(pid, totalTicksProcess);
      if (pid === process.pid && previous == null) {
        // The collector itself is expected to appear; no special treatment.
      }
      const status = readFileSafe(`${base}/status`, 32 * 1024);
      let uid = null;
      let rss = 0;
      for (const line of status.split('\n')) {
        if (line.startsWith('Uid:')) uid = line.split(/\s+/)[1];
        else if (line.startsWith('VmRSS:')) rss = (safeNumber(line.split(/\s+/)[1], 0) || 0) * 1024;
      }
      const cmdline = readFileSafe(`${base}/cmdline`, 64 * 1024).replace(/\u0000/g, ' ').trim();
      let exe = '';
      try { exe = fs.readlinkSync(`${base}/exe`); } catch { /* permission */ }
      out.push({
        pid, ppid, name,
        user: uid != null ? (users.get(uid) || uid) : '',
        cpuPercent: Math.max(0, cpuPercent), memoryBytes: rss,
        state: state === 'R' ? 'running' : state === 'S' ? 'sleeping' : state === 'D' ? 'disk sleep' : state === 'Z' ? 'zombie' : state === 'T' ? 'stopped' : state,
        startedAt: new Date(Date.now() - Math.max(0, (uptime - startTicks / CPU_TICKS_PER_SECOND)) * 1000).toISOString(),
        command: cmdline || name, exe,
        threads: Number(readFileSafe(`${base}/status`, 32 * 1024).match(/Threads:\s+(\d+)/)?.[1]) || null,
      });
    }
    this.previousProcessCpu = nextCpu;
    this.previousProcessTotal = totalDelta;
    void timestamp;
    return out;
  }

  async psProcesses(timestamp) {
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,StartTime,Path | ConvertTo-Json -Compress']
      : ['-axo', 'pid=,ppid=,user=,pcpu=,rss=,stat=,etime=,comm=,args='];
    if (process.platform === 'win32') {
      const result = await powershell(args[3], 15000);
      const parsed = parseJson(result.stdout, []);
      const list = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      // Get-Process reports cumulative CPU seconds. A real percentage only
      // exists between two samples, so the first tick reports null instead of
      // a fabricated 0%.
      const cores = Math.max(1, os.cpus().length);
      const elapsedSec = this.previousWinProcessAt ? Math.max(0.5, (timestamp - this.previousWinProcessAt) / 1000) : 0;
      const previous = this.previousWinProcessCpu;
      const nextCpu = new Map();
      const rows = list.map((entry) => {
        const pid = Number(entry.Id) || 0;
        const cpuSeconds = safeNumber(entry.CPU, null);
        let cpuPercent = null;
        if (cpuSeconds != null && elapsedSec > 0) {
          cpuPercent = processCpuPercent(previous.get(pid), cpuSeconds, elapsedSec, cores);
        }
        if (cpuSeconds != null) nextCpu.set(pid, cpuSeconds);
        return {
          pid,
          ppid: null,
          name: String(entry.ProcessName || 'process'),
          user: '',
          cpuPercent,
          memoryBytes: safeNumber(entry.WorkingSet64, 0) || 0,
          state: 'running',
          startedAt: entry.StartTime ? new Date(entry.StartTime).toISOString() : null,
          command: String(entry.Path || entry.ProcessName || ''),
          exe: String(entry.Path || ''),
        };
      }).filter((entry) => entry.pid > 0);
      this.previousWinProcessCpu = nextCpu;
      this.previousWinProcessAt = timestamp;
      return rows;
    }
    const result = await run('ps', args, { timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
    if (!result.ok) return [];
    const out = [];
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);
      if (!match) continue;
      out.push({
        pid: Number(match[1]), ppid: Number(match[2]), user: match[3],
        cpuPercent: Number(match[4]) || 0, memoryBytes: (Number(match[5]) || 0) * 1024,
        state: match[6], startedAt: new Date(Date.now() - parseElapsed(match[7])).toISOString(),
        name: match[8], command: match[9] || match[8], exe: '',
      });
    }
    void timestamp;
    return out;
  }

  async loadConnections() {
    const ss = which('ss');
    if (!ss) return;
    const result = await run(ss, ['-tunapH'], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
    if (!result.ok) return;
    const map = new Map();
    for (const line of result.stdout.split('\n')) {
      const pidMatches = [...line.matchAll(/pid=(\d+)/g)];
      for (const match of pidMatches) {
        const pid = Number(match[1]);
        const entry = map.get(pid) || { count: 0, listeners: 0 };
        entry.count += 1;
        if (/LISTEN/.test(line)) entry.listeners += 1;
        map.set(pid, entry);
      }
    }
    this.processConnections = map;
  }

  async collectInfo(platform, cpu, memory, disks) {
    const info = {
      hostname: hostname(),
      platform,
      type: os.type(),
      os: os.type(),
      version: os.version(),
      release: os.release(),
      arch: os.arch(),
      kernel: platform === 'win32' ? null : os.release(),
      uptimeSeconds: os.uptime(),
      bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
      cpu: {
        model: cpu.model, architecture: cpu.architecture,
        logicalProcessors: cpu.logicalProcessors, physicalCores: cpu.physicalCores,
        speedMhz: cpu.speedMhz, temperatureCelsius: cpu.temperatureCelsius,
      },
      memory: { total: memory.total, used: memory.used, available: memory.available, swapTotal: memory.swapTotal },
      disks: disks.map((disk) => ({ mount: disk.mount, device: disk.device, filesystem: disk.filesystem, total: disk.total, used: disk.used })),
      hardwareModel: null,
      distro: null,
    };
    if (platform === 'linux') {
      const release = parseOsRelease(readFileSafe('/etc/os-release', 64 * 1024));
      info.distro = release.PRETTY_NAME || release.NAME || null;
      info.hardwareModel = readFileSafe('/sys/devices/virtual/dmi/id/product_name', 512).trim()
        || readFileSafe('/sys/devices/virtual/dmi/id/board_name', 512).trim() || null;
      info.kernel = os.release();
      info.os = release.NAME || os.type();
    } else if (platform === 'darwin') {
      try {
        const result = require('node:child_process').execFileSync('sw_vers', [], { timeout: 2000, encoding: 'utf8' });
        info.version = result.trim().split('\n').find((line) => line.startsWith('ProductVersion:'))?.split(':')[1]?.trim() || os.release();
      } catch { /* optional */ }
      try {
        info.hardwareModel = require('node:child_process').execFileSync('sysctl', ['-n', 'hw.model'], { timeout: 2000, encoding: 'utf8' }).trim();
      } catch { /* optional */ }
      info.os = 'macOS';
    } else if (platform === 'win32') {
      info.os = 'Windows';
      info.version = os.release();
      info.kernel = null;
      const result = await powershell('Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json -Compress', 12000);
      const parsed = parseJson(result.stdout, null);
      if (parsed) info.hardwareModel = [parsed.Manufacturer, parsed.Model].filter(Boolean).join(' ') || null;
    }
    return info;
  }
}

function vmStat() {
  try {
    const out = execFileSync('/usr/bin/vm_stat', [], { timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return parseVmStat(out);
  } catch {
    return null;
  }
}

/**
 * Parse `vm_stat` output. Exposed for tests because macOS is the one platform
 * whose memory accounting cannot be checked with os.freemem().
 */
function parseVmStat(text) {
  const source = String(text || '');
  const sizeMatch = /page size of (\d+) bytes/.exec(source);
  if (!sizeMatch && !/Pages active/.test(source)) return null;
  const read = (label) => {
    const match = new RegExp(`${label}:\\s+(\\d+)`).exec(source);
    return match ? Number(match[1]) : null;
  };
  return {
    pageSize: sizeMatch ? Number(sizeMatch[1]) : 4096,
    free: read('Pages free'),
    active: read('Pages active'),
    inactive: read('Pages inactive'),
    speculative: read('Pages speculative'),
    wired: read('Pages wired down'),
    purgeable: read('Pages purgeable'),
    compressor: read('Pages occupied by compressor'),
  };
}

/**
 * "Used" the way Activity Monitor reports it: active + wired + compressed.
 */
function macMemoryUsage(sample, total) {
  const pageSize = sample?.pageSize || 4096;
  const bytes = (pages) => Math.max(0, Number(pages) || 0) * pageSize;
  const usedBytes = bytes(sample?.active) + bytes(sample?.wired) + bytes(sample?.compressor);
  const freeBytes = bytes(sample?.free);
  const used = Math.min(total, usedBytes);
  return {
    used,
    free: Math.min(total, freeBytes),
    available: Math.max(0, total - used),
    cached: bytes(sample?.inactive) + bytes(sample?.purgeable) + bytes(sample?.speculative),
  };
}

/**
 * CPU percentage from two cumulative CPU-second samples. Get-Process exposes
 * seconds, not a rate, so the first sample has no honest percentage.
 */
function processCpuPercent(previous, current, elapsedSec, cores) {
  if (current == null || previous == null || !(elapsedSec > 0) || current < previous) return null;
  const limit = 100 * Math.max(1, cores || 1);
  return Math.min(limit, ((current - previous) / elapsedSec) * 100);
}

function macSwapUsage() {
  try {
    const out = execFileSync('/usr/bin/sysctl', ['-n', 'vm.swapusage'], { timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const bytes = (value, unit) => Number(value) * (unit === 'G' ? 1024 ** 3 : unit === 'M' ? 1024 ** 2 : unit === 'K' ? 1024 : 1);
    const total = /total = ([\d.]+)([MGK])/.exec(out);
    const used = /used = ([\d.]+)([MGK])/.exec(out);
    const totalBytes = total ? bytes(total[1], total[2]) : 0;
    const usedBytes = used ? bytes(used[1], used[2]) : 0;
    return { total: totalBytes, free: Math.max(0, totalBytes - usedBytes) };
  } catch {
    return null;
  }
}

function parseElapsed(value) {
  const text = String(value || '');
  const parts = text.split('-');
  let days = 0;
  let time = parts[parts.length - 1];
  if (parts.length > 1) days = Number(parts[0]) || 0;
  const chunks = time.split(':').map(Number);
  let seconds = 0;
  if (chunks.length === 3) seconds = chunks[0] * 3600 + chunks[1] * 60 + chunks[2];
  else if (chunks.length === 2) seconds = chunks[0] * 60 + chunks[1];
  return (days * 86400 + seconds) * 1000;
}

module.exports = { LocalCollector, __test: { parseMeminfo, parsePressure, parseOsRelease, parseElapsed, parseVmStat, macMemoryUsage, processCpuPercent } };
