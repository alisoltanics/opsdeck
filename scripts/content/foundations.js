'use strict';

const { text, code, callout, table, diagram, steps, list, q, quiz, ex, lesson, mod, course, docs, ref } = require('./helpers');

const courses = [];

// ─────────────────────────────────────────────────────────────
// 1. Docker Fundamentals
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-fundamentals', 1, 'Docker Fundamentals', 'The mental model behind containers, images and registries', 'Beginner', '2h 05m', 'box', 'blue',
  'Start from zero and build a durable understanding of what Docker is, why it exists, and how images, containers and registries fit together. Every later course builds on these ideas.',
  ['Explain the difference between a container and a virtual machine', 'Install and verify Docker Engine and Compose', 'Describe the image → container → registry relationship', 'Run, inspect and remove your first containers confidently'],
  [
    mod('fundamentals-model', 'The container model', 'Why containers exist and the three objects you use every day.', [
      lesson('what-is-docker', 'What Docker actually is', '9 min',
        'Docker is packaging plus isolation: a portable filesystem and process model that runs the same way on your laptop and in production.',
        ['Define a container without marketing language', 'Compare containers with virtual machines', 'Identify the three core Docker objects'],
        [
          text('A container is an isolated process', 'A container is not a tiny virtual machine. It is one or more Linux processes running on the host kernel, isolated with namespaces and constrained with cgroups. What makes it feel like a machine is the filesystem: the container sees its own root filesystem, built from an image.\n\nThat distinction explains most container behaviour. Containers start in milliseconds because no operating system boots. They share the host kernel, so a Linux container cannot run on a Windows kernel without a Linux VM underneath. And when the main process exits, the container exits — there is no init system by default keeping it alive.'),
          diagram('docker-architecture', 'The Docker client talks to a daemon, which uses containerd and runc to start isolated processes.'),
          text('Images, containers and registries', 'An **image** is an immutable, layered filesystem plus metadata such as the default command, environment and exposed ports. A **container** is a running (or stopped) instance of an image with a thin writable layer on top. A **registry** stores and distributes images by name and digest.\n\nThe relationship is one-directional: you build or pull an image, then create containers from it. Changes inside a container do not modify the image. To keep changes, commit them or — far better — update the Dockerfile and rebuild.'),
          table(['Object', 'What it is', 'Lifetime'], [
            ['Image', 'Immutable layered filesystem + config', 'Until deleted or replaced'],
            ['Container', 'An isolated process + writable layer', 'Until removed (stopped containers persist)'],
            ['Volume', 'Persistent storage managed by Docker', 'Until removed explicitly'],
            ['Registry', 'Remote image distribution service', 'External service'],
          ]),
          callout('tip', 'The one-sentence version', 'Docker gives a process a private filesystem and a predictable environment, then ships that filesystem as a versioned artifact you can run anywhere the engine runs.'),
        ],
        {
          quiz: quiz([
            q('What is the main difference between a container and a VM?', ['Containers share the host kernel; VMs run a full guest OS', 'Containers cannot run Linux software', 'VMs start faster than containers', 'Containers require a hypervisor'], 0, 'Containers are isolated processes on the host kernel. VMs boot an entire guest operating system.'),
            q('Which object is immutable?', ['A running container', 'An image', 'A container writable layer', 'A process'], 1, 'Images are immutable. Containers add a writable layer on top.'),
            q('A container stops when…', ['The Docker daemon restarts', 'Its main process exits', 'You close the terminal', 'It runs out of layers'], 1, 'The container lifecycle is tied to PID 1 inside the container.'),
          ]),
          exercises: [
            ex('Explain it back', 'In two sentences, explain why two containers can run different Node.js versions on the same host without conflict.', 'Each image carries its own filesystem, including its own Node.js binary; the host kernel is shared but userland is not.'),
            ex('Identify the objects', 'You run `docker run -d nginx`. Name the image, the container, and where the image came from.', 'Image: nginx:latest. Container: a new instance with a writable layer. Source: Docker Hub registry unless cached locally.', { command: 'docker run -d --name demo-nginx nginx:alpine' }),
          ],
          related: ['install-and-verify', 'images-containers-registries'],
          tags: ['concepts', 'architecture'],
          commands: ['docker run', 'docker ps'],
          sources: [docs('Docker overview', 'get-started/overview/'), docs('What is a container?', 'get-started/docker-concepts/the-basics/what-is-a-container/')],
        }),
      lesson('install-and-verify', 'Install and verify Docker', '10 min',
        'A working engine, a working Compose plugin, and the five commands that prove your installation is healthy.',
        ['Check that the client and daemon are both reachable', 'Read the output of docker version and docker info', 'Recognise the most common Linux permission problem'],
        [
          text('Client and daemon are two programs', '`docker version` reports both halves of the system. The **Client** section is the CLI you just ran. The **Server** section is the daemon. If the client prints but the server section errors, Docker is installed but the engine is not running or your user cannot reach it.'),
          code('bash', `docker version
docker info
docker compose version
docker run --rm hello-world`, {
            output: 'Client: Docker Engine 29.x\nServer: Docker Engine 29.x\nDocker Compose version v5.x\n\nHello from Docker!\nThis message shows that your installation appears to be working correctly.',
            note: '`hello-world` is the smallest useful smoke test: it pulls an image, creates a container, runs it, and exits.',
          }),
          text('The permission problem', 'On Linux the daemon listens on a Unix socket owned by root. Adding your user to the `docker` group grants effective root-equivalent access:\n\n```bash\nsudo usermod -aG docker $USER\n```\n\nLog out and back in for the group change to apply. Treat docker-group membership as root access — it is not a sandbox boundary. For stronger isolation, use rootless mode.'),
          callout('warning', 'Never expose the daemon over unauthenticated TCP', 'A plain `tcp://0.0.0.0:2375` endpoint gives anyone who can reach it full control of the host. Use SSH contexts or mutual TLS instead.'),
          steps([
            { title: 'Verify the engine', body: 'Run `docker info` and confirm the Server Version and Storage Driver are populated.' },
            { title: 'Verify Compose', body: 'Run `docker compose version`. Compose v2 is a plugin: `docker compose`, not `docker-compose`.' },
            { title: 'Run a smoke test', body: 'Run `docker run --rm hello-world` and confirm the exit message.' },
          ]),
        ],
        {
          quiz: quiz([
            q('docker version shows a Client section but the Server section fails. What is the most likely cause?', ['The CLI is outdated', 'The daemon is not running or is not reachable', 'The image is missing', 'Compose is not installed'], 1, 'The CLI and daemon are separate; a missing Server section means the client cannot reach the engine.'),
            q('What does adding a user to the docker group effectively grant?', ['Read-only access to images', 'Root-equivalent control of the host', 'Network isolation', 'A separate kernel'], 1, 'The daemon can mount host paths and start privileged containers, so socket access is root-equivalent.'),
            q('Which command proves Compose v2 is installed?', ['docker-compose --version', 'docker compose version', 'docker version --compose', 'docker plugin ls'], 1, 'Compose v2 is invoked as a Docker CLI plugin: `docker compose version`.'),
          ]),
          exercises: [
            ex('Health check', 'Run the three commands that prove client, daemon and Compose are healthy.', 'docker version, docker info, docker compose version all return server/plugin details.', { command: 'docker version && docker info --format "{{.ServerVersion}}" && docker compose version' }),
            ex('Smoke test', 'Run hello-world without leaving a stopped container behind.', 'The container runs and is removed automatically.', { command: 'docker run --rm hello-world', expected: 'Hello from Docker!' }),
          ],
          related: ['client-server-architecture', 'first-container'],
          tags: ['setup', 'cli'],
          commands: ['docker version', 'docker info', 'docker compose version'],
          sources: [docs('Install Docker Engine', 'engine/install/'), docs('Linux post-installation steps', 'engine/install/linux-postinstall/')],
        }),
      lesson('images-containers-registries', 'Images, containers and registries', '10 min',
        'How a name becomes a running process: tags, digests, pulls and the local image store.',
        ['Read an image reference such as nginx:1.27-alpine', 'Explain tags versus digests', 'Trace the pull → create → run path'],
        [
          text('Anatomy of an image reference', 'A reference has up to four parts: `registry/repository:tag`. `nginx:1.27-alpine` uses Docker Hub, the official `nginx` repository and the `1.27-alpine` tag. `ghcr.io/acme/api:v2` uses the GitHub Container Registry. When the registry is omitted, Docker Hub is assumed.\n\nA **tag** is a mutable pointer. A **digest** (`sha256:…`) is the immutable content identity. Production systems should pin digests when reproducibility matters, or at minimum use specific version tags rather than `latest`.'),
          code('bash', `docker pull nginx:1.27-alpine
docker image ls nginx
docker image inspect nginx:1.27-alpine --format '{{.RepoDigests}}'
docker run -d --name web -p 8080:80 nginx:1.27-alpine
docker ps
docker stop web && docker rm web`, {
            output: 'REPOSITORY   TAG            IMAGE ID       SIZE\nnginx        1.27-alpine    a1b2c3d4e5f6   48.2MB\n[nginx@sha256:9f1e...]',
          }),
          diagram('image-layers', 'Each Dockerfile instruction that changes the filesystem adds a layer. Layers are shared between images.'),
          text('Pull is not always a download', 'If the image and all layers already exist locally, `docker run` skips the pull. When layers are shared, only missing layers are downloaded. The writable container layer is always new and is deleted with the container unless you use a volume.'),
          callout('info', 'Images are content-addressed', 'The same layer is stored once even if ten images reference it. That is why `docker system df` can show a large shared size and a smaller unique size.'),
        ],
        {
          quiz: quiz([
            q('In ghcr.io/acme/api:v2, what is the registry?', ['acme', 'api', 'ghcr.io', 'v2'], 2, 'The first component is the registry host when it contains a dot.'),
            q('Which identifier is immutable?', ['A tag', 'A digest', 'A repository name', 'latest'], 1, 'Tags can be moved; a digest identifies exact content.'),
            q('When you delete a container, what happens to its writable layer?', ['It becomes a new image', 'It is removed with the container', 'It is stored in the registry', 'It moves to a volume automatically'], 1, 'The writable layer belongs to the container and is deleted with it. Use volumes for persistence.'),
          ]),
          exercises: [
            ex('Read the reference', 'Decompose `registry.example.com/team/api:2.4.1` into registry, repository, and tag.', 'registry.example.com / team/api / 2.4.1'),
            ex('Pin a digest', 'Inspect nginx:1.27-alpine and copy its RepoDigest.', 'The inspect output includes a RepoDigests entry with an immutable sha256 digest.', { command: "docker image inspect nginx:1.27-alpine --format '{{index .RepoDigests 0}}'" }),
          ],
          related: ['image-anatomy', 'docker-workflow'],
          tags: ['images', 'registries'],
          commands: ['docker pull', 'docker image ls', 'docker image inspect'],
          sources: [docs('Image reference', 'reference/cli/docker/image/'), docs('Docker Hub', 'docker-hub/')],
        }),
      lesson('docker-workflow', 'The build → ship → run workflow', '9 min',
        'The loop you will repeat for the rest of your career, from a Dockerfile in your editor to a running service.',
        ['Describe the build, ship and run phases', 'Know which artifact moves between environments', 'Avoid rebuilding for every environment'],
        [
          text('Build once, run everywhere', 'The canonical workflow has three phases. **Build** turns a Dockerfile and build context into an image. **Ship** pushes that image to a registry. **Run** pulls the exact image and starts containers wherever it is needed.\n\nThe important discipline is that the same image moves through environments. Configuration — database URLs, feature flags, secrets — is injected at runtime as environment variables, mounted files or secret objects. Rebuilding for staging versus production destroys the guarantee you are testing the artifact you will deploy.'),
          code('bash', `# 1. Build
docker build -t acme/api:1.4.0 .

# 2. Ship (tag + push)
docker tag acme/api:1.4.0 registry.example.com/team/api:1.4.0
docker push registry.example.com/team/api:1.4.0

# 3. Run
docker run -d --name api \\
  -p 3000:3000 \\
  -e NODE_ENV=production \\
  -e DATABASE_URL=postgres://db:5432/app \\
  registry.example.com/team/api:1.4.0`, {
            note: 'In Compose the same phases are `docker compose build`, `docker compose push`, and `docker compose up -d`.',
          }),
          diagram('delivery-flow', 'A registry is the hand-off point between build systems and runtime environments.'),
          callout('tip', 'Environment parity', 'Use the same base image family across development and production. Alpine in production and Debian locally is a common source of subtle native-module differences.'),
        ],
        {
          quiz: quiz([
            q('What should move from staging to production?', ['The Dockerfile', 'The built image', 'The source tree', 'The build cache'], 1, 'Deploy the identical image; configuration is injected at runtime.'),
            q('Which phase publishes an image?', ['Build', 'Ship', 'Run', 'Prune'], 1, 'Shipping means tagging and pushing to a registry.'),
            q('Where should database passwords live?', ['Baked into the image', 'In a build argument', 'Injected at runtime as secrets', 'In the image tag'], 2, 'Secrets must never be in layers or build arguments that persist in image history.'),
          ]),
          exercises: [
            ex('Map the phases', 'For `docker compose up -d --build`, identify the build, ship and run parts.', 'Build: --build. Ship: pull/push happens separately; Compose pulls missing images. Run: up -d creates containers.'),
            ex('Write the loop', 'Write the three commands that build, push, and run an image named app:v1 in a registry.', 'docker build -t REGISTRY/app:v1 . ; docker push REGISTRY/app:v1 ; docker run -d REGISTRY/app:v1'),
          ],
          related: ['first-container', 'image-anatomy', 'compose-services'],
          tags: ['workflow', 'registry'],
          commands: ['docker build', 'docker push', 'docker run'],
          sources: [docs('Docker concepts', 'get-started/docker-concepts/the-basics/'), docs('Build, tag and publish', 'get-started/workshop/')],
        }),
      lesson('first-container', 'Lab: your first container', '14 min',
        'Run nginx, read its logs, exec into it, publish a port, and clean up without leaving a mess.',
        ['Run a detached container with a name and port mapping', 'Read logs and execute a command inside a container', 'Remove containers and images deliberately'],
        [
          text('The exercise', 'You will start an nginx web server, verify it over HTTP, inspect its logs, open a shell inside it, then remove everything. Use the integrated lab when Docker is available; the commands are identical to a normal terminal.'),
          steps([
            { title: 'Start the server', body: 'Run nginx detached, give it the name `ops-web`, and publish host port 8080 to container port 80.' },
            { title: 'Verify', body: 'Request http://localhost:8080 and confirm the default nginx welcome page.' },
            { title: 'Observe', body: 'Read the last 50 log lines. Then run `hostname` inside the container.' },
            { title: 'Clean up', body: 'Stop and remove the container, then remove the image if it is not needed.' },
          ]),
          code('bash', `docker run -d --name ops-web -p 8080:80 nginx:alpine
curl -I http://localhost:8080
docker logs --tail 50 ops-web
docker exec -it ops-web hostname
docker stop ops-web
docker rm ops-web`, {
            output: 'HTTP/1.1 200 OK\nServer: nginx/1.27.x\n...\n3f9c2a1b7d4e',
            note: '`docker exec` starts a second process in the container namespace. `hostname` returns the container id prefix by default.',
          }),
          callout('warning', 'Stop is not remove', 'A stopped container still exists and still holds its writable layer, name and port reservation. `docker ps` hides it; `docker ps -a` shows it. Remove with `docker rm` when finished.'),
        ],
        {
          lab: {
            id: 'first-container', title: 'Run and inspect nginx',
            brief: 'Complete the four steps using the lab terminal. The lab constrains resources and disables host mounts.',
            steps: [
              { instruction: 'Start nginx:alpine detached on port 8080 with the name ops-web.', command: 'docker run -d --name ops-web -p 8080:80 nginx:alpine' },
              { instruction: 'List running containers and confirm the port mapping.', command: 'docker ps' },
              { instruction: 'Read the container logs.', command: 'docker logs --tail 20 ops-web' },
              { instruction: 'Run hostname inside the container.', command: 'docker exec ops-web hostname' },
              { instruction: 'Stop and remove the container.', command: 'docker rm -f ops-web' },
            ],
          },
          quiz: quiz([
            q('What does -p 8080:80 mean?', ['Container port 8080 maps to host 80', 'Host port 8080 maps to container port 80', 'Two containers share port 8080', 'The container listens on 8080 only'], 1, 'The syntax is HOST:CONTAINER.'),
            q('Which command opens an interactive shell in a running container?', ['docker run -it', 'docker exec -it', 'docker attach', 'docker logs -f'], 1, '`docker exec` starts an additional process in a running container.'),
            q('Why does docker ps not show the container after docker stop?', ['It was removed', 'docker ps shows running containers only', 'The image was deleted', 'The name expired'], 1, 'Use `docker ps -a` to include stopped containers.'),
          ]),
          exercises: [
            ex('Publish on loopback only', 'Start nginx so it is reachable on 127.0.0.1:8088, not on every interface.', 'The port binding is restricted to loopback.', { command: 'docker run -d --name ops-web-local -p 127.0.0.1:8088:80 nginx:alpine' }),
            ex('Find the PID', 'Use inspect to find the host PID of the container main process.', 'State.Pid in docker inspect output.', { command: "docker inspect ops-web --format '{{.State.Pid}}'" }),
          ],
          related: ['run-exec-logs', 'container-lifecycle', 'ports-and-publishing'],
          tags: ['lab', 'containers'],
          commands: ['docker run', 'docker logs', 'docker exec', 'docker rm'],
          sources: [docs('Run a container', 'get-started/docker-concepts/the-basics/'), ref('docker run', 'cli/docker/container/run/')],
        }),
    ]),
  ],
  [],
));

// ─────────────────────────────────────────────────────────────
// 2. Docker Architecture
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-architecture', 2, 'Docker Architecture', 'What happens between the CLI and a running process', 'Beginner', '1h 15m', 'layers', 'cyan',
  'A precise tour of the Docker client, daemon, containerd, runc, namespaces and cgroups. This is the knowledge that turns confusing errors into obvious ones.',
  ['Trace a docker run request through every component', 'Explain the role of containerd and runc', 'Describe how namespaces and cgroups isolate and limit a process'],
  [
    mod('architecture-components', 'Components', 'The moving parts of a Docker installation.', [
      lesson('client-server-architecture', 'Client, daemon and API', '9 min',
        'The CLI is a thin HTTP client. Almost everything interesting happens in the daemon.',
        ['Describe the client/server split', 'Explain the Docker API and socket', 'Know what happens when the daemon is unreachable'],
        [
          text('A REST API with a CLI on top', 'The `docker` command parses your arguments and sends an HTTP request to the Docker daemon over a Unix socket (`/var/run/docker.sock` by default) or a TCP endpoint. The daemon does the work: pulling, building, creating, starting, and streaming logs back.\n\nThis is why remote Docker works, why tools such as Portainer and CI runners can control Docker without the CLI, and why protecting the socket is equivalent to protecting root.'),
          diagram('docker-architecture', 'Client → daemon → containerd → runc → process. The registry is contacted by the daemon, not by your CLI.'),
          table(['Component', 'Responsibility'], [
            ['docker CLI', 'Argument parsing, API calls, output formatting'],
            ['dockerd', 'Image store, networks, volumes, API, orchestration of containers'],
            ['containerd', 'Container lifecycle, image transfer, snapshots'],
            ['runc', 'Creates namespaces/cgroups and execs the container process'],
          ]),
          callout('info', 'Remote engines are just contexts', '`docker context create` stores an endpoint; `docker context use` switches the CLI to it. The CLI itself does not change.'),
        ],
        {
          quiz: quiz([
            q('Who pulls an image during docker run?', ['The CLI', 'The daemon', 'runc', 'The registry'], 1, 'The daemon performs image operations and reports progress to the client.'),
            q('The default Docker endpoint is…', ['A TCP port on localhost', 'A Unix socket', 'SSH', 'A named pipe on Linux'], 1, 'Linux uses /var/run/docker.sock by default. Windows uses a named pipe.'),
            q('Why is docker.sock access dangerous?', ['It is writable by all users by default', 'It grants control equivalent to root', 'It bypasses networking', 'It deletes images'], 1, 'The daemon can start privileged containers and mount host paths.'),
          ]),
          exercises: [
            ex('Inspect the endpoint', 'Print the Docker host and context currently in use.', 'DOCKER_HOST may be empty (default socket) and `docker context show` prints the context name.', { command: 'docker context show' }),
            ex('Explain the split', 'Why can a CI runner control a remote Docker engine without installing the daemon locally?', 'It only needs the client and access to the API endpoint.'),
          ],
          related: ['daemon-containerd-runc', 'contexts', 'daemon-security'],
          tags: ['architecture'],
          commands: ['docker context', 'docker info'],
          sources: [docs('Docker architecture', 'get-started/docker-overview/#docker-architecture'), ref('API', 'api/')],
        }),
      lesson('daemon-containerd-runc', 'dockerd, containerd and runc', '9 min',
        'The chain of custody for a container process, and why it matters when something fails to start.',
        ['Name the responsibility of each layer', 'Read a container start failure with the right mental model', 'Know where shims fit'],
        [
          text('Three layers, one process', '`dockerd` is the API server and the orchestrator of Docker objects. It delegates container execution to **containerd**, a general-purpose container runtime. containerd prepares the image snapshot and root filesystem, then invokes **runc**, an OCI runtime that creates namespaces and cgroups and execs the process.\n\nA **shim** (containerd-shim-runc-v2) sits between containerd and the container process. It keeps the container alive if containerd restarts and collects the exit status. That is why `docker ps` can still work while the daemon is being upgraded.'),
          diagram('runtime-stack', 'dockerd → containerd → shim → runc → container process.'),
          code('bash', `# See the runtime chain
ps -eo pid,ppid,comm,args | grep -E 'dockerd|containerd|shim|runc' | grep -v grep

docker info --format '{{.Driver}} {{.CgroupDriver}} {{.KernelVersion}}'`, {
            note: 'Runc only exists while a container is being created. After exec, the shim supervises the process.',
          }),
          callout('warning', 'Do not restart dockerd to fix one container', 'Restarting the daemon can disrupt networking and running containers. Diagnose with `docker inspect`, `docker logs`, and `journalctl -u docker` first.'),
        ],
        {
          quiz: quiz([
            q('Which component creates namespaces and cgroups?', ['dockerd', 'containerd', 'runc', 'the shim'], 2, 'runc implements the OCI runtime steps that isolate the process.'),
            q('What is the shim responsible for?', ['Serving the HTTP API', 'Supervising a container process and reporting exit status', 'Storing images', 'DNS'], 1, 'The shim outlives containerd restarts and owns the process lifecycle.'),
            q('Where do you look for daemon-level errors?', ['docker ps', 'journalctl -u docker', 'the container logs', 'docker history'], 1, 'The daemon logs to the system journal on systemd hosts.'),
          ]),
          exercises: [
            ex('Find the chain', 'Run a sleep container and identify its shim and runtime processes.', 'A containerd-shim-runc-v2 process appears between containerd and the sleep process.'),
            ex('Read the driver', 'Print the storage driver, cgroup driver and kernel version.', 'docker info --format with .Driver, .CgroupDriver, .KernelVersion.', { command: "docker info --format '{{.Driver}} {{.CgroupDriver}} {{.KernelVersion}}'" }),
          ],
          related: ['client-server-architecture', 'namespaces-cgroups', 'container-exits'],
          tags: ['architecture', 'runtime'],
          commands: ['docker info'],
          sources: [docs('containerd', 'engine/containers/'), docs('runc', 'engine/security/')],
        }),
      lesson('namespaces-cgroups', 'Namespaces and cgroups', '10 min',
        'The two Linux features that make containers possible: isolation and limits.',
        ['List the namespaces a container gets', 'Explain what cgroups control', 'Recognise the limits of container isolation'],
        [
          text('Namespaces isolate what a process can see', 'A namespace wraps a global system resource so processes inside it see their own private view. Docker uses PID, mount, network, IPC, UTS, user and cgroup namespaces. The PID namespace is why the container main process appears as PID 1 inside the container while having a different host PID.\n\nNamespaces do not limit resources — they only change visibility. Two containers can each see "their" network stack while still competing for host CPU.'),
          text('Cgroups limit what a process can use', 'Control groups account for and constrain CPU, memory, block I/O and process counts. `--cpus`, `--memory`, `--pids-limit` and `--blkio-weight` map to cgroup controls. When a container exceeds its memory limit, the kernel OOM killer terminates processes inside it; the container exits with code 137.'),
          table(['Namespace', 'What it isolates'], [
            ['pid', 'Process IDs'], ['net', 'Interfaces, routes, ports'], ['mnt', 'Mount points and filesystem view'],
            ['ipc', 'Shared memory and semaphores'], ['uts', 'Hostname and domain'], ['user', 'UID/GID mapping'],
          ]),
          callout('danger', 'Containers are not a security boundary by default', 'A kernel exploit or a privileged container can escape to the host. Harden with non-root users, dropped capabilities, seccomp, read-only filesystems and user namespaces.'),
        ],
        {
          quiz: quiz([
            q('Which feature limits a container to 512 MB of memory?', ['Namespaces', 'Cgroups', 'The shim', 'The image layer'], 1, 'Cgroups enforce resource limits.'),
            q('Why does the container process see PID 1?', ['It really is the host init', 'The PID namespace remaps it', 'runc renames processes', 'The kernel reuses PIDs'], 1, 'Inside the PID namespace the first process is 1.'),
            q('Exit code 137 usually means…', ['Success', 'The process was killed, often by the OOM killer', 'A missing image', 'A port conflict'], 1, '128 + 9 (SIGKILL), commonly caused by exceeding a memory limit.'),
          ]),
          exercises: [
            ex('See the namespaces', 'Run a container and list its namespaces from the host.', 'lsns or /proc/<pid>/ns shows pid, net, mnt, ipc, uts, user namespaces.', { command: "docker run -d --name ns-demo alpine sleep 300\ndocker inspect ns-demo --format '{{.State.Pid}}'" }),
            ex('Trigger the limit', 'Run a container with --memory 32m that allocates more and observe exit code 137.', 'The process is OOM-killed and docker inspect reports OOMKilled=true.', { command: 'docker run --rm --memory 32m alpine sh -c "yes | head -c 100M > /dev/null"' }),
          ],
          related: ['daemon-containerd-runc', 'resource-limits', 'container-security'],
          tags: ['linux', 'security'],
          commands: ['docker run', 'docker inspect'],
          sources: [docs('Security', 'engine/security/'), docs('Resource constraints', 'engine/containers/resource_constraints/')],
        }),
    ]),
  ],
  ['docker-fundamentals'],
));

// ─────────────────────────────────────────────────────────────
// 3. Docker CLI Complete Reference
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-cli', 3, 'Docker CLI Complete Reference', 'A working map of every command family', 'Beginner', '1h 40m', 'terminal', 'violet',
  'The Docker CLI has a large but highly regular surface. Learn the grammar, the command families, and the inspection commands that answer almost every question.',
  ['Navigate docker help and per-command help efficiently', 'Group commands by object and lifecycle', 'Use inspect, logs, stats and events as a debugging toolkit'],
  [
    mod('cli-foundations', 'CLI foundations', 'Grammar, help and output control.', [
      lesson('cli-anatomy', 'CLI anatomy and help', '10 min',
        'Docker commands follow a predictable grammar. Once you see it, the reference stops being intimidating.',
        ['Parse docker [OPTIONS] COMMAND [ARGS]', 'Use management commands and aliases', 'Discover flags with --help instead of guessing'],
        [
          text('The grammar', 'Most commands follow `docker <object> <verb> [options] [target]`. Management commands group verbs: `docker container ls`, `docker image rm`, `docker network inspect`. Shorthands exist for daily use: `docker ps` = `docker container ls`, `docker images` = `docker image ls`, `docker rmi` = `docker image rm`.\n\nGlobal options come before the command (`--context`, `--host`, `--log-level`, `-H`). Command options come after the verb.'),
          code('bash', `docker --help
docker container --help
docker run --help
docker compose --help
docker compose up --help`, {
            note: 'The --help output in OpsDeck is read live from your installed CLI, so flags always match your engine version.',
          }),
          table(['Family', 'Common commands'], [
            ['Container', 'run, create, start, stop, restart, exec, logs, inspect, cp, rm'],
            ['Image', 'pull, push, build, tag, ls, inspect, history, prune, save, load'],
            ['Volume', 'create, ls, inspect, rm, prune'],
            ['Network', 'create, ls, inspect, connect, disconnect, rm, prune'],
            ['System', 'df, info, events, prune, version'],
            ['Compose', 'up, down, ps, logs, config, build, exec, run, pull'],
          ]),
          callout('tip', 'Use --format for machines, tables for humans', 'Most list commands accept `--format` with Go templates and `{{json .}}` for JSON lines. That is how OpsDeck reads your engine without parsing tables.'),
        ],
        {
          quiz: quiz([
            q('What is the canonical form of docker ps?', ['docker list containers', 'docker container ls', 'docker containers', 'docker inspect ps'], 1, 'docker ps is an alias for docker container ls.'),
            q('Where do global options belong?', ['After the command', 'Before the command', 'Inside the image name', 'Anywhere'], 1, 'Global options such as --context and --host precede the command.'),
            q('Which output format is best for scripts?', ['Default table', '--format json', '--quiet only', '--no-trunc table'], 1, 'JSON output is stable and parseable.'),
          ]),
          exercises: [
            ex('Find the flag', 'Find the option that lets docker run set a container hostname.', 'docker run --help shows -h, --hostname string.', { command: 'docker run --help | grep -i hostname' }),
            ex('Expand an alias', 'Rewrite docker rmi -f abc123 using management commands.', 'docker image rm --force abc123'),
          ],
          related: ['container-commands', 'image-system-commands'],
          tags: ['cli'],
          commands: ['docker help', 'docker container', 'docker image'],
          sources: [ref('CLI reference', 'cli/'), docs('Use the Docker command line', 'engine/reference/commandline/cli/')],
        }),
      lesson('container-commands', 'Container lifecycle commands', '11 min',
        'The complete set of verbs that move a container from created to removed.',
        ['Choose between run, create, start and exec', 'Manage stopped containers', 'Copy files and inspect state'],
        [
          text('Create is not start', '`docker create` builds a container and its writable layer without starting it. `docker start` starts an existing container. `docker run` is create + start. This matters for orchestration and for restarting a configured container without losing its layer.\n\n`docker exec` runs an additional process inside a running container. It is not a lifecycle command and does not restart or replace the main process.'),
          code('bash', `docker create --name worker -e MODE=batch alpine sleep 3600
docker start worker
docker exec -it worker sh
docker pause worker && docker unpause worker
docker stop worker
docker rm worker

docker cp ./config.json worker:/app/config.json
docker inspect worker --format '{{.State.Status}} {{.State.ExitCode}}'`, {
            note: 'Stopping sends SIGTERM, waits (`--time`, default 10s), then SIGKILL. Handle SIGTERM in your app for graceful shutdown.',
          }),
          table(['Verb', 'Effect'], [
            ['run', 'Create + start a new container'], ['start / stop', 'Start or gracefully stop an existing container'],
            ['restart', 'Stop + start'], ['pause / unpause', 'Freeze or resume processes with the freezer cgroup'],
            ['exec', 'Run an extra process in a running container'], ['rm', 'Remove a stopped container (use -f to force)'],
          ]),
          callout('warning', 'docker attach is rarely what you want', 'Attaching to PID 1 means Ctrl-C can kill the container. Use `docker exec -it` for shells unless you are deliberately attaching to a TUI process.'),
        ],
        {
          quiz: quiz([
            q('Which command creates but does not start?', ['docker run', 'docker create', 'docker exec', 'docker start'], 1, 'create allocates the container; start runs it.'),
            q('How do you run a shell in a running container?', ['docker attach', 'docker exec -it NAME sh', 'docker start -it', 'docker logs -f'], 1, 'exec starts another process.'),
            q('What signal does docker stop send first?', ['SIGKILL', 'SIGTERM', 'SIGINT', 'SIGHUP'], 1, 'It sends SIGTERM, then SIGKILL after the timeout.'),
          ]),
          exercises: [
            ex('Graceful stop', 'Stop a container with a 30-second grace period.', 'docker stop --time 30 NAME', { command: 'docker stop --time 30 worker' }),
            ex('Copy out', 'Copy /etc/nginx/nginx.conf from a container to the current directory.', 'docker cp web:/etc/nginx/nginx.conf ./nginx.conf', { command: 'docker cp web:/etc/nginx/nginx.conf ./nginx.conf' }),
          ],
          related: ['container-lifecycle', 'run-exec-logs'],
          tags: ['cli', 'containers'],
          commands: ['docker create', 'docker start', 'docker stop', 'docker exec', 'docker cp'],
          sources: [ref('Container commands', 'cli/docker/container/')],
        }),
      lesson('image-system-commands', 'Image and system commands', '10 min',
        'Inspect, transfer, clean and measure images without guessing.',
        ['Inspect image metadata and layer history', 'Move images with save/load', 'Reclaim disk safely'],
        [
          text('Inspection before deletion', '`docker image inspect` exposes config, environment, entrypoint, labels and digests. `docker image history` shows the layers and the commands that created them — invaluable for finding accidental secrets or oversized layers.'),
          code('bash', `docker image ls --digests
docker image inspect nginx:alpine --format '{{.Config.Entrypoint}} {{.Config.Cmd}}'
docker image history nginx:alpine
docker image save -o nginx.tar nginx:alpine
docker image load -i nginx.tar

docker system df
docker image prune -a
docker system prune --volumes`, {
            output: 'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          107       10        101.4GB   61.28GB (60%)',
            note: '`docker system prune --volumes` removes unused volumes too. Read the confirmation prompt; it is not recoverable.',
          }),
          callout('danger', 'Prune is destructive', '`docker system prune -a --volumes` removes every unused image, network, build cache and volume. Back up named volumes first.'),
        ],
        {
          quiz: quiz([
            q('Which command shows the layers of an image?', ['docker image ls', 'docker image history', 'docker inspect', 'docker diff'], 1, 'image history lists layers and their creating commands.'),
            q('How do you move an image to an offline host?', ['docker push', 'docker save then docker load', 'docker cp', 'docker export'], 1, 'save writes a tar archive; load restores it.'),
            q('Which prune removes unused volumes?', ['docker image prune', 'docker volume prune', 'docker network prune', 'docker builder prune'], 1, 'volume prune removes volumes not used by containers.'),
          ]),
          exercises: [
            ex('Find the entrypoint', 'Print the Entrypoint and Cmd of redis:7-alpine.', 'The inspect output shows the entrypoint and default command.', { command: "docker image inspect redis:7-alpine --format '{{.Config.Entrypoint}} / {{.Config.Cmd}}'" }),
            ex('Measure disk', 'Show disk usage by images, containers, volumes and build cache.', 'docker system df prints one row per type with reclaimable space.', { command: 'docker system df' }),
          ],
          related: ['image-anatomy', 'cleanup-and-pruning'],
          tags: ['cli', 'images', 'system'],
          commands: ['docker image', 'docker system df', 'docker image prune'],
          sources: [ref('Image commands', 'cli/docker/image/'), ref('System commands', 'cli/docker/system/')],
        }),
    ]),
  ],
  ['docker-fundamentals'],
));

// ─────────────────────────────────────────────────────────────
// 4. Docker Containers
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-containers', 4, 'Docker Containers', 'Lifecycle, configuration and day-to-day operations', 'Beginner', '1h 50m', 'container', 'orange',
  'Go beyond docker run. Understand container state, process behaviour, configuration, port publishing and resource policy.',
  ['Reason about container lifecycle and exit codes', 'Configure containers with env, files and secrets', 'Publish ports safely and set restart/resource policy'],
  [
    mod('container-operations', 'Container operations', 'State, processes and configuration.', [
      lesson('container-lifecycle', 'The container lifecycle', '9 min',
        'Created, running, paused, stopped, removed: what each state means and how to move between them.',
        ['Name every lifecycle state', 'Predict the state after each command', 'Understand restart policies and exit codes'],
        [
          text('State is derived from the main process', 'A container is **created** when its filesystem and config exist. It is **running** while PID 1 is alive, **paused** when the freezer cgroup is engaged, and **exited** when PID 1 terminates. It remains in the exited state — with its writable layer and name — until removed.\n\nRestart policies act on exit. `unless-stopped` restarts on failure or daemon restart but respects a manual stop. `always` restarts even after a manual stop when the daemon starts.'),
          diagram('container-lifecycle', 'The container state machine. Removal is the only irreversible transition.'),
          code('bash', `docker run -d --name app --restart unless-stopped nginx:alpine
docker inspect app --format '{{.State.Status}} pid={{.State.Pid}}'
docker pause app
docker inspect app --format '{{.State.Status}}'
docker unpause app
docker stop app
docker inspect app --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}'
docker rm app`, {
            note: 'Exit code 0 is success; 137 is SIGKILL/OOM; 143 is SIGTERM. `docker inspect` records OOMKilled explicitly.',
          }),
        ],
        {
          quiz: quiz([
            q('A stopped container still exists until…', ['The daemon restarts', 'It is removed with docker rm', 'The image is pruned', 'You log out'], 1, 'Stop preserves the container; rm deletes it.'),
            q('Which restart policy respects a manual stop across daemon restarts?', ['always', 'on-failure', 'unless-stopped', 'no'], 2, 'unless-stopped does not restart containers that were explicitly stopped.'),
            q('Exit code 143 indicates…', ['OOM kill', 'SIGTERM termination', 'Success', 'Missing entrypoint'], 1, '128 + 15 = 143, the container received SIGTERM.'),
          ]),
          exercises: [
            ex('State audit', 'Start a container, pause it, stop it, and print status/exit code at each step.', 'running → paused → exited with exit code 0 or 143 depending on handler.', { command: 'docker run -d --name state-demo alpine sleep 120' }),
            ex('OOM investigation', 'Inspect a container and check OOMKilled.', 'docker inspect --format "{{.State.OOMKilled}}" NAME', { command: "docker inspect state-demo --format '{{.State.OOMKilled}}'" }),
          ],
          related: ['run-exec-logs', 'config-and-resources'],
          tags: ['containers'],
          commands: ['docker start', 'docker stop', 'docker pause', 'docker inspect'],
          sources: [docs('Container lifecycle', 'get-started/docker-concepts/the-basics/how-containers-work/')],
        }),
      lesson('run-exec-logs', 'run, exec and logs', '12 min',
        'The daily trio, including detached mode, interactive mode, TTY allocation and log streaming.',
        ['Choose flags for interactive and detached containers', 'Use exec without creating a shell dependency', 'Stream logs without losing the terminal'],
        [
          text('Detached vs interactive', '`-d` detaches and prints the container ID. `-it` allocates a TTY and keeps stdin open — used for shells and interactive CLIs. `--rm` removes the container on exit. Combining `-d` and `-it` is usually a mistake: a detached container does not need your terminal.'),
          code('bash', `# detached service
docker run -d --name api -p 3000:3000 my-api:1.0

# interactive one-off
docker run --rm -it alpine sh

# run a command in an existing container, without a TTY
docker exec api node -e "console.log(process.version)"

# follow logs, then detach with Ctrl-C (container keeps running)
docker logs -f --tail 100 api

# logs since a timestamp
docker logs --since 10m api`, {
            output: 'v20.18.0\nGET /health 200 3ms\nGET /api/users 200 12ms',
          }),
          callout('tip', 'Do not build containers that require a TTY', 'A service should log to stdout/stderr and run without stdin. `-it` is for humans, not for production entrypoints.'),
        ],
        {
          quiz: quiz([
            q('What does -it do?', ['Detaches the container', 'Allocates a TTY and keeps stdin open', 'Sets an init process', 'Publishes a port'], 1, 'It makes an interactive terminal session.'),
            q('Which command runs a second process in a running container?', ['docker run', 'docker exec', 'docker start', 'docker attach'], 1, 'exec targets an existing running container.'),
            q('Where should application logs go?', ['A file inside the container', 'stdout and stderr', 'A bind mount only', 'The daemon journal'], 1, 'Docker captures stdout/stderr through the configured logging driver.'),
          ]),
          exercises: [
            ex('One-off command', 'Use alpine to print the current date and remove the container afterwards.', 'docker run --rm alpine date', { command: 'docker run --rm alpine date' }),
            ex('Log window', 'Show the last 50 lines from a container and then follow new lines.', 'docker logs --tail 50 -f NAME'),
          ],
          related: ['container-lifecycle', 'logging-drivers'],
          tags: ['containers', 'cli'],
          commands: ['docker run', 'docker exec', 'docker logs'],
          sources: [ref('docker run', 'cli/docker/container/run/'), docs('View container logs', 'engine/reference/commandline/logs/')],
        }),
      lesson('ports-and-publishing', 'Ports and publishing', '9 min',
        'EXPOSE documents. -p publishes. The distinction prevents a whole class of connectivity bugs.',
        ['Explain EXPOSE vs -p', 'Bind published ports to loopback or specific interfaces', 'Diagnose port conflicts'],
        [
          text('Two different things', '`EXPOSE 3000` in a Dockerfile is documentation: it records intent and is visible in `docker inspect`. It does not make the port reachable from the host. `-p 8080:3000` (or `--publish`) creates a host binding that forwards traffic to the container.\n\nThe binding syntax is `[host_ip:]host_port:container_port[/protocol]`. Omitting host_ip binds on all interfaces (`0.0.0.0` and often `::`). Use `127.0.0.1:8080:3000` for local-only services.'),
          code('bash', `docker run -d --name web -p 127.0.0.1:8080:80 nginx:alpine
docker port web
docker inspect web --format '{{json .NetworkSettings.Ports}}'

# random host port
docker run -d --name web-random -P nginx:alpine
docker port web-random 80/tcp`, {
            output: '80/tcp -> 127.0.0.1:8080\n{"80/tcp":[{"HostIp":"127.0.0.1","HostPort":"8080"}]}',
          }),
          callout('warning', 'Port conflicts are a host problem', 'If bind fails with "address already in use", another process or container owns the host port. Find it with `ss -ltnp` or `docker ps --format` and choose a different host port.'),
        ],
        {
          quiz: quiz([
            q('Does EXPOSE publish a port to the host?', ['Yes', 'No, it documents intent', 'Only with -P', 'Only in Compose'], 1, 'Publishing requires -p or a compose ports entry.'),
            q('Which binding exposes a service only on localhost?', ['-p 8080:80', '-p 127.0.0.1:8080:80', '-p 0.0.0.0:8080:80', '-P'], 1, 'Prefixing the host IP restricts the listener.'),
            q('What does -P do?', ['Publishes all EXPOSEd ports to random host ports', 'Privileged mode', 'Pauses the container', 'Pulls the image'], 0, 'Capital P publishes every exposed port on an ephemeral host port.'),
          ]),
          exercises: [
            ex('Loopback only', 'Publish nginx on 127.0.0.1:8090.', 'The port is reachable only from the host.', { command: 'docker run -d --name web-loop -p 127.0.0.1:8090:80 nginx:alpine' }),
            ex('Find the owner', 'A host port is already in use. Find the process listening on it.', 'ss -ltnp | grep :PORT or lsof -i :PORT.', { command: "ss -ltnp | grep ':8090'" }),
          ],
          related: ['networking-drivers', 'bridge-dns', 'network-troubleshooting'],
          tags: ['networking', 'containers'],
          commands: ['docker run', 'docker port', 'docker inspect'],
          sources: [docs('Port publishing', 'engine/network/'), ref('docker run', 'cli/docker/container/run/')],
        }),
      lesson('config-and-resources', 'Environment, restart policy and resources', '11 min',
        'Configure containers without rebuilding, and keep one noisy service from consuming the host.',
        ['Inject configuration with -e and --env-file', 'Choose a restart policy deliberately', 'Apply CPU, memory and PID limits'],
        [
          text('Configuration at runtime', 'Environment variables are the simplest configuration channel: `-e KEY=value` or `--env-file .env`. They appear in `docker inspect` and in the process environment, so they are **not** suitable for long-lived secrets. Mount secrets read-only or use Compose secrets for anything sensitive.\n\nValues in the image are defaults; runtime flags override them. Use `docker run --env-file` for grouped settings and keep secrets out of the file.'),
          code('bash', `docker run -d --name api \\
  --env-file ./app.env \\
  -e LOG_LEVEL=info \\
  --restart unless-stopped \\
  --memory 512m --memory-swap 512m \\
  --cpus 1.5 --pids-limit 256 \\
  -p 127.0.0.1:3000:3000 \\
  my-api:1.0

docker inspect api --format '{{json .HostConfig.Memory}} {{json .HostConfig.NanoCpus}}'
docker stats --no-stream api`, {
            output: '536870912 1500000000\nCONTAINER ID   NAME   CPU %   MEM USAGE / LIMIT   MEM %\n...             api    0.4%    82.1MiB / 512MiB    16.0%',
          }),
          table(['Flag', 'Effect'], [
            ['--restart no', 'Never restart automatically'], ['--restart on-failure[:n]', 'Restart on non-zero exit, optionally limited'],
            ['--restart always', 'Always restart, including after daemon start'], ['--restart unless-stopped', 'Like always, but respects manual stop'],
            ['--memory', 'Hard memory limit (OOM kill beyond it)'], ['--cpus', 'CPU quota in cores'], ['--pids-limit', 'Maximum processes/threads'],
          ]),
          callout('warning', 'Memory swap defaults can surprise you', 'Without `--memory-swap`, Docker may allow swap beyond `--memory`. Set both equal for a hard limit, or configure swap deliberately.'),
        ],
        {
          quiz: quiz([
            q('Where should production secrets go?', ['-e flags in a script', 'Compose secrets or a mounted secret store', 'Baked into the image', 'In the image tag'], 1, 'Environment variables are visible in inspect; use secret mechanisms.'),
            q('Which restart policy restarts after a daemon restart but not after a manual stop?', ['always', 'unless-stopped', 'on-failure', 'no'], 1, 'unless-stopped is the practical default for services.'),
            q('A container hits its memory limit. What happens?', ['It is paused', 'The kernel OOM killer terminates processes', 'Docker raises the limit', 'The host reboots'], 1, 'Cgroup memory limits lead to OOM kills, commonly exit 137.'),
          ]),
          exercises: [
            ex('Hard limit', 'Run nginx with a 256 MB hard limit and no swap.', 'docker run --memory 256m --memory-swap 256m nginx:alpine', { command: 'docker run -d --memory 256m --memory-swap 256m nginx:alpine' }),
            ex('Env file', 'Create app.env with APP_PORT=3000 and start a container using it.', 'Use --env-file app.env and verify with docker exec env.', { command: 'printf "APP_PORT=3000\\n" > app.env && docker run --rm --env-file app.env alpine env' }),
          ],
          related: ['resource-limits', 'secrets-management', 'config-and-resources'],
          tags: ['containers', 'configuration'],
          commands: ['docker run', 'docker inspect', 'docker stats'],
          sources: [docs('Resource constraints', 'engine/containers/resource_constraints/'), docs('Environment variables', 'engine/reference/commandline/run/#env')],
        }),
    ]),
  ],
  ['docker-fundamentals'],
));

// ─────────────────────────────────────────────────────────────
// 5. Docker Images
// ─────────────────────────────────────────────────────────────
courses.push(course(
  'docker-images', 5, 'Docker Images', 'Layers, tags, digests and the local image store', 'Beginner', '1h 10m', 'package', 'green',
  'Understand what an image really contains, how layers are shared, and how to inspect and manage the local store without wasting disk.',
  ['Read image metadata, history and digests', 'Understand layer sharing and cache implications', 'Tag, pull, save and prune images safely'],
  [
    mod('image-model', 'The image model', 'What is inside an image and how it is stored.', [
      lesson('image-anatomy', 'Image anatomy and layers', '10 min',
        'An image is a manifest, a config and a stack of content-addressed layers.',
        ['Describe the manifest/config/layer structure', 'Explain layer sharing and copy-on-write', 'Read an image history'],
        [
          text('Not a tarball', 'An image is a manifest that references a config JSON and a list of layer blobs. Each layer is a diff of the filesystem. The config holds environment, entrypoint, command, labels, exposed ports, and the history of build instructions.\n\nAt runtime, the layers are composed into a read-only root filesystem and a writable layer is added. Writes use copy-on-write: modifying a file copies it into the writable layer, leaving the image layer untouched.'),
          diagram('image-layers', 'Shared read-only layers beneath a per-container writable layer.'),
          code('bash', `docker image inspect nginx:alpine --format '{{json .RootFS.Layers}}'
docker image history --no-trunc nginx:alpine
docker image inspect nginx:alpine --format '{{.Config.Env}}'`, {
            output: '["sha256:...","sha256:...","sha256:...","sha256:..."]',
          }),
          callout('info', 'Layer IDs are content hashes', 'Identical instructions on identical inputs produce identical layers. This is why layer order and reproducibility matter.'),
        ],
        {
          quiz: quiz([
            q('What does an image manifest reference?', ['Only a Dockerfile', 'A config and layer blobs', 'A running container', 'A volume'], 1, 'The manifest points at the config and content-addressed layers.'),
            q('How are layers shared between images?', ['By copying', 'By content hash', 'By tag', 'They are not shared'], 1, 'The same layer blob is reused by digest.'),
            q('What is the writable layer?', ['Part of the image', 'A per-container layer created at runtime', 'A registry feature', 'A build cache'], 1, 'Each container gets its own writable layer.'),
          ]),
          exercises: [
            ex('Count layers', 'Print the number of layers in nginx:alpine.', 'Pipe RootFS.Layers to jq length or count the JSON entries.', { command: "docker image inspect nginx:alpine --format '{{json .RootFS.Layers}}' | jq length" }),
            ex('Read history', 'Find the instruction that set the nginx entrypoint.', 'docker image history --no-trunc shows the ENTRYPOINT instruction.', { command: 'docker image history --no-trunc nginx:alpine | head' }),
          ],
          related: ['images-containers-registries', 'layer-caching'],
          tags: ['images'],
          commands: ['docker image inspect', 'docker image history'],
          sources: [docs('Image layers', 'get-started/docker-concepts/building-images/'), docs('Storage drivers', 'engine/storage/drivers/')],
        }),
      lesson('pull-inspect-tag', 'Pull, inspect and tag', '9 min',
        'Daily image operations with attention to tags, digests and registry defaults.',
        ['Pull specific versions and platforms', 'Inspect config and labels', 'Tag images for a registry'],
        [
          text('Pull behaviour', '`docker pull` fetches the manifest and missing layers. `--platform` selects an architecture when the image is multi-platform. A pull can be refused because of authentication, rate limits, or a missing tag. The error names the registry and repository; read it literally.'),
          code('bash', `docker pull --platform linux/amd64 nginx:1.27-alpine
docker image inspect nginx:1.27-alpine --format '{{.Architecture}} {{.Os}}'
docker tag nginx:1.27-alpine registry.example.com/web/nginx:1.27-alpine
docker image ls --filter reference='registry.example.com/*'`, {
            output: 'amd64 linux\nREPOSITORY                          TAG            IMAGE ID       SIZE\nregistry.example.com/web/nginx       1.27-alpine    ...            48.2MB',
          }),
          callout('tip', 'Tag is local until you push', '`docker tag` only creates another name for the same image ID locally. `docker push` publishes it to the registry named in the tag.'),
        ],
        {
          quiz: quiz([
            q('Does docker tag upload the image?', ['Yes', 'No, it only adds a local name', 'Only with --push', 'Only for Docker Hub'], 1, 'Push is a separate operation.'),
            q('Which flag selects an architecture on a multi-platform image?', ['--arch', '--platform', '--os', '--target'], 1, '--platform linux/amd64 selects the manifest.'),
            q('A pull fails with "manifest unknown". What is wrong?', ['The daemon is down', 'The tag or repository does not exist', 'The disk is full', 'The network is off'], 1, 'The registry has no manifest for that reference.'),
          ]),
          exercises: [
            ex('Registry tag', 'Tag alpine:3.20 for ghcr.io/team/base/alpine:3.20.', 'docker tag alpine:3.20 ghcr.io/team/base/alpine:3.20', { command: 'docker tag alpine:3.20 ghcr.io/team/base/alpine:3.20' }),
            ex('Read labels', 'Inspect the labels of an official image.', 'docker image inspect IMAGE --format "{{json .Config.Labels}}"'),
          ],
          related: ['image-anatomy', 'registry-auth', 'push-pull-digests'],
          tags: ['images', 'registries'],
          commands: ['docker pull', 'docker tag', 'docker image inspect'],
          sources: [ref('docker pull', 'cli/docker/image/pull/'), ref('docker tag', 'cli/docker/image/tag/')],
        }),
      lesson('cleanup-and-pruning', 'Cleanup, save and prune', '9 min',
        'Reclaim disk with confidence and move images between isolated environments.',
        ['Identify dangling and unused images', 'Use save/load for air-gapped transfer', 'Prune without deleting what you need'],
        [
          text('Know what is reclaimable', '`docker system df` reports Size and Reclaimable per object type. Dangling images (`<none>:<none>`) are intermediate or untagged layers. Unused images are not referenced by any container. Build cache is often the largest consumer.'),
          code('bash', `docker system df
docker image ls --filter dangling=true
docker image prune          # dangling only
docker image prune -a       # all unused images
docker builder prune
docker system prune --volumes

docker save -o app.tar acme/app:1.0
docker load -i app.tar`, {
            output: 'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE\nImages          107       10        101.4GB   61.28GB (60%)\nBuild Cache     1089      0         66.72GB   41.33GB (62%)',
          }),
          callout('danger', 'Prune is not undoable', 'Containers created later cannot use a deleted image without re-pulling. In air-gapped environments, export important images first.'),
        ],
        {
          quiz: quiz([
            q('What is a dangling image?', ['An image with no tag', 'A running image', 'An image in a registry', 'A stopped container'], 0, 'Dangling images are untagged (<none>:<none>) and safe to prune.'),
            q('Which command transfers an image without a registry?', ['docker push', 'docker save + docker load', 'docker cp', 'docker export'], 1, 'Save writes a tar archive; load imports it.'),
            q('Which prune removes build cache?', ['docker image prune', 'docker builder prune', 'docker volume prune', 'docker network prune'], 1, 'Builder prune targets BuildKit cache.'),
          ]),
          exercises: [
            ex('Reclaim safely', 'Show reclaimable space, then remove only dangling images.', 'docker system df followed by docker image prune.', { command: 'docker system df && docker image prune -f' }),
            ex('Air-gap transfer', 'Save alpine:3.20 to a file and load it after removing it locally.', 'docker save -o alpine.tar alpine:3.20; docker load -i alpine.tar', { command: 'docker save -o alpine.tar alpine:3.20' }),
          ],
          related: ['build-cache', 'system-maintenance'],
          tags: ['images', 'cleanup'],
          commands: ['docker image prune', 'docker system df', 'docker save', 'docker load'],
          sources: [ref('docker image prune', 'cli/docker/image/prune/'), docs('Pruning', 'config/pruning/')],
        }),
    ]),
  ],
  ['docker-fundamentals'],
));

module.exports = { courses };
