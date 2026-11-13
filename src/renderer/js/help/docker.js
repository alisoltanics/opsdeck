'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.help = OD.help || {};
  Object.assign(OD.help, {
    'docker/overview': {
      title: 'Overview',
      summary: 'The home page of the Docker workspace. It shows whether the Docker engine is reachable and gives you a one-screen picture of your containers, images, CPU, memory, disk and recent engine activity.',
      whenToUse: [
        'When you open OpsDeck and want to know if Docker is healthy.',
        'To see how much CPU, memory and disk Docker is using right now.',
        'To jump quickly into a common task: run a container, open the terminal, or continue a lesson.',
        'To check what just happened on the engine (containers started, images pulled, networks created).',
      ],
      howItWorks: [
        'OpsDeck talks to the local Docker engine by running the Docker command-line tool with a fixed list of arguments (never through a shell). The page loads the engine overview and the container list together when you open it.',
        'The page does not refresh itself on a timer. Click the Overview item in the sidebar again to reload it. In the background OpsDeck checks the engine every 30 seconds; if Docker goes from offline to online (or the other way round) the Overview redraws by itself.',
        'The Engine load charts are built from samples that OpsDeck collects while it is open (the last 60 samples). They start empty after you launch the app and fill up as you use the Monitoring and Overview pages.',
        'If Docker is not running, the page is replaced by an Engine offline screen. No partial or stale data is shown.',
      ],
      parts: [
        {
          name: 'Engine offline screen',
          description: 'Shown instead of the normal page when the Docker engine does not answer (Docker Desktop or the Docker service is stopped, or you have no permission on the socket). Every Docker page uses the same screen.',
          items: [
            { name: 'Reason text', description: 'The error returned by the engine, for example "Cannot connect to the Docker daemon". If nothing was returned, a generic hint is shown.' },
            { name: 'Retry connection button', description: 'Checks the engine again and redraws the page. Use it after starting Docker.' },
            { name: 'Troubleshooting button', description: 'Opens the Academy troubleshooting guides.' },
            { name: 'Docker fundamentals button', description: 'Opens the Docker fundamentals course in the Academy.' },
            { name: 'Engine unavailable panel and guide card', description: 'A red status light with a short explanation. If the error text matches a known problem, a card below lists the first four fix steps and an Open guide button for the full guide.' },
          ],
        },
        {
          name: 'Hero banner (top)',
          description: 'A greeting with your machine name, the headline "Your Docker workspace is ready." and a sentence such as "3 containers are running across default with Docker 27.3.1".',
          items: [
            { name: 'New container button', description: 'Opens the Run a container dialog (same one as on the Containers page).' },
            { name: 'Ask AI about this workspace button', description: 'Opens the AI assistant with live context from the Docker workspace. It only sends data when you press Send inside the assistant. See Settings to configure it.' },
            { name: 'Open terminal button', description: 'Goes to the Docker Terminal page.' },
            { name: 'Continue learning button', description: 'Opens the next unfinished Academy lesson, or the Academy home if you have not started.' },
            { name: 'Engine checked line', description: 'How long ago the engine overview was read, for example "Engine checked 2 minutes ago".' },
            { name: 'ExecFile only - no shell line', description: 'A reminder of the safety model: Docker is always started with an argument list, never through a shell.' },
            { name: 'Day streak line', description: 'Your current Academy learning streak in days.' },
          ],
        },
        {
          name: 'Engine panel (top right)',
          description: 'A green pulsing light with "Docker Engine 27.3.1" and the sentence "Daemon reachable over default context", plus the Compose version when Docker Compose is installed.',
          items: [
            { name: 'API', description: 'The Docker API version the engine speaks, for example 1.47.' },
            { name: 'Platform', description: 'Operating system and CPU architecture of the engine, for example linux / amd64.' },
            { name: 'CPUs', description: 'Number of CPUs available to Docker.' },
            { name: 'Logging', description: 'The default logging driver, for example json-file. It decides where container logs are stored.' },
          ],
        },
        {
          name: 'Four stat cards',
          description: 'Quick numbers with small trend lines for the last samples.',
          items: [
            { name: 'Containers running', description: 'Number of running containers, with "N total - N stopped" underneath, for example "4 running, 7 total - 3 stopped".' },
            { name: 'Images', description: 'Number of images in the local image store.' },
            { name: 'Aggregate CPU', description: 'Total CPU used by all running containers, for example 12.4%. It can be above 100% when containers use several cores.' },
            { name: 'Memory in use', description: 'Total memory used by running containers and what percentage of the machine memory that is, for example "1.8 GB, 11.2% of 16 GB".' },
          ],
        },
        {
          name: 'Engine load card',
          description: 'Two area charts, CPU and Memory, covering roughly the last minute ("60s" on the left, "now" on the right). The green Live badge means the data is real, not a demo. Hover a chart to read a value.',
        },
        {
          name: 'Running containers card',
          description: 'A short table of the first six containers returned by Docker with a count such as "3 active" in the subtitle. Open manager goes to the full Containers page. If there are no containers, an empty state offers a Run a container button.',
          items: [
            { name: 'Container column', description: 'Container name with its image underneath and a coloured dot for its state.' },
            { name: 'State column', description: 'Status badge such as running, exited, paused or created.' },
            { name: 'Ports column', description: 'Up to two published ports, for example 0.0.0.0:8080->80/tcp.' },
            { name: 'CPU column', description: 'CPU percentage at the time the page was loaded.' },
            { name: 'Created column', description: 'How long ago the container was created.' },
          ],
        },
        {
          name: 'Recent engine events card',
          description: 'The last hour of Docker activity, up to eight lines, each with an icon (container, image, network, volume), the action and the object name, for example "start web-1", the event type and how long ago it happened. The All events button opens the Events page.',
        },
        {
          name: 'Disk usage card',
          description: 'One row per kind of Docker data (Images, Containers, Local volumes, Build cache) with a bar, the total size, and how much of it is reclaimable ("1.2 GB free"). The subtitle shows the total reclaimable space. The Manage button opens Settings.',
        },
        {
          name: 'Continue learning card',
          description: 'Appears when an Academy lesson is next. Shows the lesson title, its course, duration and your overall percent complete. Click it to resume.',
        },
        {
          name: 'Quick actions card',
          description: 'Six shortcut tiles: Containers, Compose projects, Images, Live monitoring, Guided labs and CLI reference.',
        },
      ],
      example: {
        title: 'Example: check Docker health after a reboot',
        steps: [
          'Open Overview. If you see "Docker is not reachable", start Docker Desktop or the Docker service, then click Retry connection.',
          'When the hero says "Your Docker workspace is ready.", read the Containers running card, for example "2 running, 5 total".',
          'Look at Disk usage. If it says "6.4 GB reclaimable", open Images and use Free space to review what can go.',
          'Check Recent engine events for lines like "die api-1". That tells you a container stopped; open Containers and its Logs to find out why.',
        ],
      },
      tips: [
        'The Overview is read-only. Nothing here changes your containers except the New container button, which asks for confirmation first.',
        'Memory percentage is measured against your whole machine, not against a container limit.',
        'If Docker is installed but you get a permission error, the guide card on the offline screen explains the usual fix (adding your user to the docker group).',
      ],
    },

    'docker/insights': {
      title: 'Docker Intelligence',
      summary: 'An automatic health and hygiene review of your Docker setup. It reads your containers, images, volumes, networks and Compose projects and lists security problems, waste and risky settings, with a grade for each running container.',
      whenToUse: [
        'Before you deploy or share a setup, to catch privileged containers or mounted Docker sockets.',
        'When disk is filling up and you want to know which images, volumes and networks are unused.',
        'To find containers that have no memory or CPU limit, no restart policy, or are stuck restarting.',
        'To compare environment variables between services of the same Compose project.',
      ],
      howItWorks: [
        'The page analyses a snapshot of what the engine reports. It is strictly read-only: nothing is changed, started or deleted from this page.',
        'The result is cached for about 20 seconds and refreshed automatically every 90 seconds while the page is open. Press Refresh to analyse again now. The footer says when the last analysis ran, for example "Analysed 1 minute ago - read-only snapshot".',
        'Values that could not be measured are reported as unknown, never as healthy. The Limitations card at the bottom lists anything that was skipped, for example "inspect data was unavailable for 2 containers".',
        'If the analysis fails or Docker is offline you see an Analysis unavailable screen with a button to open the Docker workspace.',
      ],
      parts: [
        {
          name: 'Header actions',
          description: 'Controls at the top right.',
          items: [
            { name: 'Cross-module view button', description: 'Opens the Intelligence overview that combines Docker, Kubernetes, Databases and Observability.' },
            { name: 'Refresh button', description: 'Runs the analysis again immediately.' },
          ],
        },
        {
          name: 'Five stat cards',
          description: 'Totals at a glance.',
          items: [
            { name: 'Containers', description: 'Total containers and how many are running.' },
            { name: 'Images', description: 'Number of images, how many are dangling (untagged), and total size, for example "3 dangling - 4.2 GB".' },
            { name: 'Security findings', description: 'Number of critical findings (red when above zero), plus the warning count and the average container security score.' },
            { name: 'Storage & networks', description: 'Total volumes, with how many volumes and networks are unused.' },
            { name: 'Compose projects', description: 'Number of Compose projects and how many are partially down (fewer running containers than expected).' },
          ],
        },
        {
          name: 'Findings card',
          description: 'The main list. Each row has a severity badge, a title, a detail sentence, optional evidence (a number or list of names), the resource name, and an Open button that jumps to the page where you can fix it. The count chips in the card header show how many findings of each severity exist.',
          items: [
            { name: 'Critical', description: 'Serious problem, for example a privileged container or a mounted Docker socket. Fix first.' },
            { name: 'Warning', description: 'Should be fixed, for example a container that runs as root, dangling images, or restart loops.' },
            { name: 'Info', description: 'Good practice suggestion, for example "No memory limit" or "Mutable latest tag".' },
            { name: 'Pass', description: 'A check that was measured and is fine.' },
            { name: 'Unknown', description: 'Could not be measured.' },
          ],
        },
        {
          name: 'Container security card',
          description: 'Checks every running container for privileged mode, host network / PID / IPC namespaces, mounted Docker or containerd sockets, sensitive host paths (/proc, /sys, /dev), running as root, writable root filesystem, extra Linux capabilities, passed-through devices, a missing no-new-privileges option and secrets stored in environment variables (values are masked).',
          items: [
            { name: 'Grade and score', description: 'Every container starts at 100. Each critical issue subtracts 35, each warning 15, each info 5. Grades: A 90 or more, B 75 or more, C 60 or more, D 40 or more, F below 40.' },
            { name: 'Issues badges', description: 'One badge per problem, coloured red, orange or cyan by severity. "No issues" in green means nothing was found.' },
          ],
        },
        {
          name: 'Image hygiene and Compose projects',
          description: 'Two cards side by side. Image hygiene lists images with their size and a Dangling or Tagged badge; its Open images button goes to the Images page. Compose projects lists each project with running / total containers and its config files; Open Compose goes to the Compose page.',
        },
        {
          name: 'Resource hygiene card',
          description: 'Two small tables: volumes (name, driver, mountpoint, size) and networks (name, driver, scope, subnet). They highlight data that no container currently uses.',
        },
        {
          name: 'Optimizer card',
          description: 'Counts containers, how many were inspected, how many have no memory limit, no CPU limit, and how many are restarting. When three or more containers use almost no CPU (under 1%) and memory (under 5%) a "Nearly idle containers" table appears with their usage.',
        },
        {
          name: 'Environment comparison card',
          description: 'For each Compose project it lists services, image, number of environment variable keys, memory limit and restart policy. If services of the same project disagree about a variable (for example LOG_LEVEL is "debug" in one and "info" in another, or missing in one) a Variable / Values table shows the difference. Secret values stay masked.',
        },
        {
          name: 'Limitations card',
          description: 'Lists what the analysis could not see, so you know how complete the result is.',
        },
      ],
      tables: [
        {
          name: 'Container security table',
          columns: [
            { name: 'Container', meaning: 'Container name with its image in grey.', example: 'api-1 - myorg/api:1.4.0' },
            { name: 'Grade', meaning: 'Letter grade from A (best) to F.', example: 'C' },
            { name: 'Score', meaning: 'Number behind the grade, from 100 down.', example: '70' },
            { name: 'Project', meaning: 'Compose project the container belongs to, if any.', example: 'shop' },
            { name: 'Issues', meaning: 'Badges for each problem found.', example: 'Runs as root, No no-new-privileges option' },
          ],
        },
        {
          name: 'Image hygiene table',
          columns: [
            { name: 'Image', meaning: 'Repository and tag.', example: 'nginx:latest' },
            { name: 'Size', meaning: 'Size on disk.', example: '188MB' },
            { name: 'State', meaning: 'Dangling means untagged and unreferenced; Tagged is a normal image.', example: 'Dangling' },
          ],
        },
        {
          name: 'Compose projects table',
          columns: [
            { name: 'Project', meaning: 'Compose project name.', example: 'shop' },
            { name: 'Running', meaning: 'Running containers out of all containers in the project.', example: '2 / 3' },
            { name: 'Config files', meaning: 'Compose files the project was started from.', example: '/home/me/shop/compose.yaml' },
          ],
        },
        {
          name: 'Volumes table (Resource hygiene)',
          columns: [
            { name: 'Volume', meaning: 'Volume name.', example: 'shop_db-data' },
            { name: 'Driver', meaning: 'Storage driver.', example: 'local' },
            { name: 'Mountpoint', meaning: 'Where the data lives on the host.', example: '/var/lib/docker/volumes/shop_db-data/_data' },
            { name: 'Size', meaning: 'Size reported by Docker.', example: '340MB' },
          ],
        },
        {
          name: 'Networks table (Resource hygiene)',
          columns: [
            { name: 'Network', meaning: 'Network name.', example: 'shop_default' },
            { name: 'Driver', meaning: 'Network driver.', example: 'bridge' },
            { name: 'Scope', meaning: 'local or swarm.', example: 'local' },
            { name: 'Subnet', meaning: 'Address range of the network.', example: '172.18.0.0/16' },
          ],
        },
        {
          name: 'Nearly idle containers table',
          columns: [
            { name: 'Container', meaning: 'Container name.', example: 'cron-1' },
            { name: 'CPU', meaning: 'CPU percentage.', example: '0.1%' },
            { name: 'Memory', meaning: 'Memory percentage of the host.', example: '0.8%' },
          ],
        },
        {
          name: 'Environment comparison tables',
          columns: [
            { name: 'Service', meaning: 'Compose service name.', example: 'web' },
            { name: 'Image', meaning: 'Image the service runs.', example: 'myorg/web:2.0' },
            { name: 'Env keys', meaning: 'Number of environment variables set.', example: '12' },
            { name: 'Memory limit', meaning: 'Configured memory limit, or a dash if none.', example: '512 MB' },
            { name: 'Restart policy', meaning: 'What Docker does when the container stops.', example: 'unless-stopped' },
            { name: 'Variable / Values', meaning: 'Only when services disagree: the variable name and each service value, or "not set".', example: 'LOG_LEVEL: web=debug, worker=info' },
          ],
        },
      ],
      example: {
        title: 'Example: fix a critical finding',
        steps: [
          'Open Intelligence and look at the Security findings card. It shows 1 critical.',
          'In Findings, read the red row "Container runtime socket mounted - api-1". It means the container has /var/run/docker.sock mounted and can control the engine.',
          'Click Open to go to Containers, inspect api-1 to see its Mounts, then remove that mount from your run command or Compose file and recreate the container.',
          'Come back and press Refresh. The grade of api-1 in Container security should improve.',
        ],
      },
      tips: [
        'Info findings such as "Mutable latest tag" are advice, not errors. Pin a version or digest to make deployments repeatable.',
        'A finding about unused images or volumes is a prompt to review, not an instruction to delete. A stopped container or a build may still need them.',
        'Only running containers are graded. Start a container, then refresh, to see it in the security table.',
      ],
    },

    'docker/containers': {
      title: 'Containers',
      summary: 'List, inspect and control every container on your Docker engine: start, pause, restart, open a shell, read logs, remove, and create new ones.',
      whenToUse: [
        'To start, pause, restart or remove a container.',
        'To read the logs of a container that crashed or misbehaves.',
        'To open a shell inside a running container and look around.',
        'To open the website of a container in Firefox.',
        'To see which containers belong to which Compose project, or which containers use a given image.',
      ],
      howItWorks: [
        'The list is read from the Docker engine when the page opens, together with live CPU and memory numbers for running containers. The page does not auto-refresh: press Refresh (or perform an action, which reloads the list) to see new data.',
        'Search, state chips, the project selector and grouping filter the list instantly in the page without asking Docker again.',
        'Clicking anywhere on a row (except its buttons) opens the container detail drawer.',
        'Destructive actions ask for confirmation and show the exact Docker command that will run.',
        'Your choice of Group by project is remembered between launches.',
      ],
      parts: [
        {
          name: 'Page header',
          description: 'Title, short description and two main buttons plus an Ask AI button.',
          items: [
            { name: 'Run container button', description: 'Opens the Run a container dialog (see below).' },
            { name: 'Refresh button', description: 'Reloads containers and their CPU / memory.' },
            { name: 'Ask AI button', description: 'Opens the AI assistant for this page with the list of containers as context. It only sends data when you press Send.' },
          ],
        },
        {
          name: 'Search box',
          description: 'Filters by container name, image, ID, Compose project and service name as you type. Press / on your keyboard to jump into it.',
        },
        {
          name: 'State chips',
          description: 'All, Running, Exited, Paused and Created, each with a count. Click one to show only containers in that state. Running means the process is active; Exited means it stopped (finished or crashed); Paused means it is frozen; Created means it exists but has never been started.',
        },
        {
          name: 'Image filter chip',
          description: 'Appears when you arrive from the Images page using "Show containers using this image". It shows the image name with an x. Click it to clear the filter. The counter then reads "2 of 9 containers".',
        },
        {
          name: 'Project selector and Group by project',
          description: 'Only shown when containers come from more than one group (for example two Compose projects, or Compose plus standalone containers). The selector shows "All projects (9)" or one project with its count. Group by project turns on section rows: each project becomes a header with its container count, service count, running count and a Show only this project button. Containers that were not started by Compose are under "Standalone".',
        },
        {
          name: 'Counter',
          description: 'Small text at the right of the toolbar such as "shop - 4 containers".',
        },
        {
          name: 'Row actions (right end of every row)',
          description: 'Buttons depend on the container state.',
          items: [
            { name: 'Pause / Start', description: 'Running containers show Pause (freezes all processes). Any container that is not running shows Start.' },
            { name: 'Restart', description: 'Only for running containers. Stops and starts the container again.' },
            { name: 'Open in Firefox (globe icon)', description: 'Only shown if the container publishes at least one TCP port. Opens http://localhost:PORT in Firefox (https for ports 443 and 8443). If several ports are published, a dialog asks which one. Disabled until the container is running.' },
            { name: 'Open shell (terminal icon)', description: 'Opens an interactive shell inside the container. Disabled unless the container is running. See "Container shell" below.' },
            { name: 'Logs', description: 'Opens the log drawer (see below).' },
            { name: 'Ask AI (sparkles icon)', description: 'Asks the AI about this one container with its live logs, stats and inspect data, once you press Send.' },
            { name: 'Remove (red trash icon)', description: 'Asks for confirmation, then runs docker rm -f on the container. The container and its writable layer are deleted. Named volumes are kept.' },
          ],
        },
        {
          name: 'Run a container dialog',
          description: 'A form that builds a docker run -d command. A live preview line under the form shows the exact command as you type. After you press Run in terminal, a second confirmation shows the command again before anything runs.',
          items: [
            { name: 'Image', description: 'Required. Prefilled with alpine:3.20 (or the image you chose on the Images page). Example: nginx:1.27-alpine.' },
            { name: 'Name (optional)', description: 'Becomes --name. Example: my-web.' },
            { name: 'Port mapping', description: 'Becomes -p. Format host:container, for example 127.0.0.1:8080:80. Putting 127.0.0.1 in front keeps the port private to your machine.' },
            { name: 'Environment', description: 'Comma separated KEY=value pairs, each becomes -e. Example: LOG_LEVEL=info, TZ=UTC.' },
            { name: 'Command (optional)', description: 'Overrides the image command. Example: sh -c \'echo hello\'.' },
            { name: 'Run in terminal button', description: 'Confirms, then runs the command. On success a toast shows the new container ID.' },
          ],
        },
        {
          name: 'Container detail drawer (click a row)',
          description: 'A side panel with everything Docker knows about one container, equal to docker inspect.',
          items: [
            { name: 'Header', description: 'Name, ID, image and a state badge.' },
            { name: 'Runtime', description: 'Created, Started, Exit code (0 is a clean exit, 137 usually means killed or out of memory), Restart policy, PID and Platform.' },
            { name: 'Command', description: 'Entrypoint, Cmd, Working dir and User (root if empty).' },
            { name: 'Environment table', description: 'Key / Value pairs set in the container, with a variable count.' },
            { name: 'Mounts table', description: 'Destination inside the container, Type (volume or bind), Source / name on the host, and Mode (rw read-write, ro read-only).' },
            { name: 'Networks table', description: 'Each network the container is on with its IP, gateway and MAC address.' },
            { name: 'Labels', description: 'All labels as key=value badges. Compose adds labels such as com.docker.compose.project.' },
            { name: 'Footer buttons', description: 'Ask AI, Explain this container (opens a related Academy lesson), Open in Firefox (when running with published ports), Copy inspect command, Close.' },
          ],
        },
        {
          name: 'Logs drawer',
          description: 'Shows the container output (stdout and stderr) with timestamps in a scrolling view. It reloads by itself every 6 seconds and keeps following the end of the log while you stay at the bottom.',
          items: [
            { name: 'Tail selector', description: 'How many of the last lines to read: 100, 300 (default), 600 or 1200.' },
            { name: 'Refresh button', description: 'Reload the logs now.' },
            { name: 'Latest button', description: 'Appears when you scroll up. Click to jump back to the newest line and resume following.' },
            { name: 'Footer', description: 'Shows the docker logs command used, with Ask AI, a Debugging lesson link and Copy command.' },
            { name: 'Empty state', description: '"No log output" means the container has not written anything to stdout or stderr.' },
          ],
        },
        {
          name: 'Container shell',
          description: 'A drawer with a terminal connected to the container (like docker exec -it ... bash). If your system supports it you get a full interactive terminal with tab completion, history, colours and Ctrl+C. Otherwise you get a simpler line-by-line shell with a "$" prompt, a Run button, Up/Down arrow history, Ctrl+L to clear. Closing the drawer ends the session.',
          items: [
            { name: 'Full terminal controls', description: 'Copy selection (Ctrl+Shift+C), paste (Ctrl+Shift+V), a fullscreen toggle, and Esc to leave fullscreen. The status label shows connecting, then the session state.' },
            { name: 'Footer', description: 'Shows the equivalent docker exec command, an Ask AI button and a lesson link.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Containers table',
          description: 'One row per container. Click a row for details.',
          columns: [
            { name: 'Container', meaning: 'A coloured dot for the state, the container name in bold and its image underneath.', example: 'web-1 / nginx:1.27-alpine' },
            { name: 'State', meaning: 'Status badge with Docker status text.', example: 'running (Up 3 hours) or exited (Exited (137) 2 minutes ago)' },
            { name: 'Ports', meaning: 'Up to two published port mappings; extra ones are shown as a +N badge. Format host:port->container-port/protocol.', example: '0.0.0.0:8080->80/tcp +1' },
            { name: 'CPU / memory', meaning: 'Live CPU percent with memory used underneath. Stopped containers show 0.0%.', example: '1.8% / 42 MB' },
            { name: 'Uptime', meaning: 'How long the container has been running, or how long ago it was created if not running.', example: 'Up 3 hours' },
            { name: 'Project', meaning: 'Compose project and service as a violet badge. Click it to show only that project. A dash means a standalone container.', example: 'shop/web' },
            { name: 'Actions (unlabeled)', meaning: 'Row buttons described above.', example: 'Pause, Restart, Open in Firefox, Open shell, Logs, Ask AI, Remove' },
          ],
        },
      ],
      example: {
        title: 'Example: find out why a container keeps crashing',
        steps: [
          'Open Containers and click the Exited chip. You see api-1 with state "Exited (1) 40 seconds ago".',
          'Click the Logs button on that row. Read the last lines; for example "Error: connect ECONNREFUSED db:5432" means the database was not ready.',
          'Click the row to open the detail drawer and check Environment and Networks (is it on the same network as db?).',
          'Press Start on the row to try again, or fix the configuration and recreate the container. Use Ask AI if you want a second opinion.',
        ],
      },
      tips: [
        'Remove uses docker rm -f, so a running container is stopped immediately. Data in a named volume survives; data written only inside the container is lost.',
        'Do not publish databases to 0.0.0.0. Use a port mapping like 127.0.0.1:5432:5432 so only your machine can reach it.',
        'CPU can exceed 100% for multi-threaded containers; 200% means two full cores.',
        'Open in Firefox needs Firefox installed. If it fails, a red toast explains why.',
        'The Run a container dialog does not support every docker run option. For anything advanced use the Terminal page.',
      ],
    },

    'docker/images': {
      title: 'Images',
      summary: 'Everything stored in your local image store: where each image came from, how big it is, which containers use it. Pull new images, tag them, inspect their layers and clean up old ones.',
      whenToUse: [
        'To download (pull) an image from a registry.',
        'To free disk space by removing images you no longer need.',
        'To create a container from an image.',
        'To see how an image was built (layer history) or add a new tag to it.',
        'To find out which containers use a specific image.',
      ],
      howItWorks: [
        'The list comes from the Docker engine when the page opens. Press Refresh or perform an action to reload it. Search and filter chips work instantly on the loaded list.',
        'An image is a read-only template made of layers. Several tags (names) can point to the same image ID. Images shared between tags are stored once on disk, but each row shows the full image size.',
        'A dangling image is an image with no name and no tag (shown as <none>), usually left behind when you rebuild a tag. It is normally safe to remove.',
        'The Free space cleanup tool never removes an image that a container references and never uses --force. The Remove button on a single row does use a forced remove, so read its confirmation first.',
      ],
      parts: [
        {
          name: 'Header buttons',
          description: 'Four actions at the top right plus an Ask AI button.',
          items: [
            { name: 'Pull image', description: 'Asks for an image reference such as nginx:1.27-alpine, validates it, confirms the docker pull command and downloads the image. Pin a version or digest instead of latest for repeatable setups.' },
            { name: 'Free space', description: 'Opens the cleanup review dialog (below).' },
            { name: 'Prune dangling', description: 'After confirmation runs docker image prune --force, deleting all untagged images that nothing references. This cannot be undone.' },
            { name: 'Refresh', description: 'Reloads the list.' },
          ],
        },
        {
          name: 'Four stat cards',
          description: 'Totals for the whole image store.',
          items: [
            { name: 'Local images', description: 'Number of image rows, with the number of dangling ones.' },
            { name: 'On-disk size', description: 'Sum of the sizes of all rows. Layers shared by several images are counted for each image, so the real disk use can be lower.' },
            { name: 'In use', description: 'Tagged images referenced by at least one container (running or stopped).' },
            { name: 'Registries', description: 'Number of distinct places the images came from (Docker Hub, ghcr.io, local builds and so on).' },
          ],
        },
        {
          name: 'Free space available banner',
          description: 'A yellow banner that appears when old unused images exist, for example "3 non-system images older than 90 days with no containers could free about 1.4 GB". Its Review cleanup button opens the same dialog as Free space.',
        },
        {
          name: 'Toolbar',
          description: 'Search and filters.',
          items: [
            { name: 'Search box', description: 'Matches repository, tag, image ID or registry text.' },
            { name: 'All chip', description: 'Shows every image.' },
            { name: 'In use chip', description: 'Shows tagged images only (it hides dangling images).' },
            { name: 'Dangling chip', description: 'Shows only untagged images.' },
            { name: 'Counter', description: 'For example "5 of 18".' },
          ],
        },
        {
          name: 'Row actions',
          description: 'Buttons at the end of every image row.',
          items: [
            { name: 'Run (green play)', description: 'Opens the Run a container dialog prefilled with this image.' },
            { name: 'Show containers using this image', description: 'Jumps to the Containers page filtered to this image.' },
            { name: 'History', description: 'Opens a drawer listing each layer of the image (see below).' },
            { name: 'Tag', description: 'Asks for a new reference, for example registry.example.com/app:1.4.0, and adds it as another name for the same image.' },
            { name: 'Ask AI', description: 'Asks the AI about the image with its inspect data, history and container usage, once you press Send.' },
            { name: 'Remove (red trash)', description: 'Asks for confirmation, then removes the image. Docker refuses if a container still references it.' },
          ],
        },
        {
          name: 'Free up disk space dialog',
          description: 'A safe, reviewable cleanup. Nothing is deleted until you press Delete selected and confirm. An image is listed only if it is not an official base image (ubuntu, alpine, node, python, postgres, nginx and similar), is used by zero containers (including stopped ones), and is older than the chosen age. Several tags of one image are grouped so the size is counted once.',
          items: [
            { name: 'Older than selector', description: '1 month, 3 months (default), 6 months or 1 year. Changing it rebuilds the list.' },
            { name: 'Selected summary', description: 'Total size and number of images currently ticked, for example "1.4 GB - 3 images selected".' },
            { name: 'Image rows', description: 'Checkbox, tag (or "N tags"), short ID, age in days and "0 containers", and the size. All rows start ticked; untick any you want to keep.' },
            { name: 'Delete selected', description: 'Disabled until something is ticked. Confirms with the docker image rm command, then deletes without --force and reports how much space was freed.' },
            { name: 'Empty state', description: '"Nothing to clean up" means no image meets all conditions.' },
          ],
        },
        {
          name: 'Image history drawer',
          description: 'Lists the layers that make up the image from newest to oldest. A banner warns that history is not a secret store: build arguments and commands are visible here, so never bake passwords into an image. Footer: Ask AI, Explain layers (lesson), Copy command, Close.',
        },
      ],
      tables: [
        {
          name: 'Images table',
          columns: [
            { name: 'Image', meaning: 'Repository:tag in bold and the short image ID underneath. Dangling images show <none>:<none> with a grey icon.', example: 'nginx:1.27-alpine / sha256:3b2c9a4f1d8e' },
            { name: 'Size', meaning: 'Size of the image on disk.', example: '48.2MB' },
            { name: 'Created', meaning: 'How long ago the image was built or published.', example: '3 weeks ago' },
            { name: 'Containers', meaning: 'Number of containers (running or stopped) created from this image. A dash means Docker did not report it.', example: '2' },
            { name: 'Registry', meaning: 'Where the image comes from, as a cyan badge. Dangling images show a grey "dangling" badge instead.', example: 'docker.io' },
            { name: 'Actions (unlabeled)', meaning: 'Run, Show containers, History, Tag, Ask AI, Remove.', example: '' },
          ],
        },
        {
          name: 'Image history table',
          columns: [
            { name: 'Layer', meaning: 'Short layer ID.', example: 'a1b2c3d4e5f6' },
            { name: 'Created', meaning: 'How long ago the layer was created.', example: '3 weeks ago' },
            { name: 'Created by', meaning: 'The Dockerfile instruction that produced the layer.', example: 'RUN apk add --no-cache curl' },
            { name: 'Size', meaning: 'Size added by that layer.', example: '4.1MB' },
          ],
        },
      ],
      example: {
        title: 'Example: free 2 GB of old images',
        steps: [
          'Open Images. A yellow banner says "5 non-system images older than 90 days with no containers could free about 2.1 GB". Click Review cleanup.',
          'Look at the list. Untick the one image you still want, for example app:1.2.0.',
          'Press Delete selected and read the confirmation, which lists the docker image rm command.',
          'Confirm. A toast says "Space freed - 4 images removed - about 1.8 GB".',
        ],
      },
      tips: [
        'The Remove button on a row is forceful; the Free space dialog is the safer way to remove many images.',
        'A rebuilt tag leaves the old image behind as dangling. Prune dangling is the fast way to clean those up.',
        'Do not put secrets in Dockerfile ARG or ENV lines; they show up in History.',
        'latest is just a name that can change. Prefer a version tag or a digest.',
      ],
    },

    'docker/compose': {
      title: 'Compose',
      summary: 'Manage Docker Compose projects (several containers defined in one compose.yaml file) as a unit: bring them up, restart, stop, take them down, read the resolved configuration and the combined logs.',
      whenToUse: [
        'To start or stop a whole application made of several services.',
        'To check what Compose actually resolved from your YAML (after variables and overrides).',
        'To read the combined logs of every service in a project.',
        'To see which projects exist and whether they are fully running.',
      ],
      howItWorks: [
        'OpsDeck lists the projects that Docker Compose knows about (docker compose ls). Each project is a card. Actions run Compose commands scoped to that project name.',
        'The list loads when the page opens; use Refresh to reload it. After an action finishes the page reloads automatically and shows a toast.',
        'Compose labels every container it creates, so the same project also appears grouped on the Containers page.',
      ],
      parts: [
        {
          name: 'Page header',
          description: 'Two buttons plus Ask AI.',
          items: [
            { name: 'Refresh', description: 'Reloads the project list.' },
            { name: 'Compose docs', description: 'Opens the Docker Compose course in the Academy.' },
            { name: 'Ask AI', description: 'Asks the AI about the page with the project list as context, when you press Send.' },
          ],
        },
        {
          name: 'Summary strip',
          description: 'Shown when at least one project exists: Projects (count), Running services (total running containers across projects), Compose engine (installed Compose version) and Academy lessons (number of lessons in the Compose course).',
        },
        {
          name: 'Project card',
          description: 'One card per project.',
          items: [
            { name: 'Name and status badge', description: 'Project name. A green running badge when Compose reports it as running; otherwise the raw status in grey, for example exited(2) or running(1), exited(1).' },
            { name: 'Config file path', description: 'The first compose file used by the project. "No config file" appears if Compose does not report one. Hover for the full path.' },
            { name: 'Ask AI icon', description: 'Asks the AI about this project with its config, logs and live services.' },
            { name: 'Resolved config icon', description: 'Opens the resolved configuration drawer (below).' },
            { name: 'Logs icon', description: 'Opens the project logs drawer (below).' },
            { name: 'Running / Files / Status', description: 'Three small numbers: running containers, number of compose files, and the status text.' },
            { name: 'Up button', description: 'Runs docker compose up -d for the project, building images if needed. Creates missing containers and starts stopped ones.' },
            { name: 'Restart button', description: 'Restarts all services of the project.' },
            { name: 'Stop button', description: 'Stops the services but keeps the containers, so Up or Restart can bring them back quickly.' },
            { name: 'Down button (red)', description: 'After confirmation runs docker compose down. Containers and the project network are removed; named volumes are kept so your data survives.' },
            { name: 'Learn button', description: 'Opens the Compose architecture lesson.' },
          ],
        },
        {
          name: 'Resolved config drawer',
          description: 'Shows the final configuration Compose would use as JSON, with the file path on top and a badge for each service name. Copy copies the text; footer buttons are Ask AI, Compose services lesson, Copy path and Close.',
        },
        {
          name: 'Compose logs drawer',
          description: 'Shows the last 200 lines of logs from all services, with colour codes removed. Reload fetches them again. The footer shows the exact docker compose logs command, an Ask AI button and Close.',
        },
        {
          name: 'Empty state',
          description: '"No Compose projects found" appears when none exist. It offers Open Compose Academy and a Guided Compose lab.',
        },
        {
          name: 'Compose project names banner',
          description: 'A reminder that OpsDeck uses the project name to locate the config file and run scoped commands, and that lab sandbox projects are prefixed opsdeck-lab-.',
        },
      ],
      example: {
        title: 'Example: restart an app after changing a config file',
        steps: [
          'Open Compose and find the project card named shop (status running, Running 3).',
          'Click the Resolved config icon to check that your change (for example a new environment variable) appears.',
          'Click Up. Compose recreates only the services whose config changed.',
          'Click the Logs icon and press Reload to confirm the services started cleanly.',
        ],
      },
      tips: [
        'Down removes containers and networks but not named volumes. It is the normal way to reset an environment without losing database data.',
        'Up also builds images, so the first run can take a while.',
        'Only projects that Compose can see appear. A project whose directory was deleted may show a status but no config file.',
        'If an action fails, the red toast shows the error that Compose printed.',
      ],
    },

    'docker/volumes': {
      title: 'Volumes',
      summary: 'Named storage managed by Docker. Volumes keep data (databases, uploads) after a container is removed.',
      whenToUse: [
        'To see which named volumes exist and which Compose project created them.',
        'To create a volume before starting a container.',
        'To inspect a volume (where it lives on disk, its driver and labels).',
        'To remove volumes you no longer need.',
      ],
      howItWorks: [
        'The list is read from Docker when the page opens. Use Refresh to reload.',
        'A volume lives on this machine. It survives docker rm of a container, but it is not a backup: if the disk fails or you remove the volume, the data is gone.',
        'Volumes shown here are named volumes managed by Docker, not host bind mounts (folders you map from your own file system).',
      ],
      parts: [
        {
          name: 'Header buttons',
          description: 'Three actions plus Ask AI.',
          items: [
            { name: 'Create volume', description: 'Asks for a name (letters, digits, underscore, dot or dash, starting with a letter or digit, up to 128 characters, for example app-data) and runs docker volume create.' },
            { name: 'Prune unused', description: 'After a red confirmation runs docker volume prune --force. Every volume not referenced by any container is deleted and its data is lost.' },
            { name: 'Refresh', description: 'Reloads the list.' },
          ],
        },
        {
          name: 'Summary strip',
          description: 'Volumes (total), Drivers (distinct drivers), Compose-managed (volumes carrying a Compose label) and Storage lesson (number of lessons in the volumes course).',
        },
        {
          name: 'Row actions',
          description: 'Buttons on each row.',
          items: [
            { name: 'Inspect (eye)', description: 'Opens a drawer with the full docker volume inspect JSON (mountpoint, driver, labels, options). Footer: Ask AI, Storage lesson, Copy command, Close.' },
            { name: 'Ask AI', description: 'Asks the AI about the volume and the containers using it.' },
            { name: 'Remove (red trash)', description: 'After confirmation deletes the volume and all data in it permanently.' },
          ],
        },
        {
          name: 'Empty state',
          description: '"No volumes" with a Create volume button. Volumes appear once a container or Compose project creates one.',
        },
        {
          name: 'Volumes are not backups banner',
          description: 'A yellow reminder to back up data explicitly and write down restore steps, with a Storage lesson link.',
        },
      ],
      tables: [
        {
          name: 'Volumes table',
          columns: [
            { name: 'Volume', meaning: 'Volume name in bold with its scope underneath.', example: 'shop_db-data / local scope' },
            { name: 'Driver', meaning: 'Storage driver. local is the normal one.', example: 'local' },
            { name: 'Created', meaning: 'How long ago the volume was created.', example: '2 weeks ago' },
            { name: 'Labels', meaning: 'Up to two labels as key=value badges. Compose adds its project and volume labels.', example: 'com.docker.compose.project=shop' },
            { name: 'Actions (unlabeled)', meaning: 'Inspect, Ask AI, Remove.', example: '' },
          ],
        },
      ],
      example: {
        title: 'Example: create a volume and check it',
        steps: [
          'Click Create volume and type pgdata, then Create. A toast shows "docker volume create pgdata".',
          'Find pgdata in the table and click Inspect to see its mountpoint under /var/lib/docker/volumes.',
          'Use the volume in a container, for example with the Terminal page: docker run -d -v pgdata:/var/lib/postgresql/data postgres:16.',
        ],
      },
      tips: [
        'Prune unused deletes every volume that no container references, including volumes of stopped containers you may want back. Check the list first.',
        'This page does not show volume size or which container uses a volume; the Docker Intelligence page and Ask AI can help with that.',
        'Name volumes clearly. Compose names them project_volume, for example shop_db-data.',
      ],
    },

    'docker/networks': {
      title: 'Networks',
      summary: 'Virtual networks that connect your containers. Create, inspect and remove them, and see which containers are attached.',
      whenToUse: [
        'To create a private network so containers can reach each other by name.',
        'To see the subnet, gateway and attached containers of a network.',
        'To remove networks that are no longer used.',
      ],
      howItWorks: [
        'The list is read from Docker when the page opens; use Refresh to reload.',
        'Docker always has three built-in networks: bridge (the default), host and none. Networks you create (user-defined bridge networks) give containers automatic name resolution: a container called db can be reached as db by others on the same network. Containers on the default bridge cannot do this.',
        'Compose creates one user-defined network per project automatically, usually called project_default.',
      ],
      parts: [
        {
          name: 'Header buttons',
          description: 'Three actions plus Ask AI.',
          items: [
            { name: 'Create network', description: 'Opens a form (below).' },
            { name: 'Prune unused', description: 'After confirmation runs docker network prune --force. Networks that no container uses are removed; built-in networks are kept.' },
            { name: 'Refresh', description: 'Reloads the list.' },
          ],
        },
        {
          name: 'Summary strip',
          description: 'Networks (total), User-defined bridge (bridge networks that are not bridge, host or none), Overlay (multi-host swarm networks) and Internal only (networks with no outside access).',
        },
        {
          name: 'Create network dialog',
          description: 'A small form.',
          items: [
            { name: 'Network name', description: 'Required. Example: app-net.' },
            { name: 'Driver', description: 'bridge (default, single host), overlay (swarm, many hosts) or macvlan (gives containers addresses on your physical network).' },
            { name: 'Subnet (optional)', description: 'Address range such as 172.28.0.0/16. Leave empty to let Docker choose.' },
            { name: 'Internal network checkbox', description: 'Containers on it can talk to each other but not to the outside world.' },
          ],
        },
        {
          name: 'Row actions',
          description: 'Buttons on each row.',
          items: [
            { name: 'Inspect (eye)', description: 'Opens a drawer with Driver, Scope, Subnet, Gateway, Internal and IPv6 values plus an Attached containers list showing each container name and IPv4 address. Footer: Ask AI, DNS lesson, Copy command, Close.' },
            { name: 'Ask AI', description: 'Asks the AI about the network and its attached containers.' },
            { name: 'Remove (red trash)', description: 'After confirmation removes the network. Containers must be disconnected or removed first.' },
          ],
        },
        {
          name: 'Empty state and banner',
          description: '"No networks" suggests creating a user-defined bridge. A banner explains that name resolution needs a user-defined network and links to the networking lesson.',
        },
      ],
      tables: [
        {
          name: 'Networks table',
          columns: [
            { name: 'Network', meaning: 'Network name in bold and its short ID underneath.', example: 'shop_default / 7c1e9f2a4b3d' },
            { name: 'Driver', meaning: 'Badge: bridge (blue), overlay (violet) or other (cyan).', example: 'bridge' },
            { name: 'Scope', meaning: 'local (this host) or swarm (cluster).', example: 'local' },
            { name: 'Internal', meaning: 'An amber "internal" badge when the network has no outside access; a dash otherwise.', example: 'internal' },
            { name: 'IPv6', meaning: 'A cyan IPv6 badge when IPv6 is enabled.', example: 'IPv6' },
            { name: 'Created', meaning: 'How long ago it was created.', example: '3 days ago' },
            { name: 'Actions (unlabeled)', meaning: 'Inspect, Ask AI, Remove.', example: '' },
          ],
        },
      ],
      example: {
        title: 'Example: let two containers talk by name',
        steps: [
          'Click Create network, name it app-net, keep driver bridge, press Create network.',
          'Start your containers on it, for example from Terminal: docker run -d --network app-net --name db postgres:16 and docker run -d --network app-net --name web my-web.',
          'Open Inspect on app-net. Under Attached containers you should see db and web with their IPs.',
          'Inside web, the database is now reachable at the host name db.',
        ],
      },
      tips: [
        'Built-in networks (bridge, host, none) cannot be removed.',
        'An internal network blocks all outgoing traffic, so containers on it cannot download packages.',
        'Remove fails while containers are still attached; stop or disconnect them first.',
      ],
    },

    'docker/builds': {
      title: 'Builds',
      summary: 'Shows your Buildx builders (the engines that build images), the platforms they support and the build cache, and lets you build an image from a Dockerfile.',
      whenToUse: [
        'To build an image from a Dockerfile in a project folder.',
        'To check which builders exist and which CPU platforms they can build for (for example linux/amd64 and linux/arm64).',
        'To see how much space the build cache uses.',
      ],
      howItWorks: [
        'Docker builds images with BuildKit. A builder is a BuildKit instance. The default builder uses the Docker engine itself; you can create others with docker buildx create.',
        'The page loads builders and cache usage when it opens; press Refresh to reload.',
        'Building runs docker build as a command. The first time you use it, OpsDeck asks for the same terminal consent as the Terminal page.',
      ],
      parts: [
        {
          name: 'Header buttons',
          description: 'Build an image and Refresh, plus Ask AI.',
          items: [
            { name: 'Build an image', description: 'Opens the build dialog (below). Asks for terminal consent first if you have not given it yet.' },
            { name: 'Refresh', description: 'Reloads builders and cache.' },
          ],
        },
        {
          name: 'Builder card',
          description: 'One card per Buildx builder.',
          items: [
            { name: 'Name and current badge', description: 'Builder name. A green "current" badge marks the builder used by default.' },
            { name: 'Driver badge', description: 'How the builder runs, for example docker or docker-container.' },
            { name: 'dynamic / static badge', description: 'Dynamic builders create their nodes on demand; static ones have fixed nodes.' },
            { name: 'Nodes badge', description: 'Number of nodes, for example "1 nodes".' },
            { name: 'Active badge', description: 'When the builder was last used, for example "active 2 days ago".' },
            { name: 'Nodes list', description: 'Each node name with a status badge (green when running) and pills for the platforms it can build, such as linux/amd64.' },
          ],
        },
        {
          name: 'Build cache card',
          description: 'A bar and the total size of the BuildKit cache, with the reclaimable size in the subtitle and a note such as "42 cache records". It tells you to prune with docker builder prune when the daemon is idle. If BuildKit reports nothing, "No cache data" appears.',
        },
        {
          name: 'Reproducible build recipe card',
          description: 'A teaching card. It shows an example command (docker buildx build --platform linux/amd64,linux/arm64 -t registry.example.com/app:1.4.0 --push .) and four tips: pin base images, separate build and runtime stages, use --cache-from / --cache-to in CI, and attach SBOM and provenance attestations. A button opens the BuildKit lesson.',
        },
        {
          name: 'Build an image dialog',
          description: 'A form with a live command preview. Pressing Run build asks for confirmation (builds use CPU and disk and can take minutes), then runs the command. Toasts report start, success or failure.',
          items: [
            { name: 'Image tag', description: 'Required name for the result. Prefilled opsdeck/app:dev.' },
            { name: 'Dockerfile', description: 'Optional path of the Dockerfile (-f). Empty means the file named Dockerfile in the context.' },
            { name: 'Platform', description: 'Optional target such as linux/amd64 (--platform).' },
            { name: 'Build context (absolute path)', description: 'Folder sent to the builder, for example /home/you/project. Empty means ".".' },
            { name: 'Disable cache checkbox', description: 'Adds --no-cache to rebuild every step.' },
          ],
        },
        {
          name: 'Empty state',
          description: '"No buildx builders" with an Open build academy button when none are found.',
        },
      ],
      example: {
        title: 'Example: build a local image',
        steps: [
          'Click Build an image. Accept the consent prompt if it appears.',
          'Set Image tag to myapp:dev and Build context to /home/you/myapp. The preview reads: docker build -t myapp:dev /home/you/myapp.',
          'Press Run build and confirm. Wait for the "Build completed" toast.',
          'Open Images; myapp:dev is in the list and can be started with its Run button.',
        ],
      },
      tips: [
        'Build output is not streamed on this page. If a build fails, the toast shows the start of the error; run the same docker build in the Terminal page to see more.',
        'Use a specific base image tag in your Dockerfile, not latest alone, so builds are repeatable.',
        'The build cache can grow large over time; it is reclaimable space on the Overview disk card.',
      ],
    },

    'docker/registries': {
      title: 'Registries',
      summary: 'Shows which registries you are logged in to, where your local images come from, and lets you search Docker Hub.',
      whenToUse: [
        'To check which registries Docker has credentials for.',
        'To see how many of your images come from each registry.',
        'To find a public image on Docker Hub and copy or run its docker pull command.',
      ],
      howItWorks: [
        'OpsDeck reads your Docker configuration file to list the registries you have logged in to. It never asks for, shows or stores passwords; credentials stay in the Docker config or your credential store.',
        'To log in to a registry, run docker login in a terminal yourself.',
        'Docker Hub search sends your search term to Docker Hub when you submit the form. Nothing else is sent.',
      ],
      parts: [
        {
          name: 'Header',
          description: 'Refresh reloads the data. Registry lesson opens the registry authentication lesson. Ask AI works as on other pages.',
        },
        {
          name: 'Authenticated registries card',
          description: 'Lists each registry host you are logged in to with a green key icon and a badge showing the saved user name (or "token"). The subtitle says which credential store is in use, for example "Credential store: desktop". The footer shows the path of the Docker config file.',
          items: [
            { name: 'Empty state', description: '"No registry logins" explains that you should run docker login in a terminal.' },
          ],
        },
        {
          name: 'Image sources card',
          description: 'For every registry host among your local images, a count and a bar, for example docker.io 14, ghcr.io 3. "No images yet" appears when you have no images.',
        },
        {
          name: 'Docker Hub search card',
          description: 'A search box and a Search button. Type a name such as postgres and press Enter or Search. The result area shows a loading message, an error banner if the search failed, or the results table. Before any search it says "Search public images".',
          items: [
            { name: 'Copy pull command (copy icon)', description: 'Copies docker pull NAME to the clipboard.' },
            { name: 'Run in terminal (play icon)', description: 'Fills the Terminal page with docker pull NAME so you can review and run it.' },
          ],
        },
        {
          name: 'Verify before you pull banner',
          description: 'A reminder that official images are maintained by Docker, that Docker Hub marks verified publishers, and that a digest should be pinned in production.',
        },
      ],
      tables: [
        {
          name: 'Search results table',
          columns: [
            { name: 'Repository', meaning: 'Image name on Docker Hub.', example: 'postgres' },
            { name: 'Description', meaning: 'Short description from the publisher, or "No description".', example: 'The PostgreSQL object-relational database system' },
            { name: 'Stars', meaning: 'How many users starred it; a rough popularity signal.', example: '13,000' },
            { name: 'Trust', meaning: 'official (green) for Docker official images, automated (cyan) for automated builds, community (grey) for everything else.', example: 'official' },
            { name: 'Actions (unlabeled)', meaning: 'Copy pull command and Run in terminal.', example: '' },
          ],
        },
      ],
      example: {
        title: 'Example: find and pull a database image',
        steps: [
          'In the Docker Hub search box type redis and press Enter.',
          'Look at the Trust column. Choose the row marked official.',
          'Click the play icon (Run in terminal). The Terminal page opens with docker pull redis filled in.',
          'Edit it to a pinned version, for example docker pull redis:7.4, and press Run.',
        ],
      },
      tips: [
        'Community images are published by anyone. Check the publisher and the description before pulling.',
        'A tag such as latest can change over time. Pin a version or digest in production.',
        'Only Docker Hub can be searched from this page. Private registries appear in the logged-in list but are not searched.',
      ],
    },

    'docker/monitoring': {
      title: 'Monitoring',
      summary: 'Live CPU, memory, network, disk and process numbers for each running container, refreshed every 4 seconds.',
      whenToUse: [
        'To find which container is using the most CPU or memory.',
        'To watch resource use while you run a load test or a build.',
        'To check whether a container is close to its memory limit.',
      ],
      howItWorks: [
        'Numbers come from docker stats. The page reads them when it opens and then every 4 seconds while it stays open; the green Live badge confirms this. Refresh now reads them immediately.',
        'Each sample is also added to the history used by the two charts, which show roughly the last minute. The history is kept while OpsDeck is open and is shared with the Overview page.',
        'Only running containers are listed. Stopped containers have no live numbers.',
      ],
      parts: [
        {
          name: 'Header',
          description: 'Refresh now button, a green "Live - 4s" badge and the Ask AI button (which includes live telemetry).',
        },
        {
          name: 'Four stat cards',
          description: 'Totals across all running containers.',
          items: [
            { name: 'Aggregate CPU', description: 'Sum of CPU percentages with the number of running containers.' },
            { name: 'Memory', description: 'Total memory used and its share of your machine memory, for example "2.1 GB, 13.0% of 16 GB".' },
            { name: 'Highest CPU', description: 'The biggest CPU percentage and the name of that container. Shows a dash with "no samples" when nothing runs.' },
            { name: 'Processes', description: 'Total number of processes (PIDs) inside all containers.' },
          ],
        },
        {
          name: 'CPU pressure and Memory pressure charts',
          description: 'Area charts of aggregate CPU and of memory as a percent of the host, "60s" to "now". Hover to see values. They update with each sample.',
        },
        {
          name: 'Per-container telemetry table',
          description: 'The detailed table. The "sampled HH:MM:SS" label above it shows when the last sample was taken. Each row ends with an Ask AI button (with live telemetry) and, where available, a lesson link.',
        },
        {
          name: 'Learn to read the numbers banner',
          description: 'Explains that CPU can exceed 100% for multi-core use and that a memory limit is a ceiling, not the working set. Links to the resource limits lesson.',
        },
      ],
      tables: [
        {
          name: 'Per-container telemetry',
          columns: [
            { name: 'Container', meaning: 'Name with its short ID under it and a green running dot.', example: 'api-1 / 3f2a9c7b1d4e' },
            { name: 'CPU', meaning: 'Bar and percentage. Green up to 50%, amber above 50%, red above 80%.', example: '63.2% (amber)' },
            { name: 'Memory', meaning: 'Bar with used / limit. Turns red above 80% of the limit. If no limit is set, the limit is the host memory.', example: '210MiB / 512MiB' },
            { name: 'Network', meaning: 'Total data received (down arrow) and sent (up arrow) since the container started.', example: '1.2 GB down / 340 MB up' },
            { name: 'Block I/O', meaning: 'Total data read from and written to disk by the container.', example: '12 MB / 98 MB' },
            { name: 'PIDs', meaning: 'Number of processes and threads running in the container.', example: '14' },
            { name: 'Actions (unlabeled)', meaning: 'Ask AI and lesson link.', example: '' },
          ],
        },
      ],
      example: {
        title: 'Example: find the container that slows your machine',
        steps: [
          'Open Monitoring. Look at the Highest CPU card, for example "148.0% - worker-1".',
          'Find worker-1 in the table. The CPU bar is red.',
          'Click its Ask AI icon to get an explanation based on live telemetry, or go to Containers and open its Logs.',
          'Restart or fix it and watch the CPU pressure chart drop.',
        ],
      },
      tips: [
        'Network and Block I/O are totals since the container started, not per-second rates.',
        'A container without a memory limit shows the whole host memory as its ceiling.',
        'Leave the page open to build up the chart; leaving the page stops the 4-second refresh.',
      ],
    },

    'docker/events': {
      title: 'Events',
      summary: 'A timeline of what the Docker engine did: containers created, started and stopped, images pulled, networks and volumes created. Use it to match a problem with the action that caused it.',
      whenToUse: [
        'To find out when a container died or restarted.',
        'To see exactly what happened to the engine in the last 5 minutes, hour, day or week.',
        'To check whether a Compose command created or removed the objects you expected.',
      ],
      howItWorks: [
        'The page reads the engine history for the chosen window when it opens. It does not stream live; press Refresh to read it again. Changing the type chip or the window reloads it.',
        'Events describe changes (create, start, die, destroy, pull, connect). They are not logs: the text a container prints is in the container Logs.',
        'The window is limited by what the engine remembers, so a 7-day window may show less than 7 days.',
      ],
      parts: [
        {
          name: 'Header',
          description: 'Refresh button and Ask AI (with events as context).',
        },
        {
          name: 'Type chips',
          description: 'All, plus one chip for each type present in the loaded events, such as Container, Image, Network, Volume. Click a chip to show only that type.',
        },
        {
          name: 'Window selector',
          description: 'How far back to look: 5 minutes, 1 hour (default), 24 hours or 7 days.',
        },
        {
          name: 'Empty state',
          description: '"No events in this window" means nothing happened; widen the window or perform a Docker operation.',
        },
        {
          name: 'Events are not logs banner',
          description: 'Explains the difference and links to the Logs and debugging lesson.',
        },
      ],
      tables: [
        {
          name: 'Events table',
          columns: [
            { name: 'Time', meaning: 'Clock time of the event (24-hour).', example: '14:32:08' },
            { name: 'Type', meaning: 'Kind of object, as a coloured badge: container (blue), image (violet), network (cyan), others (orange).', example: 'container' },
            { name: 'Action', meaning: 'What happened.', example: 'start, die, create, destroy, pull, connect' },
            { name: 'Actor', meaning: 'Name of the object (or its image or short ID), with the full ID underneath.', example: 'web-1 / 3f2a9c7b1d4e8a90' },
            { name: 'Attributes', meaning: 'Up to three extra details as key=value badges, such as exit code or the network a container joined.', example: 'exitCode=137' },
            { name: 'When', meaning: 'How long ago the event happened.', example: '4 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'Example: why did my container stop?',
        steps: [
          'Open Events and choose the 1 hour window and the Container chip.',
          'Find the row for api-1 with Action die and Attributes exitCode=137.',
          'Exit code 137 means the process was killed, often because it ran out of memory. Look at the row just before it for a start.',
          'Open Monitoring or the container Logs to confirm the cause.',
        ],
      },
      tips: [
        'The die action with exitCode=0 is a normal finish; any other number is an error.',
        'Pull, create and destroy events are useful to confirm that a Compose up or down really did what you expected.',
      ],
    },

    'docker/terminal': {
      title: 'Terminal',
      summary: 'A safe Docker-only command console. You type docker commands, OpsDeck checks them and runs them against your local engine. It is not a normal shell.',
      whenToUse: [
        'To run a docker command that has no button, for example docker system df or docker volume ls.',
        'To run a command suggested by a lesson, the AI assistant or the Registries page.',
        'To see the exact output and exit code of a Docker command.',
      ],
      howItWorks: [
        'Every command is split into words and handed directly to the Docker program as a list of arguments. There is no shell, so pipes (|), redirects (>), command chaining (; and &&), variables and command substitution do not work and are rejected.',
        'A validator also blocks dangerous options such as privileged mode, host network, host namespaces, Docker socket mounts and added capabilities. A blocked command shows "Blocked by the command validator" with the reason and a warning toast.',
        'Before the first command you must give consent. Once accepted it is remembered and not asked again.',
        'The page keeps the last 60 commands while OpsDeck is open. They are cleared with the Clear button.',
        'Other pages can send a command here (for example Registries "Run in terminal"); it appears filled in the input so you can review and run it.',
      ],
      parts: [
        {
          name: 'Header',
          description: 'Clear button, a consent badge and Ask AI.',
          items: [
            { name: 'Clear', description: 'Empties the output and the history list.' },
            { name: 'Consent badge', description: 'Amber "Consent required" until you accept, then green "Consent granted".' },
          ],
        },
        {
          name: 'Explicit consent banner',
          description: 'Shown only while consent is missing. Explains that commands affect your local engine and are validated. The Review consent button opens a confirmation listing the safety rules (no shell, no privileged mode, no host networking, no Docker socket mounts, no capability additions). Choose I understand, continue to enable.',
        },
        {
          name: 'Console window',
          description: 'The black terminal. The title bar shows "opsdeck - docker" and the active Docker context. Each command appears as a block.',
          items: [
            { name: 'Command line', description: 'The command you ran, after a $ sign.' },
            { name: 'Exit badge', description: 'Green "exit 0" means success; "exit 1" or another number means failure. "timed out" is added if the command ran too long.' },
            { name: 'Time', description: 'When the command ran.' },
            { name: 'Output', description: 'Standard output on success, or the error text on failure.' },
            { name: 'Running indicator', description: 'A "Running..." line while a command is still executing. Only one command runs at a time.' },
          ],
        },
        {
          name: 'Input row',
          description: 'The $ prompt, a text box with the placeholder "docker ps -a" and a Run button. Press Enter to run. Up and Down arrows walk through earlier commands. Only Docker commands are accepted.',
        },
        {
          name: 'Starters',
          description: 'Six chips that fill the input with a safe read-only command: docker ps -a, docker images, docker compose ls, docker system df, docker version, docker info. Click one, then press Run.',
        },
        {
          name: 'Why no shell banner',
          description: 'Explains the injection risk a shell would add and links to the CLI anatomy lesson.',
        },
      ],
      example: {
        title: 'Example: see how much disk Docker uses',
        steps: [
          'Click the docker system df chip. It appears in the input.',
          'Press Run. If this is your first time, accept the consent prompt and press Run again.',
          'Read the output: a table with Images, Containers, Local Volumes and Build Cache, their total size and RECLAIMABLE space.',
          'Press the Up arrow to bring the command back later.',
        ],
      },
      tips: [
        'Typing ls | grep web will fail because pipes are not allowed. Use filters instead, for example docker ps --filter name=web.',
        'Commands that run forever (docker logs -f, docker run without -d) will end by timeout; use -d or the Logs drawer instead.',
        'For an interactive shell inside a container use the Open shell button on the Containers page, not this terminal.',
        'You are responsible for what you run: docker rm, docker image rm and docker system prune delete data.',
      ],
    },

    'docker/academy': {
      title: 'Academy',
      summary: 'A built-in Docker school with courses, lessons, quizzes, guided labs, a command reference, troubleshooting guides, diagrams and a glossary. Your progress is saved on this device only.',
      whenToUse: [
        'When you are new to Docker and want a structured path from the basics.',
        'To look up what a docker command, flag, Dockerfile instruction or Compose property does.',
        'To practise safely in a sandbox instead of on your own containers.',
        'When you hit an error and want a step-by-step fix.',
      ],
      howItWorks: [
        'The Academy has its own tab bar under the page title: Dashboard, Courses, Paths, Reference, Troubleshooting, Labs, Visuals, Glossary and Search. All content is bundled with OpsDeck and works offline; searching sends nothing over the network.',
        'Progress (completed lessons, quiz scores, bookmarks, notes, achievements, study activity) is stored locally. You can erase it in Settings with Reset all progress.',
        'Other Docker pages link into the Academy with Learn buttons and banners, so you can open the lesson that explains what you are looking at.',
      ],
      parts: [
        {
          name: 'Dashboard tab',
          description: 'Your home inside the Academy.',
          items: [
            { name: 'Hero and buttons', description: 'A greeting, your totals (lessons complete, courses complete, quiz average, achievements) and buttons Start learning or Continue learning, Browse courses and Search everything.' },
            { name: 'Daily goal ring', description: 'A ring showing minutes studied today against your daily goal (set in Settings), plus your current and best streak and a seven-day streak row.' },
            { name: 'Continue learning card', description: 'The next unfinished lesson with its course, duration and course percentage.' },
            { name: 'Your courses', description: 'Up to eight courses with level, lessons done and a progress bar.' },
            { name: 'Recent lessons', description: 'Lessons you opened lately, so you can pick up where you stopped.' },
            { name: 'Study activity', description: 'A 26-week heat map of lessons completed, quizzes, views and lab activity.' },
            { name: 'Learning path card', description: 'The path you are working on, with stage dots and percent complete.' },
            { name: 'Bookmarks', description: 'Lessons you bookmarked.' },
            { name: 'Quiz readiness', description: 'Quizzes taken, passed (70% or more), perfect scores and your average.' },
            { name: 'Reference and labs card', description: 'Shortcuts to the CLI reference, guided labs, troubleshooting and diagrams.' },
            { name: 'Achievements strip', description: 'Medals you can unlock, for example for lesson counts, streaks, quizzes or labs. Unlocked medals are highlighted and a toast appears when you earn one.' },
          ],
        },
        {
          name: 'Courses tab',
          description: 'Title "Docker Academy" with course and lesson counts and an Ask AI about the Academy button.',
          items: [
            { name: 'Find a course box', description: 'Searches course titles and descriptions.' },
            { name: 'Level chips', description: 'All, Beginner, Intermediate, Advanced, Expert.' },
            { name: 'Course card', description: 'Icon, level badge, title, subtitle, number of lessons, duration, lessons done, a "Needs ..." warning when a recommended earlier course is unfinished, and a progress bar. Click to open the course.' },
            { name: 'Course page', description: 'Shows level, duration, lesson count, progress, a Start course or Continue button, an Ask AI button, a donut chart and an accordion of modules. Each lesson row shows a check when done, its summary, a percent badge if in progress, your quiz score, a target icon if it has a quiz, a flask icon if it has a lab, and its duration. Side cards list outcomes, course facts and what to take next. Prerequisites are recommended, never locked.' },
          ],
        },
        {
          name: 'Lesson page',
          description: 'Opens from a course. Breadcrumb at the top, then the lesson title, summary and badges (level, time, lesson number, Knowledge check, Guided lab, quiz score) and a progress band that reads Not started, In progress or Completed.',
          items: [
            { name: 'Lesson body', description: 'Text, code blocks with output, callouts (tip, info, warning, danger), tables, step lists, bullet lists and interactive diagrams. Command boxes can be copied or run when they are Docker commands.' },
            { name: 'Practice exercises', description: 'Cards with a task, a command, the expected result and a hint.' },
            { name: 'Guided lab block', description: 'If the lesson has a lab, an Open lab button starts it.' },
            { name: 'Knowledge check', description: 'A multiple-choice quiz. Choose answers, press Submit answers, and see which are correct with explanations. Passing score is shown (usually 70%). Try again resets it. Your best score is saved.' },
            { name: 'Your notes', description: 'A text area that saves automatically after you stop typing. Stored locally only.' },
            { name: 'Previous / Next', description: 'Move between lessons in the course.' },
            { name: 'Right rail', description: 'Objectives, Actions (Mark complete, Bookmark, Focus notes, Ask AI, Next lesson), Course progress, Commands in this lesson (links to the reference), Related lessons and Sources.' },
          ],
        },
        {
          name: 'Paths tab',
          description: 'Guided tracks that string several courses together in order. Each card shows title, description, stage dots, courses and lessons done, level, duration and a progress bar. A path page lists the stages as a timeline with Start path or Continue path, plus Outcomes, Prerequisites and Completion criteria. A path is complete when every lesson in all its courses is done; finishing any path unlocks the Path Finisher achievement.',
        },
        {
          name: 'Reference tab',
          description: 'A searchable command reference ("Every command, flag and property").',
          items: [
            { name: 'Search box', description: 'Searches names, summaries, descriptions and tags. Every word must match. Press / to focus it.' },
            { name: 'Type chips', description: 'Docker CLI, Compose CLI, Dockerfile and YAML properties, each with an entry count.' },
            { name: 'Index', description: 'Entries grouped in cards, each with a one-line summary.' },
            { name: 'Entry page', description: 'Syntax, Live flag discovery (flags read from your installed Docker with --help, when Docker is reachable), What it does, Examples with output and explanation, Advanced usage, Expected output, Common mistakes, Security notes, Related entries, a lesson link and Previous / Next. A left list shows the other entries of the same type and marks the ones you have viewed.' },
          ],
        },
        {
          name: 'Troubleshooting tab',
          description: 'Guides organised by symptom.',
          items: [
            { name: 'Search and category chips', description: 'Search a symptom, error text or cause, and filter by category.' },
            { name: 'Guide card', description: 'Title, category, severity badge (high or critical in red, medium amber, low cyan), summary, number of steps and lessons.' },
            { name: 'Guide page', description: 'Symptoms, Likely causes, Ordered fix with commands (Docker commands can be run), Commands used, and a side rail with Matched patterns, Explain the mechanism lessons, Primary sources and Related guides. Copy summary copies the title and summary.' },
            { name: 'Pattern tester', description: 'Paste an error or log line; OpsDeck finds the best matching guide. Nothing leaves your device.' },
          ],
        },
        {
          name: 'Labs tab',
          description: 'Hands-on exercises that run real Docker commands in a sandbox.',
          items: [
            { name: 'Sandbox consent box', description: 'You must press Enable sandbox once. Lab commands are validated and hardened: no privileged mode, no host networking, no host bind mounts, no Docker socket, and capped at 0.5 CPU, 256 MB memory and 128 processes. It also shows how many lab containers, networks and volumes exist, or Docker offline.' },
            { name: 'Lab cards', description: 'Standalone sandbox exercises and labs that belong to lessons. Each shows level, steps, duration, course and a progress bar.' },
            { name: 'Lab page', description: 'A lab list on the left, the brief with objectives and progress, numbered steps (with a Load command button, or an Edit file button for file steps), a Lab workspace editor with file tabs, Template and Save file buttons, sandbox facts, notes, and a lab terminal with a Run button. A step turns green when your command matches and, if needed, produces the expected output.' },
            { name: 'Reset Lab', description: 'Runs compose down for the lab, removes every container, network and volume labelled for that lab and deletes its files. It never touches your own resources. Lesson progress is kept.' },
          ],
        },
        {
          name: 'Visuals tab',
          description: 'Interactive diagrams of architecture, lifecycle, layers, networking, Compose, storage and the build pipeline. Click a node to read what it does and jump to the lesson. Edges show request or data flow, not cables.',
        },
        {
          name: 'Glossary tab',
          description: 'Definitions of Docker terms with a search box and A to Z chips. Matches are highlighted.',
        },
        {
          name: 'Search tab',
          description: 'One search across courses, lessons, commands, Dockerfile instructions, Compose properties, troubleshooting guides, learning paths, diagrams and glossary terms. Filter chips narrow by type, results are grouped by type and matches are highlighted. Popular topic chips (docker run, exit 137, BuildKit and others) fill the search for you.',
        },
      ],
      tables: [
        {
          name: 'Lesson row in a course',
          columns: [
            { name: 'Check circle', meaning: 'Filled when the lesson is complete.', example: 'checked' },
            { name: 'Title and summary', meaning: 'What the lesson covers.', example: 'Containers vs images' },
            { name: 'Progress badge', meaning: 'Percent shown while the lesson is in progress.', example: '5%' },
            { name: 'Quiz score', meaning: 'Your best result on its knowledge check.', example: '4/5' },
            { name: 'Icons and time', meaning: 'Target icon means a quiz, flask icon a lab; the last item is the duration.', example: '12 min' },
          ],
        },
      ],
      example: {
        title: 'Example: learn a topic and practise it',
        steps: [
          'Open Academy, then Courses, and choose Beginner. Open a course such as Docker fundamentals and press Start course.',
          'Read the lesson, open the diagram, and press Mark complete in the right rail when finished. Take the Knowledge check.',
          'If the lesson has a guided lab, press Open lab, press Enable sandbox, and load and run each step command.',
          'When a command is unclear, open Reference and search it, or use Search for the error text. Press Reset Lab at the end to remove the sandbox resources.',
        ],
      },
      tips: [
        'Prerequisites are suggestions only; you can open any lesson at any time.',
        'Lab commands run on your real Docker engine, but only in labelled, limited, sandboxed resources that Reset Lab removes.',
        'Notes, progress and consent for labs are stored locally; resetting progress in Settings deletes them.',
        'A badge next to Academy in the sidebar shows your overall progress.',
      ],
    },

    'app/settings': {
      title: 'Settings',
      summary: 'Application-wide options shared by all workspaces: the AI assistant connection, appearance, learning goal, a summary of the security model, and information about the app.',
      whenToUse: [
        'To connect the AI assistant to a provider or to a local AI command-line tool.',
        'To switch between dark, light or system theme, change the interface size, or reduce motion.',
        'To change your daily learning goal or reset Academy progress.',
        'To check the OpsDeck, Electron, Chromium and Node versions when asking for help.',
      ],
      howItWorks: [
        'Most options apply immediately when you change them and are saved on this device. The AI assistant card has its own Save settings button.',
        'Settings are the same for Docker, Kubernetes, Databases, Observability and Intelligence.',
        'The page is split in two columns. Left: AI assistant, Appearance, Learning, Security model. Right: Application, Workspaces, Keyboard, About the origin.',
      ],
      parts: [
        {
          name: 'Page header',
          description: 'Reload content re-reads the Academy content files and redraws the page; a toast says whether it worked. Ask AI opens the assistant for the Settings page.',
        },
        {
          name: 'AI assistant card',
          description: 'Connects OpsDeck to a language model so you can ask questions about live resources. A status badge shows Ready (green), Setup needed (amber), Disabled or Unavailable. The line under "OpsDeck AI" shows provider and model once configured. Nothing is sent to the model until you press Send in the assistant, and sensitive keys and environment values are left out rather than masked.',
          items: [
            { name: 'Open assistant', description: 'Opens the assistant panel.' },
            { name: 'Transport', description: 'How OpsDeck reaches a model: an OpenAI-compatible API, or a local command-line tool that is already installed on this machine (such as OpenCode or Claude Code). For a CLI, OpsDeck never stores an API key and shows the CLI status instead.' },
            { name: 'Provider preset', description: 'For the API transport: choose a known provider to fill Base URL and model, or Custom provider. A note below explains the preset.' },
            { name: 'Base URL', description: 'Address of the OpenAI-compatible chat endpoint, for example https://api.deepseek.com/v1.' },
            { name: 'Model', description: 'Model name, for example deepseek-chat. For a CLI transport it can be left empty to use the CLI default; suggestions appear after Detect models.' },
            { name: 'API key', description: 'Your key for the provider. A green "saved" badge shows when one is stored; leave the field empty to keep it. Keys stay in the main process and are stored in a file readable only by you (mode 0600). Local keyless providers may not need one.' },
            { name: 'Enable OpsDeck AI checkbox', description: 'Turns the assistant on or off everywhere, including the Ask AI buttons.' },
            { name: 'Save settings', description: 'Stores the choices. The result text next to the buttons says whether the assistant is ready or what is still missing.' },
            { name: 'Test connection', description: 'Checks that the provider or CLI answers with the values currently in the form, without saving.' },
            { name: 'Detect models', description: 'Only for CLI transports. Reads the available models from the CLI and offers them in the Model field.' },
            { name: 'Clear key', description: 'Appears when a key is saved. Removes it.' },
          ],
        },
        {
          name: 'Appearance card',
          description: 'Visual preferences. Dark is the default.',
          items: [
            { name: 'Theme', description: 'Dark, Light or System (follows your operating system).' },
            { name: 'Interface scale', description: 'Shows the current zoom, for example 100%. Smaller and Larger change it and Reset returns to 100%. You can also use Ctrl and +, Ctrl and -, Ctrl and 0, or hold Ctrl and scroll. The scale is remembered between launches.' },
            { name: 'Reduce motion', description: 'Turns off most animations.' },
            { name: 'Reduce transparency and blur', description: 'Makes panels solid, which can help on slow graphics or for readability.' },
            { name: 'Collapse the sidebar by default', description: 'Starts OpsDeck with the sidebar collapsed to icons. You can still toggle it with Ctrl+B.' },
          ],
        },
        {
          name: 'Learning card',
          description: 'Academy settings.',
          items: [
            { name: 'Lessons complete and Current streak', description: 'Your totals, for example 12 / 90 lessons and 3 days.' },
            { name: 'Daily goal', description: 'Minutes per day you want to study: 10, 15, 20, 30, 45 or 60. Used by the ring on the Academy dashboard.' },
            { name: 'Reset all progress', description: 'After a red confirmation deletes lesson progress, quiz scores, bookmarks, notes, achievements and activity. This cannot be undone. Progress is only stored on this device.' },
          ],
        },
        {
          name: 'Security model card',
          description: 'A checklist of what OpsDeck does and does not do: Docker runs with an argument list and no shell; commands are checked for privileged mode, host namespaces, device passthrough and socket mounts; registry passwords are never stored by OpsDeck; the app window is isolated (context isolation, sandbox, no Node integration, strict content policy). The final red x line is a warning: OpsDeck cannot protect you from a Docker daemon that is already root-equivalent, so treat access to Docker as admin access.',
        },
        {
          name: 'Application card',
          description: 'A read-only list: Product, Version, Electron, Chromium, Node, Platform / architecture, Host name and Academy Content version. Include these when reporting a problem.',
        },
        {
          name: 'Workspaces card',
          description: 'Lists each workspace (Docker, Kubernetes, Databases, Observability, Intelligence) with a green "active" badge, or a grey "planned" badge for any not yet available.',
        },
        {
          name: 'Keyboard card',
          description: 'Shortcuts: Ctrl+K opens the command palette, Ctrl+B toggles the sidebar, Ctrl+Shift+F opens Academy search, Esc closes an overlay, and / focuses the search box on pages that have one. Ctrl+Shift+A opens the AI assistant for the current page.',
        },
        {
          name: 'About the origin card',
          description: 'States that OpsDeck is an independent operations studio, that the Academy content is written for this app, and that Docker and the Docker logo are trademarks of Docker, Inc. with no affiliation. A Glossary button opens the Academy glossary.',
        },
      ],
      example: {
        title: 'Example: connect the AI assistant with an API key',
        steps: [
          'In the AI assistant card keep Transport as OpenAI-compatible API and pick a Provider preset; Base URL and Model fill in.',
          'Paste your API key into API key.',
          'Press Test connection. Wait for a green success message.',
          'Press Save settings. The badge changes to Ready. Now use any Ask AI button; nothing is sent until you press Send in the assistant.',
        ],
      },
      tips: [
        'Your API key is never shown again after saving; the field shows "Saved - leave blank to keep it".',
        'If you prefer not to send data anywhere, untick Enable OpsDeck AI.',
        'Switching the theme or scale is instant and does not need a save button.',
        'Reset all progress is permanent. There is no undo.',
      ],
    },
  });
})();
