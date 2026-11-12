'use strict';

/**
 * Monitoring reports.
 *
 * Reports are computed from the same time-series/log/alert stores used by the
 * dashboards. Export formats are generated in the main process; the renderer
 * receives a filename and content only after the user chooses where to save.
 */

const { aggregate, quantile } = require('./metrics');

const TYPES = {
  system: { label: 'System performance', metrics: ['system.cpu.usage', 'system.memory.usage', 'system.disk.usage', 'system.network.rx.bytes_per_second', 'system.load.1'] },
  servers: { label: 'Server availability', metrics: ['server.up', 'server.cpu.usage', 'server.memory.usage', 'server.disk.usage'] },
  docker: { label: 'Docker resource utilization', metrics: ['docker.containers.running', 'docker.containers.unhealthy', 'docker.containers.cpu.usage', 'docker.containers.memory.bytes', 'docker.storage.bytes'] },
  kubernetes: { label: 'Kubernetes cluster health', metrics: ['k8s.nodes.ready', 'k8s.pods.running', 'k8s.pods.failed', 'k8s.pods.crashloop', 'k8s.workloads.degraded'] },
  databases: { label: 'Database performance', metrics: ['database.up', 'database.connections.active', 'database.connections.usage', 'database.cache.hit_ratio', 'database.queries.slow'] },
  api: { label: 'API availability', metrics: ['synthetic.up', 'synthetic.response.ms', 'synthetic.certificate.days'] },
  applications: { label: 'Application performance', metrics: ['application.requests.per_minute', 'application.error_rate', 'application.response.p95_ms', 'application.response.p99_ms'] },
  alerts: { label: 'Alert history', metrics: [] },
  incidents: { label: 'Incident history', metrics: [] },
};

function rangeLabel(from, to) {
  return `${new Date(from).toISOString().slice(0, 16).replace('T', ' ')} → ${new Date(to).toISOString().slice(0, 16).replace('T', ' ')}`;
}

class ReportGenerator {
  constructor({ config, store, logs = null, traces = null, alerts = null, incidents = null }) {
    this.config = config;
    this.store = store;
    this.logs = logs;
    this.traces = traces;
    this.alerts = alerts;
    this.incidents = incidents;
  }

  types() {
    return Object.entries(TYPES).map(([id, def]) => ({ id, label: def.label }));
  }

  generate(options = {}) {
    const type = TYPES[options.type] ? options.type : 'system';
    const to = Number(options.to) || Date.now();
    const from = Number(options.from) || to - 7 * 86400e3;
    const def = TYPES[type];
    const sections = [];
    if (def.metrics.length) {
      for (const name of def.metrics) {
        const result = this.store.query({ names: [name], from, to, step: Math.max(60000, Math.ceil((to - from) / 300)), aggregation: 'avg', limit: 100 });
        const rows = [];
        for (const series of result.series) {
          const values = series.points.map((point) => point[1]).filter((value) => Number.isFinite(value));
          if (!values.length) continue;
          const uptime = name.endsWith('.up')
            ? (values.filter((value) => value >= 1).length / values.length) * 100
            : null;
          rows.push({
            resource: series.resource,
            labels: series.labels,
            unit: series.unit,
            points: values.length,
            avg: aggregate(values, 'avg'),
            min: aggregate(values, 'min'),
            max: aggregate(values, 'max'),
            p95: quantile(values, 0.95),
            uptimePercent: uptime,
            last: values[values.length - 1],
          });
        }
        sections.push({ metric: name, unit: result.series[0]?.unit || '', rows: rows.sort((a, b) => (b.avg || 0) - (a.avg || 0)).slice(0, 100) });
      }
    }
    if (type === 'alerts' || type === 'incidents' || options.includeEvents === true) {
      sections.push({
        alerts: (this.config.get().alerts || []).filter((alert) => Date.parse(alert.startedAt) >= from && Date.parse(alert.startedAt) <= to).map((alert) => ({
          name: alert.name, severity: alert.severity, state: alert.state, resource: alert.resource,
          value: alert.value, startedAt: alert.startedAt, resolvedAt: alert.resolvedAt, acknowledged: Boolean(alert.acknowledgedAt),
        })),
        incidents: (this.config.get().incidents || []).filter((incident) => Date.parse(incident.createdAt) >= from && Date.parse(incident.createdAt) <= to).map((incident) => ({
          title: incident.title, severity: incident.severity, status: incident.status, assignee: incident.assignee,
          createdAt: incident.createdAt, resolvedAt: incident.resolvedAt, resources: incident.resources,
        })),
      });
    }
    if (this.logs) {
      const logStats = this.logs.stats();
      sections.push({ logs: { records: logStats.records, byLevel: logStats.byLevel, bySource: logStats.bySource, retentionDays: logStats.retentionDays } });
    }
    if (this.traces) {
      const traceStats = this.traces.stats();
      sections.push({ traces: { records: traceStats.records, retentionDays: traceStats.retentionDays, services: this.traces.services().slice(0, 30) } });
    }
    const report = {
      ok: true,
      id: `report-${Date.now().toString(36)}`,
      type,
      title: def.label,
      from,
      to,
      range: rangeLabel(from, to),
      generatedAt: new Date().toISOString(),
      sections,
      summary: {
        metrics: sections.filter((section) => section.metric).length,
        alerts: (this.config.get().alerts || []).filter((alert) => Date.parse(alert.startedAt) >= from && Date.parse(alert.startedAt) <= to).length,
        incidents: (this.config.get().incidents || []).filter((incident) => Date.parse(incident.createdAt) >= from && Date.parse(incident.createdAt) <= to).length,
      },
    };
    const format = String(options.format || 'json').toLowerCase();
    if (format === 'csv') {
      report.content = toCsv(report);
      report.mime = 'text/csv';
      report.filename = `opsdeck-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    } else if (format === 'pdf') {
      const pdf = buildPdf(report);
      report.content = pdf.toString('base64');
      report.encoding = 'base64';
      report.mime = 'application/pdf';
      report.filename = `opsdeck-${type}-${new Date().toISOString().slice(0, 10)}.pdf`;
    } else {
      report.content = JSON.stringify(report, null, 2);
      report.mime = 'application/json';
      report.filename = `opsdeck-${type}-${new Date().toISOString().slice(0, 10)}.json`;
    }
    report.bytes = Buffer.byteLength(report.content, report.encoding === 'base64' ? 'base64' : 'utf8');
    return report;
  }
}

function toCsv(report) {
  const lines = [`Report,${escapeCsv(report.title)}`, `Range,${escapeCsv(report.range)}`, `Generated,${report.generatedAt}`, ''];
  for (const section of report.sections) {
    if (section.metric) {
      lines.push(`Metric,${escapeCsv(section.metric)},Unit,${escapeCsv(section.unit)}`);
      lines.push('Resource,Avg,Min,Max,P95,Uptime %,Samples,Labels');
      for (const row of section.rows) {
        lines.push([
          escapeCsv(row.resource), fmt(row.avg), fmt(row.min), fmt(row.max), fmt(row.p95),
          row.uptimePercent == null ? '' : row.uptimePercent.toFixed(2),
          row.points, escapeCsv(JSON.stringify(row.labels || {})),
        ].join(','));
      }
      lines.push('');
    }
    if (section.alerts) {
      lines.push('Alerts');
      lines.push('Name,Severity,State,Resource,Value,Started,Resolved,Acknowledged');
      for (const alert of section.alerts) {
        lines.push([escapeCsv(alert.name), alert.severity, alert.state, escapeCsv(alert.resource), fmt(alert.value), alert.startedAt || '', alert.resolvedAt || '', alert.acknowledged].join(','));
      }
      lines.push('');
    }
    if (section.incidents) {
      lines.push('Incidents');
      lines.push('Title,Severity,Status,Assignee,Created,Resolved,Resources');
      for (const incident of section.incidents) {
        lines.push([escapeCsv(incident.title), incident.severity, incident.status, escapeCsv(incident.assignee), incident.createdAt || '', incident.resolvedAt || '', escapeCsv((incident.resources || []).join(' '))].join(','));
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function escapeCsv(value) {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function fmt(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '';
}

// ---------------------------------------------------------------- PDF writer

function escapePdf(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7e]/g, '?');
}

function buildPdf(report) {
  const lines = [];
  lines.push({ text: `OpsDeck — ${report.title}`, size: 18, gap: 10 });
  lines.push({ text: `Range: ${report.range}`, size: 10, gap: 4 });
  lines.push({ text: `Generated: ${report.generatedAt}`, size: 10, gap: 14 });
  for (const section of report.sections) {
    if (section.metric) {
      lines.push({ text: section.metric, size: 13, gap: 6 });
      lines.push({ text: 'Resource                         Avg        Min        Max        P95        Uptime', size: 8, gap: 3 });
      for (const row of section.rows.slice(0, 40)) {
        const resource = String(row.resource).slice(0, 30).padEnd(31);
        const uptime = row.uptimePercent == null ? '—' : `${row.uptimePercent.toFixed(1)}%`;
        lines.push({ text: `${resource}${fmt(row.avg).padStart(10)} ${fmt(row.min).padStart(10)} ${fmt(row.max).padStart(10)} ${fmt(row.p95).padStart(10)} ${uptime.padStart(10)}`, size: 7, gap: 2 });
      }
      lines.push({ text: '', size: 6, gap: 2 });
    }
    if (section.alerts?.length) {
      lines.push({ text: 'Alerts', size: 13, gap: 6 });
      for (const alert of section.alerts.slice(0, 60)) {
        lines.push({ text: `${String(alert.severity).toUpperCase().padEnd(9)} ${String(alert.state).padEnd(10)} ${alert.name} — ${alert.resource || ''}`, size: 8, gap: 2 });
      }
      lines.push({ text: '', size: 6, gap: 2 });
    }
    if (section.incidents?.length) {
      lines.push({ text: 'Incidents', size: 13, gap: 6 });
      for (const incident of section.incidents.slice(0, 60)) {
        lines.push({ text: `${String(incident.severity).toUpperCase().padEnd(9)} ${String(incident.status).padEnd(10)} ${incident.title}`, size: 8, gap: 2 });
      }
      lines.push({ text: '', size: 6, gap: 2 });
    }
  }
  lines.push({ text: 'Generated by OpsDeck Observability from locally collected data.', size: 8, gap: 0 });

  const pages = [];
  let current = [];
  let y = 800;
  for (const line of lines) {
    if (y < 50) { pages.push(current); current = []; y = 800; }
    if (line.text) current.push({ text: line.text, size: line.size, x: 40, y });
    y -= line.size + 3 + (line.gap || 0);
  }
  pages.push(current);

  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add('');
  const pagesObject = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  for (const content of pages) {
    const stream = content.map((line) => `BT /F1 ${line.size} Tf ${line.x} ${line.y} Td (${escapePdf(line.text)}) Tj ET`).join('\n');
    const streamId = add(`<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;

  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'utf8');
}

module.exports = { ReportGenerator, TYPES, buildPdf, toCsv };
