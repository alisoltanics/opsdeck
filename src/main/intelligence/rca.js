'use strict';

/**
 * Evidence-based incident investigation.
 *
 * The engine gathers what the collectors actually recorded around an alert or
 * incident, measures the change against the preceding window, and ranks
 * hypotheses. It never calls a hypothesis a confirmed root cause: each one
 * carries a confidence score and the evidence that produced it, and the report
 * always lists what could not be checked.
 */

const { clean, num, mean, stdev } = require('./util');

const CANDIDATE_METRICS = [
  { name: 'system.cpu.usage', label: 'Host CPU', unit: 'percent', high: true },
  { name: 'system.memory.usage', label: 'Host memory', unit: 'percent', high: true },
  { name: 'system.memory.pressure.avg10', label: 'Memory pressure', unit: 'percent', high: true },
  { name: 'system.disk.usage', label: 'Filesystem usage', unit: 'percent', high: true },
  { name: 'system.load.1', label: 'Load average', unit: '', high: true },
  { name: 'system.disk.latency_ms', label: 'Disk latency', unit: 'ms', high: true },
  { name: 'docker.containers.unhealthy', label: 'Unhealthy containers', unit: 'count', high: true },
  { name: 'docker.containers.restarts', label: 'Container restarts', unit: 'count', high: true },
  { name: 'docker.container.cpu.usage', label: 'Container CPU', unit: 'percent', high: true },
  { name: 'docker.container.memory.usage', label: 'Container memory', unit: 'percent', high: true },
  { name: 'docker.container.restarts', label: 'Container restart count', unit: 'count', high: true },
  { name: 'k8s.nodes.not_ready', label: 'Nodes not ready', unit: 'count', high: true },
  { name: 'k8s.pods.crashloop', label: 'CrashLoopBackOff pods', unit: 'count', high: true },
  { name: 'k8s.pods.oom_killed', label: 'OOMKilled pods', unit: 'count', high: true },
  { name: 'k8s.pods.pending', label: 'Pending pods', unit: 'count', high: true },
  { name: 'k8s.pods.failed', label: 'Failed pods', unit: 'count', high: true },
  { name: 'k8s.workloads.degraded', label: 'Degraded workloads', unit: 'count', high: true },
  { name: 'database.connections.down', label: 'Databases down', unit: 'count', high: true },
  { name: 'database.ops.persec', label: 'Database operations/s', unit: 'ops/s', high: false },
  { name: 'application.error_rate', label: 'Application error rate', unit: 'percent', high: true },
  { name: 'application.response.p95_ms', label: 'Application p95 latency', unit: 'ms', high: true },
  { name: 'application.response.avg_ms', label: 'Application average latency', unit: 'ms', high: true },
  { name: 'synthetic.targets.down', label: 'Synthetic targets down', unit: 'count', high: true },
  { name: 'network.checks.failed', label: 'Network checks failed', unit: 'count', high: true },
  { name: 'server.up', label: 'Server reachable', unit: 'boolean', high: false },
];

const ERROR_LEVELS = ['ERROR', 'FATAL', 'WARN'];

function windowOf(input = {}) {
  const now = Date.now();
  const start = Number.isFinite(Number(input.start)) ? Number(input.start) : now - 3600e3;
  const end = Number.isFinite(Number(input.end)) ? Number(input.end) : now;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function labelFor(series) {
  return series.resource || series.labels?.container || series.labels?.host || series.labels?.namespace || 'unknown';
}

function matchesScope(series, scope) {
  if (!scope) return true;
  const haystack = `${series.resource || ''} ${JSON.stringify(series.labels || {})}`.toLowerCase();
  return scope.toLowerCase().split(/[\s,]+/).filter(Boolean).some((token) => haystack.includes(token));
}

class RootCauseAnalyzer {
  constructor({ deps = {} }) {
    this.deps = deps;
  }

  async investigate(input = {}) {
    const startedAt = Date.now();
    const context = await this.resolve(input);
    if (!context || context.error) return { ok: false, error: context?.error || 'There is nothing to investigate.' };
    const scopeWindow = windowOf(context.window);
    const baselineMs = Math.max(10 * 60e3, Math.min(3 * 3600e3, (scopeWindow.end - scopeWindow.start) || 3600e3));
    const facts = [];
    const hypotheses = [];
    const limitations = [];
    const evidence = { alerts: [], incidents: [], changes: [], metrics: [], logs: [], traces: [], resources: [] };

    if (context.alert) {
      facts.push(`Alert “${context.alert.name}” is ${context.alert.state || 'firing'} with ${context.alert.severity || 'unknown'} severity.`);
      if (context.alert.value != null) {
        facts.push(`Measured value ${context.alert.value}${context.alert.unit ? ` ${context.alert.unit}` : ''} against threshold ${context.alert.threshold ?? '—'} (${context.alert.operator || '>'}).`);
      }
      if (context.alert.startedAt) facts.push(`Alert started at ${new Date(context.alert.startedAt).toISOString()}.`);
    } else if (context.incident) {
      facts.push(`Incident “${context.incident.title}” is ${context.incident.status} with ${context.incident.severity} severity.`);
      (context.incident.timeline || []).slice(-8).forEach((entry) => {
        if (entry.text) facts.push(`${new Date(entry.at).toISOString()}: ${entry.text}`);
      });
    } else {
      facts.push(`Investigation window starts at ${new Date(scopeWindow.start).toISOString()}.`);
    }

    // Alerts and incidents in the same window. Correlation is evidence, not a
    // conclusion: two alerts can share a cause or be unrelated.
    const alertsResult = this.deps.listAlerts ? await this.deps.listAlerts({ limit: 200 }) : { items: [] };
    const relatedAlerts = (alertsResult.items || []).filter((alert) => {
      const at = Date.parse(alert.startedAt || alert.updatedAt || '');
      if (Number.isFinite(at) && at < scopeWindow.start - baselineMs) return false;
      if (context.alert && alert.id === context.alert.id) return false;
      return !context.scope || matchesScope({ resource: `${alert.resource} ${alert.name}`, labels: alert.labels }, context.scope);
    });
    evidence.alerts = relatedAlerts.slice(0, 12).map((alert) => ({
      id: alert.id, name: alert.name, severity: alert.severity, state: alert.state,
      resource: alert.resource, at: alert.startedAt,
    }));
    if (relatedAlerts.length) {
      facts.push(`${relatedAlerts.length} other alert(s) fired in or near the same window.`);
      hypotheses.push({
        title: 'Correlated alerts point to a shared dependency',
        confidence: Math.min(0.72, 0.35 + relatedAlerts.length * 0.08),
        evidence: relatedAlerts.slice(0, 6).map((alert) => `${alert.name} · ${alert.resource || 'resource'} · ${alert.severity}`),
        actions: ['Compare the start times of the related alerts in the incident timeline.', 'Inspect the shared host/network/dependency listed by the graph.'],
      });
    }

    const incidentsResult = this.deps.listIncidents ? await this.deps.listIncidents({ limit: 100 }) : { items: [] };
    const relatedIncidents = (incidentsResult.items || []).filter((incident) => {
      if (context.incident && incident.id === context.incident.id) return false;
      const at = Date.parse(incident.createdAt || incident.updatedAt || '');
      if (Number.isFinite(at) && at < scopeWindow.start - baselineMs) return false;
      return !context.scope || matchesScope({ resource: `${(incident.resources || []).join(' ')} ${(incident.services || []).join(' ')} ${incident.title}`, labels: {} }, context.scope);
    });
    evidence.incidents = relatedIncidents.slice(0, 8).map((incident) => ({
      id: incident.id, title: incident.title, severity: incident.severity, status: incident.status, at: incident.createdAt,
    }));

    // Changes just before the window are the strongest "what changed" signal.
    const changeResult = this.deps.changes ? this.deps.changes({ limit: 300 }) : { items: [] };
    const changes = (changeResult.items || []).filter((change) => {
      const at = Date.parse(change.at || '');
      return Number.isFinite(at) && at >= scopeWindow.start - 60 * 60e3 && at <= scopeWindow.end + 60e3;
    });
    evidence.changes = changes.slice(0, 20);
    if (changes.length) {
      const recent = changes.filter((change) => Date.parse(change.at) >= scopeWindow.start - 30 * 60e3);
      facts.push(`${changes.length} infrastructure change(s) were recorded in the surrounding hour${recent.length ? `, ${recent.length} within 30 minutes of the start` : ''}.`);
      const ranked = recent.length ? recent : changes;
      hypotheses.push({
        title: 'A recent infrastructure change may have triggered the incident',
        confidence: Math.min(0.7, 0.4 + Math.min(0.25, ranked.length * 0.05) + (recent.length ? 0.05 : 0)),
        evidence: ranked.slice(0, 8).map((change) => `${new Date(change.at).toISOString()} · ${change.title}`),
        actions: ['Open the change record and compare the previous and current configuration.', 'If the change is recent and the incident started afterwards, review the rollback path.'],
      });
    }

    // Metric comparison: during window vs the equal-length window before it.
    if (this.deps.queryMetrics) {
      for (const candidate of CANDIDATE_METRICS) {
        let result;
        try {
          result = await this.deps.queryMetrics({
            names: [candidate.name],
            from: scopeWindow.start - baselineMs,
            to: scopeWindow.end,
            aggregation: 'avg',
            limit: 200,
          });
        } catch { continue; }
        if (!result?.ok) continue;
        for (const series of result.series || []) {
          const before = [];
          const during = [];
          for (const point of series.points || []) {
            if (point[0] < scopeWindow.start) before.push(point[1]);
            else during.push(point[1]);
          }
          if (during.length < 2) continue;
          if (context.scope && !matchesScope(series, context.scope) && !context.broad) continue;
          const duringAvg = mean(during);
          const beforeAvg = before.length >= 2 ? mean(before) : null;
          const sd = before.length >= 3 ? stdev(before) : 0;
          const z = sd > 0 && beforeAvg != null ? (duringAvg - beforeAvg) / sd : null;
          const deltaPct = beforeAvg != null && beforeAvg !== 0 ? ((duringAvg - beforeAvg) / Math.abs(beforeAvg)) * 100 : null;
          const noteworthy = (z != null && Math.abs(z) >= 2)
            || (deltaPct != null && Math.abs(deltaPct) >= 25)
            || (candidate.high && duringAvg >= (series.unit === 'percent' ? 85 : Number.POSITIVE_INFINITY));
          if (!noteworthy) continue;
          evidence.metrics.push({
            name: candidate.name, label: candidate.label, unit: series.unit || candidate.unit,
            resource: labelFor(series), labels: series.labels,
            before: beforeAvg == null ? null : Number(beforeAvg.toFixed(3)),
            during: Number(duringAvg.toFixed(3)),
            deltaPercent: deltaPct == null ? null : Number(deltaPct.toFixed(1)),
            zScore: z == null ? null : Number(z.toFixed(2)),
            samples: during.length,
          });
        }
      }
    }
    if (evidence.metrics.length) {
      const top = evidence.metrics
        .slice()
        .sort((a, b) => Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0) || Math.abs(b.deltaPercent ?? 0) - Math.abs(a.deltaPercent ?? 0))
        .slice(0, 3);
      for (const metric of top) {
        const worsening = (metric.zScore ?? 0) > 0 || (metric.deltaPercent ?? 0) > 0;
        facts.push(`${metric.label} on ${metric.resource} moved from ${metric.before ?? 'no baseline'} to ${metric.during}${metric.unit ? ` ${metric.unit}` : ''}${metric.deltaPercent == null ? '' : ` (${metric.deltaPercent > 0 ? '+' : ''}${metric.deltaPercent}%)`}.`);
        if (worsening) {
          hypotheses.push({
            title: `${metric.label} saturation on ${metric.resource}`,
            confidence: Math.min(0.82, 0.42 + Math.min(0.25, Math.abs(metric.zScore ?? 0) / 15) + Math.min(0.12, Math.abs(metric.deltaPercent ?? 0) / 500)),
            evidence: [
              `During: ${metric.during}${metric.unit ? ` ${metric.unit}` : ''}`,
              metric.before == null ? 'No usable baseline before the window.' : `Baseline: ${metric.before}${metric.unit ? ` ${metric.unit}` : ''}`,
              metric.zScore == null ? '' : `Change is ${metric.zScore} standard deviations from the baseline.`,
            ].filter(Boolean),
            actions: [
              `Open the relevant module and inspect ${metric.resource}.`,
              'Check whether the increase aligns with a deployment or a traffic shift.',
              'Compare the resource limit with current usage before changing capacity.',
            ],
          });
        }
      }
    } else {
      limitations.push('No metric moved significantly in the comparison window, or the scope filter removed every series.');
    }

    // Error logs: count and sample.
    if (this.deps.queryLogs && context.scope) {
      for (const term of [context.scope, context.alert?.resource, context.incident?.services?.[0]].filter(Boolean).slice(0, 2)) {
        let result;
        try {
          result = await this.deps.queryLogs({ from: scopeWindow.start, to: scopeWindow.end, search: term, levels: ERROR_LEVELS, limit: 60 });
        } catch { continue; }
        if (!result?.ok || !result.rows?.length) continue;
        evidence.logs.push(...result.rows.slice(0, 12).map((row) => ({
          at: new Date(row.timestamp).toISOString(),
          level: row.level,
          service: row.service,
          text: clean(row.text, 400),
        })));
      }
      if (evidence.logs.length) {
        const services = [...new Set(evidence.logs.map((row) => row.service).filter(Boolean))];
        facts.push(`${evidence.logs.length} warning/error log record(s) matched the affected scope${services.length ? ` (${services.slice(0, 4).join(', ')})` : ''}.`);
        hypotheses.push({
          title: 'Application or system errors are contributing to the incident',
          confidence: Math.min(0.6, 0.3 + evidence.logs.length * 0.02),
          evidence: evidence.logs.slice(0, 6).map((row) => `${row.level} ${row.service || 'log'}: ${row.text.slice(0, 200)}`),
          actions: ['Open Logs filtered to the affected service and window.', 'Look for the first error rather than the most frequent one; the first often carries the cause.'],
        });
      }
    }

    // Trace errors and latency.
    if (this.deps.queryTraces) {
      try {
        const result = await this.deps.queryTraces({
          from: scopeWindow.start, to: scopeWindow.end,
          service: context.service || '',
          errors: true,
          limit: 50,
        });
        if (result?.ok && result.rows?.length) {
          evidence.traces = result.rows.slice(0, 10).map((trace) => ({
            traceId: trace.traceId, name: trace.name, service: trace.service,
            services: trace.services, durationMs: trace.durationMs, errors: trace.errors, at: trace.startTime,
          }));
          facts.push(`${result.rows.length} trace(s) with errors were recorded in the window.`);
          hypotheses.push({
            title: 'A failing service dependency is propagating errors',
            confidence: Math.min(0.65, 0.32 + result.rows.length * 0.02),
            evidence: result.rows.slice(0, 5).map((trace) => `${trace.name} via ${trace.services.join(' → ')} (${trace.durationMs} ms, ${trace.errors} error span(s))`),
            actions: ['Open the trace and find the deepest error span.', 'Compare the failing dependency with the service dependency graph.'],
          });
        }
      } catch { /* traces are optional */ }
    }

    // Resource state.
    if (this.deps.resources) {
      const resources = await this.deps.resources();
      const tokens = (context.scope || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
      const related = tokens.length
        ? resources.filter((resource) => {
          const haystack = `${resource.name} ${resource.namespace} ${resource.host} ${JSON.stringify(resource.labels || {})}`.toLowerCase();
          return tokens.some((token) => haystack.includes(token));
        })
        : [];
      evidence.resources = related.slice(0, 20).map((resource) => ({
        id: resource.id, name: resource.name, module: resource.module, kind: resource.kind,
        status: resource.status, detail: resource.statusDetail, environment: resource.environment,
      }));
      const unhealthy = related.filter((resource) => ['unhealthy', 'degraded', 'stopped'].includes(resource.status));
      if (unhealthy.length) {
        facts.push(`${unhealthy.length} related resource(s) are not healthy: ${unhealthy.slice(0, 4).map((resource) => `${resource.kind}/${resource.name} (${resource.status})`).join(', ')}.`);
        hypotheses.push({
          title: 'The affected resource or a direct dependency is unhealthy',
          confidence: Math.min(0.8, 0.45 + unhealthy.length * 0.06),
          evidence: unhealthy.slice(0, 8).map((resource) => `${resource.kind}/${resource.name}: ${resource.statusDetail || resource.status}`),
          actions: ['Open the resource in its module and check recent events.', 'Use the infrastructure graph to inspect dependencies and single points of failure.'],
        });
      }
    }

    // Sort hypotheses by confidence and keep the strongest explanations.
    hypotheses.sort((a, b) => b.confidence - a.confidence);
    const unique = [];
    const seen = new Set();
    for (const hypothesis of hypotheses) {
      if (seen.has(hypothesis.title)) continue;
      seen.add(hypothesis.title);
      unique.push({
        ...hypothesis,
        confidence: Number(hypothesis.confidence.toFixed(2)),
        label: hypothesis.confidence >= 0.65 ? 'high' : hypothesis.confidence >= 0.4 ? 'medium' : 'low',
        confirmed: false,
      });
    }
    const timeline = [
      ...evidence.alerts.map((entry) => ({ at: entry.at, module: 'observability', title: `Alert: ${entry.name}`, detail: entry.resource })),
      ...evidence.changes.map((entry) => ({ at: entry.at, module: entry.module || 'intelligence', title: entry.title, detail: entry.detail })),
      ...evidence.logs.map((entry) => ({ at: entry.at, module: 'observability', title: `${entry.level} ${entry.service || 'log'}`, detail: entry.text.slice(0, 240) })),
      ...evidence.traces.map((entry) => ({ at: entry.at, module: 'observability', title: `Trace: ${entry.name}`, detail: `${entry.durationMs} ms · ${entry.errors} error span(s)` })),
    ].filter((entry) => Date.parse(entry.at)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 60);

    if (!this.deps.queryMetrics) limitations.push('The metrics store was not available, so saturation could not be measured.');
    if (!this.deps.queryLogs) limitations.push('Log search was not available.');
    if (!this.deps.queryTraces) limitations.push('Trace search was not available.');
    if (!evidence.logs.length) limitations.push('No matching warning/error logs were retained for this window.');
    if (!evidence.changes.length) limitations.push('No infrastructure change was recorded near the incident window; changes made outside OpsDeck are not visible.');

    return {
      ok: true,
      id: `rca-${Date.now().toString(36)}`,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      scope: context.scope,
      window: { from: new Date(scopeWindow.start).toISOString(), to: new Date(scopeWindow.end).toISOString(), baselineMinutes: Math.round(baselineMs / 60e3) },
      subject: {
        type: context.alert ? 'alert' : context.incident ? 'incident' : 'manual',
        id: context.alert?.id || context.incident?.id || '',
        title: context.alert?.name || context.incident?.title || context.scope || 'Investigation',
      },
      summary: unique.length
        ? `${unique[0].label === 'high' ? 'Strongest' : 'Most likely'} explanation: ${unique[0].title}. It is a hypothesis supported by ${unique[0].evidence.length} piece(s) of evidence, not a confirmed root cause.`
        : 'No explanation could be ranked from the available evidence. Collect more metrics, logs or traces, or widen the window.',
      facts,
      hypotheses: unique.slice(0, 5),
      affected: {
        resources: evidence.resources,
        alerts: evidence.alerts,
        incidents: evidence.incidents,
        services: [...new Set([
          ...(context.incident?.services || []),
          ...evidence.traces.flatMap((trace) => trace.services || []),
          ...evidence.logs.map((row) => row.service).filter(Boolean),
        ])].slice(0, 20),
      },
      evidence,
      timeline,
      limitations,
      recommendedSteps: unique.slice(0, 2).flatMap((hypothesis) => hypothesis.actions).slice(0, 6),
      readOnly: true,
    };
  }

  async resolve(input = {}) {
    let alert = null;
    let incident = null;
    let scope = clean(input.scope || input.service || input.resource, 240);
    let window = { start: Number(input.from) || undefined, end: Number(input.to) || undefined };
    if (input.alertId && this.deps.listAlerts) {
      const result = await this.deps.listAlerts({ limit: 500 });
      alert = (result.items || []).find((entry) => entry.id === input.alertId) || null;
      if (!alert) return { error: 'That alert is no longer in the retention window.' };
      scope = scope || alert.resource || alert.labels?.service || '';
      window = {
        start: Date.parse(alert.startedAt || '') || Date.now() - 3600e3,
        end: Date.now(),
      };
    } else if (input.incidentId && this.deps.getIncident) {
      const result = await this.deps.getIncident(input.incidentId);
      incident = result?.incident || null;
      if (!incident) return { error: 'That incident does not exist.' };
      scope = scope || (incident.resources || []).join(' ') || (incident.services || []).join(' ');
      window = {
        start: Date.parse(incident.createdAt || '') || Date.now() - 3600e3,
        end: Date.now(),
      };
    }
    if (!alert && !incident && !scope) return { error: 'Choose an alert, incident or resource to investigate.' };
    if (!window.start) window.start = Date.now() - 3600e3;
    if (!window.end) window.end = Date.now();
    return { alert, incident, scope, window, broad: Boolean(input.broad) };
  }
}

module.exports = { RootCauseAnalyzer, CANDIDATE_METRICS, __test: { matchesScope, windowOf } };
