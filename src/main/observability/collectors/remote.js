'use strict';

/**
 * Remote server collector.
 *
 * Three agentless methods are supported:
 *   ssh         – a single read-only POSIX shell probe (or PowerShell on Windows)
 *   prometheus  – scrape a node_exporter / compatible endpoint
 *   agent       – pull the last snapshot pushed by an OpsDeck monitoring agent
 *
 * Credentials are resolved by ObservabilityService from the encrypted config
 * and passed in memory. They are never persisted here.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { metric, percent } = require('../metrics');
const { run, safeNumber, sanitizeText, powershell } = require('../util');
const { parseText, fetchText } = require('../prometheus');

const MAX_SERVERS = 100;

const LINUX_SCRIPT = String.raw`
echo "##HOST"; hostname 2>/dev/null
echo "##OS"; (cat /etc/os-release 2>/dev/null || true) | head -20
echo "##UNAME"; uname -srm 2>/dev/null
echo "##UPTIME"; cat /proc/uptime 2>/dev/null
echo "##LOAD"; cat /proc/loadavg 2>/dev/null
echo "##STAT1"; grep '^cpu' /proc/stat 2>/dev/null
echo "##MEM"; cat /proc/meminfo 2>/dev/null
echo "##DF"; df -Pk 2>/dev/null
echo "##NET1"; cat /proc/net/dev 2>/dev/null
echo "##DISK1"; cat /proc/diskstats 2>/dev/null
echo "##PROC"; ps -eo pid=,user=,pcpu=,pmem=,rss=,stat=,comm= --sort=-pcpu 2>/dev/null | head -25
echo "##NETSTAT"; (ss -s 2>/dev/null || netstat -s 2>/dev/null | head -30 || true)
sleep 1
echo "##STAT2"; grep '^cpu' /proc/stat 2>/dev/null
echo "##NET2"; cat /proc/net/dev 2>/dev/null
echo "##DISK2"; cat /proc/diskstats 2>/dev/null
`.trim();

const WINDOWS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
$net = Get-NetAdapterStatistics
$perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' }
$procs = Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 Id,ProcessName,CPU,WorkingSet64,StartTime,Path
[pscustomobject]@{
  host = $env:COMPUTERNAME
  os = $os.Caption
  version = $os.Version
  kernel = $null
  uptimeSeconds = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalSeconds)
  cpu = @{ usage = [double]$perf.PercentProcessorTime; model = ($cpu | Select-Object -First 1).Name; logical = [int]($cpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum }
  memory = @{ total = [double]$os.TotalVisibleMemorySize * 1024; free = [double]$os.FreePhysicalMemory * 1024 }
  disks = @($disks | ForEach-Object { @{ device = $_.DeviceID; mount = "$($_.DeviceID)\"; filesystem = $_.FileSystem; total = [double]$_.Size; free = [double]$_.FreeSpace } })
  network = @($net | ForEach-Object { @{ name = $_.Name; rxBytes = [double]$_.ReceivedBytes; txBytes = [double]$_.SentBytes; rxDropped = [double]$_.ReceivedDiscardedPackets; txDropped = [double]$_.SentDiscardedPackets; rxErrors = [double]$_.ReceivedPacketErrors; txErrors = [double]$_.OutboundPacketErrors } })
  processes = @($procs | ForEach-Object { @{ pid = $_.Id; name = $_.ProcessName; memoryBytes = [double]$_.WorkingSet64; startedAt = if ($_.StartTime) { $_.StartTime.ToString('o') } else { $null }; exe = $_.Path } })
} | ConvertTo-Json -Depth 6 -Compress
`.trim();

function section(text, name) {
  const marker = `##${name}`;
  const lines = String(text || '').split(/\r?\n/);
  const out = [];
  let active = false;
  for (const line of lines) {
    if (line.startsWith('##')) {
      if (active) break;
      active = line.trim() === marker;
      continue;
    }
    if (active) out.push(line);
  }
  return out.join('\n');
}

function parseCpuStat(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const match = /^(cpu\d*)\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const values = match[2].trim().split(/\s+/).map(Number);
    const total = values.slice(0, 8).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const idle = (values[3] || 0) + (values[4] || 0);
    out.push({ name: match[1], total, idle });
  }
  return out;
}

function parseNetDev(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const match = /^\s*([^:]+):\s*(.+)$/.exec(line);
    if (!match) continue;
    const values = match[2].trim().split(/\s+/).map(Number);
    if (values.length < 16) continue;
    out.push({
      name: match[1].trim(), rxBytes: values[0], rxPackets: values[1], rxErrors: values[2], rxDropped: values[3],
      txBytes: values[8], txPackets: values[9], txErrors: values[10], txDropped: values[11],
    });
  }
  return out;
}

function parseMeminfo(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const match = /^([^:]+):\s+(\d+)(?:\s+(kB))?/.exec(line);
    if (match) out[match[1]] = Number(match[2]) * (match[3] ? 1024 : 1);
  }
  return out;
}

function parseOsRelease(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, idx).trim()] = value;
  }
  return out;
}

function parseDf(text) {
  const out = [];
  const lines = String(text || '').split('\n').slice(1);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    if (/^(tmpfs|devtmpfs|proc|sysfs|overlay|squashfs)$/i.test(parts[0])) continue;
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    const free = Number(parts[3]) * 1024;
    if (!total) continue;
    out.push({ device: parts[0], mount: parts.slice(5).join(' '), filesystem: '', total, used, free, percent: percent(used, total) || 0 });
  }
  return out;
}

function parseDiskstats(text) {
  const out = new Map();
  for (const line of String(text || '').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 14) continue;
    if (/^(loop|ram|zram|fd|sr)/.test(parts[2])) continue;
    out.set(parts[2], {
      reads: Number(parts[3]) || 0, sectorsRead: Number(parts[5]) || 0, readMs: Number(parts[6]) || 0,
      writes: Number(parts[7]) || 0, sectorsWritten: Number(parts[9]) || 0, writeMs: Number(parts[10]) || 0,
    });
  }
  return out;
}

function parseProcesses(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    if (!match) continue;
    out.push({
      pid: Number(match[1]), user: match[2], cpuPercent: Number(match[3]) || 0,
      memoryPercent: Number(match[4]) || 0, memoryBytes: (Number(match[5]) || 0) * 1024,
      state: match[6], name: match[7].trim(),
    });
  }
  return out;
}

class RemoteCollector {
  constructor({ getServers }) {
    this.name = 'remote';
    this.label = 'Remote servers';
    this.source = 'remote';
    this.getServers = getServers;
    this.last = new Map();
    this.lastAt = 0;
    this.lastError = '';
    this.inFlight = false;
    this.previous = new Map();
  }

  async collect(now = Date.now()) {
    const started = now;
    const metrics = [];
    const errors = [];
    if (this.inFlight) {
      return { ok: true, metrics: [], details: { at: new Date(now).toISOString(), servers: [...this.last.values()], skipped: 'A previous remote round is still running.' }, errors: [], durationMs: 0, at: new Date(now).toISOString() };
    }
    this.inFlight = true;
    try {
      const servers = (typeof this.getServers === 'function' ? this.getServers() : []).filter((server) => server && server.enabled !== false).slice(0, MAX_SERVERS);
      const results = await Promise.all(servers.map((server) => this.collectServer(server, now).catch((error) => ({
        id: server.id, name: server.name, method: server.method, host: server.host,
        ok: false, error: sanitizeText(error.message || String(error), 400), at: new Date(now).toISOString(),
        metrics: [], missing: [],
      }))));
      for (const result of results) {
        this.last.set(result.id, result);
        metrics.push(...(result.metrics || []));
        if (result.error) errors.push(`${result.name}: ${result.error}`);
      }
      this.lastAt = now;
      this.lastError = errors.join('; ');
      return {
        ok: true,
        metrics,
        details: {
          at: new Date(now).toISOString(),
          servers: results.map(({ metrics: _metrics, ...rest }) => rest),
          summary: {
            total: results.length,
            online: results.filter((result) => result.ok).length,
            offline: results.filter((result) => !result.ok).length,
          },
          errors,
        },
        errors,
        durationMs: Date.now() - started,
        at: new Date(now).toISOString(),
      };
    } finally {
      this.inFlight = false;
    }
  }

  async collectServer(server, now) {
    const method = String(server.method || 'ssh').toLowerCase();
    let snapshot;
    if (method === 'prometheus' || method === 'exporter') snapshot = await this.prometheusServer(server, now);
    else if (method === 'agent') snapshot = this.agentSnapshot(server, now);
    else snapshot = await this.sshServer(server, now);
    const resource = `server:${server.id}`;
    const labels = {
      server: server.name, host: server.host || '', group: server.group || '',
      environment: server.environment || '', method,
      ...(server.tags && server.tags.length ? { tags: server.tags.join(',') } : {}),
    };
    const metrics = [];
    const push = (name, value, unit = 'count') => {
      const n = safeNumber(value, null);
      if (n == null) return;
      metrics.push(metric(name, n, { unit, source: this.source, resource, labels, timestamp: now }));
    };
    if (!snapshot.ok) {
      metrics.push(metric('server.up', 0, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
      return { ...server, secret: undefined, ok: false, error: snapshot.error || 'Collection failed.', at: new Date(now).toISOString(), metrics, missing: snapshot.missing || [] };
    }
    metrics.push(metric('server.up', 1, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
    push('server.cpu.usage', snapshot.cpu?.usage, 'percent');
    push('server.load.1', snapshot.cpu?.load1);
    push('server.load.5', snapshot.cpu?.load5);
    push('server.load.15', snapshot.cpu?.load15);
    push('server.cpu.temperature.celsius', snapshot.cpu?.temperature, 'celsius');
    push('server.memory.total.bytes', snapshot.memory?.total, 'bytes');
    push('server.memory.used.bytes', snapshot.memory?.used, 'bytes');
    push('server.memory.free.bytes', snapshot.memory?.free, 'bytes');
    push('server.memory.available.bytes', snapshot.memory?.available, 'bytes');
    push('server.memory.usage', snapshot.memory?.usage, 'percent');
    push('server.swap.total.bytes', snapshot.memory?.swapTotal, 'bytes');
    push('server.swap.used.bytes', snapshot.memory?.swapUsed, 'bytes');
    push('server.uptime.seconds', snapshot.uptimeSeconds, 'seconds');
    push('server.process.count', snapshot.processes?.length);
    push('server.disk.total.bytes', (snapshot.disks || []).reduce((sum, disk) => sum + (disk.total || 0), 0), 'bytes');
    push('server.disk.used.bytes', (snapshot.disks || []).reduce((sum, disk) => sum + (disk.used || 0), 0), 'bytes');
    push('server.network.rx.bytes_per_second', snapshot.network?.rxBytesPerSecond, 'bytes_per_second');
    push('server.network.tx.bytes_per_second', snapshot.network?.txBytesPerSecond, 'bytes_per_second');
    for (const disk of snapshot.disks || []) {
      const diskLabels = { ...labels, mount: disk.mount, device: disk.device };
      metrics.push(metric('server.disk.usage', disk.percent, { unit: 'percent', source: this.source, resource: `${resource}:${disk.mount}`, labels: diskLabels, timestamp: now }));
      metrics.push(metric('server.disk.total.bytes', disk.total, { unit: 'bytes', source: this.source, resource: `${resource}:${disk.mount}`, labels: diskLabels, timestamp: now }));
      metrics.push(metric('server.disk.used.bytes', disk.used, { unit: 'bytes', source: this.source, resource: `${resource}:${disk.mount}`, labels: diskLabels, timestamp: now }));
    }
    for (const iface of snapshot.network?.interfaces || []) {
      const netLabels = { ...labels, interface: iface.name };
      metrics.push(metric('server.network.rx.bytes_total', iface.rxBytes, { unit: 'bytes', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
      metrics.push(metric('server.network.tx.bytes_total', iface.txBytes, { unit: 'bytes', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
      if (iface.rxBytesPerSecond != null) {
        metrics.push(metric('server.network.rx.bytes_per_second', iface.rxBytesPerSecond, { unit: 'bytes_per_second', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
        metrics.push(metric('server.network.tx.bytes_per_second', iface.txBytesPerSecond, { unit: 'bytes_per_second', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
      }
      if (iface.rxDropped != null) {
        metrics.push(metric('server.network.rx.dropped_total', iface.rxDropped, { unit: 'count', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
        metrics.push(metric('server.network.tx.dropped_total', iface.txDropped || 0, { unit: 'count', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
        metrics.push(metric('server.network.rx.errors_total', iface.rxErrors || 0, { unit: 'count', source: this.source, resource: `${resource}:${iface.name}`, labels: netLabels, timestamp: now }));
      }
    }
    for (const process of (snapshot.processes || []).slice(0, 12)) {
      metrics.push(metric('server.process.cpu.usage', process.cpuPercent, {
        unit: 'percent', source: this.source, resource: `${resource}:process:${process.pid}`,
        labels: { ...labels, process: process.name, pid: process.pid }, timestamp: now,
      }));
      metrics.push(metric('server.process.memory.bytes', process.memoryBytes, {
        unit: 'bytes', source: this.source, resource: `${resource}:process:${process.pid}`,
        labels: { ...labels, process: process.name, pid: process.pid }, timestamp: now,
      }));
    }
    return {
      ...server, secret: undefined,
      ok: true, at: new Date(now).toISOString(), metrics,
      info: snapshot.info || null, cpu: snapshot.cpu || null, memory: snapshot.memory || null,
      disks: snapshot.disks || [], network: snapshot.network || null,
      processes: snapshot.processes || [], uptimeSeconds: snapshot.uptimeSeconds ?? null,
      missing: snapshot.missing || [],
    };
  }

  async sshServer(server, now) {
    const host = String(server.host || '').trim();
    if (!host || !/^[A-Za-z0-9._:-]{1,253}$/.test(host)) throw new Error('The server host is not valid.');
    const port = Number(server.port) || 22;
    const user = String(server.username || '').trim();
    if (user && !/^[A-Za-z0-9._@-]{1,80}$/.test(user)) throw new Error('The SSH username is not valid.');
    const target = user ? `${user}@${host}` : host;
    const args = [
      '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15',
      '-p', String(port),
    ];
    let keyFile = '';
    if (server.secret?.privateKey) {
      keyFile = path.join(os.tmpdir(), `opsdeck-obs-${crypto.randomUUID()}.key`);
      fs.writeFileSync(keyFile, String(server.secret.privateKey), { mode: 0o600 });
      args.push('-i', keyFile, '-o', 'IdentitiesOnly=yes');
    }
    if (server.os === 'windows') {
      args.push(target, `powershell -NoProfile -NonInteractive -Command "${WINDOWS_SCRIPT.replace(/\n/g, '; ').replace(/"/g, '\\"')}"`);
    } else {
      args.push(target, 'sh', '-c', LINUX_SCRIPT);
    }
    let result;
    try {
      result = await run('ssh', args, { timeout: Math.max(15000, Number(server.timeoutMs) || 30000), maxBuffer: 8 * 1024 * 1024 });
    } finally {
      if (keyFile) { try { fs.unlinkSync(keyFile); } catch { /* best effort */ } }
    }
    if (result.stderr && /Permission denied|Host key verification failed|Connection refused|No route to host|timed out/i.test(result.stderr)) {
      return { ok: false, error: sanitizeText(result.stderr, 400) };
    }
    if (!result.ok && !result.stdout) return { ok: false, error: sanitizeText(result.stderr || result.error || 'SSH command failed.', 400) };
    if (server.os === 'windows') {
      let data;
      try { data = JSON.parse(result.stdout); } catch { return { ok: false, error: 'The Windows monitoring script returned unreadable output.' }; }
      const total = Number(data.memory?.total) || 0;
      const free = Number(data.memory?.free) || 0;
      const disks = (data.disks || []).map((disk) => ({ ...disk, used: Math.max(0, (disk.total || 0) - (disk.free || 0)), percent: percent((disk.total || 0) - (disk.free || 0), disk.total) || 0, filesystem: disk.filesystem || '' }));
      return {
        ok: true,
        info: { hostname: data.host, os: data.os, version: data.version, kernel: null },
        cpu: { usage: safeNumber(data.cpu?.usage, 0), load1: null, load5: null, load15: null, model: data.cpu?.model || '', logical: data.cpu?.logical || null },
        memory: { total, used: total - free, free, available: free, usage: percent(total - free, total) || 0 },
        disks,
        network: { interfaces: (data.network || []).map((entry) => ({ ...entry, rxBytesPerSecond: null, txBytesPerSecond: null })), rxBytesPerSecond: null, txBytesPerSecond: null },
        processes: (data.processes || []).map((entry) => ({ pid: entry.pid, name: entry.name, cpuPercent: 0, memoryBytes: entry.memoryBytes, startedAt: entry.startedAt, user: '', state: '' })),
        uptimeSeconds: safeNumber(data.uptimeSeconds, null),
        missing: ['Per-process CPU on Windows (use the agent or Performance Counter access)'],
      };
    }

    const hostname = section(result.stdout, 'HOST').trim();
    const osRelease = parseOsRelease(section(result.stdout, 'OS'));
    const uname = section(result.stdout, 'UNAME').trim();
    const uptimeSeconds = safeNumber((section(result.stdout, 'UPTIME').trim().split(/\s+/)[0]), null);
    const load = section(result.stdout, 'LOAD').trim().split(/\s+/).map(Number);
    const stat1 = parseCpuStat(section(result.stdout, 'STAT1'));
    const stat2 = parseCpuStat(section(result.stdout, 'STAT2'));
    const cpuRows = stat2.length ? stat2 : stat1;
    const total = cpuRows.find((row) => row.name === 'cpu');
    const prevTotal = stat1.find((row) => row.name === 'cpu');
    let cpuUsage = null;
    if (stat2.length && prevTotal && total) {
      const totalDelta = Math.max(1, total.total - prevTotal.total);
      cpuUsage = percent(totalDelta - Math.max(0, total.idle - prevTotal.idle), totalDelta);
    } else if (total && total.total > 0) {
      cpuUsage = percent(total.total - total.idle, total.total);
    }
    const mem = parseMeminfo(section(result.stdout, 'MEM'));
    const memTotal = mem.MemTotal || 0;
    const memAvailable = mem.MemAvailable ?? mem.MemFree ?? 0;
    const swapTotal = mem.SwapTotal || 0;
    const swapFree = mem.SwapFree || 0;
    const disks = parseDf(section(result.stdout, 'DF'));
    const net1 = parseNetDev(section(result.stdout, 'NET1'));
    const net2 = parseNetDev(section(result.stdout, 'NET2'));
    const previous = this.previous.get(server.id);
    const interval = previous ? Math.max(1, (now - previous.at) / 1000) : 0;
    const previousByName = new Map((previous?.net || []).map((entry) => [entry.name, entry]));
    const interfaces = net2.map((entry) => {
      const before = previousByName.get(entry.name);
      return {
        ...entry,
        rxBytesPerSecond: before && interval ? Math.max(0, (entry.rxBytes - before.rxBytes) / interval) : null,
        txBytesPerSecond: before && interval ? Math.max(0, (entry.txBytes - before.txBytes) / interval) : null,
      };
    });
    const physical = interfaces.filter((entry) => entry.name !== 'lo');
    const disk1 = parseDiskstats(section(result.stdout, 'DISK1'));
    const disk2 = parseDiskstats(section(result.stdout, 'DISK2'));
    const diskInterval = previous ? Math.max(1, (now - previous.at) / 1000) : 0;
    for (const disk of disks) {
      const name = String(disk.device).split('/').pop().replace(/\d+$/, '');
      const a = disk1.get(name);
      const b = disk2.get(name);
      if (a && b && diskInterval) {
        const reads = Math.max(0, b.sectorsRead - a.sectorsRead) * 512 / diskInterval;
        const writes = Math.max(0, b.sectorsWritten - a.sectorsWritten) * 512 / diskInterval;
        disk.readBytesPerSecond = Math.round(reads);
        disk.writeBytesPerSecond = Math.round(writes);
      }
    }
    this.previous.set(server.id, { at: now, net: net2 });
    return {
      ok: true,
      info: { hostname, os: osRelease.PRETTY_NAME || osRelease.NAME || uname, version: osRelease.VERSION || '', kernel: uname },
      cpu: {
        usage: cpuUsage, load1: load[0] ?? null, load5: load[1] ?? null, load15: load[2] ?? null,
        model: '', logical: cpuRows.filter((row) => row.name !== 'cpu').length || null, temperature: null,
      },
      memory: {
        total: memTotal, used: Math.max(0, memTotal - memAvailable), free: mem.MemFree || 0,
        available: memAvailable, usage: percent(memTotal - memAvailable, memTotal) || 0,
        swapTotal, swapUsed: Math.max(0, swapTotal - swapFree),
      },
      disks,
      network: {
        interfaces,
        rxBytesPerSecond: physical.reduce((sum, entry) => sum + (entry.rxBytesPerSecond || 0), 0),
        txBytesPerSecond: physical.reduce((sum, entry) => sum + (entry.txBytesPerSecond || 0), 0),
      },
      processes: parseProcesses(section(result.stdout, 'PROC')),
      uptimeSeconds,
      missing: [],
    };
  }

  async prometheusServer(server, now) {
    const url = String(server.url || '');
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'The Prometheus exporter URL is not valid.' };
    const response = await fetchText(url, {
      timeoutMs: server.timeoutMs || 12000,
      token: server.secret?.token,
      username: server.username,
      password: server.secret?.password,
      rejectUnauthorized: server.rejectUnauthorized !== false,
    });
    if (!response.ok) return { ok: false, error: `Exporter request failed: ${response.error || 'no response'}` };
    const { samples } = parseText(response.text, { limit: 50000 });
    const pick = (name, labels = {}) => samples.find((sample) => sample.name === name && Object.entries(labels).every(([key, value]) => sample.labels[key] === value));
    const cpuIdle = samples.filter((sample) => sample.name === 'node_cpu_seconds_total' && sample.labels.mode === 'idle').reduce((sum, sample) => sum + sample.value, 0);
    const cpuAll = samples.filter((sample) => sample.name === 'node_cpu_seconds_total').reduce((sum, sample) => sum + sample.value, 0);
    const memTotal = pick('node_memory_MemTotal_bytes')?.value || 0;
    const memAvailable = pick('node_memory_MemAvailable_bytes')?.value || pick('node_memory_MemFree_bytes')?.value || 0;
    const disks = samples.filter((sample) => sample.name === 'node_filesystem_size_bytes' && sample.labels.mountpoint && !/^\/(proc|sys|dev)/.test(sample.labels.mountpoint))
      .map((sample) => {
        const available = samples.find((entry) => entry.name === 'node_filesystem_avail_bytes' && entry.labels.mountpoint === sample.labels.mountpoint && entry.labels.device === sample.labels.device)?.value || 0;
        return {
          device: sample.labels.device || '', mount: sample.labels.mountpoint,
          filesystem: sample.labels.fstype || '', total: sample.value, free: available,
          used: Math.max(0, sample.value - available), percent: percent(sample.value - available, sample.value) || 0,
        };
      });
    const interfaces = [];
    const names = new Set(samples.filter((sample) => sample.name === 'node_network_receive_bytes_total').map((sample) => sample.labels.device));
    for (const name of names) {
      if (name === 'lo') continue;
      interfaces.push({
        name,
        rxBytes: pick('node_network_receive_bytes_total', { device: name })?.value || 0,
        txBytes: pick('node_network_transmit_bytes_total', { device: name })?.value || 0,
        rxDropped: pick('node_network_receive_drop_total', { device: name })?.value ?? null,
        txDropped: pick('node_network_transmit_drop_total', { device: name })?.value ?? null,
        rxErrors: pick('node_network_receive_errs_total', { device: name })?.value ?? null,
        txErrors: pick('node_network_transmit_errs_total', { device: name })?.value ?? null,
        rxBytesPerSecond: null, txBytesPerSecond: null,
      });
    }
    const uptime = pick('node_time_seconds') && pick('node_boot_time_seconds')
      ? pick('node_time_seconds').value - pick('node_boot_time_seconds').value : null;
    return {
      ok: true,
      info: {
        hostname: pick('node_uname_info')?.labels.nodename || server.name,
        os: pick('node_os_info')?.labels.pretty_name || 'Linux',
        version: pick('node_uname_info')?.labels.release || '', kernel: pick('node_uname_info')?.labels.release || '',
      },
      cpu: { usage: cpuAll > 0 ? percent(cpuAll - cpuIdle, cpuAll) : null, load1: pick('node_load1')?.value ?? null, load5: pick('node_load5')?.value ?? null, load15: pick('node_load15')?.value ?? null, logical: null, temperature: null },
      memory: {
        total: memTotal, used: Math.max(0, memTotal - memAvailable), free: pick('node_memory_MemFree_bytes')?.value || 0,
        available: memAvailable, usage: percent(memTotal - memAvailable, memTotal) || 0,
        swapTotal: pick('node_memory_SwapTotal_bytes')?.value || 0,
        swapUsed: (pick('node_memory_SwapTotal_bytes')?.value || 0) - (pick('node_memory_SwapFree_bytes')?.value || 0),
      },
      disks, network: { interfaces, rxBytesPerSecond: null, txBytesPerSecond: null },
      processes: [], uptimeSeconds: uptime,
      missing: ['per-process metrics are not exposed by node_exporter by default', 'network rates require two scrapes (available after the next interval)'],
    };
  }

  agentSnapshot(server, now) {
    const snapshot = server.agentSnapshot;
    if (!snapshot) return { ok: false, error: 'The agent has not pushed a snapshot yet.', missing: [] };
    if (snapshot.at && now - Date.parse(snapshot.at) > Math.max(120000, Number(server.agentTimeoutMs) || 300000)) {
      return { ok: false, error: `The last agent snapshot is stale (${snapshot.at}).`, missing: [] };
    }
    return { ...snapshot, ok: true };
  }
}

module.exports = { RemoteCollector, __test: { section, parseCpuStat, parseNetDev, parseMeminfo, parseDf, parseDiskstats, parseProcesses } };
