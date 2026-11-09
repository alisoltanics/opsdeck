'use strict';

/**
 * Standalone guided labs. Each command is validated again in the main process;
 * the renderer only decides when a step has been completed.
 */
const step = (instruction, command, hint = '', opts = {}) => ({
  instruction,
  command,
  hint,
  expect: opts.expect || command,
  output: opts.output || null,
  file: opts.file || null,
  content: opts.content || null,
});

const lab = (id, title, subtitle, level, duration, icon, accent, description, objectives, steps, notes = []) => ({
  id, title, subtitle, level, duration, icon, accent, description, objectives, steps,
  notes,
});

const labs = [
  lab('lab-first-contact', 'First contact', 'Run, inspect and remove a container', 'Beginner', '8 min', 'play', 'green',
    'A five-step introduction to the container lifecycle using images that are already approved for the sandbox.',
    ['Run a detached container', 'Read its state with docker ps', 'Read logs and remove it cleanly'],
    [
      step('Run hello-world and read the output.', 'docker run --rm hello-world', 'The image prints a short explanation and exits.'),
      step('Run an nginx container named lab-web in the background.', 'docker run -d --name lab-web nginx:1.27-alpine'),
      step('Confirm it is running.', 'docker ps', 'Look for lab-web and its published port.'),
      step('Read the container logs.', 'docker logs lab-web', 'nginx logs requests and startup messages.'),
      step('Remove the container.', 'docker rm -f lab-web', 'Force removal stops the running container first.'),
    ],
    ['The lab adds resource limits, drops capabilities and applies an opsdeck.lab label automatically.']),

  lab('lab-lifecycle', 'Lifecycle control', 'Stop, start and inspect state', 'Beginner', '7 min', 'rotate-cw', 'blue',
    'Practice graceful stop and restart while watching the recorded state and exit code.',
    ['Stop a container without deleting it', 'Start it again', 'Inspect the recorded exit code'],
    [
      step('Create a named background container.', 'docker run -d --name lab-cycle alpine sleep 600', 'The command keeps PID 1 alive for ten minutes.'),
      step('Stop it gracefully.', 'docker stop lab-cycle', 'SIGTERM is sent first; the process exits.'),
      step('Show all containers including stopped ones.', 'docker ps -a', 'lab-cycle is now Exited (0).'),
      step('Inspect the exit code.', "docker inspect lab-cycle --format '{{.State.ExitCode}}'", 'A graceful stop records exit code 0.'),
      step('Start it again.', 'docker start lab-cycle', 'Starting preserves the writable layer.'),
      step('Clean up.', 'docker rm -f lab-cycle'),
    ]),

  lab('lab-images', 'Image anatomy', 'Pull, inspect and compare images', 'Beginner', '9 min', 'layers', 'violet',
    'Look inside an image: its repository, digest, size, history and configuration.',
    ['Pull a pinned image', 'Read image metadata with inspect', 'Read layer history'],
    [
      step('Pull a small, pinned image.', 'docker pull alpine:3.20'),
      step('List local images.', 'docker images'),
      step('Inspect the image configuration.', "docker image inspect alpine:3.20 --format '{{.Id}} {{.Os}}/{{.Architecture}}'"),
      step('Read the layer history.', 'docker image history alpine:3.20', 'The history shows what each build instruction added.'),
      step('Run a one-off command from the image.', 'docker run --rm alpine:3.20 uname -a'),
    ],
    ['Image history can reveal build arguments. Never treat a layer as a secret store.']),

  lab('lab-volumes', 'Persistent volumes', 'Data that survives a container', 'Intermediate', '10 min', 'database', 'orange',
    'Create a named volume, write data from one container and read it back from a different one.',
    ['Create a labelled volume', 'Write data as a non-root user', 'Prove the data survives container removal'],
    [
      step('Create a named volume.', 'docker volume create lab-data'),
      step('Write a file into the volume.', 'docker run --rm -v lab-data:/data alpine sh -c "echo persisted > /data/hello.txt"', 'Named volumes are mounted by name, not by host path.'),
      step('Read it from a brand-new container.', 'docker run --rm -v lab-data:/data alpine cat /data/hello.txt', '', { output: 'persisted' }),
      step('Inspect the volume.', 'docker volume inspect lab-data', 'The mountpoint is on the Docker host, not in your home directory.'),
      step('Remove the volume.', 'docker volume rm lab-data', 'Removal is irreversible. In production, back up first.'),
    ]),

  lab('lab-network', 'Private network', 'Name resolution on a user-defined bridge', 'Intermediate', '12 min', 'network', 'cyan',
    'Two containers on a user-defined network resolve each other by name. Nothing is published to the host.',
    ['Create a user-defined bridge', 'Resolve a service by name', 'Inspect the network membership'],
    [
      step('Create the network.', 'docker network create lab-net'),
      step('Run redis on the network.', 'docker run -d --name lab-cache --network lab-net redis:7-alpine'),
      step('Resolve the name from another container.', 'docker run --rm --network lab-net alpine getent hosts lab-cache', 'Embedded DNS answers on user-defined networks.'),
      step('Inspect the network.', 'docker network inspect lab-net'),
      step('Clean up the container and network.', 'docker rm -f lab-cache'),
      step('Remove the network.', 'docker network rm lab-net'),
    ],
    ['The default bridge does not provide name resolution. Always create a user-defined network for services.']),

  lab('lab-compose', 'Compose a stack', 'Write and run a Compose project', 'Intermediate', '14 min', 'boxes', 'violet',
    'Author a two-service Compose file in the lab workspace, start it and inspect the resolved project.',
    ['Write a valid Compose file', 'Start a project with a sandbox prefix', 'Inspect and tear down every resource'],
    [
      step('Write compose.yaml with nginx and redis.', 'Write the Compose file', 'Use the editor beside the terminal.', {
        file: 'compose.yaml',
        content: `name: lab-stack
services:
  web:
    image: nginx:1.27-alpine
    ports:
      - "127.0.0.1:8099:80"
  cache:
    image: redis:7-alpine
`,
      }),
      step('Validate and start the project.', 'docker compose up -d', 'OpsDeck injects a project name and directory automatically.'),
      step('List the running services.', 'docker compose ps'),
      step('Read the web logs.', 'docker compose logs web'),
      step('Tear down the project and its volumes.', 'docker compose down -v'),
    ],
    ['Compose service names become DNS names on the project network.']),

  lab('lab-build', 'Build an image', 'A Dockerfile, a build and a run', 'Intermediate', '14 min', 'hammer', 'orange',
    'Build a tiny nginx image with a custom page using an isolated build context.',
    ['Write a Dockerfile', 'Build with a label', 'Run and verify the custom page'],
    [
      step('Write a Dockerfile that copies index.html into nginx.', 'Write the Dockerfile', 'Use the editor beside the terminal.', {
        file: 'Dockerfile',
        content: `FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
`,
      }),
      step('Write index.html for the image.', 'Write index.html', '', {
        file: 'index.html',
        content: '<h1>Built inside an OpsDeck lab</h1>\n',
      }),
      step('Build the image using the lab directory.', 'docker build -t lab-page {dir}', 'The context must be inside the lab workspace.'),
      step('Run the image.', 'docker run -d --name lab-page -p 127.0.0.1:8098:80 lab-page', 'The build applied an opsdeck.lab label automatically.'),
      step('Verify the page from inside the sandbox.', 'docker exec lab-page cat /usr/share/nginx/html/index.html', '', { output: 'Built inside' }),
      step('Clean up the container.', 'docker rm -f lab-page'),
    ],
    ['Labs may not mount host paths. COPY from the build context is the supported way to add files.']),

  lab('lab-diagnose', 'Diagnose a failure', 'Exit codes, logs and evidence', 'Advanced', '12 min', 'wrench', 'amber',
    'Reproduce a failing container and use evidence to explain it without guessing.',
    ['Reproduce a non-zero exit', 'Read the exit code and error', 'Recover and clean up'],
    [
      step('Run a container that exits immediately.', 'docker run --name lab-fail alpine sh -c "echo boom >&2; exit 7"', 'It exits with code 7.'),
      step('List all containers.', 'docker ps -a', 'lab-fail is in the Exited state.'),
      step('Read the exit code.', "docker inspect lab-fail --format '{{.State.ExitCode}}'", 'Inspect is the source of truth, not the log text.'),
      step('Read the logs.', 'docker logs lab-fail', 'stderr is included by default.'),
      step('Run a corrected command.', 'docker run --rm alpine sh -c "echo recovered"', 'A new container is the normal recovery path.'),
      step('Remove the failed container.', 'docker rm lab-fail'),
    ],
    ['Exit 137 usually means SIGKILL or an OOM kill. Exit 127 means the command was not found.']),
];

module.exports = { labs };
