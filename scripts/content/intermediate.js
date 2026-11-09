'use strict';

const { text, code, callout, table, diagram, steps, list, q, quiz, ex, lesson, mod, course, docs, ref } = require('./helpers');

const courses = [];

// ─────────────────────────────────────────────────────────────
// 6. Dockerfile Masterclass
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'dockerfile-masterclass', 6, 'Dockerfile Masterclass', 'From first instruction to production-grade image', 'Intermediate', '2h 30m', 'file-code', 'blue',
  'Learn to write Dockerfiles that are small, reproducible, secure and fast to rebuild. This is the highest-leverage skill in everyday Docker work.',
  ['Choose the right instruction for each layer', 'Use multi-stage builds to ship only runtime artifacts', 'Order layers and .dockerignore for effective caching', 'Harden images with non-root users and read-only patterns'],
  [
    mod('dockerfile-basics', 'Instructions and semantics', 'The grammar of a Dockerfile and the instructions that matter.', [
      lesson('dockerfile-anatomy', 'Dockerfile anatomy', '12 min',
        'Every instruction is a decision about layers, build context, or runtime defaults.',
        ['Distinguish build-time from runtime instructions', 'Explain COPY vs ADD and RUN vs CMD', 'Write a minimal correct Dockerfile'],
        [
          text('A recipe, executed top to bottom', 'A Dockerfile is a sequence of instructions executed by the builder. Filesystem-changing instructions (`RUN`, `COPY`, `ADD`) create layers. Metadata instructions (`ENV`, `EXPOSE`, `LABEL`, `WORKDIR`, `USER`) update the image config. `FROM` starts a new build stage.\n\nOnly files in the **build context** can be copied. The context is sent to the builder, so a large context slows every build even if the file is not copied.'),
          code('dockerfile', `# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Dependencies first: this layer is cached until the lockfile changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application code second
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "server.js"]`, {
            note: 'The `# syntax` directive pins the Dockerfile frontend, enabling modern features consistently across engines.',
          }),
          table(['Instruction', 'Phase', 'Creates layer'], [
            ['FROM', 'Build', 'Starts stage'], ['RUN', 'Build', 'Yes'], ['COPY / ADD', 'Build', 'Yes'],
            ['ENV / ARG', 'Build + runtime / build only', 'No'], ['WORKDIR', 'Both', 'No'], ['USER', 'Runtime', 'No'],
            ['CMD / ENTRYPOINT', 'Runtime', 'No'], ['EXPOSE', 'Documentation', 'No'], ['HEALTHCHECK', 'Runtime', 'No'],
          ]),
          callout('warning', 'Prefer COPY over ADD', 'ADD has extra behaviours (URLs, auto-extraction) that are surprising and bypass .dockerignore expectations. Use COPY unless you specifically need ADD.'),
        ],
        {
          quiz: quiz([
            q('Which instructions create filesystem layers?', ['ENV and EXPOSE', 'RUN, COPY and ADD', 'CMD and ENTRYPOINT', 'WORKDIR and USER'], 1, 'Only instructions that change the filesystem produce layers.'),
            q('Why is build context size important?', ['It changes the base image', 'The whole context is sent to the builder', 'It increases image tags', 'It disables caching'], 1, 'A large context is transferred even if unused.'),
            q('What does WORKDIR do?', ['Copies files', 'Sets the working directory for following instructions and runtime', 'Creates a volume', 'Changes the base image'], 1, 'It is both a build and runtime setting.'),
          ]),
          exercises: [
            ex('Minimal Dockerfile', 'Write a Dockerfile that runs a static file server using nginx:alpine and copies ./site into the web root.', 'FROM nginx:alpine; COPY site/ /usr/share/nginx/html/; EXPOSE 80.'),
            ex('Find the anti-pattern', 'Explain why COPY . . before npm ci is bad for rebuild speed.', 'Any source change invalidates the dependency layer, forcing a full reinstall.'),
          ],
          related: ['layer-caching', 'multi-stage-builds', 'production-dockerfile'],
          tags: ['dockerfile', 'build'],
          commands: ['docker build'],
          sources: [ref('Dockerfile reference', 'dockerfile/'), docs('Building images', 'get-started/docker-concepts/building-images/')],
        }),
      lesson('entrypoint-vs-cmd', 'ENTRYPOINT vs CMD', '10 min',
        'The two runtime instructions, exec form vs shell form, and how arguments flow.',
        ['Predict what runs for every combination of ENTRYPOINT and CMD', 'Use exec form for correct signal handling', 'Override defaults without rebuilding'],
        [
          text('Defaults versus the executable', '`ENTRYPOINT` sets the executable. `CMD` sets default arguments (or the whole command if there is no ENTRYPOINT). `docker run image arg` replaces CMD but keeps ENTRYPOINT. That is the contract that makes images configurable without a rebuild.\n\nUse **exec form** (`["node","server.js"]`) so the process is PID 1 and receives signals directly. Shell form (`node server.js`) wraps the command in `/bin/sh -c`; the shell becomes PID 1 and may not forward SIGTERM.'),
          table(['ENTRYPOINT', 'CMD', 'Result'], [
            ['["nginx","-g","daemon off;"]', 'none', 'nginx -g daemon off;'],
            ['["node"]', '["server.js"]', 'node server.js'],
            ['none', '["node","server.js"]', 'node server.js'],
            ['["node"]', '["server.js"]', 'docker run img worker.js → node worker.js'],
          ]),
          code('dockerfile', `FROM node:20-alpine
WORKDIR /app
COPY . .
# Exec form: node is PID 1 and receives SIGTERM
ENTRYPOINT ["node"]
CMD ["server.js"]`, {
            note: 'Now `docker run IMAGE worker.js` runs the worker without changing the image.',
          }),
          callout('warning', 'Do not use shell form for services', 'Shell form hides signal handling behind /bin/sh. If you need shell features at startup, use an entrypoint script that ends with `exec "$@"`.'),
        ],
        {
          quiz: quiz([
            q('What happens to CMD when you pass arguments to docker run?', ['It is appended', 'It is replaced', 'It is ignored only with -it', 'It becomes an env var'], 1, 'Runtime arguments replace CMD, not ENTRYPOINT.'),
            q('Which form gives PID 1 signal handling?', ['Shell form', 'Exec form', 'Both are identical', 'Only with --init'], 1, 'Exec form runs the binary directly.'),
            q('How do you make a reusable base image that accepts a command?', ['Set CMD only', 'Set ENTRYPOINT to the binary and CMD to defaults', 'Use RUN', 'Use ADD'], 1, 'ENTRYPOINT + CMD is the standard contract.'),
          ]),
          exercises: [
            ex('Fix the signals', 'Rewrite CMD node server.js in exec form.', 'CMD ["node", "server.js"]'),
            ex('Entrypoint script', 'Write the final line of an entrypoint script that preserves signal handling.', 'exec "$@"'),
          ],
          related: ['dockerfile-anatomy', 'production-dockerfile'],
          tags: ['dockerfile', 'runtime'],
          commands: ['docker run'],
          sources: [ref('ENTRYPOINT', 'dockerfile/#entrypoint'), ref('CMD', 'dockerfile/#cmd')],
        }),
      lesson('multi-stage-builds', 'Multi-stage builds', '12 min',
        'Build with a full toolchain, ship only the artifact. The single biggest image-size win.',
        ['Separate build and runtime stages', 'Copy artifacts with COPY --from', 'Use stage targeting for development'],
        [
          text('Stages are named build environments', 'Each `FROM ... AS name` starts a stage. Only the final stage becomes the image. Files can be copied from earlier stages with `COPY --from=name`. Build tools, caches, source and test dependencies stay behind.\n\nThis works for compiled languages, but also for Node: install dev dependencies and build, then copy `dist` and production `node_modules` into a slim runtime stage.'),
          code('dockerfile', `# syntax=docker/dockerfile:1
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]`, {
            note: 'The runtime stage contains no source, dev dependencies, or build cache.',
          }),
          code('bash', `# Build only a specific stage for debugging
docker build --target build -t app:debug .

# Compare sizes
docker image ls app`, {
            output: 'app   debug    ...   1.12GB\napp   latest   ...   184MB',
          }),
          callout('tip', 'Use --target in development', 'A `dev` stage can include hot reload and test tools while CI builds the minimal runtime stage. One Dockerfile, different targets.'),
        ],
        {
          quiz: quiz([
            q('Which stage becomes the final image?', ['The first', 'The last', 'Every stage', 'The one named runtime'], 1, 'Unless --target is used, the final stage is the output.'),
            q('How do you copy a build artifact?', ['COPY --from=build /app/dist ./dist', 'ADD build:/app', 'RUN cp', 'VOLUME'], 0, 'COPY --from references a previous stage.'),
            q('What is --target used for?', ['Choosing a registry', 'Stopping the build at a named stage', 'Setting the platform', 'Cleaning cache'], 1, 'It builds up to the named stage.'),
          ]),
          exercises: [
            ex('Go multi-stage', 'Convert a single-stage Go build into builder + scratch runtime.', 'Builder stage uses golang and builds a static binary; runtime FROM scratch or distroless, COPY --from=builder the binary.'),
            ex('Debug stage', 'Build only the deps stage of a Dockerfile.', 'docker build --target deps -t app:deps .', { command: 'docker build --target deps -t app:deps .' }),
          ],
          related: ['dockerfile-anatomy', 'production-dockerfile', 'multi-platform-bake'],
          tags: ['dockerfile', 'optimization'],
          commands: ['docker build'],
          sources: [docs('Multi-stage builds', 'build/building/multi-stage/'), ref('COPY', 'dockerfile/#copy')],
        }),
      lesson('layer-caching', 'Layer caching and .dockerignore', '11 min',
        'Why the same Dockerfile rebuilds in two seconds for one person and two minutes for another.',
        ['Order instructions for cache hits', 'Use .dockerignore to shrink context', 'Diagnose cache invalidation'],
        [
          text('Cache keys', 'The builder caches each layer keyed by the parent layer, the instruction, and the input files. If the parent or input changes, that layer and every later layer miss. This is why dependency manifests are copied before source code: source changes should not invalidate dependency installation.\n\nFor `COPY`, the cache key includes file metadata and content. A changed lockfile correctly invalidates `npm ci`. A changed README should not invalidate it if the README is excluded or copied later.'),
          code('dockerfile', `FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build`, {
            note: 'BuildKit cache mounts keep the package manager cache between builds without baking it into a layer.',
          }),
          code('bash', `# .dockerignore
node_modules
.git
.env
dist
coverage
*.log`, {
            note: 'Excluding node_modules is critical: the host copy can shadow the container install and is often platform-specific.',
          }),
          callout('tip', 'A cache hit is not always correct', 'If a build depends on a remote URL or unpinned package version, the cache may hide an update. Use `--no-cache` for deliberate refreshes and pin versions for reproducibility.'),
        ],
        {
          quiz: quiz([
            q('Why copy package.json before the source?', ['To reduce image size', 'To keep dependency layers cached when source changes', 'To set permissions', 'To enable BuildKit'], 1, 'Only changed layers and their descendants are rebuilt.'),
            q('What does .dockerignore affect?', ['Runtime file access', 'The build context sent to the builder', 'Registry pushes', 'Container networking'], 1, 'It filters the build context.'),
            q('Which flag forces a full rebuild?', ['--pull', '--no-cache', '--force', '--fresh'], 1, '--no-cache bypasses the build cache.'),
          ]),
          exercises: [
            ex('Reorder for speed', 'Put npm ci before COPY . . and explain the cache effect.', 'Source edits no longer reinstall dependencies.'),
            ex('Shrink context', 'Write a .dockerignore for a Node project that excludes node_modules, .git, .env, dist and logs.', 'List each pattern on its own line.'),
          ],
          related: ['dockerfile-anatomy', 'build-cache', 'multi-stage-builds'],
          tags: ['dockerfile', 'performance'],
          commands: ['docker build'],
          sources: [docs('Build cache', 'build/cache/'), docs('.dockerignore', 'build/building/context/#dockerignore-files')],
        }),
      lesson('production-dockerfile', 'Production Dockerfile patterns', '12 min',
        'Non-root, pinned bases, health checks, labels and a build that fails closed.',
        ['Harden the runtime user and filesystem', 'Pin and document the base image', 'Add health checks and OCI labels'],
        [
          text('Production checklist', 'A production image should run as a non-root user, use a minimal pinned base, avoid build tools, handle signals, expose only what is needed, and carry provenance labels. Add a health check so orchestrators can distinguish "process alive" from "service ready".'),
          code('dockerfile', `# syntax=docker/dockerfile:1.7
FROM node:20.18-alpine3.20 AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20.18-alpine3.20
LABEL org.opencontainers.image.title="acme/api" \\
      org.opencontainers.image.source="https://github.com/acme/api" \\
      org.opencontainers.image.version="1.4.0"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]`, {
            note: 'Use distroless or scratch equivalents where possible. Alpine is shown for familiarity, not as a universal best choice.',
          }),
          table(['Concern', 'Pattern'], [
            ['User', 'USER node / numeric UID'], ['Filesystem', 'Read-only root + tmpfs for writable paths'],
            ['Base image', 'Pin version and digest in regulated environments'], ['Build tools', 'Keep them in a builder stage only'],
            ['Secrets', 'BuildKit secret mounts; never ARG or COPY .env'], ['Provenance', 'OCI labels + signed images'],
          ]),
          callout('danger', 'Never bake secrets into layers', 'Anything in a layer can be extracted even if deleted in a later layer. BuildKit `--mount=type=secret` keeps secrets out of history.'),
        ],
        {
          quiz: quiz([
            q('Which user should a production process run as?', ['root', 'A non-root user', 'Nobody only during build', 'It does not matter'], 1, 'Non-root limits the blast radius of a compromise.'),
            q('How do you use a secret during build without persisting it?', ['ARG SECRET', 'ENV SECRET', 'RUN --mount=type=secret', 'COPY .env'], 2, 'BuildKit secret mounts are not stored in layers.'),
            q('What does a HEALTHCHECK enable?', ['Faster builds', 'Readiness/liveness decisions by the runtime', 'Smaller images', 'Automatic TLS'], 1, 'It lets Docker and orchestrators detect unhealthy containers.'),
          ]),
          exercises: [
            ex('Harden it', 'Add a non-root user and HEALTHCHECK to a Node Dockerfile.', 'Create/use an existing user, set USER, add a HEALTHCHECK command that exits non-zero on failure.'),
            ex('Secret mount', 'Write a RUN using a BuildKit secret named npmrc.', 'RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci', { command: 'docker build --secret id=npmrc,src=$HOME/.npmrc .' }),
          ],
          related: ['multi-stage-builds', 'container-security', 'secrets-management'],
          tags: ['dockerfile', 'security', 'production'],
          commands: ['docker build'],
          sources: [docs('Best practices for Dockerfiles', 'build/building/best-practices/'), docs('Build secrets', 'build/building/secrets/')],
        }),
    ]),
  ],
  ['docker-images'],
));

// ─────────────────────────────────────────────────────────────
// 7. Docker Volumes
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-volumes', 7, 'Docker Volumes', 'Persistent storage, bind mounts and backup', 'Intermediate', '1h 05m', 'database', 'amber',
  'Containers are disposable; data is not. Learn when to use named volumes, bind mounts and tmpfs, and how to back up and restore safely.',
  ['Choose the right mount type for each use case', 'Manage volume lifecycle and sharing', 'Back up and restore a volume without downtime surprises'],
  [
    mod('storage-model', 'Storage model', 'Where data lives and what survives.', [
      lesson('storage-and-volumes', 'Storage drivers, volumes and tmpfs', '10 min',
        'The writable layer is disposable. Volumes are the supported persistence mechanism.',
        ['Explain the writable layer and its cost', 'Create and mount named volumes', 'Use tmpfs for ephemeral sensitive data'],
        [
          text('Three places data can live', 'The **writable layer** is tied to the container and is removed with it. A **volume** is managed by Docker, stored outside the image layers, and can outlive containers. A **bind mount** maps an arbitrary host path into the container. `tmpfs` stores data in memory and disappears on stop.\n\nVolumes are the default recommendation for databases and application state because Docker manages their lifecycle and they work on every platform.'),
          diagram('volume-storage', 'Writable layer, named volume, bind mount and tmpfs compared.'),
          code('bash', `docker volume create app-data
docker run -d --name db \\
  -v app-data:/var/lib/postgresql/data \\
  -e POSTGRES_PASSWORD=example \\
  postgres:16-alpine

docker volume inspect app-data
docker volume ls
docker volume rm app-data   # fails while in use`, {
            output: '[{"Name":"app-data","Driver":"local","Mountpoint":"/var/lib/docker/volumes/app-data/_data",...}]',
          }),
          callout('info', 'Use --mount for clarity in automation', '`--mount type=volume,source=app-data,target=/data` is more explicit than `-v`, and it fails loudly when the source does not exist.'),
        ],
        {
          quiz: quiz([
            q('What happens to the writable layer when a container is removed?', ['It becomes a volume', 'It is deleted', 'It is committed automatically', 'It moves to /var/lib/docker'], 1, 'Only volumes and bind mounts persist.'),
            q('Which storage is removed on container stop?', ['Named volume', 'Bind mount', 'tmpfs', 'Image layer'], 2, 'tmpfs lives in memory for the container lifetime.'),
            q('Can you remove a volume that a container is using?', ['Yes, always', 'No, Docker refuses', 'Only with -f', 'Only if stopped'], 1, 'Docker protects in-use volumes; force removal is not the default.'),
          ]),
          exercises: [
            ex('Persist Postgres', 'Run postgres with a named volume for its data directory.', 'docker run -d --name db -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=secret postgres:16-alpine', { command: 'docker volume create pgdata' }),
            ex('Ephemeral secret', 'Mount a tmpfs at /run/app for a container.', 'docker run --tmpfs /run/app:rw,size=16m alpine', { command: 'docker run --rm --tmpfs /run/app:rw,size=16m alpine ls -ld /run/app' }),
          ],
          related: ['bind-mounts', 'volume-backup', 'compose-networks-volumes'],
          tags: ['volumes', 'storage'],
          commands: ['docker volume create', 'docker volume inspect', 'docker run'],
          sources: [docs('Volumes', 'engine/storage/volumes/'), docs('Storage overview', 'engine/storage/')],
        }),
      lesson('bind-mounts', 'Bind mounts and permissions', '10 min',
        'Direct host paths are powerful for development and risky in production.',
        ['Use bind mounts for local development', 'Diagnose permission and ownership errors', 'Use :ro and :z correctly'],
        [
          text('The host owns the files', 'A bind mount maps a host path directly. UIDs inside the container are the same numeric UIDs on the host unless user namespaces are enabled. That is the source of most "permission denied" errors: the container process runs as UID 1000 while the host directory is owned by UID 0 or another user.\n\nUse bind mounts for source code in development, configuration files, and local tooling. Avoid them for production state; they couple the container to host layout and permissions.'),
          code('bash', `# development source mount
docker run --rm -it -v "$PWD":/app -w /app node:20-alpine sh

# read-only config
docker run -d -v "$PWD/nginx.conf":/etc/nginx/conf.d/default.conf:ro nginx:alpine

# SELinux relabel (Linux)
docker run -d -v "$PWD/site":/usr/share/nginx/html:ro,Z nginx:alpine

# inspect the resolved mounts
docker inspect --format '{{json .Mounts}}' CONTAINER`, {
            note: '`-v` creates a host directory if it does not exist, which often hides typos. `--mount` requires the path to exist.',
          }),
          callout('warning', 'Secrets and bind mounts', 'A bind-mounted secret file is visible to the container and lives on the host. Set restrictive permissions and never mount a directory containing unrelated secrets.'),
        ],
        {
          quiz: quiz([
            q('Why do bind mounts cause permission errors?', ['Docker rewrites UIDs', 'Numeric UIDs are shared with the host', 'Volumes are faster', 'SELinux is always off'], 1, 'Container UIDs map to host UIDs unless user namespaces are used.'),
            q('What does the :ro suffix do?', ['Removes ownership', 'Makes the mount read-only', 'Enables SELinux', 'Runs as root'], 1, 'The container cannot write to the mount.'),
            q('Which mount type is best for a production database?', ['Bind mount to a host directory', 'Named volume', 'tmpfs', 'Container writable layer'], 1, 'Named volumes are portable and Docker-managed.'),
          ]),
          exercises: [
            ex('Read-only config', 'Mount ./nginx.conf into the nginx config path read-only.', 'docker run -v "$PWD/nginx.conf":/etc/nginx/conf.d/default.conf:ro nginx:alpine', { command: 'docker run --rm -v "$PWD/nginx.conf":/etc/nginx/conf.d/default.conf:ro nginx:alpine nginx -t' }),
            ex('Fix ownership', 'A bind-mounted directory is not writable by UID 1000. Give two safe fixes.', 'chown the host directory to UID 1000, or run the container with --user matching the host UID.'),
          ],
          related: ['storage-and-volumes', 'volume-backup', 'compose-services'],
          tags: ['volumes', 'development'],
          commands: ['docker run', 'docker inspect'],
          sources: [docs('Bind mounts', 'engine/storage/bind-mounts/')],
        }),
      lesson('volume-backup', 'Backup and restore volumes', '10 min',
        'A repeatable tar-based backup, a restore drill, and what not to do with live database files.',
        ['Back up and restore a named volume', 'Understand consistency for live databases', 'Automate retention'],
        [
          text('Backup is a container that mounts two volumes', 'The standard pattern runs a temporary container with the data volume mounted read-only and a backup directory mounted writable. `tar` writes an archive to the backup directory. No data is copied to the host filesystem unless the second mount is a bind mount.'),
          code('bash', `# Backup
docker run --rm \\
  -v app-data:/data:ro \\
  -v "$PWD/backups":/backup \\
  alpine sh -c 'tar czf /backup/app-data-$(date +%Y%m%d-%H%M).tgz -C /data .'

# Restore into a fresh volume
docker volume create app-data-restore
docker run --rm \\
  -v app-data-restore:/data \\
  -v "$PWD/backups":/backup \\
  alpine sh -c 'tar xzf /backup/app-data-20260101-1200.tgz -C /data'`, {
            note: 'For a live database, stop writes or use the database native dump (pg_dump, mysqldump) for a consistent backup.',
          }),
          callout('danger', 'Test restores', 'An untested backup is a hypothesis. Restore into a throwaway volume and verify the application can read it before you need it.'),
        ],
        {
          quiz: quiz([
            q('Why mount the data volume read-only during backup?', ['It is faster', 'To prevent accidental writes', 'Docker requires it', 'To enable compression'], 1, 'Read-only prevents the backup container from modifying data.'),
            q('What is the safest backup for a live Postgres database?', ['tar of the data directory while running', 'pg_dump or a snapshot-consistent method', 'docker cp', 'docker export'], 1, 'A filesystem copy of a live database can be inconsistent.'),
            q('Where does the backup file live in the example?', ['Inside the data volume', 'In the host ./backups bind mount', 'In the image', 'In the registry'], 1, 'The second mount writes the archive to the host.'),
          ]),
          exercises: [
            ex('Backup command', 'Write a tar backup of volume pgdata into ./backups.', 'docker run --rm -v pgdata:/data:ro -v "$PWD/backups":/backup alpine tar czf /backup/pgdata.tgz -C /data .', { command: 'mkdir -p backups' }),
            ex('Restore drill', 'Restore that archive into a new volume and list the files.', 'Create a new volume, mount it and the backup dir, run tar xzf, then ls.'),
          ],
          related: ['storage-and-volumes', 'production-backup'],
          tags: ['volumes', 'backup'],
          commands: ['docker run', 'docker volume create'],
          sources: [docs('Backup volumes', 'engine/storage/volumes/#back-up-restore-or-migrate-data-volumes')],
        }),
    ]),
  ],
  ['docker-containers'],
));

// ─────────────────────────────────────────────────────────────
// 8. Docker Networking
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-networking', 8, 'Docker Networking', 'Drivers, DNS, isolation and connectivity debugging', 'Intermediate', '1h 45m', 'network', 'cyan',
  'Networks are where most "it works on my machine" bugs live. Learn the drivers, how Docker DNS resolves service names, and how to debug a connection systematically.',
  ['Select the right network driver', 'Create user-defined bridge networks with DNS', 'Distinguish publishing from exposing', 'Debug connectivity with inspect, exec and logs'],
  [
    mod('network-model', 'Network model', 'Drivers and the default topologies.', [
      lesson('networking-drivers', 'Network drivers', '11 min',
        'bridge, host, overlay, macvlan, ipvlan and none: what each is for.',
        ['Match a driver to a use case', 'Explain the default bridge', 'Know the security implications of host networking'],
        [
          text('Bridge is the default', 'A bridge network is a virtual switch on the host. Containers get veth pairs and an IP on the bridge. The default `bridge` network exists automatically, but user-defined bridge networks are preferred because they provide automatic DNS resolution by container name.\n\n`host` removes network isolation: the container shares the host stack, so port mappings are ignored and conflicts are immediate. `overlay` spans multiple hosts (Swarm). `macvlan` gives containers real MAC addresses on the physical network. `none` disables networking entirely.'),
          diagram('network-topology', 'The host bridge connects containers to each other and, through NAT, to external networks.'),
          table(['Driver', 'Use case', 'DNS by name'], [
            ['bridge (default)', 'Simple single-host', 'No (only --link)'], ['bridge (user-defined)', 'Most single-host apps', 'Yes'],
            ['host', 'Performance / special networking', 'Host resolver'], ['overlay', 'Multi-host Swarm', 'Yes'],
            ['macvlan', 'Legacy apps needing L2 presence', 'External'], ['none', 'Fully isolated', 'No'],
          ]),
          callout('warning', 'Host networking bypasses isolation', 'A host-network container can bind any host port and reach localhost services. Avoid it unless you need the host stack and understand the blast radius.'),
        ],
        {
          quiz: quiz([
            q('Which network provides DNS by container name?', ['The default bridge', 'A user-defined bridge', 'none', 'host'], 1, 'Embedded DNS works on user-defined networks.'),
            q('Which driver shares the host network stack?', ['bridge', 'overlay', 'host', 'macvlan'], 2, 'Host networking removes the network namespace boundary.'),
            q('Overlay networks are primarily used with…', ['Single-host Compose', 'Swarm / multi-host', 'macvlan', 'Windows only'], 1, 'Overlay spans hosts in a Swarm.'),
          ]),
          exercises: [
            ex('Create a user network', 'Create a bridge network named app-net and inspect its subnet.', 'docker network create app-net; docker network inspect app-net.', { command: 'docker network create app-net' }),
            ex('Isolate', 'Run a container with no network and prove it cannot resolve DNS.', 'docker run --rm --network none alpine ping -c1 1.1.1.1 fails.', { command: 'docker run --rm --network none alpine sh -c "getent hosts example.com || echo isolated"' }),
          ],
          related: ['bridge-dns', 'ports-and-publishing', 'network-troubleshooting'],
          tags: ['networking'],
          commands: ['docker network create', 'docker network ls', 'docker network inspect'],
          sources: [docs('Docker networking', 'engine/network/'), docs('Network drivers', 'engine/network/drivers/')],
        }),
      lesson('bridge-dns', 'Bridge networks and DNS', '11 min',
        'How service names resolve, why the default bridge behaves differently, and how aliases work.',
        ['Connect containers to a user-defined network', 'Resolve services by name and alias', 'Understand embedded DNS at 127.0.0.11'],
        [
          text('Embedded DNS', 'On a user-defined network, Docker runs an embedded DNS server at `127.0.0.11` inside each container. It resolves container names and network aliases to current container IPs. This is what makes `postgres:5432` work in Compose without hard-coded IPs.\n\nOn the default bridge, only IP addresses and `--link` (legacy) work. Always create a user-defined network for multi-container applications.'),
          code('bash', `docker network create app-net
docker run -d --name db --network app-net postgres:16-alpine \\
  -e POSTGRES_PASSWORD=secret
docker run -d --name api --network app-net my-api:1.0

# from inside api, the name db resolves
docker exec api getent hosts db
docker exec api node -e "require('net').connect(5432,'db').on('connect',()=>{console.log('ok');process.exit(0)})"

# attach an existing container to a second network
docker network connect app-net api
docker network inspect app-net`, {
            output: '172.20.0.2   db\nok',
          }),
          callout('tip', 'Aliases let you rename services', '`--network-alias database` adds another DNS name. Compose uses this for service aliases and stable naming.'),
        ],
        {
          quiz: quiz([
            q('What DNS server does Docker run inside user-defined networks?', ['8.8.8.8', '127.0.0.11', 'The host resolver', 'CoreDNS in every container'], 1, 'Docker embedded DNS listens on 127.0.0.11.'),
            q('Can containers on the default bridge resolve names automatically?', ['Yes', 'No', 'Only with Compose', 'Only with --dns'], 1, 'Default bridge name resolution requires legacy links.'),
            q('What does a network alias do?', ['Adds a DNS name', 'Publishes a port', 'Creates a subnet', 'Encrypts traffic'], 0, 'Aliases are additional names in Docker DNS.'),
          ]),
          exercises: [
            ex('Name resolution', 'Create two containers on a user-defined network and resolve one from the other.', 'getent hosts SERVICE returns the other container IP.'),
            ex('Alias', 'Add alias database to a container named db on app-net.', 'docker network connect --alias database app-net db', { command: 'docker network connect --alias database app-net db' }),
          ],
          related: ['networking-drivers', 'compose-networks-volumes', 'network-troubleshooting'],
          tags: ['networking', 'dns'],
          commands: ['docker network create', 'docker network connect', 'docker exec'],
          sources: [docs('Bridge networks', 'engine/network/drivers/bridge/'), docs('Embedded DNS', 'engine/network/')],
        }),
      lesson('user-defined-networks-lab', 'Lab: connect two services', '12 min',
        'Build a two-container application network from scratch and prove connectivity both ways.',
        ['Create a network and attach containers', 'Verify DNS and TCP connectivity', 'Inspect and clean up network resources'],
        [
          text('The scenario', 'Run Redis and a client container on a private network. Confirm the client resolves `cache` and can reach port 6379. Then connect the client to a second network and observe the additional interface.'),
          steps([
            { title: 'Create the network', body: 'Create `opsdeck-net` with the bridge driver.' },
            { title: 'Start Redis', body: 'Run redis:7-alpine with the name `cache` on that network.' },
            { title: 'Test DNS and TCP', body: 'From an alpine client, resolve `cache` and use `nc -z cache 6379`.' },
            { title: 'Inspect', body: 'Inspect the network and find both container IPs.' },
            { title: 'Clean up', body: 'Remove the containers and the network.' },
          ]),
          code('bash', `docker network create opsdeck-net
docker run -d --name cache --network opsdeck-net redis:7-alpine
docker run --rm --network opsdeck-net alpine sh -c 'getent hosts cache && nc -z cache 6379 && echo reachable'
docker network inspect opsdeck-net --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\\n"}}{{end}}'
docker rm -f cache
docker network rm opsdeck-net`, {
            output: '172.18.0.2   cache\nreachable\ncache 172.18.0.2/16',
          }),
          callout('info', 'Network cleanup is automatic… eventually', 'Removing the last container can leave a user-defined network behind. Remove it explicitly when you are done, or let Compose manage it.'),
        ],
        {
          lab: {
            id: 'connect-two-services', title: 'Private network with Redis',
            brief: 'Use the lab terminal. Redis is on the approved image list and resource limits are applied automatically.',
            steps: [
              { instruction: 'Create the bridge network opsdeck-net.', command: 'docker network create opsdeck-net' },
              { instruction: 'Run redis:7-alpine as cache on opsdeck-net.', command: 'docker run -d --name cache --network opsdeck-net redis:7-alpine' },
              { instruction: 'Resolve cache and test port 6379 from alpine.', command: "docker run --rm --network opsdeck-net alpine sh -c 'getent hosts cache && nc -z cache 6379 && echo reachable'" },
              { instruction: 'Inspect the network.', command: 'docker network inspect opsdeck-net' },
              { instruction: 'Remove the container and network.', command: 'docker rm -f cache && docker network rm opsdeck-net' },
            ],
          },
          quiz: quiz([
            q('Why does cache resolve without --link?', ['Both containers are on a user-defined network', 'Redis registers with DNS', 'Alpine has a hosts entry', 'Docker Hub provides DNS'], 0, 'User-defined networks use Docker embedded DNS.'),
            q('What command tests TCP reachability?', ['ping', 'nc -z host port', 'curl only', 'dig'], 1, 'nc -z attempts a TCP connection without sending data.'),
            q('Where can you find container IPs on a network?', ['docker ps', 'docker network inspect', 'docker logs', 'docker image inspect'], 1, 'Network inspect lists connected containers and addresses.'),
          ]),
          exercises: [
            ex('Second network', 'Connect the running cache container to a second network.', 'docker network connect other-net cache', { command: 'docker network create other-net && docker network connect other-net cache' }),
            ex('Clean up', 'Remove the containers and both networks.', 'docker rm -f cache; docker network rm opsdeck-net other-net'),
          ],
          related: ['bridge-dns', 'network-troubleshooting', 'compose-networks-volumes'],
          tags: ['lab', 'networking'],
          commands: ['docker network', 'docker exec'],
          sources: [docs('Networking tutorial', 'network/network-tutorial-standalone/')],
        }),
      lesson('network-troubleshooting', 'Troubleshooting connectivity', '12 min',
        'A repeatable checklist for "the container cannot reach the database".',
        ['Debug DNS, routing and port binding separately', 'Read inspect output effectively', 'Use temporary debug containers safely'],
        [
          text('Separate the layers', 'Debug in order: (1) are the containers on the same network? (2) does the name resolve? (3) is the target process listening on the expected interface? (4) is the port published? (5) is a host firewall or proxy interfering? Most incidents are a mismatch in one of these layers, not a Docker bug.'),
          code('bash', `# 1. Network membership
docker inspect api --format '{{json .NetworkSettings.Networks}}'
docker network inspect app-net --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\\n"}}{{end}}'

# 2. DNS from inside the client
docker exec api getent hosts db

# 3. Is the listener bound correctly?
docker exec db sh -c 'netstat -lntp 2>/dev/null || ss -lntp'
# A process bound to 127.0.0.1 inside the container is NOT reachable by other containers.

# 4. Published port
docker port api
curl -v http://127.0.0.1:8080/health

# 5. Ephemeral debug container on the same network
docker run --rm --network app-net nicolaka/netshoot \\
  sh -c 'dig db +short; nc -zv db 5432'`, {
            note: 'netshoot is a popular debug image; in restricted environments use alpine with busybox tools instead.',
          }),
          callout('warning', 'Do not "fix" networking with host mode', 'Switching to host networking hides the real problem and destroys isolation. Fix DNS, bind addresses, or network membership instead.'),
        ],
        {
          quiz: quiz([
            q('A service listens on 127.0.0.1:5432 inside its container. Can another container reach it?', ['Yes, via the container IP', 'No, it is bound to loopback', 'Only with host networking', 'Only via published ports'], 1, 'Loopback inside the container is not reachable from other namespaces.'),
            q('Which command shows which networks a container is attached to?', ['docker ps', 'docker inspect', 'docker top', 'docker diff'], 1, 'NetworkSettings.Networks lists attachments and IPs.'),
            q('What is the first thing to check for name resolution failures?', ['The image tag', 'Whether both containers share a user-defined network', 'The Docker version', 'The restart policy'], 1, 'Embedded DNS only works on user-defined networks.'),
          ]),
          exercises: [
            ex('Layer checklist', 'A web container cannot reach db:5432. List the first four checks in order.', 'Same network → DNS resolves → listener on 0.0.0.0 → published/port correct.'),
            ex('Find the bind address', 'Inspect a Postgres container and explain why it might listen only on localhost.', 'The postgres config listen_addresses may be localhost; set it to * or the container interface.'),
          ],
          related: ['bridge-dns', 'ports-and-publishing', 'container-exits'],
          tags: ['networking', 'troubleshooting'],
          commands: ['docker inspect', 'docker exec', 'docker port'],
          sources: [docs('Network troubleshooting', 'engine/network/'), docs('netshoot', 'https://github.com/nicolaka/netshoot')],
        }),
    ]),
  ],
  ['docker-containers'],
));

// ─────────────────────────────────────────────────────────────
// 9. Docker Compose Complete Course
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-compose', 9, 'Docker Compose Complete Course', 'Model, run and operate multi-container applications', 'Intermediate', '3h 10m', 'boxes', 'violet',
  'Compose is the fastest path from a set of containers to a reproducible application. Learn the full specification: services, networks, volumes, configuration, health, profiles and production overrides.',
  ['Read and write a complete compose.yaml', 'Model service dependencies and health checks', 'Manage configuration with env files, secrets and configs', 'Use profiles and override files for dev/prod workflows'],
  [
    mod('compose-model', 'The Compose model', 'Files, projects and the command lifecycle.', [
      lesson('compose-architecture', 'Compose architecture and the file model', '12 min',
        'A Compose file is a declarative description of a project. The CLI turns it into Docker API calls.',
        ['Explain the project model and naming', 'Read the top-level sections', 'Know the difference between compose.yaml and docker-compose.yml'],
        [
          text('One file, one project', 'Compose reads `compose.yaml` (preferred) or `docker-compose.yml`, resolves variables, validates the model, and creates a **project**. Resources are named `<project>_<resource>` by default, so two checkouts can run side by side with `-p`.\n\nThe top-level keys are `services`, `networks`, `volumes`, `secrets`, `configs`, `name`, and `include`. The obsolete top-level `version` key is ignored by modern Compose and should be removed.'),
          diagram('compose-architecture', 'Compose resolves the file into a project containing services, networks, volumes, secrets and configs.'),
          code('yaml', `name: acme

services:
  api:
    build: .
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:`, {
            note: 'Modern Compose does not need a `version:` key. Use `docker compose config` to see the fully resolved model.',
          }),
          table(['Command', 'Purpose'], [
            ['docker compose config', 'Resolve and validate the model'], ['docker compose up -d', 'Create/start the project'],
            ['docker compose ps', 'Project container status'], ['docker compose logs -f', 'Follow logs'],
            ['docker compose exec SERVICE sh', 'Shell in a running service'], ['docker compose down', 'Stop and remove the project'],
          ]),
          callout('tip', 'Always validate before shipping', '`docker compose config --quiet` fails fast on syntax and interpolation errors and is ideal for CI.'),
        ],
        {
          quiz: quiz([
            q('What is the preferred default filename?', ['docker-compose.yml', 'compose.yaml', 'dockerfile', 'compose.json'], 1, 'Compose prefers compose.yaml, though docker-compose.yml is still supported.'),
            q('What does the project name control?', ['Registry login', 'Resource naming and isolation', 'The base image', 'The network driver'], 1, 'Resources are prefixed with the project name.'),
            q('Is the top-level version key required?', ['Yes', 'No, it is obsolete', 'Only for v2', 'Only in production'], 1, 'Modern Compose ignores it and recommends removing it.'),
          ]),
          exercises: [
            ex('Validate', 'Write a minimal compose.yaml with one nginx service and validate it.', 'docker compose config --quiet returns success.', { command: 'docker compose config' }),
            ex('Isolate projects', 'Run the same file twice under project names dev and test.', 'Use -p dev and -p test; resources and containers are namespaced.'),
          ],
          related: ['compose-services', 'compose-profiles-production'],
          tags: ['compose'],
          commands: ['docker compose', 'docker compose config'],
          sources: [docs('Compose file reference', 'compose/compose-file/'), docs('Compose overview', 'compose/')],
        }),
      lesson('compose-services', 'Services: image, build, ports and commands', '13 min',
        'The service object is the heart of Compose. Learn the fields that define a container.',
        ['Choose between image and build', 'Configure ports, environment and commands', 'Use develop and watch for local workflows'],
        [
          text('image or build', 'A service either pulls an `image` or builds from a `build` context, or both (build and tag as the image). Use `build.context` plus `image` so the built result gets a stable name. `build.args` passes build-time values; they are visible in image history and must not contain secrets.'),
          code('yaml', `services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
      args:
        NODE_VERSION: "20"
    image: acme/api:local
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: production
      LOG_LEVEL: \${LOG_LEVEL:-info}
    env_file:
      - path: .env
        required: false
    command: ["node", "dist/server.js"]
    working_dir: /app
    user: "1000:1000"
    restart: unless-stopped
    stop_grace_period: 30s
    init: true`, {
            note: '`\${VAR:-default}` is Compose interpolation, not shell. `$$` escapes a literal dollar sign.',
          }),
          table(['Field', 'Meaning'], [
            ['image', 'Image reference to pull or tag'], ['build', 'Build context and options'],
            ['ports', 'Publish host:container (short or long syntax)'], ['expose', 'Document/internal port only'],
            ['environment', 'Map or list of env vars'], ['env_file', 'Load variables from files'],
            ['command', 'Override CMD'], ['entrypoint', 'Override ENTRYPOINT'],
            ['restart', 'Restart policy'], ['init', 'Run a tiny init as PID 1'],
          ]),
          callout('warning', 'Compose interpolation happens before containers start', 'Values from your shell and `.env` are substituted into the file. If a variable is missing, Compose warns and substitutes an empty string. Use `${VAR:?error}` to fail fast.'),
        ],
        {
          quiz: quiz([
            q('Which field publishes a host port?', ['expose', 'ports', 'publish', 'listen'], 1, '`ports` creates host bindings; `expose` is internal documentation.'),
            q('Build args are appropriate for…', ['Secrets', 'Non-secret build-time values', 'Runtime passwords', 'TLS keys'], 1, 'Args are stored in image history and must not hold secrets.'),
            q('What does ${VAR:-default} do?', ['Fails if unset', 'Uses default when unset or empty', 'Escapes the variable', 'Loads .env'], 1, 'It provides a fallback value.'),
          ]),
          exercises: [
            ex('Build and tag', 'Configure a service to build from . and tag the result acme/web:dev.', 'Set build: . and image: acme/web:dev.'),
            ex('Fail fast', 'Make Compose fail when DATABASE_URL is missing.', 'Use ${DATABASE_URL:?DATABASE_URL is required} in the environment.'),
          ],
          related: ['compose-architecture', 'compose-environment-secrets', 'compose-services'],
          tags: ['compose', 'services'],
          commands: ['docker compose build', 'docker compose up'],
          sources: [docs('Compose services', 'compose/compose-file/05-services/')],
        }),
      lesson('compose-networks-volumes', 'Networks and volumes in Compose', '11 min',
        'Implicit defaults, explicit topologies, external resources and naming.',
        ['Design a multi-network Compose app', 'Declare and reuse named volumes', 'Use external and driver options'],
        [
          text('Defaults and intent', 'Compose creates a default network named `<project>_default` and attaches every service to it. Services can reach each other by service name. Volumes referenced in services but not declared at top level are created as anonymous or project-scoped resources; declare them explicitly for control.\n\nUse multiple networks to separate tiers: a frontend network for the proxy and app, a backend network for app and database. The database is then unreachable from the proxy.'),
          code('yaml', `services:
  proxy:
    image: nginx:1.27-alpine
    ports: ["80:80"]
    networks: [frontend]
  api:
    build: .
    networks: [frontend, backend]
  db:
    image: postgres:16-alpine
    networks: [backend]
    volumes:
      - pgdata:/var/lib/postgresql/data

networks:
  frontend:
  backend:
    internal: true

volumes:
  pgdata:
    name: acme_pgdata`, {
            note: 'An internal network has no external connectivity; db can talk to api but cannot reach the internet.',
          }),
          callout('tip', 'Name production volumes deliberately', 'The `name:` field prevents accidental renames when the project name changes, which would otherwise create a new empty volume.'),
        ],
        {
          quiz: quiz([
            q('What is the default Compose network called?', ['bridge', 'compose_default', '<project>_default', 'host'], 2, 'It is prefixed with the project name.'),
            q('What does internal: true do?', ['Publishes ports', 'Removes external connectivity from the network', 'Encrypts traffic', 'Enables DNS'], 1, 'Internal networks have no gateway to outside networks.'),
            q('Why declare a volume name explicitly?', ['Faster I/O', 'Stable identity across project renames', 'Encryption', 'Automatic backup'], 1, 'The name fixes the volume identity.'),
          ]),
          exercises: [
            ex('Two-tier network', 'Write networks so only the proxy can reach the API and only the API can reach the database.', 'proxy on frontend; api on frontend+backend; db on backend only.'),
            ex('External network', 'Attach a service to a pre-existing network named shared.', 'networks: {shared: {external: true}}'),
          ],
          related: ['compose-architecture', 'compose-environment-secrets', 'bridge-dns'],
          tags: ['compose', 'networking', 'volumes'],
          commands: ['docker compose config'],
          sources: [docs('Compose networks', 'compose/compose-file/06-networks/'), docs('Compose volumes', 'compose/compose-file/07-volumes/')],
        }),
      lesson('compose-environment-secrets', 'Environment, secrets and configs', '13 min',
        'Configuration is not one thing. Separate ordinary settings, sensitive values and read-only config files.',
        ['Use .env, env_file and interpolation correctly', 'Mount Compose secrets without baking them into images', 'Use configs for non-secret files'],
        [
          text('Three channels', '**Environment**: ordinary configuration. Compose loads `.env` for interpolation and `env_file` for container environment. Values are visible in inspect.\n\n**Secrets**: sensitive values mounted as files under `/run/secrets/<name>` by default. They are not in the image or environment.\n\n**Configs**: non-secret files (nginx.conf, app config) mounted read-only, with the same declarative model.'),
          code('yaml', `services:
  api:
    image: acme/api:1.4
    environment:
      NODE_ENV: production
    env_file:
      - .env
    secrets:
      - db_password
      - source: tls_key
        target: tls.key
        mode: 0400
    configs:
      - source: nginx_conf
        target: /etc/nginx/conf.d/default.conf

secrets:
  db_password:
    file: ./secrets/db_password.txt
  tls_key:
    environment: TLS_KEY

configs:
  nginx_conf:
    file: ./nginx.conf`, {
            note: 'In a Swarm, secrets and configs are first-class; in Compose they are mounted files. Both keep secrets out of image layers.',
          }),
          code('bash', `# Read a secret inside the container
docker compose exec api sh -c 'cat /run/secrets/db_password'

# Check what Compose will run without starting it
docker compose config`, {
            note: 'Do not print secrets in shared logs. This is for a local verification only.',
          }),
          callout('danger', 'Environment variables are not secrets', 'Anything in the environment is visible through inspect, /proc, crash dumps and child processes. Use secrets for credentials.'),
        ],
        {
          quiz: quiz([
            q('Where does a Compose secret appear in the container?', ['As an env var', 'As a file under /run/secrets', 'In the image layer', 'In the compose file only'], 1, 'Secrets are mounted as files by default.'),
            q('What is .env used for?', ['Container environment automatically', 'Interpolation by the Compose CLI', 'Secrets storage', 'Image build'], 1, 'Compose reads .env for variable substitution; env_file sets container env.'),
            q('Configs are appropriate for…', ['Passwords', 'Non-secret configuration files', 'API keys', 'TLS private keys'], 1, 'Configs are for non-sensitive files.'),
          ]),
          exercises: [
            ex('Secret mount', 'Declare a secret from ./secrets/db_password.txt and mount it in api.', 'Top-level secrets + service secrets entry; verify with cat /run/secrets/db_password.'),
            ex('Env precedence', 'Explain the precedence between shell env, .env, env_file and the environment map.', 'Shell/.env feed interpolation; env_file loads container values; the service environment map overrides env_file.'),
          ],
          related: ['compose-services', 'secrets-management', 'production-compose'],
          tags: ['compose', 'security', 'configuration'],
          commands: ['docker compose config', 'docker compose exec'],
          sources: [docs('Compose secrets', 'compose/how-tos/use-secrets/'), docs('Environment variables', 'compose/how-tos/environment-variables/')],
        }),
      lesson('compose-health-dependencies', 'Health checks and dependencies', '12 min',
        'depends_on only controls start order unless you attach a health condition. Learn the difference between started and ready.',
        ['Write a service health check', 'Use depends_on conditions correctly', 'Avoid startup races'],
        [
          text('Started is not ready', 'By default `depends_on` waits for the dependency container to start, not for its application to accept connections. A database process can be running while still initialising. Use a health check plus `condition: service_healthy` to wait for readiness.\n\nCompose does not restart a dependent service when a dependency later becomes unhealthy. For resilient systems, the application must also retry connections.'),
          code('yaml', `services:
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 5s
  cache:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 2s
      retries: 5`, {
            note: '`start_period` gives slow starters time before failures count.',
          }),
          table(['Condition', 'Waits for'], [
            ['service_started', 'Container started'], ['service_healthy', 'Health check passing'],
            ['service_completed_successfully', 'One-shot job exits 0'],
          ]),
          callout('warning', 'Health checks can lie', 'A TCP check only proves the port is open. Use an application-level endpoint that verifies dependencies when readiness matters.'),
        ],
        {
          quiz: quiz([
            q('What does depends_on do by default?', ['Waits for readiness', 'Waits for container start', 'Restarts dependencies', 'Creates a network'], 1, 'Without a condition it only orders startup.'),
            q('Which condition waits for a health check?', ['service_started', 'service_healthy', 'service_ready', 'service_completed'], 1, 'service_healthy waits for the health check to pass.'),
            q('What is start_period for?', ['Delaying the first retry accounting for startup', 'Setting the container timeout', 'Restarting the container', 'Publishing ports'], 0, 'It gives slow applications time before failures count.'),
          ]),
          exercises: [
            ex('Write a health check', 'Add a pg_isready health check to a Postgres service.', 'healthcheck.test: ["CMD-SHELL","pg_isready -U postgres"] with interval/timeout/retries.'),
            ex('One-shot migration', 'Make api wait for a migrate service that must exit successfully.', 'depends_on: migrate: {condition: service_completed_successfully}'),
          ],
          related: ['compose-services', 'healthchecks', 'container-exits'],
          tags: ['compose', 'health'],
          commands: ['docker compose up', 'docker compose ps'],
          sources: [docs('Compose depends_on', 'compose/compose-file/05-services/#depends_on'), docs('Healthcheck', 'compose/compose-file/05-services/#healthcheck')],
        }),
      lesson('compose-profiles-production', 'Profiles, overrides and production', '14 min',
        'One project, several contexts: development, testing, production and optional tooling.',
        ['Use profiles to opt into services', 'Layer override files for environments', 'Run Compose safely in production-like deployments'],
        [
          text('Profiles are opt-in service groups', 'A service with `profiles: ["debug"]` does not start unless the profile is enabled with `--profile debug` or `COMPOSE_PROFILES`. Services without profiles always start. Use profiles for admin tools, seeders, test runners and optional databases.'),
          code('yaml', `# compose.yaml
services:
  api:
    image: acme/api:1.4
  db:
    image: postgres:16-alpine
  adminer:
    image: adminer:4
    profiles: ["debug"]
    ports: ["8081:8080"]
  test:
    build: { context: ., target: test }
    profiles: ["test"]
    command: npm test`, {
            note: '`docker compose --profile debug up -d` starts api, db and adminer.',
          }),
          text('Overrides', 'Compose merges multiple `-f` files in order. Put shared definition in `compose.yaml`, production-specific settings in `compose.prod.yaml`, and run `docker compose -f compose.yaml -f compose.prod.yaml up -d`. Lists such as `ports` are appended for some fields; understand merge rules before relying on them.'),
          code('bash', `# validate the merged model
docker compose -f compose.yaml -f compose.prod.yaml config

# production-like run
docker compose -f compose.yaml -f compose.prod.yaml pull
docker compose -f compose.yaml -f compose.prod.yaml up -d --wait

# stop and remove, keeping volumes
docker compose -f compose.yaml -f compose.prod.yaml down`, {
            note: '`--wait` waits for services to be healthy before returning, if health checks are defined.',
          }),
          callout('danger', 'Compose is not a cluster scheduler', 'A single-host Compose deployment has no rescheduling, rolling update or multi-node failover. Use Swarm, Kubernetes or a managed platform when you need those guarantees.'),
        ],
        {
          quiz: quiz([
            q('How do you start a service with profile debug?', ['--profile debug', '--with debug', 'COMPOSE_DEBUG=1', 'profiles: debug'], 0, 'Enable the profile explicitly.'),
            q('What does multiple -f files do?', ['Runs one project per file', 'Merges files in order', 'Ignores the second', 'Creates two projects'], 1, 'Compose merges configuration.'),
            q('Which flag waits for healthy services?', ['--wait', '--health', '--ready', '--detach'], 0, '--wait waits for running/healthy state.'),
          ]),
          exercises: [
            ex('Add a debug tool', 'Add adminer behind profile debug and start it.', 'docker compose --profile debug up -d adminer'),
            ex('Production override', 'Create compose.prod.yaml that removes a published port and sets restart: always.', 'Use the override file and validate with docker compose config.'),
          ],
          related: ['compose-architecture', 'production-compose', 'zero-downtime'],
          tags: ['compose', 'production'],
          commands: ['docker compose up', 'docker compose config'],
          sources: [docs('Compose profiles', 'compose/how-tos/profiles/'), docs('Merge', 'compose/how-tos/multiple-compose-files/merge/')],
        }),
    ]),
  ],
  ['docker-containers', 'docker-networking', 'docker-volumes'],
));

// ─────────────────────────────────────────────────────────────
// 10. Build and BuildKit
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-build-buildkit', 10, 'Docker Build and BuildKit', 'Faster, smarter and multi-platform image builds', 'Advanced', '1h 25m', 'hammer', 'orange',
  'BuildKit is the default builder and a different architecture from the legacy builder. Learn cache mounts, multi-platform builds, builders and declarative Bake files.',
  ['Explain BuildKit’s architecture and benefits', 'Use cache mounts and registry cache effectively', 'Build multi-platform images with buildx', 'Automate builds with docker buildx bake'],
  [
    mod('buildkit', 'BuildKit in practice', 'The modern builder and its cache.', [
      lesson('buildkit-architecture', 'BuildKit architecture', '9 min',
        'A DAG of build steps, executed concurrently, with content-addressed caching.',
        ['Describe how BuildKit differs from the legacy builder', 'Read a build graph', 'Know when to use a custom builder'],
        [
          text('A graph, not a straight line', 'BuildKit parses the Dockerfile into a directed acyclic graph of operations. Independent stages and steps can run in parallel. It uses content-addressed caching, supports secret and SSH mounts, and can emit provenance/SBOM data.\n\nThe **docker** driver builds inside the daemon’s image store. The **docker-container** driver runs BuildKit in a container and unlocks multi-platform builds, registry cache, and isolation from the daemon image store.'),
          code('bash', `docker buildx version
docker buildx ls
docker buildx create --name ci-builder --driver docker-container --use
docker buildx inspect --bootstrap
docker buildx build --load -t acme/api:dev .`, {
            output: 'NAME/NODE       DRIVER/ENDPOINT             STATUS      BUILDKIT\ndefault         docker                      running     v0.15\nci-builder*     docker-container            running     v0.15',
          }),
          diagram('build-process', 'Build context → parse → DAG → parallel execution → layers → image or cache export.'),
          callout('info', 'BuildKit is the default', 'Docker Engine 23.0+ uses BuildKit for `docker build` on Linux. The legacy builder is deprecated; do not build new workflows around it.'),
        ],
        {
          quiz: quiz([
            q('What is the main unit of BuildKit execution?', ['A shell script', 'A DAG of operations', 'A single layer', 'A container'], 1, 'BuildKit builds and executes a dependency graph.'),
            q('Which driver enables multi-platform builds?', ['docker', 'docker-container', 'remote', 'legacy'], 1, 'The docker-container driver runs BuildKit with a driver that supports multi-platform output.'),
            q('Why is BuildKit faster?', ['It skips validation', 'Parallel execution and better caching', 'It uses the host shell', 'It disables layers'], 1, 'Concurrency and content-addressed caching are the main wins.'),
          ]),
          exercises: [
            ex('Create a builder', 'Create and bootstrap a docker-container builder named lab-builder.', 'docker buildx create --name lab-builder --driver docker-container --bootstrap', { command: 'docker buildx create --name lab-builder --driver docker-container --use' }),
            ex('Inspect', 'List builders and identify the current one.', 'docker buildx ls marks the current builder with *.'),
          ],
          related: ['build-cache', 'multi-platform-bake', 'layer-caching'],
          tags: ['buildkit', 'build'],
          commands: ['docker buildx', 'docker build'],
          sources: [docs('BuildKit', 'build/buildkit/'), docs('buildx', 'reference/cli/docker/buildx/')],
        }),
      lesson('build-cache', 'Cache mounts and registry cache', '11 min',
        'Keep package manager caches across builds and share build cache through a registry.',
        ['Use RUN --mount=type=cache', 'Export and import cache with buildx', 'Know when cache hurts reproducibility'],
        [
          text('Cache mounts vs layer cache', 'A layer cache stores the result of an instruction. A **cache mount** persists a directory (npm, pip, Go modules) across builds without adding it to the image layer. This keeps images small while avoiding repeated downloads.\n\nFor CI, export cache to a registry or local directory and import it in later runs with `--cache-to` and `--cache-from`.'),
          code('dockerfile', `# syntax=docker/dockerfile:1
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \\
    npm ci --prefer-offline
COPY . .
RUN npm run build`, {
            note: 'The npm cache is not part of the final image; it lives in BuildKit’s cache store keyed by the mount id.',
          }),
          code('bash', `docker buildx build \\
  --cache-to type=registry,ref=registry.example.com/acme/api:cache,mode=max \\
  --cache-from type=registry,ref=registry.example.com/acme/api:cache \\
  -t registry.example.com/acme/api:1.4 \\
  --push .`, {
            note: 'mode=max caches intermediate layers, not only the final image.',
          }),
          callout('warning', 'Cache can hide supply-chain changes', 'A cached `apt-get install` may not see an updated package index. Use `--no-cache` for security rebuilds and pin base images by digest.'),
        ],
        {
          quiz: quiz([
            q('Does a cache mount add data to the final image?', ['Yes', 'No', 'Only with --load', 'Only in CI'], 1, 'Cache mounts are excluded from layers.'),
            q('Which flag exports build cache?', ['--cache-to', '--cache-export', '--save-cache', '--cache-mount'], 0, '--cache-to writes cache to a backend.'),
            q('What does mode=max cache?', ['Only the final image', 'All intermediate layers', 'Only secrets', 'The build context'], 1, 'It caches intermediate results too.'),
          ]),
          exercises: [
            ex('Cache mount', 'Add an npm cache mount to a Dockerfile RUN.', 'RUN --mount=type=cache,target=/root/.npm npm ci'),
            ex('Registry cache', 'Write a buildx command that imports and exports registry cache.', '--cache-from type=registry,ref=... --cache-to type=registry,ref=...,mode=max'),
          ],
          related: ['buildkit-architecture', 'layer-caching', 'project-ci-pipeline'],
          tags: ['buildkit', 'cache', 'performance'],
          commands: ['docker buildx build'],
          sources: [docs('Build cache', 'build/cache/'), docs('Cache storage backends', 'build/cache/backends/')],
        }),
      lesson('multi-platform-bake', 'Multi-platform builds and Bake', '11 min',
        'Build for amd64 and arm64 at once, and define repeatable build targets in a file.',
        ['Create a multi-platform build', 'Understand emulation and native builders', 'Use docker buildx bake for CI'],
        [
          text('Multi-platform output', 'Multi-platform builds require a builder that supports them (docker-container driver). BuildKit schedules a build per platform, potentially using QEMU emulation for foreign architectures. Emulation is slow; native runners are faster for large builds.\n\n`--push` or `--load` is required because a multi-platform result is an image index, not a single image loadable into the local store.'),
          code('bash', `docker buildx build \\
  --platform linux/amd64,linux/arm64 \\
  -t registry.example.com/acme/api:1.4 \\
  --push .

docker buildx imagetools inspect registry.example.com/acme/api:1.4`, {
            output: 'Name: registry.example.com/acme/api:1.4\nMediaType: application/vnd.oci.image.index.v1+json\nManifests:\n  linux/amd64\n  linux/arm64',
          }),
          code('hcl', `# docker-bake.hcl
group "default" {
  targets = ["api"]
}

target "api" {
  context    = "."
  dockerfile = "Dockerfile"
  platforms  = ["linux/amd64", "linux/arm64"]
  tags       = ["registry.example.com/acme/api:1.4"]
  cache-from = ["type=registry,ref=registry.example.com/acme/api:cache"]
  cache-to   = ["type=registry,ref=registry.example.com/acme/api:cache,mode=max"]
}`, {
            note: 'Run with `docker buildx bake` or select targets with `docker buildx bake api`.',
          }),
          callout('tip', 'Bake is for teams', 'A Bake file keeps CI and local builds identical, supports inheritance, and can build several images in parallel.'),
        ],
        {
          quiz: quiz([
            q('Why can a multi-platform image not be --load-ed?', ['It is encrypted', 'It is an image index with multiple manifests', 'It is too large', 'It requires Swarm'], 1, 'The result is a manifest list/index; push it to a registry.'),
            q('What is QEMU used for?', ['Native compilation', 'Emulating foreign architectures', 'Cache storage', 'TLS'], 1, 'BuildKit uses emulation when the host cannot run the target architecture natively.'),
            q('Which command runs a Bake file?', ['docker buildx bake', 'docker compose bake', 'docker bake', 'docker build --bake'], 0, 'buildx bake is the entry point.'),
          ]),
          exercises: [
            ex('Multi-arch', 'Build an image for amd64 and arm64 and push it.', 'docker buildx build --platform linux/amd64,linux/arm64 -t REGISTRY/app:tag --push .'),
            ex('Bake target', 'Write a Bake target that builds two tags from one context.', 'A target with tags = ["repo/app:1.0","repo/app:latest"].'),
          ],
          related: ['buildkit-architecture', 'build-cache', 'project-ci-pipeline'],
          tags: ['buildkit', 'multi-platform', 'ci'],
          commands: ['docker buildx build', 'docker buildx bake', 'docker buildx imagetools'],
          sources: [docs('Multi-platform builds', 'build/building/multi-platform/'), docs('Bake', 'build/bake/')],
        }),
    ]),
  ],
  ['docker-images', 'dockerfile-masterclass'],
));

module.exports = { courses };
