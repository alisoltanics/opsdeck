'use strict';

const { text, code, callout, table, diagram, steps, list, q, quiz, ex, lesson, mod, course, docs, ref } = require('./helpers');

const courses = [];

// ─────────────────────────────────────────────────────────────
// 16. Docker Production Best Practices
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-production', 16, 'Docker Production Best Practices', 'Operating containers beyond a laptop', 'Advanced', '2h 05m', 'rocket', 'green',
  'Production is a set of promises: reproducible artifacts, graceful failure, observable behaviour, safe configuration and tested recovery. This course turns Docker knowledge into operational discipline.',
  ['Apply twelve-factor and immutable-image principles', 'Run a production-grade Compose deployment', 'Design for zero-downtime updates', 'Instrument, back up and recover a service'],
  [
    mod('production-readiness', 'Readiness', 'What "production-ready" actually means.', [
      lesson('production-readiness', 'Production readiness checklist', '12 min',
        'The non-negotiables that separate a demo from a service you can operate.',
        ['Evaluate an image and Compose stack against a readiness checklist', 'Design graceful shutdown and startup', 'Remove environment coupling from images'],
        [
          text('Immutable artifacts, mutable configuration', 'Build once and promote the same image. Configuration comes from the environment, mounted files or a secret store. The image should not know whether it is in staging or production.\n\nA production service must start without manual steps, expose a readiness signal, log to stdout, handle SIGTERM, bound its resource use, and fail safely when dependencies are unavailable.'),
          table(['Area', 'Requirement'], [
            ['Artifact', 'Pinned base, immutable tag/digest, SBOM/scan'], ['Config', 'Environment/secrets, no baked values'],
            ['Process', 'PID 1 signal handling, graceful shutdown'], ['Health', 'Readiness + liveness with sensible timings'],
            ['Resources', 'CPU/memory/PID limits and expectations'], ['Observability', 'Structured logs, metrics, traces'],
            ['Data', 'Named volumes, tested backup/restore'], ['Security', 'Non-root, read-only, dropped caps'],
          ]),
          code('dockerfile', `# Graceful shutdown requires exec form and a signal-aware app
ENTRYPOINT ["node", "dist/server.js"]
STOPSIGNAL SIGTERM`, {
            note: 'Node, Go, Python and Java all need explicit SIGTERM handling. Docker sends SIGTERM, then SIGKILL after the grace period.',
          }),
          code('yaml', `services:
  api:
    image: registry.example.com/acme/api@sha256:...
    read_only: true
    tmpfs: ["/tmp"]
    user: "10001:10001"
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    stop_grace_period: 30s
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 15s
      timeout: 3s
      retries: 3
      start_period: 20s`, {
            note: 'A production Compose service should read like a policy document.',
          }),
          callout('warning', 'Do not run a demo stack in production', 'The default bridge network, no resource limits, `latest`, root user and no health checks are acceptable for a demo and unacceptable for a service.'),
        ],
        {
          quiz: quiz([
            q('What should change between staging and production?', ['The image', 'Configuration and secrets', 'The base image', 'The application code'], 1, 'The artifact stays identical; configuration changes.'),
            q('Why is exec-form ENTRYPOINT important in production?', ['Smaller image', 'Signals reach the application process', 'It enables TLS', 'It sets the user'], 1, 'Exec form avoids a shell masking PID 1 signals.'),
            q('Which is a production requirement for data?', ['Bind mount to /tmp', 'Tested backup and restore', 'No volumes', 'Root-owned files'], 1, 'Untested backups are not a recovery plan.'),
          ]),
          exercises: [
            ex('Checklist audit', 'Audit a compose service against five readiness areas.', 'Check image pinning, config, resources, health and security.'),
            ex('Graceful shutdown', 'Add a 30s stop grace period and a SIGTERM handler plan.', 'stop_grace_period: 30s plus app-level SIGTERM handling.'),
          ],
          related: ['production-compose', 'zero-downtime', 'production-observability'],
          tags: ['production', 'operations'],
          commands: ['docker compose', 'docker run'],
          sources: [docs('Production', 'production/'), docs('Best practices', 'build/building/best-practices/')],
        }),
      lesson('production-compose', 'Production Compose', '12 min',
        'A disciplined single-host deployment: pinned images, explicit policy, secrets, logging and resource limits.',
        ['Write a production Compose file and override', 'Pin images and control pull behaviour', 'Apply restart, logging and resource policy'],
        [
          text('One host, explicit policy', 'Compose is a legitimate production tool for single-host or small deployments when you accept its limits: no rescheduling, no multi-node failover, manual rolling updates. Write policy explicitly instead of relying on defaults.'),
          code('yaml', `name: acme
services:
  api:
    image: registry.example.com/acme/api:1.4.0
    pull_policy: always
    restart: unless-stopped
    ports: ["127.0.0.1:3000:3000"]
    env_file: [.env.production]
    secrets: [db_password]
    read_only: true
    tmpfs: ["/tmp"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    stop_grace_period: 30s
    deploy:
      resources:
        limits: { cpus: "1.5", memory: 512M }
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 15s
    depends_on:
      db: { condition: service_healthy }

  db:
    image: postgres:16.4-alpine
    restart: unless-stopped
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s

secrets:
  db_password:
    file: /etc/acme/db_password
volumes:
  pgdata:
    name: acme_pgdata`, {
            note: 'Compose supports `deploy.resources.limits` on a single host even without Swarm.',
          }),
          code('bash', `docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d --wait
docker compose -f compose.yaml ps`, {
            note: 'Run from a versioned deployment directory, not from a developer checkout.',
          }),
          callout('danger', 'Compose does not reschedule', 'If the host dies, the service is down until you intervene. For HA, use an orchestrator or a managed platform.'),
        ],
        {
          quiz: quiz([
            q('Which Compose setting controls image pull behaviour?', ['pull_policy', 'image_pull', 'update', 'refresh'], 0, 'pull_policy controls when Compose pulls.'),
            q('What does deploy.resources.limits work on?', ['Only Swarm', 'Single-host Compose too', 'Only Kubernetes', 'Only Windows'], 1, 'Modern Compose supports it locally.'),
            q('What is the main limitation of Compose in production?', ['No networking', 'No multi-node scheduling/failover', 'No volumes', 'No logs'], 1, 'It is single-host and does not reschedule.'),
          ]),
          exercises: [
            ex('Pin and cap', 'Pin an image to a version and add a 512 MB memory limit.', 'image: repo/app:1.4.0 and deploy.resources.limits.memory: 512M.'),
            ex('Validate', 'Validate a production Compose file in CI.', 'docker compose -f compose.yaml config --quiet'),
          ],
          related: ['production-readiness', 'zero-downtime', 'compose-profiles-production'],
          tags: ['production', 'compose'],
          commands: ['docker compose up', 'docker compose config'],
          sources: [docs('Compose in production', 'compose/how-tos/production/'), docs('Compose file', 'compose/compose-file/')],
        }),
      lesson('zero-downtime', 'Zero-downtime updates', '12 min',
        'Rolling a service without dropping requests requires draining, health checks and a proxy that understands readiness.',
        ['Design a safe update sequence', 'Drain connections before stopping', 'Handle database migrations without breaking old code'],
        [
          text('The update sequence', 'Start the new version, wait until it is healthy, add it to the proxy, then drain and stop the old version. Compose on a single host cannot do this for a published port by itself; put a reverse proxy in front and use two instances or an orchestrator.\n\nMigrations must be backward compatible: add columns before code needs them, deploy code that writes both shapes, then remove the old shape. A destructive migration in the same release as the code is a downtime guarantee.'),
          steps([
            { title: 'Build and push', body: 'Produce an immutable image and digest.' },
            { title: 'Start alongside', body: 'Run the new container on a different internal port.' },
            { title: 'Wait for readiness', body: 'Poll the readiness endpoint, not just the port.' },
            { title: 'Shift traffic', body: 'Update the proxy upstream and reload gracefully.' },
            { title: 'Drain and stop', body: 'Stop accepting new connections, wait for in-flight requests, then stop the old container.' },
          ]),
          code('yaml', `# Caddy upstream switch (conceptual)
reverse_proxy /api/* api-blue:3000 api-green:3000 {
  lb_policy first
  health_uri /health/ready
  health_interval 5s
  fail_duration 30s
}`, {
            note: 'In Compose, changing the proxy config and reloading is often the practical traffic switch. Swarm/Kubernetes automate this.',
          }),
          callout('warning', 'A health check that only tests port 3000 is not readiness', 'Check dependencies and warm-up state; otherwise traffic arrives before the app can serve it.'),
        ],
        {
          quiz: quiz([
            q('What is the correct point to send traffic to a new container?', ['Immediately after start', 'After readiness passes', 'After it logs a request', 'After 60 seconds always'], 1, 'Readiness proves it can serve.'),
            q('Why must migrations be backward compatible?', ['Old and new code run simultaneously', 'Databases cannot be migrated', 'Docker caches schemas', 'It reduces disk'], 0, 'During rollout both versions may run.'),
            q('Can Compose alone do zero-downtime on one published port?', ['Yes', 'No, a proxy/orchestrator is needed', 'Only with Swarm', 'Only with host networking'], 1, 'A single published port cannot overlap old and new containers.'),
          ]),
          exercises: [
            ex('Blue/green plan', 'Describe a blue/green update for a Compose service behind Caddy.', 'Run green on a new internal port, wait healthy, switch upstream, drain blue.'),
            ex('Safe migration', 'Write the three-step expand/contract migration sequence.', 'Add new column nullable → deploy dual-write/read → remove old column later.'),
          ],
          related: ['production-compose', 'compose-health-dependencies', 'production-backup'],
          tags: ['production', 'deployment'],
          commands: ['docker compose', 'docker build'],
          sources: [docs('Compose production', 'compose/how-tos/production/'), docs('Deployment', 'get-started/deployment/')],
        }),
      lesson('production-observability', 'Observability and SLOs', '11 min',
        'Logs, metrics and traces are not decoration. They are how you know whether the service is keeping its promises.',
        ['Define SLIs and SLOs for a container service', 'Structure logs for querying', 'Correlate metrics, logs and traces'],
        [
          text('Start from user-visible behaviour', 'An SLI is a measured signal (request success rate, latency, saturation). An SLO is a target over a window. Dashboards should answer: are users succeeding, and how fast? Container CPU is a supporting signal, not the goal.\n\nUse structured JSON logs with request IDs, stable metric names and trace propagation. Keep high-cardinality data out of metric labels.'),
          table(['Signal', 'Use', 'Tool'], [
            ['Logs', 'Discrete events and errors', 'stdout → Loki/ELK/cloud'], ['Metrics', 'Aggregates and alerting', 'Prometheus/OTLP'],
            ['Traces', 'Request path across services', 'OTel/Jaeger/Tempo'], ['Health', 'Readiness/liveness', 'Docker health checks'],
          ]),
          code('json', `{"level":"error","ts":"2026-01-01T12:00:00Z","service":"api","requestId":"abc","route":"/orders","status":500,"durationMs":42,"error":"db_timeout"}`, {
            note: 'One line per event. Do not log secrets or request bodies by default.',
          }),
          callout('tip', 'Alert on symptoms, page on burn rate', 'A page for every CPU spike destroys trust. Alert when the error budget is burning or a user-visible SLO is at risk.'),
        ],
        {
          quiz: quiz([
            q('What is an SLO?', ['A server limit', 'A target for a measured service-level indicator', 'A logging driver', 'A storage class'], 1, 'It is an objective for reliability.'),
            q('Which label is dangerous in metrics?', ['service', 'status', 'request_id', 'region'], 2, 'High-cardinality IDs explode time-series storage.'),
            q('What should logs contain?', ['Structured fields and request IDs', 'Secrets', 'Full request bodies always', 'Only free text'], 0, 'Structured logs are queryable and correlatable.'),
          ]),
          exercises: [
            ex('Define an SLI', 'Define success rate and p95 latency SLIs for an HTTP API.', 'successful_requests/total_requests; p95 latency over a window.'),
            ex('Structured log', 'Write one JSON log line for a failed request.', 'Include level, ts, service, requestId, route, status, durationMs, error.'),
          ],
          related: ['monitoring-stack', 'production-readiness', 'healthchecks'],
          tags: ['production', 'observability'],
          commands: ['docker logs', 'docker stats'],
          sources: [docs('Observability', 'config/containers/logging/'), docs('Prometheus', 'https://prometheus.io/docs/')],
        }),
      lesson('production-backup', 'Backup, restore and disaster recovery', '11 min',
        'The recovery plan is the product. Everything else is a backup you hope works.',
        ['Design backups for data and configuration', 'Test restore procedures', 'Define RPO/RTO and retention'],
        [
          text('What must be recoverable', 'Application data (volumes or database dumps), secrets/configuration, the Compose files and deployment metadata, and the exact image digests. Without the digest you cannot reproduce the running artifact after a registry change.\n\nDefine RPO (how much data you can lose) and RTO (how long recovery may take). Backup frequency follows RPO; restore drills validate RTO.'),
          code('bash', `# Database-consistent backup
docker compose exec -T db pg_dump -U app -d app \\
  | gzip > "backups/app-$(date +%Y%m%d-%H%M).sql.gz"

# Volume backup for non-database state
docker run --rm -v acme_pgdata:/data:ro -v "$PWD/backups":/backup \\
  alpine tar czf /backup/pgdata-$(date +%Y%m%d).tgz -C /data .

# Restore drill into a throwaway database
gunzip -c backups/app-20260101.sql.gz | docker compose exec -T db psql -U app -d app_restore`, {
            note: '`-T` disables TTY allocation so the pipeline works in scripts.',
          }),
          table(['Asset', 'Method', 'Frequency'], [
            ['Database', 'Native dump / snapshot', 'Per RPO'], ['Volumes', 'tar or storage snapshot', 'Per RPO'],
            ['Compose/config', 'Version control', 'Every change'], ['Secrets', 'Secret manager export/escrow', 'On rotation'],
            ['Images', 'Registry retention + digest record', 'Every release'],
          ]),
          callout('danger', 'A backup stored on the same host is not disaster recovery', 'Replicate off-host and test a restore that does not depend on the failed machine.'),
        ],
        {
          quiz: quiz([
            q('What does RPO measure?', ['Recovery time', 'Acceptable data loss window', 'Backup size', 'Retention days'], 1, 'Recovery point objective.'),
            q('Why record image digests?', ['To reduce size', 'To reproduce the exact artifact later', 'To enable DNS', 'To speed builds'], 1, 'Tags move; digests pin content.'),
            q('What validates a backup?', ['Its file size', 'A tested restore', 'Its timestamp', 'Compression ratio'], 1, 'Only a restore proves recoverability.'),
          ]),
          exercises: [
            ex('Backup script', 'Write a pg_dump backup piped to gzip with a timestamp.', 'docker compose exec -T db pg_dump ... | gzip > backups/app-DATE.sql.gz'),
            ex('Restore drill', 'Restore into a separate database and run a sanity query.', 'psql -d app_restore then SELECT count(*) from a core table.'),
          ],
          related: ['volume-backup', 'production-readiness', 'system-maintenance'],
          tags: ['production', 'backup'],
          commands: ['docker compose exec', 'docker run'],
          sources: [docs('Volumes backup', 'engine/storage/volumes/'), docs('Postgres backup', 'https://www.postgresql.org/docs/current/backup.html')],
        }),
    ]),
  ],
  ['docker-compose', 'docker-security'],
));

// ─────────────────────────────────────────────────────────────
// 17. Advanced Docker Administration
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'daemon-config', 17, 'Advanced Docker Administration', 'Engine configuration, contexts, maintenance and upgrades', 'Advanced', '1h 35m', 'server-cog', 'slate',
  'Administer the engine itself: daemon configuration, remote contexts, storage layout, upgrades and routine maintenance.',
  ['Configure the daemon safely', 'Manage remote engines with contexts', 'Plan storage, upgrades and maintenance windows', 'Apply rootless and hardening options'],
  [
    mod('engine-admin', 'Engine administration', 'The host-level concerns.', [
      lesson('daemon-config', 'Daemon configuration and storage', '12 min',
        'daemon.json, data-root, live-restore, metrics and safe reloads.',
        ['Configure daemon.json correctly', 'Move the Docker data root safely', 'Use live-restore during upgrades'],
        [
          text('One configuration file', 'On Linux, the daemon reads `/etc/docker/daemon.json` (or the path in the systemd unit). Changes require a reload or restart; validate first. `live-restore` keeps containers running while the daemon restarts, which reduces the impact of upgrades on workloads that tolerate a brief control-plane gap.'),
          code('json', `{
  "data-root": "/var/lib/docker",
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "metrics-addr": "127.0.0.1:9323",
  "icc": false,
  "no-new-privileges": true,
  "default-address-pools": [
    { "base": "172.30.0.0/16", "size": 24 }
  ]
}`, {
            note: 'Put metrics on loopback unless Prometheus runs on another host and the network is protected.',
          }),
          code('bash', `sudo dockerd --validate --config-file /etc/docker/daemon.json
sudo systemctl reload docker

# Storage usage by category
docker system df -v
du -sh /var/lib/docker/* | sort -h`, {
            note: 'A reload applies supported options; some require a full restart. Check the docs for each key.',
          }),
          callout('danger', 'Changing data-root with containers running', 'Stop the daemon and workloads, move the directory preserving ownership, update the config, then start. Never copy a live store.'),
        ],
        {
          quiz: quiz([
            q('What does live-restore do?', ['Restarts containers', 'Keeps containers running while the daemon restarts', 'Backs up volumes', 'Enables TLS'], 1, 'It reduces upgrade disruption.'),
            q('How do you validate daemon.json before restarting?', ['dockerd --validate --config-file', 'docker info', 'docker compose config', 'jq'], 0, 'The daemon can validate the file.'),
            q('Which setting changes where images and containers are stored?', ['data-root', 'storage-driver', 'log-driver', 'metrics-addr'], 0, 'data-root is the Docker root directory.'),
          ]),
          exercises: [
            ex('Validate', 'Validate a daemon.json on a Linux host.', 'sudo dockerd --validate --config-file /etc/docker/daemon.json'),
            ex('Metrics', 'Expose daemon metrics on loopback:9323.', 'Add metrics-addr 127.0.0.1:9323 and reload.'),
          ],
          related: ['daemon-security', 'system-maintenance', 'monitoring-stack'],
          tags: ['administration', 'daemon'],
          commands: ['docker info', 'docker system df'],
          sources: [docs('Daemon configuration', 'reference/cli/dockerd/'), docs('Live restore', 'config/containers/live-restore/')],
        }),
      lesson('contexts', 'Contexts and remote engines', '10 min',
        'Switch between local, SSH and remote engines without changing your workflow.',
        ['Create and use Docker contexts', 'Connect over SSH safely', 'Understand DOCKER_HOST precedence'],
        [
          text('A context is a named endpoint', 'A context stores a daemon endpoint, TLS material and metadata. `docker context use` changes the active endpoint for all subsequent commands. SSH contexts are the safest way to reach a remote engine: they use your existing SSH identity and do not expose a TCP port.'),
          code('bash', `docker context ls
docker context create staging --docker "host=ssh://deploy@staging.example.com"
docker context use staging
docker info --format '{{.Name}} {{.ServerVersion}}'
docker ps

docker context use default
DOCKER_CONTEXT=staging docker ps`, {
            note: 'DOCKER_CONTEXT overrides the active context for a single command environment.',
          }),
          callout('warning', 'Contexts are privileged endpoints', 'Switching to a production context and running `docker system prune` is one keystroke from disaster. Use distinct shell prompts and read the context name before destructive commands.'),
        ],
        {
          quiz: quiz([
            q('What is the safest remote engine connection?', ['TCP 2375', 'SSH context', 'HTTP', 'A shared socket'], 1, 'SSH uses existing secure authentication.'),
            q('Which command shows the active context?', ['docker context show', 'docker info --context', 'docker ps', 'docker version'], 0, 'context show prints the current name.'),
            q('What overrides the active context for one command?', ['DOCKER_HOST file', 'DOCKER_CONTEXT env var', '--remote flag', 'docker switch'], 1, 'The environment variable takes precedence.'),
          ]),
          exercises: [
            ex('Create a context', 'Create an SSH context named lab.', 'docker context create lab --docker "host=ssh://user@host"'),
            ex('One-off', 'Run docker ps against a context without switching.', 'DOCKER_CONTEXT=lab docker ps'),
          ],
          related: ['client-server-architecture', 'daemon-security', 'system-maintenance'],
          tags: ['administration', 'contexts'],
          commands: ['docker context', 'docker info'],
          sources: [docs('Contexts', 'engine/context/working-with-contexts/')],
        }),
      lesson('system-maintenance', 'Maintenance, upgrades and rootless', '12 min',
        'A routine that keeps an engine healthy across months and versions.',
        ['Plan disk and version maintenance', 'Upgrade the engine without surprise downtime', 'Evaluate rootless mode'],
        [
          text('A maintenance routine', 'Weekly: inspect disk usage, prune with retention, review daemon logs. Monthly: apply security updates to the engine and base images, verify backups. Quarterly: rehearse restore, review access to the socket and contexts, audit running capabilities.\n\nUpgrade paths matter: read release notes, pin a version in package managers, and test in a staging host. Engine upgrades can change storage drivers, cgroup versions and default behaviours.'),
          code('bash', `# Weekly
docker system df
docker system events --since 24h --filter event=die
journalctl -u docker --since '7 days ago' --no-pager | grep -i error | tail -50

# Controlled cleanup
docker builder prune --keep-storage 10GB
docker image prune -a --filter "until=168h"
docker volume prune

# Version inventory
docker version --format '{{.Server.Version}}'
apt list --installed 2>/dev/null | grep -E 'docker|containerd'`, {
            note: 'Use your distribution’s package manager or Docker’s official repository; do not mix sources.',
          }),
          table(['Cadence', 'Task'], [
            ['Daily', 'Alerts, failed containers, disk trend'], ['Weekly', 'Prune with retention, log review'],
            ['Monthly', 'Engine/base image updates, access review'], ['Quarterly', 'Restore drill, capability audit, upgrade test'],
          ]),
          callout('tip', 'Rootless is a strong default for developer hosts', 'It reduces daemon privilege, but some networking/storage features and privileged ports differ. Validate your workloads before standardising.'),
        ],
        {
          quiz: quiz([
            q('What is a safe prune retention strategy?', ['Delete everything weekly', 'Prune with age/size filters', 'Never prune', 'Delete /var/lib/docker'], 1, 'Retention filters avoid removing needed artifacts.'),
            q('What should you do before an engine upgrade?', ['Delete volumes', 'Read release notes and test on staging', 'Disable health checks', 'Switch to host networking'], 1, 'Upgrades can change behaviour.'),
            q('What does rootless mode change?', ['The daemon runs as a non-root user', 'The kernel', 'The image format', 'Networking is disabled'], 0, 'It reduces daemon privilege.'),
          ]),
          exercises: [
            ex('Maintenance plan', 'Write a weekly maintenance checklist.', 'df, prune with filters, logs, failed units, backup verification.'),
            ex('Rootless check', 'Find out whether a host is running rootless Docker.', 'docker info --format "{{.SecurityOptions}}" and check for rootless.'),
          ],
          related: ['daemon-config', 'daemon-security', 'disk-space'],
          tags: ['administration', 'maintenance'],
          commands: ['docker system', 'docker version'],
          sources: [docs('Rootless', 'engine/security/rootless/'), docs('Upgrade', 'engine/install/')],
        }),
    ]),
  ],
  ['docker-architecture', 'docker-security'],
));

// ─────────────────────────────────────────────────────────────
// 18. Real-world Docker Projects
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'real-world-projects', 18, 'Real-world Docker Projects', 'Five complete stacks you can actually run', 'Intermediate', '3h 20m', 'blocks', 'orange',
  'Apply everything in complete, runnable projects: a Node/Postgres API, a TLS reverse proxy, a CI pipeline, a monitoring stack and a multi-stage Go service.',
  ['Assemble a production-shaped Compose application', 'Terminate TLS with a reverse proxy', 'Build and publish images in CI', 'Ship a multi-stage compiled service'],
  [
    mod('project-stacks', 'Project stacks', 'Complete walkthroughs.', [
      lesson('project-node-postgres', 'Project: Node API + PostgreSQL', '18 min',
        'A full-stack Compose project with health checks, migrations, secrets and a non-root image.',
        ['Write a multi-stage Node Dockerfile', 'Compose an API with Postgres and a migration job', 'Use secrets and health-aware dependencies'],
        [
          text('The shape of the project', 'The API is a small Node service with a `/health/ready` endpoint. Postgres stores data. A one-shot `migrate` service runs schema migrations and must complete before the API starts. Configuration comes from an env file; the database password is a Compose secret.'),
          code('dockerfile', `# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]`, {}),
          code('yaml', `name: acme
services:
  api:
    build: .
    image: acme/api:local
    restart: unless-stopped
    ports: ["127.0.0.1:3000:3000"]
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://app:secret@db:5432/app
    secrets: [db_password]
    depends_on:
      db: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 15s
      timeout: 3s
      retries: 3
      start_period: 20s

  migrate:
    build: .
    image: acme/api:local
    command: ["node", "dist/migrate.js"]
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      db: { condition: service_healthy }
    restart: "no"

  db:
    image: postgres:16.4-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_DB: app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 12

secrets:
  db_password:
    file: ./secrets/db_password.txt
volumes:
  pgdata:`, {
            note: 'The migrate service reuses the API image. One artifact, two commands.',
          }),
          code('bash', `printf 'change-me' > secrets/db_password.txt
docker compose up -d --build --wait
docker compose ps
curl -fsS http://127.0.0.1:3000/health/ready
docker compose logs -f api
docker compose down`, {
            note: '`--wait` returns after services are healthy. The migration job must exit 0.',
          }),
          callout('tip', 'Seed data is a separate one-shot', 'Add a `seed` service under a profile and run it deliberately. Do not seed on every boot.'),
        ],
        {
          quiz: quiz([
            q('Why is migrate a separate service?', ['It must run once and complete before the API', 'It uses less memory', 'It needs a different network', 'It cannot be in the image'], 0, 'The completion condition orders a one-shot job.'),
            q('Where does the database password come from?', ['An env var in the file', 'A Compose secret file', 'The image', 'The volume'], 1, 'POSTGRES_PASSWORD_FILE reads the mounted secret.'),
            q('Which command waits for health before returning?', ['up -d --wait', 'up -d', 'compose ps', 'compose logs'], 0, '--wait waits for health.'),
          ]),
          exercises: [
            ex('Run the stack', 'Create the secret file and start the project.', 'docker compose up -d --build --wait'),
            ex('Break it', 'Point DATABASE_URL at the wrong host and observe the readiness failure.', 'The API becomes unhealthy; logs show connection errors; dependent migration never completes.'),
          ],
          related: ['multi-stage-builds', 'compose-health-dependencies', 'production-compose'],
          tags: ['project', 'compose', 'node'],
          commands: ['docker compose', 'docker build'],
          sources: [docs('Compose sample', 'compose/samples/'), docs('Postgres image', 'https://hub.docker.com/_/postgres')],
        }),
      lesson('project-reverse-proxy', 'Project: TLS reverse proxy', '15 min',
        'Caddy or nginx in front of two services, with automatic certificates and a clean network split.',
        ['Design a frontend/backend network split', 'Terminate TLS at the proxy', 'Route by host and path'],
        [
          text('Only the proxy is public', 'The proxy publishes 80/443 and joins the frontend network. The API and web app join frontend; the database joins a private backend network. Only the proxy is reachable from the internet, and the database is not reachable from the proxy.'),
          code('yaml', `name: acme
services:
  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks: [frontend]
  web:
    image: acme/web:1.4
    restart: unless-stopped
    networks: [frontend, backend]
  api:
    image: acme/api:1.4
    restart: unless-stopped
    networks: [frontend, backend]
  db:
    image: postgres:16.4-alpine
    restart: unless-stopped
    networks: [backend]
    volumes: ["pgdata:/var/lib/postgresql/data"]

networks:
  frontend:
  backend:
    internal: true
volumes:
  caddy-data:
  caddy-config:
  pgdata:`, {}),
          code('caddyfile', `acme.example.com {
  encode zstd gzip
  handle /api/* {
    reverse_proxy api:3000
  }
  handle {
    reverse_proxy web:3000
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}`, {
            note: 'Caddy obtains and renews certificates automatically when the domain resolves and ports 80/443 are reachable.',
          }),
          callout('warning', 'TLS is not optional in production', 'Terminate TLS at the edge and forward only over private networks. If you terminate elsewhere, forward the correct scheme/headers and trust only known proxies.'),
        ],
        {
          quiz: quiz([
            q('Which service publishes public ports?', ['web', 'api', 'db', 'caddy'], 3, 'Only the proxy is exposed.'),
            q('Why is the backend network internal?', ['It is faster', 'It removes external connectivity', 'It enables TLS', 'It reduces image size'], 1, 'Internal networks isolate the database tier.'),
            q('Who obtains certificates in the Caddy example?', ['Docker', 'Caddy', 'Postgres', 'The API'], 1, 'Caddy automates ACME.'),
          ]),
          exercises: [
            ex('Network split', 'Write networks so only caddy and web share a public network.', 'caddy frontend; web frontend+backend; api backend; db backend.'),
            ex('Headers', 'Add HSTS and nosniff headers to a Caddyfile.', 'Use the header block shown above.'),
          ],
          related: ['compose-networks-volumes', 'production-compose', 'zero-downtime'],
          tags: ['project', 'networking', 'tls'],
          commands: ['docker compose', 'docker network inspect'],
          sources: [docs('Caddy', 'https://caddyserver.com/docs/'), docs('Compose networks', 'compose/compose-file/06-networks/')],
        }),
      lesson('project-ci-pipeline', 'Project: CI build and publish', '14 min',
        'A GitHub Actions pipeline that builds multi-platform images with cache and push-by-digest discipline.',
        ['Build and push an image in CI', 'Use registry cache across runs', 'Scan and sign as a gate'],
        [
          text('CI is a Docker client', 'The runner needs the Docker CLI, Buildx and registry credentials. Use short-lived tokens, never print them, and prefer digest-pinned actions. Build multi-platform only if you actually deploy multiple architectures; it is slower.'),
          code('yaml', `name: image
on:
  push:
    branches: [main]
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true`, {
            note: '`type=gha` uses GitHub Actions cache; `type=registry` works across CI systems.',
          }),
          code('bash', `# Local reproduction of the CI build
docker buildx build \\
  --platform linux/amd64 \\
  --cache-from type=registry,ref=ghcr.io/acme/api:cache \\
  --cache-to type=registry,ref=ghcr.io/acme/api:cache,mode=max \\
  -t ghcr.io/acme/api:local --load .

docker scout cves ghcr.io/acme/api:local`, {
            note: 'Reproduce CI locally before changing the workflow; it shortens the feedback loop.',
          }),
          callout('warning', 'Do not build on every push to every branch', 'Use path filters and concurrency cancellation. CI minutes are a finite resource and stale builds waste them.'),
        ],
        {
          quiz: quiz([
            q('Which cache backend is native to GitHub Actions?', ['type=gha', 'type=local', 'type=s3', 'type=azure'], 0, 'The gha backend stores cache in Actions.'),
            q('Why use short-lived registry tokens?', ['Faster pushes', 'Limit blast radius if leaked', 'Enable TLS', 'Reduce image size'], 1, 'CI credentials should be scoped and temporary.'),
            q('What does provenance attest?', ['Vulnerability status', 'How and from what the image was built', 'The registry region', 'The runtime user'], 1, 'It records build provenance.'),
          ]),
          exercises: [
            ex('Pipeline', 'Write the login and build-push steps for GHCR.', 'docker/login-action with GITHUB_TOKEN and build-push-action with tags/push.'),
            ex('Cache', 'Add registry cache to a buildx build.', '--cache-from/--cache-to type=registry,ref=...,mode=max.'),
          ],
          related: ['build-cache', 'multi-platform-bake', 'image-provenance'],
          tags: ['project', 'ci', 'registry'],
          commands: ['docker buildx build', 'docker push'],
          sources: [docs('GitHub Actions', 'build/ci/github-actions/'), docs('Build cache', 'build/cache/backends/')],
        }),
      lesson('project-monitoring-stack', 'Project: monitoring stack', '15 min',
        'A complete local observability stack with alerting rules and a dashboard you can extend.',
        ['Run Prometheus, Grafana, cAdvisor and node-exporter', 'Write an alert rule', 'Secure the stack'],
        [
          text('What to run', 'cAdvisor for container metrics, node-exporter for host metrics, Prometheus for storage and alerting, Grafana for dashboards. Keep all ports on loopback and put authentication in front if remote access is needed.'),
          code('yaml', `name: ops-monitoring
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    ports: ["127.0.0.1:8080:8080"]
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    devices: ["/dev/kmsg"]
    restart: unless-stopped
    networks: [monitoring]
  node-exporter:
    image: prom/node-exporter:v1.8.2
    ports: ["127.0.0.1:9100:9100"]
    pid: host
    restart: unless-stopped
    networks: [monitoring]
  prometheus:
    image: prom/prometheus:v2.55.1
    ports: ["127.0.0.1:9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus-data:/prometheus
    restart: unless-stopped
    networks: [monitoring]
  grafana:
    image: grafana/grafana:11.3.0
    ports: ["127.0.0.1:3001:3000"]
    volumes: ["grafana-data:/var/lib/grafana"]
    restart: unless-stopped
    depends_on: [prometheus]
    networks: [monitoring]
networks:
  monitoring:
volumes:
  prometheus-data:
  grafana-data:`, {}),
          code('yaml', `# alerts.yml
groups:
  - name: containers
    rules:
      - alert: ContainerDown
        expr: up{job="cadvisor"} == 0
        for: 2m
        labels: { severity: page }
        annotations:
          summary: "cAdvisor target is down"
      - alert: HighContainerCPU
        expr: sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (name) > 0.8
        for: 10m
        labels: { severity: warning }`, {
            note: 'Tune thresholds to your workload; a fixed 0.8 core alert is a starting point, not a universal rule.',
          }),
          callout('danger', 'Do not expose cAdvisor or Prometheus publicly', 'They have no authentication by default. Bind to loopback, use a private network, or put an authenticated proxy in front.'),
        ],
        {
          quiz: quiz([
            q('What does node-exporter provide?', ['Container metrics', 'Host-level metrics', 'Dashboards', 'Alert routing'], 1, 'It exposes host metrics.'),
            q('Where should monitoring ports bind?', ['0.0.0.0', '127.0.0.1', 'The public IP', 'A random interface'], 1, 'Loopback prevents accidental exposure.'),
            q('What does Prometheus use to evaluate alerts?', ['Alert rules', 'Grafana dashboards', 'Docker health checks', 'Compose profiles'], 0, 'Alerting rules evaluate PromQL expressions.'),
          ]),
          exercises: [
            ex('Deploy', 'Run the four-service monitoring stack locally.', 'docker compose up -d and check all services are running.'),
            ex('Alert', 'Write a rule for a container restarting repeatedly.', 'Use changes(container_start_time_seconds[10m]) or a restart counter rate.'),
          ],
          related: ['monitoring-stack', 'production-observability', 'healthchecks'],
          tags: ['project', 'monitoring', 'compose'],
          commands: ['docker compose', 'docker stats'],
          sources: [docs('Prometheus', 'https://prometheus.io/docs/'), docs('cAdvisor', 'https://github.com/google/cadvisor')],
        }),
      lesson('project-go-multistage', 'Project: multi-stage Go service', '14 min',
        'A static binary, a scratch runtime, non-root execution and multi-platform builds.',
        ['Build a static Go binary in a builder stage', 'Ship a minimal scratch/distroless runtime', 'Cross-compile for amd64 and arm64'],
        [
          text('The smallest useful runtime', 'Go can produce a fully static binary with `CGO_ENABLED=0`. A `scratch` runtime contains only the binary and CA certificates. If you need a shell for debugging, use distroless or a debug variant; do not add a shell to production for convenience.'),
          code('dockerfile', `# syntax=docker/dockerfile:1
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN --mount=type=cache,target=/root/.cache/go-build \\
    CGO_ENABLED=0 GOOS=\${TARGETOS} GOARCH=\${TARGETARCH} \\
    go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/server /server
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/server"]`, {
            note: 'The binary must be static. If it needs libc, use distroless/base instead of scratch.',
          }),
          code('bash', `docker buildx build \\
  --platform linux/amd64,linux/arm64 \\
  -t ghcr.io/acme/go-service:1.0 \\
  --push .

docker image inspect ghcr.io/acme/go-service:1.0 --format '{{.Size}}'`, {
            output: '8421337',
            note: 'A small image is not automatically faster at runtime, but it pulls faster and has a tiny attack surface.',
          }),
          callout('tip', 'Cross-compile instead of emulating', 'Set GOOS/GOARCH in the builder to produce native binaries for each platform; QEMU emulation is slower and can hide architecture-specific bugs.'),
        ],
        {
          quiz: quiz([
            q('Why CGO_ENABLED=0?', ['It makes the binary static', 'It enables TLS', 'It reduces memory', 'It compiles faster'], 0, 'A static binary can run in scratch.'),
            q('What must be copied into a scratch image for HTTPS?', ['CA certificates', 'A shell', 'glibc', 'curl'], 0, 'TLS verification needs a CA bundle.'),
            q('How do you build for arm64 from an amd64 host without emulation?', ['GOARCH=arm64 cross-compilation', 'QEMU only', 'Use host networking', 'Build on the target only'], 0, 'Go cross-compiles natively.'),
          ]),
          exercises: [
            ex('Static build', 'Write the Go build RUN with static linking and stripped symbols.', 'CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server'),
            ex('Multi-arch', 'Build and push for amd64 and arm64.', 'docker buildx build --platform linux/amd64,linux/arm64 --push -t REPO:TAG .'),
          ],
          related: ['multi-stage-builds', 'multi-platform-bake', 'production-readiness'],
          tags: ['project', 'go', 'build'],
          commands: ['docker buildx build', 'docker image inspect'],
          sources: [docs('Multi-stage', 'build/building/multi-stage/'), docs('Multi-platform', 'build/building/multi-platform/')],
        }),
    ]),
  ],
  ['dockerfile-masterclass', 'docker-build-buildkit', 'docker-compose'],
));

module.exports = { courses };
