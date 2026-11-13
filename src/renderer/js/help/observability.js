'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.help = OD.help || {};

  // Elements shared by every Observability page.
  const HEADER = {
    name: 'Page header',
    description: 'Every Observability page starts with a title, a one-line description and the same buttons on the right.',
    items: [
      { name: 'Refresh', description: 'Re-reads the page from the monitoring service and shows a "Refreshed" message. Pages that are not on the automatic 30-second refresh (logs, traces, alerts, settings and others) only update when you click this or change a filter.' },
      { name: 'Ask AI', description: 'Opens the AI assistant with the current Observability page as context, so you can ask questions about what you see. The assistant never runs a remediation by itself.' },
    ],
  };
  const RANGE = {
    name: 'Range selector',
    description: 'Drop-down in the header with Last 15 minutes, Last hour, Last 6 hours, Last 24 hours, Last 7 days and Last 30 days. It changes the time window of charts and trends. The choice is shared between the pages that show it (Overview, Docker, Kubernetes, Databases, Applications, Metrics explorer, Dashboards).',
  };
  const LIVE_NOTE = 'This page refreshes itself every 30 seconds while it is open and visible, and once more about 3 seconds after you open it so the first sample appears without a click.';
  const COLLECTOR_NOTE = {
    name: 'Collector banners',
    description: 'A blue or yellow banner at the top explains the state of the collector behind the page: "Waiting for the first sample" (the collector has not finished a run yet), "Collector disabled" (turn it on in Settings), "Source unavailable" (the source cannot be read in this environment) or "Partial result" (some parts failed, with the reasons listed).',
  };

  Object.assign(OD.help, {
    'observability/overview': {
      title: 'Health overview',
      summary: 'A single live picture of everything OpsDeck monitors: one health score, this machine\'s CPU, memory and disk, counts of hosts, services, containers, clusters, databases, alerts and incidents, and the things that need attention right now.',
      whenToUse: [
        'You start your day and want to know whether anything is wrong.',
        'An alert fired and you want to see which resources are affected.',
        'You want to check that all collectors are running and returning data.',
      ],
      howItWorks: [
        'Everything is measured by collectors that run inside OpsDeck on a schedule (every 10 seconds by default). Nothing on this page is simulated: when a source cannot be read, the value is shown as a dash or the card says it is unavailable.',
        'The health score is a weighted average of the components that have data: hosts, containers, clusters, databases and services. Components without data are left out and listed as "Missing". A score of 90 or more is Healthy, 70 to 89 is Degraded and below 70 is Critical.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        {
          name: 'Header buttons (Overview only)',
          description: 'Besides Refresh and Ask AI, this page has one extra button.',
          items: [{ name: 'Open dashboards', description: 'Jumps to the Dashboards page.' }],
        },
        { name: 'Partial coverage banner', description: 'Appears when some areas could not be measured, for example "Kubernetes not connected". It lists exactly what is missing so a good score is not mistaken for full coverage.' },
        {
          name: 'Health score card',
          description: 'A donut with the score from 0 to 100 and its label (Healthy, Degraded, Critical or Unknown). Under it is the formula that was used, for example "Weighted average over available components: Hosts 100.0x0.25 + Containers 80.0x0.2 ... / 0.65", and the list of missing components.',
        },
        {
          name: 'Stat cards',
          description: 'Six headline numbers.',
          items: [
            { name: 'CPU', description: 'Average CPU use across all cores of this machine, with the core count, the 1-minute load average and a small sparkline. Example: 34.2% - 8 cores - load 1.4.' },
            { name: 'Memory', description: 'Percentage of system memory in use, with total installed memory.' },
            { name: 'Disk pressure', description: 'Usage of the fullest mounted filesystem. Orange from 70%, red from 90%.' },
            { name: 'Hosts', description: 'Online hosts out of all hosts (this machine plus remote servers). "2 unreachable" means two remote servers did not answer their last check.' },
            { name: 'Services', description: 'Synthetic checks that are healthy out of the total, with the degraded and failed counts.' },
            { name: 'Active alerts', description: 'Alerts that are firing or pending, and how many of them are critical.' },
          ],
        },
        {
          name: 'Inventory tiles',
          description: 'Six small tiles that summarise the other pages: Docker (running/total containers), Kubernetes (ready/total nodes), Databases (measured/total connections), Applications (services reporting spans), Incidents (open incidents) and Agents (number of connected agents, or "Off" when the ingest receiver is stopped).',
        },
        {
          name: 'CPU trend and Memory trend',
          description: 'Two area charts for the selected range, scaled 0 to 100%. They stay empty until at least two collection ticks have happened.',
        },
        {
          name: 'Top consumers',
          description: 'The heaviest users of CPU right now across containers, processes and Kubernetes pods. Each row shows its kind, name, usage and a detail such as the image or namespace.',
        },
        {
          name: 'Needs attention',
          description: 'Failed synthetic checks, unhealthy containers and unreachable services, each with a red icon and a short reason. If it is empty, "No active problems" is shown.',
        },
        {
          name: 'Collectors card',
          description: 'One row per collector (local, network, docker, kubernetes, databases, synthetic, remote, logs, applications). Each collector runs on its own, so a failure in one does not stop the others.',
        },
        {
          name: 'Active alerts and Open incidents',
          description: 'Two lists at the bottom with the latest firing or pending alerts and the open incidents. "All alerts" and "All incidents" open the full pages.',
        },
      ],
      tables: [
        {
          name: 'Collectors table',
          description: 'Shows whether each data source is working.',
          columns: [
            { name: 'Collector', meaning: 'Display name and internal key of the collector.', example: 'Docker (docker)' },
            { name: 'State', meaning: 'Running when the last run succeeded, Unavailable when the source cannot be reached, Error when the run failed, Disabled when you turned it off in Settings.', example: 'Running' },
            { name: 'Metrics', meaning: 'How many data points the last run produced.', example: '142' },
            { name: 'Duration', meaning: 'How long the last run took.', example: '380 ms' },
            { name: 'Last run', meaning: 'Time since the last run, or "waiting" if it has not run yet.', example: '8 seconds ago' },
            { name: 'Detail', meaning: 'Reason or first error, shortened to 80 characters.', example: 'Docker engine not reachable' },
          ],
        },
        {
          name: 'Top consumers table',
          columns: [
            { name: 'Kind', meaning: 'Where the number comes from: container, process or pod.', example: 'container' },
            { name: 'Name', meaning: 'Name of the consumer.', example: 'api-1' },
            { name: 'Usage', meaning: 'Current CPU use.', example: '62.5%' },
            { name: 'Detail', meaning: 'Extra context such as the image.', example: 'nginx:1.27' },
          ],
        },
      ],
      example: {
        title: 'Example: find out why the score dropped to 74',
        steps: [
          'Open Health overview. The donut shows 74 and the label "Degraded".',
          'Read the formula under the label to see which component pulled the average down, for example Containers 60.',
          'Look at "Needs attention". It lists "api-1 - container - unhealthy".',
          'Click "All alerts" to see whether a rule already fired for it, or open the Docker page for the container details.',
        ],
      },
      tips: [
        'A missing component is not counted as healthy. A high score with several "Missing" entries only describes the parts that were measured.',
        'Empty charts right after start are normal. Wait for two collection ticks (about 20 seconds with the default interval).',
        'Turn collectors you do not use off in Settings so they do not show as errors.',
      ],
    },

    'observability/infrastructure': {
      title: 'Infrastructure',
      summary: 'Details of the machine OpsDeck runs on and a list of remote servers you connect over SSH, a Prometheus node exporter or an OpsDeck agent.',
      whenToUse: [
        'You want to see disks, network interfaces and the busiest processes of this machine.',
        'You want to add a server to monitor and check that it answers.',
      ],
      howItWorks: [
        'The "This machine" part comes from the local collector. The remote part comes from the remote collector, which polls each enabled server every 30 seconds by default.',
        'SSH passwords, private keys and exporter tokens are stored in the encrypted vault and never shown again after saving.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        COLLECTOR_NOTE,
        {
          name: 'This machine',
          description: 'A card with facts about the local host and four meters.',
          items: [
            { name: 'Add server', description: 'Opens the "Add remote server" form (also available in the Remote servers card).' },
            { name: 'Facts list', description: 'Hostname, operating system, kernel, architecture, CPU model, number of cores, uptime and when the data was measured.' },
            { name: 'Meters', description: 'CPU, Memory, Load 1m and Temperature. Temperature shows a dash when the sensor cannot be read.' },
          ],
        },
        { name: 'Filesystems card', description: 'One row per mounted filesystem with a usage bar. See the table below.' },
        { name: 'Interfaces card', description: 'Network interfaces with their address and live receive and send rates, computed from real counters.' },
        {
          name: 'Remote servers card',
          description: 'The servers you added. With none, an empty state offers "Add your first server".',
          items: [
            { name: 'Add server', description: 'Opens the form. Fields: name, collection method (SSH, Prometheus node exporter or OpsDeck agent), host and port, exporter URL, SSH username, operating system (Linux or Windows), group, environment, tags, agent id, timeout, password, private key, passphrase, exporter bearer token, note, "Collect this server" and "Verify TLS certificates".' },
            { name: 'Test (row)', description: 'Contacts the server right now and reports "Server responded" with the response time, or "Server did not respond" with the error.' },
            { name: 'Edit (row)', description: 'Opens the same form filled with the current values.' },
            { name: 'Delete (row)', description: 'After confirmation, stops monitoring the server and removes its stored credentials.' },
          ],
        },
        { name: 'Processes card', description: 'The 20 processes using the most CPU on this machine, with PID, name, user, CPU and memory.' },
      ],
      tables: [
        {
          name: 'Filesystems table',
          columns: [
            { name: 'Mount', meaning: 'Where the filesystem is mounted.', example: '/' },
            { name: 'Filesystem', meaning: 'Type of filesystem.', example: 'ext4' },
            { name: 'Used / Total', meaning: 'Space used and total size.', example: '180 GB / 500 GB' },
            { name: 'Usage', meaning: 'Bar and percentage of the space used.', example: '36%' },
          ],
        },
        {
          name: 'Remote servers table',
          columns: [
            { name: 'Server', meaning: 'Name and host or URL.', example: 'db-1 / 10.0.0.12' },
            { name: 'Method', meaning: 'How it is measured: ssh, prometheus or agent.', example: 'ssh' },
            { name: 'State', meaning: 'Online or Offline from the last check, or "Not sampled" if it has not been checked yet.', example: 'Online' },
            { name: 'CPU / Memory', meaning: 'Last measured usage, shown only while the server is online.', example: '23.0% / 61.4%' },
            { name: 'Checked', meaning: 'Time since the last check.', example: '12 seconds ago' },
          ],
        },
      ],
      example: {
        title: 'Example: monitor a Linux server over SSH',
        steps: [
          'Click "Add server".',
          'Enter a name such as db-1, keep the method on SSH, and fill in the host (10.0.0.12), port 22 and an SSH username.',
          'Paste a private key or enter a password. Leave "Collect this server" ticked and click "Add server".',
          'Click "Test" on the new row. A "Server responded" message with a time in milliseconds means it works.',
          'After the next poll the row shows Online with CPU and memory values.',
        ],
      },
      tips: [
        'Use a dedicated read-only account for SSH monitoring.',
        'Prometheus node exporter servers need the full metrics URL, for example http://10.0.0.12:9100/metrics.',
        'Untick "Verify TLS certificates" only for exporters with self-signed certificates you trust.',
      ],
    },

    'observability/docker': {
      title: 'Docker',
      summary: 'Container, Compose project, storage, network and volume measurements read from the Docker engine.',
      whenToUse: [
        'You want to know which containers are running, restarting or unhealthy and what they use.',
        'You are looking for the container that eats CPU or memory.',
      ],
      howItWorks: [
        'Data comes from the Docker collector, which asks the engine on this machine for stats. Container memory is the working set, and "of limit" appears only when the container has a memory limit.',
        'If Docker is not reachable, the page says so and shows no numbers at all.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        {
          name: 'Stat cards',
          description: 'Four totals for the engine.',
          items: [
            { name: 'Containers', description: 'Running out of total, with stopped and restarting counts.' },
            { name: 'Unhealthy', description: 'Containers whose health check reports unhealthy, and the total restart count. Red when above zero.' },
            { name: 'Container CPU', description: 'Sum of the CPU use of running containers.' },
            { name: 'Container memory', description: 'Sum of the working-set memory of running containers.' },
          ],
        },
        { name: 'Containers card', description: 'Every container with its measurements. See the table below.' },
        { name: 'Compose projects card', description: 'Containers grouped by Compose project: running/total, CPU, memory, a green "healthy" or red "N unhealthy" badge and the project directory.' },
        { name: 'Storage card', description: 'The engine disk usage report by type (images, containers, volumes, build cache): item count, active items, size and how much is reclaimable.' },
        { name: 'Engine card', description: 'Docker version, operating system, architecture and when it was measured.' },
        { name: 'Networks and Volumes cards', description: 'Networks list name, driver, attached containers and scope. Volumes list name, driver and mount point. Volume size shows "usage unavailable" because Docker reports metadata, not bytes.' },
      ],
      tables: [
        {
          name: 'Containers table',
          columns: [
            { name: 'Container', meaning: 'Name and short id.', example: 'api-1 / 3f2a9c1b7d4e' },
            { name: 'Image', meaning: 'Image the container runs (shortened to 40 characters).', example: 'nginx:1.27' },
            { name: 'State', meaning: 'running, exited, restarting and so on. A red "unhealthy" badge is added when the health check fails.', example: 'running' },
            { name: 'CPU', meaning: 'Current CPU use of the container.', example: '4.2%' },
            { name: 'Memory', meaning: 'Working-set memory and, if a limit is set, the percentage of that limit.', example: '210 MB, 41% of limit' },
            { name: 'Net in / out', meaning: 'Total bytes received and sent.', example: '1.2 GB / 340 MB' },
            { name: 'Restarts', meaning: 'How many times Docker restarted the container. A growing number means a crash loop.', example: '7' },
          ],
        },
      ],
      example: {
        title: 'Example: spot a crash-looping container',
        steps: [
          'Open Docker and look at the Containers card. The Restarting count is 1 and Unhealthy is 1.',
          'In the table, find the row with a high Restarts number, for example worker-1 with 14.',
          'Open Alerts to check that the "Docker container unhealthy" rule fired, or open the Docker workspace to read the container logs.',
        ],
      },
      tips: [
        'Start Docker and click Refresh when you see "Docker metrics are unavailable".',
        'To act on a container (restart, stop), use the Docker pages in the sidebar. This page only measures.',
      ],
    },

    'observability/kubernetes': {
      title: 'Kubernetes',
      summary: 'Nodes, pods, workloads and warning events of the cluster selected in the Kubernetes workspace.',
      whenToUse: [
        'You want to know whether all nodes are Ready and pods are running.',
        'You are looking for crash loops, OOM kills or recent cluster warnings.',
      ],
      howItWorks: [
        'Data comes from the Kubernetes collector, which reads the cluster through the context selected in the Kubernetes workspace (every 30 seconds by default).',
        'CPU and memory per pod and node need a metrics-server in the cluster. Without it a banner says so and those cells stay blank instead of being estimated.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        { name: 'No cluster connected state', description: 'If no context is selected the page shows "No cluster is connected" instead of any data. Select a context in the Kubernetes workspace.' },
        {
          name: 'Stat cards',
          description: 'Four headline numbers.',
          items: [
            { name: 'Nodes ready', description: 'Ready nodes out of total, and whether usage metrics are available.' },
            { name: 'Pods', description: 'Running pods out of total, with the pending and failed counts.' },
            { name: 'Crash loops', description: 'Pods stuck restarting (CrashLoopBackOff). Red when above zero.' },
            { name: 'Warning events', description: 'Number of recent cluster-wide warning events. Orange when above zero.' },
          ],
        },
        { name: 'Nodes card', description: 'Each node with Ready or Not ready, internal IP, CPU capacity in millicores, memory capacity and a Pressure badge ("pressure" in red when the node reports disk, memory or PID pressure).' },
        {
          name: 'Pods card',
          description: 'Each pod with namespace, phase, node, restarts, CPU, memory and an Issue column.',
          items: [{ name: 'Open Kubernetes', description: 'Link to the Kubernetes workspace Pods page where you can act on pods.' }],
        },
        { name: 'Workloads card', description: 'Deployments, StatefulSets and DaemonSets with ready/desired replica counts and a health badge.' },
        { name: 'Warning events card', description: 'The latest warnings (up to 50) with object, reason, namespace, a shortened message and how long ago.' },
      ],
      tables: [
        {
          name: 'Pods table',
          columns: [
            { name: 'Pod', meaning: 'Pod name and namespace.', example: 'api-7d9f6 / prod' },
            { name: 'Phase', meaning: 'Running is green, Failed is red, anything else (Pending, Unknown) is orange.', example: 'Running' },
            { name: 'Node', meaning: 'Node the pod runs on.', example: 'worker-2' },
            { name: 'Restarts', meaning: 'Container restart count.', example: '12' },
            { name: 'CPU / Memory', meaning: 'Measured usage in millicores and bytes (needs metrics-server).', example: '120m / 256 MB' },
            { name: 'Issue', meaning: 'CrashLoopBackOff or OOMKilled badge when detected, otherwise a dash.', example: 'OOMKilled' },
          ],
        },
        {
          name: 'Workloads table',
          columns: [
            { name: 'Ready', meaning: 'Ready replicas out of desired replicas.', example: '2/3' },
            { name: 'Health', meaning: 'Ready when the workload is healthy, otherwise its status such as Degraded.', example: 'Degraded' },
          ],
        },
      ],
      example: {
        title: 'Example: a pod keeps restarting',
        steps: [
          'The "Crash loops" card shows 1 in red.',
          'In the Pods card find the row with the CrashLoopBackOff badge and a high Restarts count.',
          'Read the Warning events card for the same object, for example "BackOff: restarting failed container".',
          'Click "Open Kubernetes" to read the pod logs.',
        ],
      },
      tips: [
        'CPU and memory columns stay empty when metrics-server is not installed. That is expected.',
        'This page is for monitoring. Restarts and scaling are done in the Kubernetes workspace.',
      ],
    },

    'observability/databases': {
      title: 'Databases',
      summary: 'Connection counts, cache hit ratio, throughput and size for the database connections you already created in the Databases workspace.',
      whenToUse: [
        'You want to see at a glance which databases are reachable and how busy they are.',
        'You want an alert if a database goes down.',
      ],
      howItWorks: [
        'The database collector reads engine metrics through the existing database sessions every 30 seconds by default. It measures connected profiles, and also saved profiles when "Auto-connect saved database profiles" is on in Settings.',
        'Which metrics exist depends on the engine, so some cells can be a dash.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        { name: 'Empty state', description: 'With no monitored connection, the page explains that you must create or connect a database first and offers an "Open Databases" button.' },
        {
          name: 'Stat cards',
          description: 'Two cards.',
          items: [
            { name: 'Monitored', description: 'Profiles with measured metrics out of all profiles considered.' },
            { name: 'Unreachable', description: 'Profiles whose connection attempt failed. Red when above zero.' },
          ],
        },
        {
          name: 'Connection metrics card',
          description: 'One row per database connection. The "Open Databases" button leads to the Databases workspace.',
        },
        { name: 'Auto-connect banner', description: 'Shown when auto-connect is on: the collector opens sessions for saved profiles that are not connected.' },
      ],
      tables: [
        {
          name: 'Connection metrics table',
          columns: [
            { name: 'Database', meaning: 'Profile name and database name.', example: 'orders-prod / orders' },
            { name: 'Engine', meaning: 'Database engine.', example: 'PostgreSQL' },
            { name: 'State', meaning: 'Measured (metrics were read), Idle (not connected, no reading) or Unreachable (connection failed).', example: 'Measured' },
            { name: 'Connections', meaning: 'Active connections, with the maximum the server allows.', example: '18 of 100' },
            { name: 'Cache hit', meaning: 'Share of reads served from memory. Higher is better; on PostgreSQL below about 95% often means too little memory.', example: '99.2%' },
            { name: 'Ops/s', meaning: 'Operations or queries per second.', example: '420' },
            { name: 'Size', meaning: 'Database size on disk.', example: '12.4 GB' },
            { name: 'Detail', meaning: 'The error message when something failed.', example: 'connection refused' },
          ],
        },
      ],
      example: {
        title: 'Example: get alerted when a database is down',
        steps: [
          'Connect the database in the Databases workspace.',
          'Open this page and check that its State is Measured.',
          'Open Alerts. The built-in rule "Database unavailable" fires when database.up stays below 1 for 60 seconds.',
          'Add a notification channel so the alert reaches you.',
        ],
      },
      tips: [
        'Idle does not mean broken. It only means no session is open. Connect the profile or enable auto-connect.',
        'Auto-connect opens sessions with saved credentials, so enable it only for databases you want monitored.',
      ],
    },

    'observability/applications': {
      title: 'Applications',
      summary: 'Request rate, error rate and latency of your own services, calculated from OpenTelemetry spans that instrumented applications send to the OpsDeck ingest receiver.',
      whenToUse: [
        'You want to know which service is slow or failing.',
        'You want p95 and p99 latency per service without a separate APM product.',
      ],
      howItWorks: [
        'Services appear only after spans arrive. Enable the ingest receiver in Settings, then export OTLP/HTTP JSON traces from your application. Nothing is simulated.',
        'Statistics are computed from the spans of the analysis window (about the last hour). A service is Degraded when its error rate is above 5%.',
        LIVE_NOTE,
      ],
      parts: [
        HEADER,
        RANGE,
        COLLECTOR_NOTE,
        {
          name: 'Empty state and instrumentation guide',
          description: 'With no spans the page says "No application spans received" and, when the receiver is enabled, shows an "Instrument an application" card with the OTLP endpoint, the traces exporter URL and the protocol, ready to copy into your OpenTelemetry settings.',
        },
        {
          name: 'Stat cards',
          description: 'Three totals.',
          items: [
            { name: 'Services', description: 'Services that reported spans in the last hour.' },
            { name: 'Spans', description: 'Total spans in the analysis window.' },
            { name: 'Degraded', description: 'Services with an error rate above 5%.' },
          ],
        },
        { name: 'Services card', description: 'One row per service. Under the name, up to three downstream dependencies are listed (for example a database or another service it calls).' },
        { name: 'Instrumented operations card', description: 'Tags such as "checkout - POST /orders - 184 ms" showing the top operations per service with their p95 latency.' },
      ],
      tables: [
        {
          name: 'Services table',
          columns: [
            { name: 'Service', meaning: 'Service name taken from the span resource, plus its dependencies.', example: 'checkout / postgres, redis' },
            { name: 'Health', meaning: 'Healthy, or Degraded when more than 5% of requests failed.', example: 'Degraded' },
            { name: 'Req/min', meaning: 'Requests per minute.', example: '240' },
            { name: 'Errors', meaning: 'Share of spans that ended in error.', example: '7.50%' },
            { name: 'p50', meaning: 'Median latency: half of the requests were faster than this.', example: '42 ms' },
            { name: 'p95', meaning: '95 out of 100 requests were faster than this. It shows what slower users experience.', example: '310 ms' },
            { name: 'p99', meaning: '99 out of 100 requests were faster. It exposes the worst cases.', example: '1,240 ms' },
            { name: 'Last seen', meaning: 'When the service last sent a span.', example: '5 seconds ago' },
          ],
        },
      ],
      example: {
        title: 'Example: read a slow service',
        steps: [
          'The row "checkout" shows p50 42 ms, p95 310 ms, p99 1,240 ms and Errors 7.50%.',
          'The median is fast, but 1 request in 100 takes over a second, and 7.5% fail, so the service is Degraded.',
          'Open Traces, tick "Errors only" and pick checkout to see the failing requests.',
        ],
      },
      tips: [
        'Only OTLP over HTTP with JSON is supported. Protobuf payloads are rejected with HTTP 415.',
        'No services after enabling the receiver usually means the application has not exported traces yet or points at the wrong URL or port.',
      ],
    },

    'observability/synthetic': {
      title: 'Synthetic checks',
      summary: 'Active probes that test your websites, ports, DNS names and TLS certificates from this machine on a schedule and record whether they are up and how fast they answer.',
      whenToUse: [
        'You want to know when a website or API stops answering.',
        'You want a warning before a TLS certificate expires.',
      ],
      howItWorks: [
        'Each enabled check runs from OpsDeck itself (default every 60 seconds per check). Every result is a real probe: HTTP request, TCP connection, DNS lookup or TLS handshake.',
        'Results are stored as metrics (synthetic.up, synthetic.response.ms, synthetic.certificate.days), which the built-in alert rules and the Intelligence page use.',
      ],
      parts: [
        HEADER,
        COLLECTOR_NOTE,
        {
          name: 'Stat cards',
          description: 'Targets (total, with the number of disabled ones), Up (passing checks) and Down (failing checks, red when above zero).',
        },
        {
          name: 'Checks card',
          description: 'All your targets in a table.',
          items: [
            { name: 'Add target', description: 'Opens the form. Fields: name; check type (HTTP(S), TCP port, DNS record, TLS certificate); URL; host; port; HTTP method; expected status codes (for example 200,204); DNS record type (A, AAAA, CNAME, MX, TXT); "Response must contain" text; an auth header name and value; interval (10 to 3600 s); timeout; group; environment; tags; note; "Run this check"; "Verify TLS certificates".' },
            { name: 'Test (row)', description: 'Runs the check once now and shows the response time and status code.' },
            { name: 'Edit (row)', description: 'Changes the check settings.' },
            { name: 'Delete (row)', description: 'After confirmation, removes the check and its stored auth header.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Checks table',
          columns: [
            { name: 'Target', meaning: 'Name and the URL or host:port.', example: 'Checkout API / https://api.example.com/health' },
            { name: 'Kind', meaning: 'http, tcp, dns or tls.', example: 'http' },
            { name: 'State', meaning: 'Up (green) when the check passed, Down (red) when it failed, or "skipped" when it is disabled.', example: 'Up' },
            { name: 'Latency', meaning: 'How long the probe took.', example: '128 ms' },
            { name: 'Status', meaning: 'HTTP status code returned.', example: '200' },
            { name: 'Certificate', meaning: 'Days until the TLS certificate expires.', example: '23 d' },
            { name: 'Detail', meaning: 'Error text for a failed check.', example: 'Expected status 200, got 503' },
          ],
        },
      ],
      example: {
        title: 'Example: monitor a health endpoint and get notified',
        steps: [
          'Click "Add target", name it "Checkout API", keep HTTP(S), enter https://api.example.com/health and expected status 200.',
          'Save, then click "Test" on the row. You should see "Target responded" with a time in milliseconds.',
          'If the endpoint fails for 2 minutes, the built-in rule "Website or API unavailable" fires. Make sure you have a channel on the Notifications page.',
        ],
      },
      tips: [
        'The built-in rule "TLS certificate expiring" warns when a certificate has fewer than 14 days left.',
        'Probes start from this computer, so they show what this computer sees, not what users in other networks see.',
        'Use "Response must contain" to catch pages that return 200 but show an error text.',
      ],
    },

    'observability/network': {
      title: 'Network',
      summary: 'Reachability checks (ping, TCP, DNS) with latency and packet loss, plus an inventory of SNMP devices such as switches and routers.',
      whenToUse: [
        'You want to know whether your gateway, DNS server or another host is reachable and how fast.',
        'You want uptime and interface counts of a switch or router.',
      ],
      howItWorks: [
        'Checks run from this machine (every 60 seconds by default). Latency and loss come from real probes. SNMP uses version 2c; the community string is stored in the encrypted vault.',
      ],
      parts: [
        HEADER,
        COLLECTOR_NOTE,
        { name: '"Measured, not estimated" banner', description: 'A reminder that values come from active probes and real interface counters.' },
        {
          name: 'Reachability checks card',
          description: 'ICMP, TCP and DNS probes.',
          items: [
            { name: 'Add check', description: 'Opens a form: name, kind (ping, tcp or dns), host, port (for TCP), probe count (1 to 10), timeout and enabled.' },
            { name: 'Delete (row)', description: 'After confirmation, stops probing that host.' },
          ],
        },
        {
          name: 'SNMP devices card',
          description: 'Network devices read over SNMP v2c.',
          items: [
            { name: 'Add device', description: 'Opens a form: name, host, port, community (hidden), timeout and enabled.' },
            { name: 'Delete (row)', description: 'After confirmation, removes the device and its community string.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Reachability checks table',
          columns: [
            { name: 'Check', meaning: 'Name and host.', example: 'Gateway / 192.168.1.1' },
            { name: 'Kind', meaning: 'ping, tcp or dns.', example: 'ping' },
            { name: 'State', meaning: 'Reachable (green) or Failed (red).', example: 'Reachable' },
            { name: 'Latency', meaning: 'Average response time.', example: '2 ms' },
            { name: 'Loss', meaning: 'Share of probes that got no answer. Anything above 0% on a wired link deserves a look.', example: '0.0%' },
            { name: 'Detail', meaning: 'Error text.', example: 'timeout' },
          ],
        },
        {
          name: 'SNMP devices table',
          columns: [
            { name: 'Device', meaning: 'Name and host.', example: 'core-switch-1 / 10.0.0.2' },
            { name: 'Uptime', meaning: 'Time since the device last restarted.', example: '34.5h' },
            { name: 'Interfaces', meaning: 'Number of interfaces the device reports.', example: '48' },
            { name: 'Detail', meaning: 'Error text, for example a wrong community.', example: 'timeout' },
          ],
        },
      ],
      example: {
        title: 'Example: watch your internet connection',
        steps: [
          'Click "Add check" in Reachability checks.',
          'Name it "Cloudflare DNS", choose kind ping, host 1.1.1.1, probe count 4 and save.',
          'After a minute the row shows Reachable, a latency such as 14 ms and Loss 0.0%.',
        ],
      },
      tips: [
        'Only SNMP v2c is supported. The community string is a shared password, so use a read-only community.',
        'The Docker and Kubernetes network details are on their own pages. This page is about the local network.',
      ],
    },

    'observability/logs': {
      title: 'Logs',
      summary: 'A searchable store of log lines collected from this machine, containers, Kubernetes pods and remote servers, plus lines pushed by agents.',
      whenToUse: [
        'You want to search messages across several sources at once.',
        'You want to export recent errors to a CSV file.',
      ],
      howItWorks: [
        'Logs are not streamed live. You pull lines into the store with "Collect now", or agents and OTLP exporters push them to the ingest receiver. The store is a compressed local file kept with owner-only permissions.',
        'Old lines are removed after the retention time (7 days by default) or when the maximum record count is reached (20,000 by default). Both are changed in Settings.',
        'The table shows up to 300 matching lines. This page does not refresh itself; use Refresh or Apply filters.',
      ],
      parts: [
        HEADER,
        {
          name: 'Stat cards',
          description: 'Stored lines (with retention days), Errors (count of ERROR and FATAL lines), Sources (how many different sources exist) and Store size (file size, or "in memory").',
        },
        {
          name: 'Search logs card - filters',
          description: 'The first toolbar filters what is shown.',
          items: [
            { name: 'Search', description: 'Text to find in the message, service or trace id.' },
            { name: 'Level', description: 'All levels, TRACE, DEBUG, INFO, WARN, ERROR or FATAL. Changing it reloads immediately.' },
            { name: 'Source', description: 'All sources, or one of the sources that exist in the store (for example local, docker, kubernetes, remote). Changing it reloads immediately.' },
            { name: 'Apply filters', description: 'Runs the search with the typed text.' },
            { name: 'Clear stored logs', description: 'After confirmation, deletes every stored log line. This cannot be undone.' },
            { name: 'Export CSV', description: 'Saves the lines that match the current search, level and source to a CSV file you choose.' },
          ],
        },
        {
          name: 'Search logs card - Collect',
          description: 'The second toolbar pulls new lines into the store.',
          items: [
            { name: 'Collect from', description: 'Local host (journalctl or a log file), Docker container, Kubernetes pod or Remote server.' },
            { name: 'Container, pod or server id', description: 'Optional for local. For Docker enter the container id or name, for Kubernetes enter namespace/pod (for example prod/api-7d9f6; without a slash, the default namespace is used), for a remote server enter its server id.' },
            { name: 'Collect now', description: 'Reads recent lines from that source. A "Collection result" banner then says how many lines were added.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Log lines table',
          columns: [
            { name: 'Time', meaning: 'When the line was logged.', example: '13 Nov 2026, 09:41:12' },
            { name: 'Level', meaning: 'Severity. ERROR and FATAL are red, WARN is orange, the rest are grey.', example: 'ERROR' },
            { name: 'Source', meaning: 'Where the line came from.', example: 'docker' },
            { name: 'Service', meaning: 'Service, container or pod name.', example: 'api-1' },
            { name: 'Message', meaning: 'The log text, shortened to 260 characters.', example: 'connect ECONNREFUSED 10.0.0.5:5432' },
          ],
        },
      ],
      example: {
        title: 'Example: find why the API container failed',
        steps: [
          'Set "Collect from" to Docker container, type the container name (api-1) and click "Collect now".',
          'The banner says for example "250 lines added from docker".',
          'Set Level to ERROR and Source to docker, or type "ECONNREFUSED" in Search and click "Apply filters".',
          'Click "Export CSV" to hand the matching lines to a colleague.',
        ],
      },
      tips: [
        'Collecting again may add lines you already have; use time and level filters to focus.',
        'Logs may contain secrets printed by applications. Treat exported files carefully.',
        'An empty table after collecting usually means the source had no recent output or the id was wrong; read the banner text.',
      ],
    },

    'observability/traces': {
      title: 'Traces',
      summary: 'Distributed traces received from instrumented applications over OTLP/HTTP JSON. A trace is the full path of one request across services, made of spans.',
      whenToUse: [
        'A request is slow or failing and you want to see which step took the time.',
        'You want to see which services take part in a request.',
      ],
      howItWorks: [
        'Traces do not exist until an application exports them to the ingest receiver (enable it in Settings; the endpoint is shown on Agents & ingest). Only JSON is accepted; protobuf is rejected with HTTP 415.',
        'Spans are stored locally for the retention time (7 days by default) up to the span limit. This page does not refresh itself; use Refresh or Apply.',
      ],
      parts: [
        HEADER,
        { name: 'Stat cards', description: 'Stored spans (with retention days), Services (seen in received traces) and Traces in range (matching the current filter).' },
        {
          name: 'Filters card',
          description: 'Choose which traces to list.',
          items: [
            { name: 'Service', description: 'All services or one service, with its span count. Changing it reloads.' },
            { name: 'Errors only', description: 'Show only traces that contain at least one failed span. Changing it reloads.' },
            { name: 'Apply', description: 'Re-runs the query with the current filters.' },
            { name: 'Clear stored traces', description: 'After confirmation, deletes all stored spans. This cannot be undone.' },
            { name: 'Ingest guide', description: 'Opens Agents & ingest, where the receiver address and agent tokens are shown.' },
          ],
        },
        { name: 'Traces card', description: 'The list of traces (up to 100). Click a trace id to open its detail.' },
        {
          name: 'Trace detail card',
          description: 'Appears below the list after you click a trace id. Close it with "Close".',
          items: [
            { name: 'Summary', description: 'Start time, total duration, number of spans, number of errors and the services involved.' },
            { name: 'Waterfall', description: 'One row per span, indented by depth (a child call is indented under its parent). The bar shows when the span started inside the trace and how long it lasted, and turns red when the span failed. The duration is written next to the bar.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Traces table',
          columns: [
            { name: 'Trace', meaning: 'Trace id (shortened). Click it to open the detail.', example: '4bf92f3577b34da6...' },
            { name: 'Root span', meaning: 'The first operation of the request and its service.', example: 'POST /orders / checkout' },
            { name: 'Services', meaning: 'All services that took part.', example: 'checkout, payments, postgres' },
            { name: 'Duration', meaning: 'Total time of the trace.', example: '842 ms' },
            { name: 'Spans', meaning: 'Number of spans in the trace.', example: '17' },
            { name: 'Status', meaning: 'A green "ok" or a red badge with the error count.', example: '2 errors' },
            { name: 'When', meaning: 'How long ago it was recorded.', example: '3 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'Example: find the slow step of an order request',
        steps: [
          'Pick the service "checkout" in Service and click "Apply".',
          'Look for a trace with a long Duration, for example 842 ms, and click its id.',
          'In the waterfall, find the longest bar. For example "SELECT orders" takes 700 ms of the 842 ms, so the database query is the bottleneck.',
          'Open Applications to see whether the p95 of that service is also high.',
        ],
      },
      tips: [
        'If a request passes through a service without instrumentation, its work is not visible, so the gap shows as parent time without children.',
        'Traces may contain URLs and attribute values from your applications; clear the store before sharing the machine.',
      ],
    },

    'observability/alerts': {
      title: 'Alerts',
      summary: 'Alert rules check a metric against a threshold, alerts are what a rule produces when the threshold is crossed, and silences mute notifications for a while.',
      whenToUse: [
        'You want to see what is wrong right now and acknowledge or resolve it.',
        'You want to be told when CPU, disk, a container, a database or a website has a problem.',
        'You are doing maintenance and want to mute notifications.',
      ],
      howItWorks: [
        'Rules are evaluated every few seconds against the local metric store. When a rule\'s condition becomes true, the alert is Pending. If the condition lasts for the "Pending for" time, the alert becomes Firing, notifications are sent to your channels, and (if the rule says so) an incident is opened or updated. When the condition ends for the "Recovery for" time, the alert is Resolved.',
        'OpsDeck ships with built-in rules: CPU usage high, Memory usage high and Disk usage high (above 90% for 5 minutes), Docker container unhealthy, Kubernetes pod crash loop, Kubernetes node not ready, Database unavailable, Website or API unavailable and TLS certificate expiring (less than 14 days).',
        'This page does not refresh itself; use Refresh.',
      ],
      parts: [
        HEADER,
        { name: 'Stat cards', description: 'Active (firing or pending, with the number of critical ones), Rules (total and enabled) and Silences (active mutes).' },
        {
          name: 'Alerts card',
          description: 'Firing, pending and recently resolved alerts. "New rule" is repeated here for convenience.',
          items: [
            { name: 'Acknowledge (row)', description: 'Records that you have seen the alert. The alert stays active until it recovers or you resolve it.' },
            { name: 'Resolve (row)', description: 'Closes the alert by hand. Only shown while the alert is not resolved.' },
          ],
        },
        {
          name: 'Rules card',
          description: 'All alert rules.',
          items: [
            { name: 'New rule', description: 'Opens the rule form. Fields: name; severity (info, warning, critical); metric (for example system.cpu.usage); source filter; resource filter; aggregation (avg, max, min, sum, last, count, median, p90, p95, p99); operator (>, >=, <, <=, ==, !=); threshold; unit; pending-for seconds; lookback seconds; evaluate-every seconds; recovery threshold; recovery-for seconds; missing data (skip evaluation or fire the alert); label matcher such as host=db-1,mount=/data; incident group key; description; "Enable this rule"; "Open an incident when firing".' },
            { name: 'Edit (row)', description: 'Change a rule, including the built-in ones.' },
            { name: 'Delete (row)', description: 'After confirmation, deletes the rule. Alerts it already raised stay in the history.' },
          ],
        },
        {
          name: 'Silences card',
          description: 'Active mutes.',
          items: [
            { name: 'Create silence', description: 'Opens a form with a rule id (leave blank for all rules), a reason (required) and an "Until" date and time (default one hour from now). Alerts still evaluate and are recorded, but notifications are suppressed.' },
            { name: 'Remove (row)', description: 'Ends the silence immediately.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Alerts table',
          columns: [
            { name: 'Alert', meaning: 'Rule name and a short summary of what was observed.', example: 'CPU usage high - system.cpu.usage > 90.0% (observed 94.3)' },
            { name: 'Severity', meaning: 'critical (red), warning (orange) or info (blue).', example: 'warning' },
            { name: 'State', meaning: 'pending (condition true but not long enough yet), firing (confirmed problem), resolved (recovered).', example: 'firing' },
            { name: 'Resource', meaning: 'What the alert is about.', example: 'docker:api' },
            { name: 'Value', meaning: 'Last observed value and the rule threshold.', example: '94.3%, threshold 90.0%' },
            { name: 'Started', meaning: 'When the alert began.', example: '12 minutes ago' },
          ],
        },
        {
          name: 'Rules table',
          columns: [
            { name: 'Rule', meaning: 'Name and the condition in short form.', example: 'system.cpu.usage avg > 90 percent' },
            { name: 'Severity', meaning: 'How serious a firing alert is.', example: 'warning' },
            { name: 'Enabled', meaning: 'Whether the rule is evaluated.', example: 'enabled' },
            { name: 'Lookback', meaning: 'How far back in time samples are taken for the aggregation.', example: '300s lookback' },
            { name: 'For', meaning: 'How long the condition must hold before the alert fires.', example: '300s for' },
          ],
        },
      ],
      example: {
        title: 'Example: alert when a container turns unhealthy',
        steps: [
          'Check the Rules card. The built-in "Docker container unhealthy" rule already exists: docker.containers.unhealthy max > 0 for 60 seconds, severity critical.',
          'If you want a different threshold, click Edit and change the values, or click "New rule" to create your own.',
          'Open Notifications and add a channel, then use "Send test" to confirm it works.',
          'When a container stays unhealthy for 60 seconds the alert moves from pending to firing, you receive a message and an incident is opened.',
        ],
      },
      tips: [
        'Use "Pending for" to avoid noise from short spikes: a 5 minute pending time ignores a CPU spike of 30 seconds.',
        'Silences do not stop alerts from being recorded. They only mute notifications.',
        'If metrics are missing, the default "Skip evaluation" does nothing. Choose "Fire the alert" only if silence itself is a problem (for example a heartbeat).',
        'Acknowledging does not fix anything. It tells your team someone is on it.',
      ],
    },

    'observability/deployments': {
      title: 'Deployments',
      summary: 'A timeline of rollouts read from Kubernetes ReplicaSets and Docker container creation times, so you can match a problem with the change that came before it.',
      whenToUse: [
        'Something broke and you want to know what was deployed just before.',
        'You want to see how many rollouts happened in the last 24 hours.',
      ],
      howItWorks: [
        'The page reads rollout evidence from the cluster and the Docker engine when you open or refresh it. No event is invented. Kubernetes shows retained ReplicaSets (each ReplicaSet revision is one rollout), Docker shows when each container was created.',
        'If one source fails, a "Partial coverage" banner names it and the other source still shows. A "How to read this" list at the bottom explains limits of the evidence.',
      ],
      parts: [
        HEADER,
        {
          name: 'Stat cards',
          description: 'Deployment records (total and how many are in the current view), Kubernetes rollouts, Docker creations and Last 24 hours (with how many are still progressing).',
        },
        {
          name: 'Deployment timeline card',
          description: 'The list of deployment records.',
          items: [
            { name: 'Filter box', description: 'Type to filter live by workload, image, namespace, version, state, context or change cause.' },
            { name: 'Source drop-down', description: 'All sources, Kubernetes or Docker.' },
            { name: 'Counter', description: 'Shows "N of M record(s)" for the current filter.' },
            { name: 'Kubernetes deployments / Containers (header links)', description: 'Open the matching pages in the Kubernetes and Docker workspaces.' },
            { name: 'Open (row)', description: 'Opens the workload or container in its own workspace.' },
          ],
        },
        { name: 'How to read this', description: 'A short list of known limitations of the evidence, shown when there are any.' },
      ],
      tables: [
        {
          name: 'Deployment timeline table',
          columns: [
            { name: 'When', meaning: 'Date and time of the rollout plus how long ago.', example: '13 Nov 2026, 08:15 / 1 hour ago' },
            { name: 'Source', meaning: 'Kubernetes (blue) or Docker (violet).', example: 'Kubernetes' },
            { name: 'Workload', meaning: 'Name and kind and namespace.', example: 'api / Deployment / prod' },
            { name: 'Image / revision', meaning: 'Container image and, for Kubernetes, the revision number.', example: 'registry.example.com/api:1.8.2, revision 14' },
            { name: 'State', meaning: 'active or running (green), progressing (orange), superseded or exited or stopped (grey), created (blue).', example: 'active' },
            { name: 'Detail', meaning: 'Extra text such as the change cause.', example: 'kubectl set image' },
          ],
        },
      ],
      example: {
        title: 'Example: link an error spike to a release',
        steps: [
          'An alert for the "checkout" service started at 08:20.',
          'Open Deployments and type "checkout" in the filter box.',
          'A row at 08:15 shows revision 14 with the image tag 1.8.2, state active, and the previous revision as superseded.',
          'Open the workload from the row to roll back or read the logs.',
        ],
      },
      tips: [
        'Kubernetes only keeps a limited number of old ReplicaSets, so very old rollouts will not show.',
        'A Docker creation time means the container was created then, which is not always a new release.',
      ],
    },

    'observability/incidents': {
      title: 'Incidents',
      summary: 'Incidents group related alerts into one case with a status, an owner and a timeline, so a team can follow a problem from detection to resolution.',
      whenToUse: [
        'An alert fired and you want to track who handles it and what was found.',
        'You noticed a problem that monitoring did not detect and want to record it.',
      ],
      howItWorks: [
        'When an alert from a rule that has "Open an incident when firing" fires, OpsDeck opens an incident, or adds the alert to an existing open incident with the same group key (by default rule and resource). When all linked alerts recover, the incident is resolved automatically and a timeline entry is added.',
        'Status moves through open, acknowledged, mitigated and resolved. Every change adds an entry to the timeline.',
        'This page does not refresh itself; use Refresh.',
      ],
      parts: [
        HEADER,
        { name: 'Stat cards', description: 'Open (not resolved), Critical (open critical incidents) and Total retained.' },
        {
          name: 'Incidents card',
          description: 'List of incidents.',
          items: [
            { name: 'Create incident', description: 'Opens a form with title (required), severity, assignee and summary, for problems your monitoring did not raise.' },
            { name: 'Update (row)', description: 'Opens a form for status (open, acknowledged, mitigated, resolved), severity, assignee, root cause, resolution and a timeline note. Hidden for resolved incidents.' },
            { name: 'View (row)', description: 'Opens the detail card below the table.' },
          ],
        },
        {
          name: 'Incident detail card',
          description: 'Shows the summary, assignee, root cause, resolution and creation time, and then the timeline: each entry has a time, a type (for example status or note) and a text. "Close" hides the card.',
        },
      ],
      tables: [
        {
          name: 'Incidents table',
          columns: [
            { name: 'Incident', meaning: 'Title and a short summary.', example: 'Website or API unavailable - Checkout API' },
            { name: 'Severity', meaning: 'critical, warning or info.', example: 'critical' },
            { name: 'Status', meaning: 'open (orange), acknowledged (blue) or resolved (green); mitigated is also possible.', example: 'acknowledged' },
            { name: 'Assignee', meaning: 'Who owns it, or "Unassigned".', example: 'Sara' },
            { name: 'Alerts', meaning: 'Number of alerts grouped into the incident.', example: '3' },
            { name: 'Updated', meaning: 'Time since the last change.', example: '4 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'Example: handle an incident from start to finish',
        steps: [
          'A critical incident "Database unavailable" appears with status open. Click "Update", set the assignee to yourself and the status to acknowledged.',
          'After restarting the service, set the status to mitigated and write the cause in "Root cause", for example "Disk full on db-1".',
          'When all is back to normal, set the status to resolved and fill in "Resolution". Click "View" to review the timeline you built.',
        ],
      },
      tips: [
        'Write the root cause and resolution while it is fresh; the timeline is the record for a later review.',
        'Resolved incidents have no Update button. Create a new incident if it comes back.',
      ],
    },

    'observability/dashboards': {
      title: 'Dashboards',
      summary: 'Collections of charts and tables ("widgets") built from stored metrics. Built-in dashboards cover infrastructure, Docker, Kubernetes, databases, API and logs, and you can build your own.',
      whenToUse: [
        'You want a ready-made view of one area, such as Docker.',
        'You want a custom screen with only the metrics you care about.',
      ],
      howItWorks: [
        'Widgets read metrics from the local time-series store for the selected range. A widget only shows data that collectors have actually recorded; with no samples it says "No data yet".',
        'Built-in dashboards are read-only. To change one, duplicate it and edit the copy.',
        'The dashboard re-reads when you change the range or click Refresh.',
      ],
      parts: [
        HEADER,
        RANGE,
        {
          name: 'Dashboard list (left)',
          description: 'All dashboards, each with its name, "Built in" or "Custom" and the number of widgets. The active one is highlighted.',
          items: [{ name: 'New', description: 'Opens a form with name (required), description and icon, and creates an empty custom dashboard that opens right away.' }],
        },
        {
          name: 'Dashboard header',
          description: 'The name and description of the open dashboard with its actions.',
          items: [
            { name: 'Favorite / Unfavorite', description: 'Marks the dashboard as a favorite.' },
            { name: 'Duplicate', description: 'Makes an editable copy, the way to customise a built-in dashboard.' },
            { name: 'Add widget', description: 'Custom dashboards only. Opens the widget form: title, visualisation (timeseries, area, bar, pie, gauge, stat, table, topn, heatmap, status, latency), metric (chosen from recorded metrics), unit, aggregation (avg, max, min, sum, last), width in grid columns (1 to 12) and height in pixels (120 to 600).' },
            { name: 'Delete', description: 'Custom dashboards only. After confirmation, removes the dashboard. Built-in ones cannot be deleted.' },
          ],
        },
        {
          name: 'Widgets',
          description: 'Each widget is a card with a title and the metric name. Time series show an area chart, lists show a table (for example log lines or top-N values). Widgets on custom dashboards have Edit and Delete buttons; Delete asks for confirmation.',
        },
      ],
      example: {
        title: 'Example: build a "Payments service" dashboard',
        steps: [
          'Click "New" in the dashboard list, name it "Payments service" and create it.',
          'Click "Add widget". Title "Checkout p95", visualisation timeseries, metric application.response.p95_ms, unit milliseconds, aggregation max, width 6.',
          'Add a second widget for application.error_rate with unit percent.',
          'Switch the range to Last 24 hours to see the trend over a day.',
        ],
      },
      tips: [
        'The metric list in the widget form only has metrics that were recorded, so wait for the collector or ingest to deliver data first.',
        'The widths of widgets on one row add up to 12 columns.',
        'To explore a metric without saving anything, use the Metrics explorer.',
      ],
    },

    'observability/metrics': {
      title: 'Metrics explorer',
      summary: 'Browse every metric OpsDeck has stored, look at its chart and the series behind it, and export the samples to CSV.',
      whenToUse: [
        'You want to know which metric names exist before writing an alert rule or a dashboard widget.',
        'You want to check the raw values behind a chart.',
      ],
      howItWorks: [
        'The catalog lists all metrics currently retained (names such as system.cpu.usage, docker.containers.running, synthetic.up, application.error_rate). Raw samples are kept 24 hours and then rolled up into aggregates kept 30 days by default.',
        'A metric can have several series, for example one per mount point or per container, told apart by labels.',
      ],
      parts: [
        HEADER,
        RANGE,
        {
          name: 'Catalog card',
          description: 'Search and pick a metric.',
          items: [
            { name: 'Search metrics', description: 'Narrows the list of metrics by name, for example "docker." or "system.cpu".' },
            { name: 'Metric', description: 'Drop-down with the matching metrics (up to 200). Changing it loads the metric right away.' },
            { name: 'Query', description: 'Applies the search text and the selected metric and reloads.' },
            { name: 'Export CSV', description: 'Saves the samples of the selected metric for the current range as a CSV file.' },
            { name: 'Counts line', description: 'Shows how many metrics and how many stored series exist.' },
          ],
        },
        {
          name: 'Result card',
          description: 'Titled with the metric name and a subtitle such as "3 series - avg over 1h". It has an area chart of the first series and a table of series (up to 30). With no metric chosen, it says "No metric selected".',
        },
      ],
      tables: [
        {
          name: 'Series table',
          columns: [
            { name: 'Metric', meaning: 'Metric name.', example: 'system.disk.usage' },
            { name: 'Source', meaning: 'Which collector produced it.', example: 'local' },
            { name: 'Resource', meaning: 'The thing measured.', example: 'host' },
            { name: 'Labels', meaning: 'Extra dimensions in JSON that tell series apart.', example: '{"mount":"/data"}' },
            { name: 'Latest', meaning: 'Most recent value, formatted with the unit.', example: '71.3%' },
            { name: 'Points', meaning: 'Number of samples in the range.', example: '360' },
          ],
        },
      ],
      example: {
        title: 'Example: pick the right metric for an alert rule',
        steps: [
          'Type "disk" in Search metrics and choose system.disk.usage in Metric.',
          'Click "Query". The table shows one series per mount point with the latest percentage.',
          'Copy the metric name and use it in "New rule" on the Alerts page, with an aggregation of max and a threshold of 90.',
        ],
      },
      tips: [
        'Only the first series is drawn in the chart. Use the table to see the others.',
        'A short range has more detail; a long range uses rolled-up aggregates.',
      ],
    },

    'observability/reports': {
      title: 'Reports',
      summary: 'Creates a snapshot report from retained monitoring data and lets you preview it and save it as JSON, CSV or PDF.',
      whenToUse: [
        'You need a record for a weekly review, an audit or a customer.',
        'You want data from a past period (up to 30 days).',
      ],
      howItWorks: [
        'A report is generated on demand from the data stored locally; it is not a schedule and nothing is sent anywhere. JSON and CSV are shown as text in the preview; for PDF the preview only shows the file name and size.',
      ],
      parts: [
        HEADER,
        {
          name: 'Generate a report card',
          description: 'Choose what to generate.',
          items: [
            { name: 'Report', description: 'One of: System performance, Server availability, Docker resource utilization, Kubernetes cluster health, Database performance, API availability, Application performance, Alert history, Incident history.' },
            { name: 'Format', description: 'JSON, CSV or PDF.' },
            { name: 'Range', description: '1h, 24h, 7d (default) or 30d.' },
            { name: 'Generate', description: 'Builds the report and shows it in the Preview card.' },
            { name: 'Save to file', description: 'Appears after a report is generated. Opens a save dialog to write the file.' },
          ],
        },
        { name: 'Preview card', description: 'The report text (up to 12,000 characters) or, for PDF, a box with the file name and size. Before the first report, an empty state asks you to pick a report and format.' },
      ],
      example: {
        title: 'Example: weekly Docker report as PDF',
        steps: [
          'Choose "Docker resource utilization", format PDF and range 7d.',
          'Click "Generate". The preview says "PDF generated" with a file size.',
          'Click "Save to file" and choose where to store it.',
        ],
      },
      tips: [
        'Reports cover only the retention you have. Increase retention in Settings if you need longer history.',
        'The alert and incident reports have no metrics, they list history.',
      ],
    },

    'observability/insights': {
      title: 'Intelligence (Observability)',
      summary: 'A read-only analysis of your retained telemetry: service objectives and error budgets, anomalies, capacity forecasts, service dependencies and latency profiles, plus a list of findings that need attention.',
      whenToUse: [
        'You want to define a reliability target such as 99.9% availability and see whether you meet it.',
        'You want to know whether a metric behaves unusually or when a disk will fill up.',
        'You want to see how your services call each other.',
      ],
      howItWorks: [
        'The analysis runs in the main process over retained samples and spans. Values that could not be measured are reported as unknown or listed under Limitations, never as healthy. Nothing is estimated without enough data.',
        'The page analyses once when opened and then refreshes in the background every 90 seconds (it does not interrupt a form you are typing in). Use Refresh to update now. A footer shows "Analysed ... read-only snapshot".',
        'The only thing you can change here is the list of service objectives, which are saved in the shared intelligence settings.',
      ],
      parts: [
        {
          name: 'Page header',
          description: 'Title, a short description and two buttons.',
          items: [
            { name: 'Cross-module view', description: 'Opens the Intelligence overview that combines all workspaces.' },
            { name: 'Refresh', description: 'Runs the analysis again now.' },
          ],
        },
        {
          name: 'Stat cards',
          description: 'Four cards.',
          items: [
            { name: 'Objectives', description: 'Number of objectives measured. Red if one is breached.' },
            { name: 'Anomalies (24h)', description: 'Unusual values found in the last day and how many series were examined.' },
            { name: 'Capacity series', description: 'Number of series with a seven-day projection.' },
            { name: 'Service edges', description: 'Number of caller-to-callee connections between services, with the service and span counts.' },
          ],
        },
        { name: 'Findings card', description: 'Items that crossed a rule: SLO burn, anomalies, capacity crossings and failing dependencies. Each has a severity badge (critical, warning, info, pass, unknown), a title, detail and evidence, and an Open button to the related page. Chips at the top count findings per severity.' },
        { name: 'Service objectives card', description: 'Results of each objective. See the table below.' },
        {
          name: 'Objective definitions card',
          description: 'Your objectives with an add form.',
          items: [
            { name: 'Definitions list', description: 'Name, metric, "Good when" (at least or at most the threshold), target, window, state and a Delete button (after confirmation; no metric data is deleted).' },
            { name: 'Add objective form', description: 'Name, Metric (for example synthetic.up), Comparison ("At least the threshold is good" or "At most the threshold is good"), Threshold, Target % (0 to 100), Window in hours (1 to 720) and Aggregation (avg, max, min, last). "Add objective" saves it. Names must be unique, and at most 50 objectives are allowed.' },
          ],
        },
        { name: 'Anomalies card', description: 'Values that deviate strongly from the median of recent samples, with direction and score in sigma.' },
        { name: 'Capacity forecast card', description: 'A linear trend of resources such as disk usage, with the projected date they cross a limit.' },
        { name: 'Dependencies card', description: 'Service-to-service edges built from span parents and peers. "Open traces" jumps to Traces.' },
        { name: 'Service profiles card', description: 'Per-service span counts, error rates, latency and the most frequent operations.' },
        { name: 'Limitations card', description: 'Lists what could not be measured and why.' },
      ],
      tables: [
        {
          name: 'Service objectives table',
          columns: [
            { name: 'Objective', meaning: 'Name and the metric it uses.', example: 'Checkout availability - synthetic.up' },
            { name: 'Achieved', meaning: 'Share of samples in the window that were good.', example: '99.95%' },
            { name: 'Target', meaning: 'The share you want to reach.', example: '99.90%' },
            { name: 'State', meaning: 'Meeting (green) or Breached (red).', example: 'Meeting' },
            { name: 'Error budget', meaning: 'How much of the allowed failures is used up. 100% means the target is missed. Orange from 80%.', example: '50% consumed' },
            { name: 'Samples', meaning: 'Number of samples behind the result.', example: '1,440' },
          ],
        },
        {
          name: 'Anomalies table',
          columns: [
            { name: 'Metric / Resource', meaning: 'What deviated.', example: 'docker.containers.cpu.usage / api-1' },
            { name: 'When', meaning: 'Time of the unusual sample.', example: '2 hours ago' },
            { name: 'Value / Baseline', meaning: 'The value seen and the usual median.', example: '88 vs 12' },
            { name: 'Direction', meaning: 'Above baseline or Below baseline.', example: 'Above baseline' },
            { name: 'Score', meaning: 'How far from normal, in standard-deviation-like units (sigma). Higher is more unusual.', example: '6.2σ' },
          ],
        },
        {
          name: 'Capacity forecast table',
          columns: [
            { name: 'Series', meaning: 'Resource tracked.', example: 'Disk usage /' },
            { name: 'Current / Threshold', meaning: 'Now and the limit used.', example: '78% / 90%' },
            { name: 'Trend', meaning: 'Change per day.', example: '+1.2/day' },
            { name: 'Projected crossing', meaning: 'Date the threshold would be reached, or "Already crossed".', example: '24 Nov 2026, 10:00' },
            { name: 'Confidence', meaning: 'How well a straight line fits the samples.', example: '93%' },
          ],
        },
        {
          name: 'Dependencies table',
          columns: [
            { name: 'Edge', meaning: 'Caller to callee.', example: 'checkout -> payments' },
            { name: 'Calls / Errors', meaning: 'Number of calls and share that failed.', example: '1,200 / 2.5%' },
            { name: 'Mean / p95', meaning: 'Average and 95th percentile latency of the calls.', example: '60 ms / 210 ms' },
          ],
        },
      ],
      example: {
        title: 'Example: add a 99.9% availability objective for a website',
        steps: [
          'Make sure a Synthetic check exists, because it records the metric synthetic.up (1 when up, 0 when down).',
          'In "Objective definitions" enter the name "Checkout availability" and the metric synthetic.up.',
          'Set Comparison to "At least the threshold is good", Threshold 1, Target % 99.9, Window 24 hours, Aggregation avg, then click "Add objective".',
          'After the next analysis the "Service objectives" card shows Achieved and Error budget. If Error budget goes above 80%, you are close to missing the target.',
        ],
      },
      tips: [
        'Forecasts need enough samples. An empty Capacity card usually means the data is too young.',
        'Anomalies only compare a metric with its own recent history. They are hints, not alarms; use Alerts for paging.',
        'Deleting an objective does not delete any metric data.',
      ],
    },

    'observability/integrations': {
      title: 'Integrations',
      summary: 'Connect external monitoring systems (Prometheus, Loki, Elasticsearch, Tempo, Jaeger, Datadog, CloudWatch, GCP, Azure Monitor and others), test them, discover what they hold and run queries from inside OpsDeck.',
      whenToUse: [
        'You already run Prometheus, Loki or Elasticsearch and want to query them here.',
        'You want to check that a monitoring endpoint is reachable.',
      ],
      howItWorks: [
        'Each integration uses the native HTTP API of the system. Credentials are encrypted in the vault and never returned to the window. Results come from the real source, never from a stub.',
        'Not every adapter can be queried. Query is only offered for Prometheus, VictoriaMetrics, Netdata, Loki, Elasticsearch and OpenSearch. Other adapters offer Test and Discover.',
        'This page does not refresh itself; use Refresh.',
      ],
      parts: [
        HEADER,
        { name: 'Vault banner', description: 'States that real adapters are used and which vault backend encrypts the credentials.' },
        {
          name: 'Sources card',
          description: 'Your integrations.',
          items: [
            { name: 'Add integration', description: 'Opens a form: name, adapter, base URL, host, port, "Use TLS", username, password, bearer token, API key, organisation or tenant, bucket, region, project id, tenant id, client id, client email, client secret, service account private key, extra headers as JSON, timeout and enabled. Only fill in the fields your adapter needs.' },
            { name: 'Test (row)', description: 'Calls the system and reports "Integration reachable" or the error.' },
            { name: 'Discover (row)', description: 'Asks the system what it holds (for example metric or label names) and shows the result in a "Discovery result" card.' },
            { name: 'Query (row)', description: 'Only for queryable adapters. Opens a form with an expression, an index (Elasticsearch and OpenSearch only) and a maximum number of results (1 to 1000). The raw response appears in a "Query result" card.' },
            { name: 'Edit / Delete (row)', description: 'Change the settings, or delete after confirmation (stored credentials are removed too).' },
          ],
        },
        { name: 'Discovery result and Query result cards', description: 'Raw JSON returned by the system, shown below the table after you use Discover or Query.' },
        { name: 'Supported adapters card', description: 'Tags with every adapter type OpsDeck supports. Hover a tag for its description.' },
      ],
      tables: [
        {
          name: 'Sources table',
          columns: [
            { name: 'Integration', meaning: 'Name and adapter type.', example: 'Production Prometheus / Prometheus' },
            { name: 'Endpoint', meaning: 'URL or host.', example: 'https://prometheus.example.com' },
            { name: 'State', meaning: 'enabled or disabled.', example: 'enabled' },
            { name: 'Connection', meaning: 'Connected, Unreachable or "not tested", with an error text under it.', example: 'Connected' },
            { name: 'Last test', meaning: 'Time since the last test.', example: '5 minutes ago' },
          ],
        },
      ],
      example: {
        title: 'Example: query Prometheus for CPU rate',
        steps: [
          'Click "Add integration", choose adapter Prometheus, name it "Production Prometheus" and enter the base URL.',
          'Save and click "Test". "Integration reachable" confirms the URL and credentials.',
          'Click "Query" and enter: rate(node_cpu_seconds_total[5m]). Set a result limit and click "Run query".',
          'The response appears in the "Query result" card.',
        ],
      },
      tips: [
        'Loki queries use LogQL, for example {app="api"} |= "error". Elasticsearch accepts a query string or a JSON query that starts with a brace.',
        'Use a read-only token for every integration.',
        'Results are shown as JSON, they are not stored in the OpsDeck metric store.',
      ],
    },

    'observability/notifications': {
      title: 'Notifications',
      summary: 'Delivery channels (webhook, Slack, Discord, Telegram, email) that receive alert and incident messages.',
      whenToUse: [
        'You want to be told outside OpsDeck when an alert fires or resolves.',
        'You need to check that a channel works.',
      ],
      howItWorks: [
        'When an alert fires or resolves, OpsDeck sends a message to every enabled channel. Silences on the Alerts page suppress these messages.',
        'Tokens and SMTP passwords are encrypted in the vault and never returned to the window; the table only says "secret stored".',
        'This page does not refresh itself; use Refresh.',
      ],
      parts: [
        HEADER,
        {
          name: 'Delivery channels card',
          description: 'The list of channels.',
          items: [
            { name: 'Add channel', description: 'Opens a form: name, type (webhook, slack, discord, telegram, email) and then the fields that type needs. Webhook, Slack and Discord use a URL. Email uses SMTP host, port, username, password, From address and Recipients (comma separated), with options "Use implicit TLS" and "Use STARTTLS". Telegram uses a chat id and a bot token. A signing secret and "Verify TLS certificates" are available as well, plus "Enabled".' },
            { name: 'Send test (row)', description: 'Sends a test message right now. You get "Test notification sent" or "Delivery failed" with the reason.' },
            { name: 'Edit (row)', description: 'Change a channel.' },
            { name: 'Delete (row)', description: 'After confirmation, removes the channel and its stored secret.' },
          ],
        },
        { name: 'Secrets banner', description: 'Explains that secrets stay in the main process.' },
      ],
      tables: [
        {
          name: 'Delivery channels table',
          columns: [
            { name: 'Channel', meaning: 'Name and type.', example: 'On-call Slack / slack' },
            { name: 'Destination', meaning: 'URL, host or chat id.', example: 'https://hooks.slack.com/services/...' },
            { name: 'State', meaning: 'enabled or disabled.', example: 'enabled' },
            { name: 'Credentials', meaning: '"secret stored" (blue) or "no secret".', example: 'secret stored' },
          ],
        },
      ],
      example: {
        title: 'Example: send alerts to Slack',
        steps: [
          'In Slack create an incoming webhook and copy its URL.',
          'Click "Add channel", choose type slack, enter a name and paste the URL, then save.',
          'Click "Send test". A message arrives in the Slack channel and OpsDeck shows "Test notification sent".',
          'From now on every firing or resolved alert is posted there.',
        ],
      },
      tips: [
        'A webhook URL is a secret. Anyone with it can post to your channel.',
        'Port 465 normally needs "implicit TLS"; port 587 normally needs STARTTLS.',
        'If a test fails, the toast shows the exact reason (DNS, TLS, 4xx).',
      ],
    },

    'observability/agents': {
      title: 'Agents & ingest',
      summary: 'Controls the small local web server (the ingest receiver) that accepts metrics, logs and traces pushed by agents and OpenTelemetry exporters, and the tokens those agents use.',
      whenToUse: [
        'You want an application or another machine to push telemetry into OpsDeck.',
        'You need to create or revoke an agent token.',
      ],
      howItWorks: [
        'The receiver is off by default. Enable it in Settings; it listens on 127.0.0.1 (this machine only) unless you change the bind address. Agents authenticate with a bearer token.',
        'It accepts JSON only: agent metric snapshots, OTLP/HTTP JSON traces, logs and metrics, and simple log or metric ingest. Protobuf is rejected with HTTP 415.',
        'This page does not refresh itself; use Refresh.',
      ],
      parts: [
        HEADER,
        {
          name: 'Stat cards',
          description: 'Receiver (Listening with the address and port, or Stopped), Agents (registered and online) and Requests (received since the receiver started).',
        },
        { name: 'Receiver error banner', description: 'Appears if the receiver could not start, for example "Port 8787 is already in use."' },
        { name: 'Ingest endpoint banner', description: 'When running, shows the URL to POST to. When stopped, tells you to enable it in Settings.' },
        {
          name: 'Registered agents card',
          description: 'Your agents.',
          items: [
            { name: 'Restart receiver', description: 'Stops and starts the receiver, applying changed Settings such as the port.' },
            { name: 'Create agent', description: 'Creates an agent and shows its bearer token once in a dialog with a Copy token button. The token cannot be shown again.' },
            { name: 'Revoke (row)', description: 'After confirmation, the agent can no longer push data. The record stays, marked revoked.' },
            { name: 'Remove (row)', description: 'After confirmation, deletes the agent record.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Registered agents table',
          columns: [
            { name: 'Agent', meaning: 'Name and agent id.', example: 'web-1 / agent-3f2a...' },
            { name: 'Platform', meaning: 'Operating system the agent reported.', example: 'linux' },
            { name: 'State', meaning: 'online (green), offline (grey) or revoked (red).', example: 'online' },
            { name: 'Last seen', meaning: 'When it last pushed data, or "never".', example: '12 seconds ago' },
          ],
        },
      ],
      example: {
        title: 'Example: send traces from an application',
        steps: [
          'Open Settings, tick "Enable ingest receiver" and save. Back here, "Receiver" should say Listening.',
          'Click "Create agent", name it, and copy the token from the dialog.',
          'In your application set the OTLP traces endpoint to the receiver address plus /v1/otlp/traces, protocol http/json, and add the header Authorization: Bearer <token>.',
          'Within a minute traces appear on the Traces page and services on Applications.',
        ],
      },
      tips: [
        'Keep the bind address 127.0.0.1 unless you really need other machines to connect. 0.0.0.0 exposes the receiver to your network.',
        'Store the token immediately; it is shown once only.',
        'The Requests counter resets when the receiver restarts.',
      ],
    },

    'observability/remediation': {
      title: 'Remediation',
      summary: 'Lets an alert trigger a pre-approved fix, such as restarting a container, with limits and a full audit trail. It is disabled by default.',
      whenToUse: [
        'A known problem always has the same safe fix.',
        'You want to run a fix by hand and keep a record of it.',
      ],
      howItWorks: [
        'Only a short allowlist of actions exists: restart a Docker container, restart a Compose project, restart a Kubernetes workload, run an HTTP health check, send a notification webhook. Nothing else can be run.',
        'A policy ties one alert rule (or any alert) to one action and target, with a minimum severity, a cooldown and a maximum number of runs per hour. A policy requires explicit approval unless you set it to run automatically.',
        'Automation has a master switch. While it is off, nothing runs automatically. Every attempt, whether it worked or not, is recorded in the audit trail below. OpsDeck never runs a remediation because of an AI answer.',
        'This page does not refresh itself; use Refresh.',
      ],
      parts: [
        HEADER,
        {
          name: 'Automation safety card',
          description: 'The master switch and the allowlist.',
          items: [
            { name: 'Enable / Disable', description: 'Turns automated remediation on or off. Both ask for confirmation. Disabling stops every automated action immediately.' },
            { name: 'Action tags', description: 'The allowlisted actions, as labels.' },
          ],
        },
        {
          name: 'Policies card',
          description: 'Your policies.',
          items: [
            { name: 'Add policy', description: 'Opens a form: policy name; action; alert rule id (blank means any alert); minimum severity; approval (require explicit approval, or run automatically); target as JSON; cooldown seconds; maximum per hour (1 to 60); "Enable this policy". Defaults are safe: action docker.restart, severity critical, approval required, cooldown 300 s, 3 per hour, and the policy starts disabled.' },
            { name: 'Run (row)', description: 'Runs the policy now after you confirm; the confirmation shows the exact target. Your click counts as the approval.' },
            { name: 'Edit / Delete (row)', description: 'Change a policy, or delete it after confirmation. The audit trail is kept.' },
          ],
        },
        { name: 'Recent executions card', description: 'The audit trail of attempts.' },
      ],
      tables: [
        {
          name: 'Policies table',
          columns: [
            { name: 'Policy', meaning: 'Name and action.', example: 'Restart the API container / docker.restart' },
            { name: 'State', meaning: 'enabled or disabled.', example: 'enabled' },
            { name: 'Approval', meaning: '"approval required" (blue) or "auto" (orange).', example: 'approval required' },
            { name: 'Alert rule', meaning: 'Rule id that triggers it, or "any alert".', example: 'any alert' },
            { name: 'Limits', meaning: 'Cooldown and maximum runs per hour.', example: '300s / 3 per hour' },
          ],
        },
        {
          name: 'Recent executions table',
          columns: [
            { name: 'Policy / Action', meaning: 'What ran.', example: 'Restart the API container / docker.restart' },
            { name: 'Result', meaning: 'Succeeded or Failed.', example: 'Succeeded' },
            { name: 'Actor', meaning: 'Who or what started it, for example the operator who clicked Run.', example: 'operator' },
            { name: 'When', meaning: 'Time since it ran.', example: '3 minutes ago' },
            { name: 'Detail', meaning: 'Result message or error.', example: 'Container restarted' },
          ],
        },
      ],
      example: {
        title: 'Example: restart a container by hand under a policy',
        steps: [
          'Click "Add policy", name it "Restart the API container", choose docker.restart, and enter the target {"containerId":"api-1"}.',
          'Leave Approval on "Require explicit approval", and save. The policy starts disabled.',
          'Click "Run" on the row. The confirmation shows the target; click "Run now".',
          'A new row appears under Recent executions with the result and actor "operator".',
        ],
      },
      tips: [
        'Test the action and target by hand first, and only then consider "Run automatically".',
        'The cooldown prevents restart loops: a policy will not run again until the cooldown has passed.',
        'The target is JSON. For a Kubernetes workload use {"kind":"deployments","name":"api","namespace":"prod"}.',
      ],
    },

    'observability/settings': {
      title: 'Settings',
      summary: 'Controls how often data is collected, which collectors run, how long data is kept, the ingest receiver and workspace preferences.',
      whenToUse: [
        'You want to turn off a collector you do not use.',
        'You want to keep logs or metrics longer, or save disk space.',
        'You need to enable the ingest receiver for agents or OpenTelemetry.',
      ],
      howItWorks: [
        'Changes are applied only when you click "Save settings"; leaving the page discards edits. Data is stored locally in files readable only by you.',
        'The page loads the current values each time you open it.',
      ],
      parts: [
        HEADER,
        {
          name: 'Collection card',
          description: 'Cadence and which collectors run.',
          items: [
            { name: 'Monitoring enabled', description: 'Master switch. Unticking it stops every scheduled collector.' },
            { name: 'Base interval (seconds)', description: 'How often the main collectors run, from 2 to 300. Default 10.' },
            { name: 'Database interval (seconds)', description: 'How often database metrics are read, from 5 to 600. Default 30.' },
            { name: 'Auto-connect saved database profiles', description: 'Opens sessions for saved database profiles so their metrics can be read even when you have not connected them.' },
            { name: 'Collector checkboxes', description: 'One per collector (for example Local, Network, Docker, Kubernetes, Databases, Synthetic, Remote, Logs, Applications). Untick the ones you do not need.' },
          ],
        },
        {
          name: 'Retention card',
          description: 'How long data is kept.',
          items: [
            { name: 'Raw samples (hours)', description: '1 to 720, default 24.' },
            { name: 'Aggregate retention (days)', description: 'Rolled-up metric history, 1 to 3650, default 30.' },
            { name: 'Log retention (days)', description: '1 to 365, default 7.' },
            { name: 'Trace retention (days)', description: '1 to 365, default 7.' },
            { name: 'Maximum log records', description: '100 to 200,000, default 20,000.' },
            { name: 'Maximum series', description: 'Limit on distinct metric series, 100 to 100,000, default 5,000.' },
          ],
        },
        {
          name: 'Agent & OTLP receiver card',
          description: 'The ingest receiver, local by default.',
          items: [
            { name: 'Enable ingest receiver', description: 'Starts the receiver after saving (or after Restart receiver on Agents & ingest).' },
            { name: 'Bind address', description: '127.0.0.1 for this machine only; 0.0.0.0 for all network interfaces.' },
            { name: 'Port', description: 'TCP port, default 8787.' },
            { name: 'TLS', description: 'Needs a certificate configured for the receiver.' },
          ],
        },
        {
          name: 'Workspace preferences card',
          description: 'Default time range (15m, 1h, 6h, 24h or 7d) and the Overview widget ids as a comma-separated list.',
        },
        {
          name: 'Action buttons',
          description: 'At the bottom of the page.',
          items: [
            { name: 'Save settings', description: 'Applies and stores every change on the page.' },
            { name: 'Export configuration', description: 'Saves your configuration to a JSON file you choose.' },
          ],
        },
      ],
      example: {
        title: 'Example: keep logs for 30 days',
        steps: [
          'In Retention set "Log retention (days)" to 30.',
          'If you collect a lot of logs, also raise "Maximum log records", because the record cap removes old lines even before the time limit.',
          'Click "Save settings". You see "Settings saved".',
        ],
      },
      tips: [
        'A lower base interval gives fresher data but uses more CPU and disk.',
        'Lowering retention deletes old data over time, so export or create a report first if you need it.',
        'Do not bind the receiver to 0.0.0.0 on an untrusted network.',
      ],
    },
  });
})();
