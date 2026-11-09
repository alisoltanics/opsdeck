'use strict';

const { text, code, callout, table, diagram, steps, list, q, quiz, ex, lesson, mod, course, docs, ref } = require('./helpers');

const courses = [];

// ─────────────────────────────────────────────────────────────
// 11. Docker Registry
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-registry', 11, 'Docker Registry', 'Publishing, distributing and trusting images', 'Intermediate', '1h 20m', 'cloud', 'blue',
  'A registry is the boundary between build and runtime. Learn authentication, tags and digests, private registries, and the supply-chain controls that make images trustworthy.',
  ['Authenticate and push to registries safely', 'Use tags and digests correctly', 'Run a private registry with TLS and storage', 'Understand scanning, SBOM and signing'],
  [
    mod('registry-operations', 'Registry operations', 'Auth, publishing and private registries.', [
      lesson('registry-auth', 'Registries and authentication', '10 min',
        'Docker Hub, GHCR, ECR and self-hosted registries all speak the same distribution API.',
        ['Log in without leaking passwords', 'Understand credential stores', 'Configure access for CI'],
        [
          text('One API, many providers', 'A registry implements the OCI Distribution API. Docker Hub, GitHub Container Registry, Amazon ECR, Google Artifact Registry and Harbor all accept `docker login`, `push` and `pull`. Image references encode the registry host, so `ghcr.io/acme/api` never goes to Docker Hub.'),
          code('bash', `# Never pass the password as an argument: it lands in shell history.
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# Inspect the credential configuration (hosts only, not secrets)
docker info --format '{{json .RegistryConfig}}'
cat ~/.docker/config.json

docker logout ghcr.io`, {
            note: 'Docker stores credentials in a credential helper (desktop, pass, secretservice) when configured; otherwise config.json contains base64 auth, not encryption.',
          }),
          callout('warning', 'config.json is not encrypted', 'Base64 is encoding, not encryption. Use a credential helper or short-lived tokens, and never commit ~/.docker/config.json.'),
        ],
        {
          quiz: quiz([
            q('Why use --password-stdin?', ['It is faster', 'It avoids exposing the password in process lists and history', 'It encrypts the password', 'It creates a token'], 1, 'stdin keeps the secret out of argv and shell history.'),
            q('How does Docker know which registry to push to?', ['A global setting', 'The registry host in the image reference', 'The Dockerfile', 'The container name'], 1, 'The first reference component selects the registry.'),
            q('What does a credential helper do?', ['Stores credentials in an external secure store', 'Encrypts image layers', 'Signs images', 'Runs a proxy'], 0, 'Helpers delegate storage to OS keychains or secret managers.'),
          ]),
          exercises: [
            ex('Safe login', 'Write a login command using an environment token.', 'printf \'%s\' "$TOKEN" | docker login REGISTRY -u USER --password-stdin'),
            ex('Find the store', 'Check whether a credsStore is configured.', 'Read ~/.docker/config.json and look for credsStore.'),
          ],
          related: ['push-pull-digests', 'private-registry', 'project-ci-pipeline'],
          tags: ['registry', 'security'],
          commands: ['docker login', 'docker logout'],
          sources: [docs('Registry authentication', 'reference/cli/docker/login/'), docs('Credential helpers', 'engine/security/trust/')],
        }),
      lesson('push-pull-digests', 'Tags, digests and publishing', '11 min',
        'Tags are convenient and mutable. Digests are precise and immutable. Production needs both, used deliberately.',
        ['Tag an image for a registry', 'Push and verify a digest', 'Pull by digest for reproducibility'],
        [
          text('The publishing sequence', 'Build with a local name, tag it with the full registry path, push, then read back the digest. The digest is the content identity; deploy by digest when you need an auditable guarantee that the artifact did not change.'),
          code('bash', `docker build -t acme/api:1.4.0 .
docker tag acme/api:1.4.0 ghcr.io/acme/api:1.4.0
docker push ghcr.io/acme/api:1.4.0

docker inspect --format '{{index .RepoDigests 0}}' ghcr.io/acme/api:1.4.0
# ghcr.io/acme/api@sha256:...

docker pull ghcr.io/acme/api@sha256:abc123...
docker run --rm ghcr.io/acme/api@sha256:abc123... --version`, {
            output: 'The push refers to repository [ghcr.io/acme/api]\n1.4.0: digest: sha256:abc123... size: 1573',
          }),
          table(['Reference', 'Mutable', 'Use'], [
            ['app:latest', 'Yes', 'Local experiments only'], ['app:1.4.0', 'Usually', 'Human-friendly releases'],
            ['app@sha256:…', 'No', 'Auditable production deploys'], ['app:1.4.0@sha256:…', 'No', 'Readable and exact'],
          ]),
          callout('warning', 'latest is not a version', 'It is a tag that moves. Deploying latest makes rollbacks ambiguous and caching unpredictable.'),
        ],
        {
          quiz: quiz([
            q('Which reference is immutable?', ['app:latest', 'app:1.4.0', 'app@sha256:...', 'app'], 2, 'A digest pins exact content.'),
            q('Does docker tag push the image?', ['Yes', 'No', 'Only to Docker Hub', 'Only with --push'], 1, 'Push is separate.'),
            q('What does RepoDigests contain?', ['Local image IDs', 'Registry digests for the image', 'Tags', 'Layer sizes'], 1, 'It maps repository references to content digests.'),
          ]),
          exercises: [
            ex('Publish', 'Tag and push an image to a registry path.', 'docker tag app:1.0 REGISTRY/team/app:1.0 && docker push REGISTRY/team/app:1.0'),
            ex('Pin', 'Write a run command pinned to a digest.', 'docker run --rm REGISTRY/team/app@sha256:...'),
          ],
          related: ['registry-auth', 'image-provenance', 'zero-downtime'],
          tags: ['registry', 'digests'],
          commands: ['docker tag', 'docker push', 'docker pull'],
          sources: [docs('Push', 'reference/cli/docker/image/push/'), docs('Digests', 'reference/cli/docker/image/pull/')],
        }),
      lesson('private-registry', 'Run a private registry', '11 min',
        'Deploy registry:2 behind TLS, persist its storage, and understand when a managed registry is the better choice.',
        ['Run a registry with persistent storage', 'Configure TLS or a reverse proxy', 'Push and pull from the local registry'],
        [
          text('A registry is a stateless-looking HTTP service', 'The reference `registry:2` image implements the distribution API. It stores blobs on the filesystem by default; production deployments put that path on a volume or object storage and terminate TLS in front of it. Without TLS, Docker refuses to authenticate except to localhost.'),
          code('yaml', `services:
  registry:
    image: registry:2.8
    restart: unless-stopped
    ports:
      - "127.0.0.1:5000:5000"
    environment:
      REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: /var/lib/registry
      REGISTRY_HTTP_ADDR: 0.0.0.0:5000
    volumes:
      - registry-data:/var/lib/registry

volumes:
  registry-data:`, {
            note: 'Localhost HTTP is treated as insecure-but-allowed. For remote access, add TLS or put Caddy/nginx in front.',
          }),
          code('bash', `docker compose up -d
docker tag alpine:3.20 localhost:5000/team/alpine:3.20
docker push localhost:5000/team/alpine:3.20
curl http://localhost:5000/v2/_catalog
curl http://localhost:5000/v2/team/alpine/tags/list`, {
            output: '{"repositories":["team/alpine"]}\n{"name":"team/alpine","tags":["3.20"]}',
          }),
          callout('danger', 'The registry has no authentication by default', 'Anyone who can reach the port can push and pull. Put authentication, authorization, TLS and rate limiting in front before exposing it beyond localhost.'),
        ],
        {
          quiz: quiz([
            q('Why does Docker refuse a remote HTTP registry?', ['HTTP is slower', 'It requires TLS for authenticated remote access', 'The registry image lacks HTTP', 'It needs Swarm'], 1, 'Insecure registries must be explicitly allow-listed, which is discouraged.'),
            q('Where should registry blobs live in production?', ['Container writable layer', 'A volume or object storage', 'The image', 'tmpfs'], 1, 'The writable layer is deleted with the container.'),
            q('Which endpoint lists repositories?', ['/v2/_catalog', '/v2/repos', '/_api/repositories', '/health'], 0, 'The catalog endpoint is part of the distribution API.'),
          ]),
          exercises: [
            ex('Local registry', 'Run registry:2 on 127.0.0.1:5000 with a named volume.', 'Use the compose file above and verify /v2/_catalog.'),
            ex('Push to it', 'Tag alpine and push it to localhost:5000/team/alpine:3.20.', 'docker tag + docker push, then check the catalog.'),
          ],
          related: ['registry-auth', 'production-compose', 'image-provenance'],
          tags: ['registry', 'self-hosted'],
          commands: ['docker push', 'docker pull', 'docker compose'],
          sources: [docs('Deploy a registry server', 'registry/deploying/'), docs('Registry configuration', 'registry/configuration/')],
        }),
    ]),
  ],
  ['docker-images'],
));

// ─────────────────────────────────────────────────────────────
// 12. Docker Security
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-security', 12, 'Docker Security', 'Hardening containers, images and the daemon', 'Advanced', '2h 10m', 'shield', 'red',
  'Containers share the host kernel. Security is a set of layered controls: least privilege, minimal images, secret hygiene, provenance and daemon hardening.',
  ['Threat-model a container deployment', 'Apply non-root, capability, seccomp and filesystem controls', 'Manage secrets without baking them into images', 'Harden the Docker daemon and supply chain'],
  [
    mod('container-hardening', 'Container hardening', 'Reduce privilege and attack surface.', [
      lesson('container-security', 'The container security model', '13 min',
        'What isolation gives you, what it does not, and the controls that actually reduce risk.',
        ['Name the default privileges of a container', 'Drop capabilities and run non-root', 'Use read-only filesystems and seccomp'],
        [
          text('Shared kernel, shared risk', 'A container is a process on the host kernel with namespaces and cgroups. A kernel vulnerability or a misconfigured privileged container can compromise the host. Docker’s defaults are reasonable but not a security boundary on their own.\n\nThe highest-leverage controls are: run as non-root, drop unnecessary capabilities, use a read-only root filesystem, apply a seccomp profile, and never mount the Docker socket into an application container.'),
          code('bash', `docker run -d --name hardened \\
  --user 10001:10001 \\
  --cap-drop ALL \\
  --security-opt no-new-privileges \\
  --security-opt seccomp=/etc/docker/seccomp.json \\
  --read-only \\
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \\
  --memory 256m --pids-limit 128 \\
  nginxinc/nginx-unprivileged:1.27-alpine`, {
            note: 'The unprivileged nginx image listens on 8080 and runs without root. Pair read-only with tmpfs for paths the app must write.',
          }),
          table(['Control', 'Flag / setting', 'Stops'], [
            ['User', 'USER / --user', 'Root inside container'], ['Capabilities', '--cap-drop ALL', 'Mount, ptrace, raw sockets'],
            ['No new privileges', '--security-opt no-new-privileges', 'setuid escalation'], ['Filesystem', '--read-only + tmpfs', 'Persistence of a compromise'],
            ['Syscalls', 'seccomp profile', 'Dangerous kernel calls'], ['Resources', '--memory --pids-limit', 'DoS / fork bombs'],
          ]),
          callout('danger', 'Never mount docker.sock into an app', 'It is a root-equivalent API. A compromised web app becomes a host compromise. Use a narrowly scoped proxy or a separate deployment mechanism.'),
        ],
        {
          quiz: quiz([
            q('What is the strongest reason not to run as root?', ['Slower startup', 'A container escape or app compromise gains fewer host privileges', 'Images are larger', 'Logs are noisy'], 1, 'Least privilege limits blast radius.'),
            q('What does --read-only do?', ['Encrypts the filesystem', 'Makes the root filesystem read-only', 'Disables volumes', 'Drops capabilities'], 1, 'Writable paths must be explicitly mounted.'),
            q('Why is docker.sock dangerous in a container?', ['It is slow', 'It grants control of the Docker daemon', 'It uses too much disk', 'It breaks DNS'], 1, 'The daemon can start privileged containers and mount host paths.'),
          ]),
          exercises: [
            ex('Harden nginx', 'Run unprivileged nginx with a read-only root and tmpfs for /tmp.', 'Combine --read-only, --tmpfs /tmp, --cap-drop ALL, --security-opt no-new-privileges.'),
            ex('Check capabilities', 'Inspect a container and list its capabilities.', 'docker inspect --format "{{json .HostConfig.CapDrop}} {{json .HostConfig.CapAdd}}".'),
          ],
          related: ['secrets-management', 'daemon-security', 'production-dockerfile'],
          tags: ['security', 'hardening'],
          commands: ['docker run', 'docker inspect'],
          sources: [docs('Security', 'engine/security/'), docs('Seccomp', 'engine/security/seccomp/')],
        }),
      lesson('secrets-management', 'Secrets management', '11 min',
        'Keep credentials out of images, environment variables and logs.',
        ['Identify where secrets leak', 'Use BuildKit secrets and Compose secrets', 'Integrate an external secret manager'],
        [
          text('Where secrets leak', 'Secrets leak through image layers, build args, environment variables, logs, crash dumps, shell history, CI output, and world-readable files. Deleting a secret in a later Dockerfile layer does not remove it from the earlier layer.'),
          table(['Mechanism', 'Safe for secrets?', 'Why'], [
            ['ENV / --env', 'No', 'Visible in inspect and /proc'], ['ARG', 'No', 'Visible in image history'],
            ['COPY .env', 'No', 'Stored in a layer permanently'], ['BuildKit secret mount', 'Yes', 'Not persisted in layers'],
            ['Compose secret file', 'Yes', 'Mounted at runtime, not in image'], ['External vault', 'Yes', 'Injected at runtime, rotated centrally'],
          ]),
          code('dockerfile', `# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \\
    npm ci
COPY . .
RUN npm run build`, {
            note: 'Build with: docker build --secret id=npmrc,src=$HOME/.npmrc .',
          }),
          callout('warning', 'Rotation is part of secret management', 'A secret that cannot be rotated is an incident waiting to happen. Prefer short-lived tokens and automate rotation.'),
        ],
        {
          quiz: quiz([
            q('Which build mechanism is safe for secrets?', ['ARG', 'ENV', 'RUN --mount=type=secret', 'COPY .env'], 2, 'Secret mounts are not stored in layers.'),
            q('Why is deleting a secret in a later layer insufficient?', ['Layers are encrypted', 'The earlier layer still contains it', 'Docker caches env vars', 'Secrets are immutable'], 1, 'Image layers are additive; history remains.'),
            q('What is the best long-term secret strategy?', ['One shared .env file', 'A secret manager with rotation and least privilege', 'Secrets in the image', 'Secrets in Git'], 1, 'Central management and rotation reduce exposure.'),
          ]),
          exercises: [
            ex('Build secret', 'Write a RUN that uses a secret named pip_conf.', 'RUN --mount=type=secret,id=pip_conf,target=/etc/pip.conf pip install -r requirements.txt'),
            ex('Audit an image', 'Find environment variables that look sensitive.', 'docker image inspect IMAGE --format "{{json .Config.Env}}" and grep for TOKEN/PASSWORD/KEY.'),
          ],
          related: ['container-security', 'compose-environment-secrets', 'image-provenance'],
          tags: ['security', 'secrets'],
          commands: ['docker build', 'docker inspect'],
          sources: [docs('Build secrets', 'build/building/secrets/'), docs('Compose secrets', 'compose/how-tos/use-secrets/')],
        }),
      lesson('image-provenance', 'Scanning, SBOMs and signing', '11 min',
        'Know what is in an image, where it came from, and whether it has been tampered with.',
        ['Scan images for vulnerabilities', 'Generate and inspect an SBOM', 'Sign and verify images'],
        [
          text('Three questions', '**What is inside?** A software bill of materials (SBOM) lists packages and versions. **Is it vulnerable?** A scanner maps packages to advisories. **Is it the image I built?** A signature and provenance attestation answer that.\n\nDocker Scout, Trivy, Grype and registry-native scanners cover the first two. Sigstore/cosign and Docker’s attestations cover provenance. Pin base images and rebuild regularly; scanners only help if you act on results.'),
          code('bash', `# Docker Scout (when available)
docker scout cves registry.example.com/acme/api:1.4
docker scout sbom registry.example.com/acme/api:1.4

# BuildKit provenance and SBOM attestations
docker buildx build \\
  --provenance=true --sbom=true \\
  -t registry.example.com/acme/api:1.4 --push .

# cosign verification (if signatures are used)
cosign verify registry.example.com/acme/api:1.4 \\
  --certificate-identity-regexp 'https://github.com/acme/.*' \\
  --certificate-oidc-issuer https://token.actions.githubusercontent.com`, {
            note: 'Scanners and cosign are separate tools; OpsDeck does not install them for you.',
          }),
          callout('info', 'SBOMs are not a security feature by themselves', 'They are inventory. Pair them with continuous scanning and a rebuild policy.'),
        ],
        {
          quiz: quiz([
            q('What does an SBOM contain?', ['Image signatures', 'A list of components and versions', 'Runtime secrets', 'Host kernel modules'], 1, 'It is a software bill of materials.'),
            q('What does cosign verify prove?', ['The image is vulnerability-free', 'The signature matches a trusted identity', 'The image is small', 'The registry is private'], 1, 'Verification checks signature and identity.'),
            q('Why rebuild images regularly?', ['To change the tag', 'To pick up base image and dependency security fixes', 'To reduce layers', 'To reset volumes'], 1, 'New vulnerabilities are disclosed after an image is built.'),
          ]),
          exercises: [
            ex('Generate attestations', 'Build with provenance and SBOM and push.', 'docker buildx build --provenance=true --sbom=true -t ... --push .'),
            ex('Scan', 'Run a vulnerability scan on an image you use.', 'docker scout cves IMAGE or trivy image IMAGE.'),
          ],
          related: ['push-pull-digests', 'secrets-management', 'project-ci-pipeline'],
          tags: ['security', 'supply-chain'],
          commands: ['docker buildx build', 'docker scout'],
          sources: [docs('Supply chain', 'build/attestations/'), docs('Docker Scout', 'scout/')],
        }),
      lesson('daemon-security', 'Daemon and host hardening', '12 min',
        'The engine is the real privileged component. Protect its socket, configuration and update path.',
        ['Harden the Docker socket and remote access', 'Configure daemon logging and user namespaces', 'Understand rootless mode trade-offs'],
        [
          text('The daemon is root', 'Anyone with socket access can mount the host filesystem and start a privileged container. Restrict the socket with filesystem permissions, avoid exposing TCP without mutual TLS, and never give application containers the socket. Rootless mode runs the daemon as a normal user, reducing the impact of a daemon compromise at the cost of some networking and storage features.'),
          code('json', `{
  "icc": false,
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "userns-remap": "default",
  "live-restore": true
}`, {
            note: 'daemon.json lives at /etc/docker/daemon.json on Linux. Validate with dockerd --validate --config-file and restart deliberately.',
          }),
          code('bash', `# Check socket ownership
ls -l /var/run/docker.sock

# Rootless mode
dockerd-rootless-setuptool.sh install
systemctl --user status docker

# Audit daemon config
docker info --format '{{json .SecurityOptions}}'`, {
            output: '["name=seccomp,profile=builtin","name=cgroupns"]',
          }),
          callout('danger', 'Remote TCP without TLS is host takeover', 'Port 2375 has no authentication. Use `dockerd --tlsverify` with mutual TLS, or SSH contexts, and firewall the port.'),
        ],
        {
          quiz: quiz([
            q('What is the safest way to give a CI job access to Docker?', ['Mount docker.sock with write access', 'Use a dedicated remote engine with scoped credentials', 'Expose TCP 2375', 'Run privileged containers'], 1, 'Isolate the engine and scope credentials.'),
            q('What does rootless mode change?', ['Runs the daemon as a non-root user', 'Encrypts images', 'Removes namespaces', 'Disables seccomp'], 0, 'It reduces daemon privilege.'),
            q('Why set log rotation?', ['To reduce image size', 'To stop logs filling the host disk', 'To encrypt logs', 'To enable DNS'], 1, 'json-file logs grow without max-size/max-file.'),
          ]),
          exercises: [
            ex('Audit socket', 'Check the permissions and group of docker.sock.', 'ls -l /var/run/docker.sock; getent group docker.'),
            ex('Security options', 'Print the active security options.', 'docker info --format "{{json .SecurityOptions}}".'),
          ],
          related: ['container-security', 'daemon-config', 'contexts'],
          tags: ['security', 'daemon'],
          commands: ['docker info'],
          sources: [docs('Daemon security', 'engine/security/'), docs('Rootless mode', 'engine/security/rootless/')],
        }),
    ]),
  ],
  ['docker-containers', 'docker-images'],
));

// ─────────────────────────────────────────────────────────────
// 13. Docker Performance
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-performance', 13, 'Docker Performance', 'Measure, limit and optimise containers and builds', 'Advanced', '1h 10m', 'gauge', 'amber',
  'Performance work starts with measurement. Learn how CPU, memory, I/O and build time behave under Docker and where the real bottlenecks are.',
  ['Apply resource limits without starving services', 'Reduce image size and startup time', 'Profile build and runtime performance', 'Interpret docker stats correctly'],
  [
    mod('performance-model', 'Performance model', 'Limits, footprint and measurement.', [
      lesson('resource-limits', 'CPU, memory and I/O limits', '11 min',
        'What the flags actually do, and why limits without requests can hurt.',
        ['Translate --cpus and --memory into cgroup behaviour', 'Avoid OOM kills and CPU throttling surprises', 'Set PID limits against fork bombs'],
        [
          text('Limits are ceilings, not reservations', '`--cpus 1.5` sets a CPU quota (150% of one core). `--memory 512m` is a hard limit; exceeding it triggers the OOM killer. `--pids-limit` caps processes and threads. `--blkio-weight` is a relative share, not a bandwidth guarantee.\n\nA container with a CPU quota that is too low will be throttled even when the host is idle. Watch `cpu.stat` (nr_throttled, throttled_time) when latency is unexplained.'),
          code('bash', `docker run -d --name api \\
  --cpus 1.5 \\
  --memory 512m --memory-swap 512m \\
  --pids-limit 256 \\
  --blkio-weight 500 \\
  acme/api:1.4

docker stats --no-stream
docker inspect api --format '{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}} {{.HostConfig.PidsLimit}}'`, {
            output: '1500000000 536870912 256',
          }),
          callout('warning', 'Java and Node need heap awareness', 'A JVM may see host memory unless you set -XX:MaxRAMPercentage or use container-aware defaults. Node’s default heap can also exceed a small container limit.'),
        ],
        {
          quiz: quiz([
            q('What does --cpus 0.5 mean?', ['50% of all host cores', 'Half of one CPU core', 'Half a gigabyte of RAM', 'Priority 0.5'], 1, 'It sets a quota equal to half a core.'),
            q('A container exceeds --memory. What happens?', ['It is throttled', 'The kernel OOM killer may terminate processes', 'Docker raises the limit', 'It restarts automatically'], 1, 'Memory is a hard limit.'),
            q('What does --pids-limit protect against?', ['Port exhaustion', 'Fork bombs and runaway threads', 'DNS failures', 'Disk bloat'], 1, 'It caps the number of processes/threads.'),
          ]),
          exercises: [
            ex('Set limits', 'Run nginx with 1 CPU and 256 MB hard memory.', 'docker run --cpus 1 --memory 256m --memory-swap 256m nginx:alpine', { command: 'docker run -d --cpus 1 --memory 256m --memory-swap 256m nginx:alpine' }),
            ex('Read throttling', 'Find the cgroup for a container and read cpu.stat.', 'Use the container id under /sys/fs/cgroup and inspect nr_throttled/throttled_usec.'),
          ],
          related: ['runtime-performance', 'config-and-resources', 'namespaces-cgroups'],
          tags: ['performance', 'resources'],
          commands: ['docker run', 'docker stats', 'docker inspect'],
          sources: [docs('Resource constraints', 'engine/containers/resource_constraints/')],
        }),
      lesson('image-size-startup', 'Image size and startup', '10 min',
        'Smaller images pull faster, start faster and have a smaller attack surface — but size is not the only goal.',
        ['Measure image size and layer contribution', 'Choose base images deliberately', 'Reduce startup time without breaking signals'],
        [
          text('Where size comes from', 'Most oversized images contain build tools, package caches, documentation or duplicate dependencies. Multi-stage builds and cache mounts remove build-time bytes. `docker image history` shows which instruction contributed which layer; `dive` gives a file-level view.\n\nDo not chase the smallest possible image blindly. A distroless image is harder to debug; Alpine uses musl, which can break native modules. Optimise for the operational model you can support.'),
          code('bash', `docker image ls --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}'
docker image history --no-trunc acme/api:1.4
docker run --rm acme/api:1.4 du -sh /app /usr/local/lib/node_modules 2>/dev/null

# Compare a shell-form vs exec-form startup
docker inspect acme/api:1.4 --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}'`, {
            note: 'A smaller image is not automatically faster at runtime; startup is dominated by process initialisation and health checks.',
          }),
          table(['Change', 'Size', 'Startup', 'Trade-off'], [
            ['Multi-stage', '↓↓', '~', 'Build complexity'], ['Alpine base', '↓', '↓', 'musl compatibility'],
            ['distroless', '↓↓', '↓', 'Harder debugging'], ['Remove dev deps', '↓', '↓', 'Separate test image'],
            ['Precompile assets', '↓', '↓↓', 'Build time'],
          ]),
          callout('tip', 'Measure pull time in your network', 'A 1 GB image is painful on a slow link even if it is fine in a datacenter. Optimise for the slowest environment that must run it.'),
        ],
        {
          quiz: quiz([
            q('Which command shows per-layer size contribution?', ['docker image ls', 'docker image history', 'docker ps', 'docker stats'], 1, 'History lists layer sizes and commands.'),
            q('What is a trade-off of distroless images?', ['They are larger', 'They lack a shell and debugging tools', 'They cannot run Node', 'They require root'], 1, 'Debugging requires ephemeral containers or a debug variant.'),
            q('Why can Alpine break Node native modules?', ['It uses musl instead of glibc', 'It has no kernel', 'It disables DNS', 'It uses Windows containers'], 0, 'Prebuilt native binaries may target glibc.'),
          ]),
          exercises: [
            ex('Layer audit', 'Find the largest layer in an image.', 'docker image history --no-trunc IMAGE and compare sizes.'),
            ex('Measure startup', 'Time a container from start to healthy.', 'Use time docker run with a health check, or inspect StartedAt and health status.'),
          ],
          related: ['multi-stage-builds', 'runtime-performance', 'production-dockerfile'],
          tags: ['performance', 'images'],
          commands: ['docker image history', 'docker image ls'],
          sources: [docs('Best practices', 'build/building/best-practices/')],
        }),
      lesson('runtime-performance', 'Runtime performance and stats', '11 min',
        'Read docker stats correctly, distinguish host and container load, and find the real bottleneck.',
        ['Interpret CPU %, memory usage and I/O counters', 'Recognise noisy-neighbour effects', 'Use cgroup data when stats is not enough'],
        [
          text('What docker stats reports', 'CPU % is relative to one core on most platforms, so 250% means 2.5 cores. Memory usage includes page cache for the cgroup; it is not the same as application heap. Network and block I/O are cumulative counters, so compare deltas over time rather than absolute values.'),
          code('bash', `docker stats --no-stream --format 'table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.NetIO}}\\t{{.BlockIO}}\\t{{.PIDs}}'

# Host-level view of a container cgroup
cat /sys/fs/cgroup/system.slice/docker-<id>.scope/memory.current
cat /sys/fs/cgroup/system.slice/docker-<id>.scope/cpu.stat

# Process tree
docker top CONTAINER`, {
            output: 'NAME   CPU %   MEM USAGE / LIMIT   NET I/O         BLOCK I/O     PIDS\napi    0.42%   82.1MiB / 512MiB    1.2MB / 840kB   0B / 4.1kB   7',
          }),
          callout('warning', 'A container is not a VM', 'Host CPU steal, memory pressure and disk I/O affect every container. If all containers are slow, look at the host before tuning individual limits.'),
        ],
        {
          quiz: quiz([
            q('CPU 250% in docker stats means…', ['250 host cores', '2.5 cores worth of CPU', '250 MB', 'A throttle'], 1, 'Percent is relative to a single core.'),
            q('Memory usage includes…', ['Only heap', 'Cgroup memory including page cache', 'Only RSS', 'Only swap'], 1, 'Cgroup accounting includes page cache.'),
            q('What is the first step in performance debugging?', ['Increase limits', 'Measure and identify the bottleneck', 'Restart containers', 'Add replicas'], 1, 'Optimise based on evidence.'),
          ]),
          exercises: [
            ex('Baseline', 'Capture three stats samples 5 seconds apart for one container.', 'Run docker stats --no-stream repeatedly and compare counters.'),
            ex('Cgroup memory', 'Read memory.current for a container.', 'Use the cgroup path from docker inspect or systemd-cgls.'),
          ],
          related: ['resource-limits', 'monitoring-stack', 'image-size-startup'],
          tags: ['performance', 'monitoring'],
          commands: ['docker stats', 'docker top'],
          sources: [docs('docker stats', 'reference/cli/docker/container/stats/')],
        }),
    ]),
  ],
  ['docker-containers'],
));

// ─────────────────────────────────────────────────────────────
// 14. Docker Monitoring
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-monitoring', 14, 'Docker Monitoring', 'Logs, metrics, events and health', 'Intermediate', '1h 25m', 'activity', 'cyan',
  'A running container is not the same as a healthy service. Learn the signals Docker exposes and how to turn them into a monitoring stack you can trust.',
  ['Use stats, events and health checks effectively', 'Configure logging drivers with rotation', 'Build a cAdvisor + Prometheus + Grafana stack', 'Alert on symptoms that matter'],
  [
    mod('observability', 'Observability', 'The signals and the stack.', [
      lesson('stats-events', 'Stats and events', '10 min',
        'The built-in telemetry: resource usage snapshots and the Docker event stream.',
        ['Read docker stats and docker events', 'Filter events by type and object', 'Know the limits of built-in metrics'],
        [
          text('Events tell the story', '`docker events` streams daemon-level events: container start/die/oom, image pull, network connect, volume mount. Filter with `--filter type=container --filter event=die` or by label. Events are essential for correlating a failure with a deployment or OOM kill.\n\nStats are point-in-time resource samples. Neither is a long-term metrics store; export to Prometheus or your platform if you need retention and alerting.'),
          code('bash', `docker events --filter type=container --filter event=die --format '{{json .}}'
docker events --since 1h --until now --filter label=com.docker.compose.project=acme
docker stats --no-stream
docker inspect --format '{{.State.OOMKilled}} {{.State.ExitCode}}' api`, {
            output: '{"Type":"container","Action":"die","Actor":{"ID":"...","Attributes":{"exitCode":"137",...}},"time":...}',
          }),
          callout('info', 'Event retention is short', 'The daemon keeps only recent events. If you need history, ship them to a log pipeline or use Prometheus-style metrics.'),
        ],
        {
          quiz: quiz([
            q('Which event indicates an OOM kill?', ['start', 'die with exitCode 137', 'pull', 'connect'], 1, 'Exit 137 plus OOMKilled=true.'),
            q('Are docker stats persisted?', ['Yes, for 30 days', 'No, they are live snapshots', 'Only with Compose', 'Only in Swarm'], 1, 'Use an external metrics store for retention.'),
            q('How do you filter events to one Compose project?', ['--filter project=', '--filter label=com.docker.compose.project=NAME', '--name', '--scope'], 1, 'Labels identify Compose resources.'),
          ]),
          exercises: [
            ex('Watch a crash', 'Stream events and kill a container in another terminal.', 'A die event with exitCode 137/143 appears.'),
            ex('Snapshot', 'Capture one stats sample for all running containers.', 'docker stats --no-stream'),
          ],
          related: ['monitoring-stack', 'container-exits', 'logging-drivers'],
          tags: ['monitoring', 'events'],
          commands: ['docker events', 'docker stats', 'docker inspect'],
          sources: [docs('docker events', 'reference/cli/docker/system/events/'), docs('docker stats', 'reference/cli/docker/container/stats/')],
        }),
      lesson('logging-drivers', 'Logging drivers and rotation', '11 min',
        'Where stdout goes, how to rotate it, and why JSON files fill disks.',
        ['Choose a logging driver', 'Configure rotation for json-file', 'Ship logs centrally'],
        [
          text('stdout is the contract', 'Applications should log to stdout/stderr. The daemon captures those streams with a logging driver. The default `json-file` writes files under `/var/lib/docker/containers/<id>/`; without rotation they can fill the disk.\n\n`local` is a better default for many installations. `journald`, `syslog`, `fluentd`, `gelf` and cloud drivers ship logs elsewhere. Driver support differs by platform.'),
          code('bash', `docker run -d --name api \\
  --log-driver json-file \\
  --log-opt max-size=10m \\
  --log-opt max-file=3 \\
  acme/api:1.4

docker inspect api --format '{{json .HostConfig.LogConfig}}'
docker logs --since 15m --tail 200 api

# Daemon-wide default in /etc/docker/daemon.json
# { "log-driver": "local", "log-opts": { "max-size": "10m" } }`, {
            note: 'Changing the daemon default does not rewrite existing containers; recreate them.',
          }),
          callout('warning', 'docker logs only works with local drivers', 'If you ship logs with a remote driver, `docker logs` may return nothing. Query the central system instead.'),
        ],
        {
          quiz: quiz([
            q('Where does json-file store logs?', ['/var/log/docker', '/var/lib/docker/containers/<id>/', '/tmp', 'The image'], 1, 'Per-container JSON files live under the Docker root.'),
            q('Why set max-size and max-file?', ['Faster logs', 'Prevent unbounded disk growth', 'Encrypt logs', 'Enable DNS'], 1, 'Rotation caps disk usage.'),
            q('Which driver is a good local default?', ['none', 'local', 'syslog only', 'fluentd'], 1, 'local is designed as a better default than json-file.'),
          ]),
          exercises: [
            ex('Rotate', 'Run a container with 5 MB logs and 2 files.', '--log-opt max-size=5m --log-opt max-file=2'),
            ex('Audit driver', 'Check the logging driver of a running container.', 'docker inspect --format "{{.HostConfig.LogConfig.Type}}" NAME'),
          ],
          related: ['stats-events', 'monitoring-stack', 'disk-space'],
          tags: ['monitoring', 'logging'],
          commands: ['docker logs', 'docker inspect'],
          sources: [docs('Logging drivers', 'config/containers/logging/configure/')],
        }),
      lesson('healthchecks', 'Health checks that mean something', '10 min',
        'A port check is not a health check. Design probes that test the service contract.',
        ['Write effective HEALTHCHECK / compose healthcheck', 'Tune interval, timeout, retries and start period', 'Avoid health checks that damage the service'],
        [
          text('What should be checked', 'A good health check exercises the dependency path that matters: database connectivity, cache availability, or a `/health/ready` endpoint that verifies downstreams. A shallow TCP check only proves the process is listening. A deep check on every probe can overload dependencies — separate liveness (is the process alive?) from readiness (can it serve traffic?).'),
          code('dockerfile', `HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, {
            note: 'The command must exit 0 for healthy and non-zero for unhealthy. Output is stored in the health log.',
          }),
          code('bash', `docker inspect --format '{{json .State.Health}}' api
docker ps --filter health=unhealthy`, {
            output: '{"Status":"healthy","FailingStreak":0,"Log":[...]}',
          }),
          callout('tip', 'Start period prevents restart storms', 'Give slow starters time. Without start_period, a legitimate 40-second boot can be marked unhealthy and restarted repeatedly.'),
        ],
        {
          quiz: quiz([
            q('What exit code marks a container healthy?', ['0', '1', '2', '200'], 0, 'Zero means healthy.'),
            q('Why separate liveness and readiness?', ['They use different ports', 'A dependency outage should not always restart the process', 'Docker requires it', 'It reduces image size'], 1, 'Restarting on a dependency outage can make things worse.'),
            q('What does start_period do?', ['Delays health failure accounting during startup', 'Stops the container', 'Sets the restart policy', 'Enables logs'], 0, 'It gives the app time to initialise.'),
          ]),
          exercises: [
            ex('Readiness probe', 'Add a HEALTHCHECK that calls /health/ready with a 20s start period.', 'Use CMD with curl/node and --start-period=20s.'),
            ex('Find unhealthy', 'List unhealthy containers.', 'docker ps --filter health=unhealthy'),
          ],
          related: ['compose-health-dependencies', 'monitoring-stack', 'troubleshooting-method'],
          tags: ['monitoring', 'health'],
          commands: ['docker inspect', 'docker ps'],
          sources: [docs('HEALTHCHECK', 'reference/dockerfile/#healthcheck'), docs('Compose healthcheck', 'compose/compose-file/05-services/#healthcheck')],
        }),
      lesson('monitoring-stack', 'A cAdvisor + Prometheus + Grafana stack', '13 min',
        'A practical Compose stack for container metrics, with the security caveats called out.',
        ['Deploy cAdvisor, Prometheus and Grafana with Compose', 'Scrape container metrics', 'Protect the Docker socket exposure'],
        [
          text('The standard open-source stack', 'cAdvisor reads container cgroups and exposes Prometheus metrics. Prometheus scrapes and stores them. Grafana queries Prometheus and renders dashboards. All three run comfortably in Compose on a single host. cAdvisor needs read access to the Docker socket and host cgroups; treat that access as sensitive and restrict the network.'),
          code('yaml', `services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    ports: ["127.0.0.1:8080:8080"]
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    devices:
      - /dev/kmsg
    restart: unless-stopped
    networks: [monitoring]

  prometheus:
    image: prom/prometheus:v2.55.1
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    ports: ["127.0.0.1:9090:9090"]
    networks: [monitoring]

  grafana:
    image: grafana/grafana:11.3.0
    volumes:
      - grafana-data:/var/lib/grafana
    ports: ["127.0.0.1:3001:3000"]
    networks: [monitoring]

networks:
  monitoring:
volumes:
  prometheus-data:
  grafana-data:`, {
            note: 'This stack is for a trusted host. Do not publish cAdvisor or Prometheus publicly.',
          }),
          code('yaml', `# prometheus.yml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: cadvisor
    static_configs:
      - targets: ["cadvisor:8080"]
  - job_name: docker
    static_configs:
      - targets: ["host.docker.internal:9323"]`, {
            note: 'The Docker daemon can expose metrics on :9323 when configured with metrics-addr.',
          }),
          callout('danger', 'Mounting the Docker socket is a privilege', 'cAdvisor and many exporters mount it read-only, but the socket is still powerful. Isolate the monitoring network and run the stack on a dedicated host or with a restricted socket proxy.'),
        ],
        {
          quiz: quiz([
            q('What does cAdvisor expose?', ['Container metrics for Prometheus', 'Container logs', 'TLS certificates', 'Compose files'], 0, 'It exposes cgroup and container metrics.'),
            q('Why bind monitoring ports to 127.0.0.1?', ['Faster', 'Prevent public exposure of metrics and dashboards', 'Enable TLS', 'Reduce memory'], 1, 'Monitoring endpoints often lack authentication.'),
            q('What does Prometheus do?', ['Scrapes and stores time-series metrics', 'Renders dashboards', 'Runs containers', 'Builds images'], 0, 'Grafana visualises Prometheus data.'),
          ]),
          exercises: [
            ex('Deploy the stack', 'Bring up cAdvisor + Prometheus + Grafana locally.', 'Use the compose file and confirm the three containers are running.'),
            ex('Query', 'In Prometheus, query container_cpu_usage_seconds_total.', 'The metric appears for running containers after a scrape interval.'),
          ],
          related: ['stats-events', 'healthchecks', 'production-observability'],
          tags: ['monitoring', 'compose'],
          commands: ['docker compose up'],
          sources: [docs('Prometheus metrics', 'config/daemon/#metrics-address'), docs('cAdvisor', 'https://github.com/google/cadvisor')],
        }),
    ]),
  ],
  ['docker-containers', 'docker-compose'],
));

// ─────────────────────────────────────────────────────────────
// 15. Docker Troubleshooting
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-troubleshooting', 15, 'Docker Troubleshooting', 'A systematic method for real failures', 'Intermediate', '1h 40m', 'wrench', 'red',
  'Stop guessing. Learn a repeatable diagnostic method and the specific failure signatures for exits, ports, disk pressure and builds.',
  ['Apply a layered diagnostic method', 'Diagnose immediate container exits', 'Resolve port, network and disk problems', 'Read BuildKit failures correctly'],
  [
    mod('diagnostics', 'Diagnostics', 'Method and common failure signatures.', [
      lesson('troubleshooting-method', 'A systematic method', '11 min',
        'Observe, narrow, verify. The same loop works for every Docker problem.',
        ['Collect the right evidence before changing anything', 'Separate host, engine, container and application layers', 'Write a useful bug report'],
        [
          text('The loop', 'Start with the exact error and the layer that produced it. Reproduce with the smallest command. Check `docker inspect`, logs and events before editing configuration. Change one variable at a time. Record what you changed; most long incidents are a pile of untracked changes.'),
          steps([
            { title: 'Identify the layer', body: 'Is it the CLI, daemon, image build, container start, networking, or the application?' },
            { title: 'Collect evidence', body: 'Exact command, full error, docker version, docker info, inspect state, logs, events.' },
            { title: 'Reproduce minimally', body: 'Run the same image with a trivial command to separate image problems from application problems.' },
            { title: 'Change one thing', body: 'Test a single hypothesis. Revert if it does not help.' },
            { title: 'Verify and document', body: 'Confirm the fix with a health check and leave a note in the runbook.' },
          ]),
          code('bash', `docker version
docker info
docker inspect --format '{{json .State}}' NAME
docker logs --tail 200 --timestamps NAME
docker events --since 30m --filter container=NAME
docker stats --no-stream NAME
journalctl -u docker --since '30 min ago' --no-pager | tail -100`, {
            note: 'These commands answer most "why did it fail?" questions before you touch a config file.',
          }),
          callout('tip', 'Read the first error, not the last', 'Later errors are often consequences. In a stack trace or build log, the first causal failure is usually the one to fix.'),
        ],
        {
          quiz: quiz([
            q('What should you do before changing configuration?', ['Restart Docker', 'Collect evidence and identify the layer', 'Delete containers', 'Rebuild images'], 1, 'Evidence prevents guesswork.'),
            q('Which command shows recent daemon-level events for a container?', ['docker logs', 'docker events --filter container=NAME', 'docker top', 'docker diff'], 1, 'Events include start/die/oom and more.'),
            q('Why change one variable at a time?', ['It is faster', 'To know which change fixed or broke the system', 'Docker requires it', 'It reduces logs'], 1, 'Multiple changes make causality impossible.'),
          ]),
          exercises: [
            ex('Evidence pack', 'Write the five commands you would collect for a container that keeps restarting.', 'version, inspect state, logs, events, stats/journal.'),
            ex('Minimal repro', 'A custom image exits immediately. What trivial command tests the image itself?', 'docker run --rm IMAGE sh (or the shell available) to inspect files and entrypoint.'),
          ],
          related: ['container-exits', 'disk-space', 'build-failures'],
          tags: ['troubleshooting'],
          commands: ['docker inspect', 'docker logs', 'docker events'],
          sources: [docs('Troubleshooting', 'engine/troubleshooting/')],
        }),
      lesson('container-exits', 'Container exits immediately', '12 min',
        'The most common Docker problem, diagnosed by exit code, logs and command.',
        ['Interpret exit codes 0, 1, 126, 127, 137, 143', 'Find why PID 1 terminated', 'Use an override command to debug an image'],
        [
          text('Exit codes are evidence', '`0` means success — a one-shot job can exit immediately and that is correct. `1` is a general application error. `126` means command found but not executable. `127` means command not found. `137` is SIGKILL (often OOM). `143` is SIGTERM. Read the code before reading the logs, then read the logs.'),
          code('bash', `docker ps -a --filter name=app
docker inspect app --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}}'
docker logs app
docker inspect app --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}'

# Override the entrypoint to inspect the filesystem
docker run --rm -it --entrypoint sh IMAGE`, {
            output: 'status=exited exit=127 oom=false error=',
            note: 'Exit 127 usually means the command in CMD/ENTRYPOINT does not exist in the image or PATH.',
          }),
          table(['Symptom', 'Likely cause'], [
            ['Exit 0 immediately', 'Command is a one-shot or daemonizes'], ['Exit 127', 'Binary missing / wrong PATH'],
            ['Exit 126', 'Permission denied / not executable'], ['Exit 137', 'OOM kill or manual SIGKILL'],
            ['Restart loop', 'App crashes or dependency unavailable'], ['No logs', 'App writes to a file, not stdout'],
          ]),
          callout('warning', 'A daemonizing process is a bug in a container', 'If the app forks to the background, PID 1 exits and the container stops. Run in the foreground and let Docker supervise.'),
        ],
        {
          quiz: quiz([
            q('Exit code 127 means…', ['OOM', 'Command not found', 'Success', 'SIGTERM'], 1, 'The shell could not find the command.'),
            q('Exit code 137 means…', ['Success', 'SIGKILL, often OOM', 'Permission denied', 'Port conflict'], 1, '128 + 9. Check OOMKilled.'),
            q('How do you debug an image whose entrypoint exits instantly?', ['Increase memory', 'Override entrypoint with a shell', 'Use host networking', 'Prune images'], 1, 'Run --entrypoint sh to inspect the image.'),
          ]),
          exercises: [
            ex('Diagnose', 'A container exits 127. List the first three checks.', 'Entrypoint/Cmd exists, PATH, shebang/interpreter, file permissions.'),
            ex('Inspect', 'Override the entrypoint of postgres to open a shell.', 'docker run --rm -it --entrypoint sh postgres:16-alpine'),
          ],
          related: ['troubleshooting-method', 'container-lifecycle', 'build-failures'],
          tags: ['troubleshooting', 'containers'],
          commands: ['docker inspect', 'docker logs', 'docker run'],
          sources: [docs('Container exits', 'engine/troubleshooting/')],
        }),
      lesson('disk-space', 'Disk pressure and pruning', '11 min',
        'When /var/lib/docker fills the host: find the consumer, reclaim safely, prevent recurrence.',
        ['Measure Docker disk usage by category', 'Find large images, containers and volumes', 'Set retention and log rotation'],
        [
          text('Find the consumer', '`docker system df` gives the category totals. `docker system df -v` lists per-image, per-container and per-volume sizes. Build cache is frequently the largest and least understood consumer. Container logs under `/var/lib/docker/containers` are another common culprit.'),
          code('bash', `docker system df -v
docker image ls --format 'table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}' | sort -k3 -h
docker ps -as --format 'table {{.Names}}\\t{{.Size}}'
docker system events --since 24h --filter type=image --filter event=untag

du -sh /var/lib/docker/* 2>/dev/null | sort -h
docker builder prune --keep-storage 5GB
docker image prune -a
docker volume prune`, {
            note: 'Prune commands are destructive. Confirm what is unused and back up volumes first.',
          }),
          callout('danger', 'Do not delete files under /var/lib/docker manually', 'Use Docker commands. Deleting the overlay or container directories directly can corrupt the image store.'),
        ],
        {
          quiz: quiz([
            q('Which command shows per-object disk usage?', ['docker ps -s', 'docker system df -v', 'docker info', 'docker stats'], 1, 'df -v breaks usage down by object.'),
            q('Which category is often the largest hidden consumer?', ['Networks', 'Build cache', 'Volumes', 'Images'], 1, 'Build cache can grow very large.'),
            q('Why not delete /var/lib/docker files manually?', ['It is slow', 'It can corrupt Docker metadata', 'It requires root', 'It breaks DNS'], 1, 'Docker must manage its own store.'),
          ]),
          exercises: [
            ex('Audit', 'List the ten largest images.', 'docker image ls --format and sort by size, or docker system df -v.'),
            ex('Reclaim', 'Prune build cache but keep 5 GB.', 'docker builder prune --keep-storage 5GB', { command: 'docker builder prune --keep-storage 5GB' }),
          ],
          related: ['cleanup-and-pruning', 'logging-drivers', 'system-maintenance'],
          tags: ['troubleshooting', 'disk'],
          commands: ['docker system df', 'docker builder prune'],
          sources: [docs('Pruning', 'config/pruning/')],
        }),
      lesson('build-failures', 'Build failures', '12 min',
        'Read a BuildKit log, find the failing step, and fix the layer instead of rebuilding blindly.',
        ['Locate the first failing step', 'Diagnose package, network and permission errors', 'Use --progress and debug targets'],
        [
          text('The first error wins', 'BuildKit prints a step graph and the failing step’s output. Network failures while installing packages are often DNS or proxy issues in the build container, not the Dockerfile. Permission errors are often a missing user or a directory created as root in an earlier layer. Cache misses are not errors but explain slow builds.'),
          code('bash', `docker build --progress=plain --no-cache -t app:debug .
docker build --target build -t app:build .
docker run --rm -it app:build sh

# Check build-time DNS and proxy
docker build --build-arg HTTP_PROXY=$HTTP_PROXY .
docker buildx build --ssh default .`, {
            output: '#12 [build 4/6] RUN npm ci\n#12 0.532 npm ERR! network request to https://registry.npmjs.org failed',
          }),
          callout('tip', 'Reproduce the layer', 'Build the failing stage with --target, then run a shell in it. You now have the exact environment the failing RUN saw.'),
        ],
        {
          quiz: quiz([
            q('Which flag gives plain, timestamped build output?', ['--verbose', '--progress=plain', '--debug', '--log-level=debug'], 1, 'BuildKit accepts --progress=plain.'),
            q('A package install fails with DNS errors. What should you check?', ['Image size', 'Build container DNS/proxy configuration', 'Port mappings', 'Restart policy'], 1, 'Build containers use the daemon network configuration.'),
            q('How do you inspect a failed stage?', ['docker logs', 'Build with --target and run a shell', 'docker exec', 'docker events'], 1, 'Target the stage and run a shell in the result.'),
          ]),
          exercises: [
            ex('Plain log', 'Rebuild an image with plain progress and identify the failing step.', 'docker build --progress=plain .'),
            ex('Debug stage', 'Build the build stage and open a shell.', 'docker build --target build -t dbg . && docker run --rm -it dbg sh'),
          ],
          related: ['layer-caching', 'buildkit-architecture', 'troubleshooting-method'],
          tags: ['troubleshooting', 'build'],
          commands: ['docker build', 'docker run'],
          sources: [docs('Build troubleshooting', 'build/building/'), docs('BuildKit', 'build/buildkit/')],
        }),
    ]),
  ],
  ['docker-containers', 'dockerfile-masterclass', 'docker-networking'],
));

module.exports = { courses };
