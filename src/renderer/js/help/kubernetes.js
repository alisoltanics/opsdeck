'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.help = OD.help || {};

  // ---------------------------------------------------------------- shared text

  const ASK_REFRESH = 'Ask AI asks the assistant about this view using live cluster context. Refresh reads the cluster again.';

  function toolbarPart(namespaced) {
    const items = [
      { name: 'Context', description: 'A context is one saved cluster connection from a kubeconfig file (for example "minikube" or "prod-eu"). Choosing another one switches the whole Kubernetes workspace to that cluster. OpsDeck remembers the choice itself and never edits your ~/.kube/config.' },
    ];
    if (namespaced) {
      items.push({ name: 'Namespace', description: 'A namespace is a named folder inside the cluster that groups objects (for example "default", "shop", "monitoring"). This list picks which one is shown. It is greyed out while "All namespaces" is on.' });
      items.push({ name: 'Current namespace / All namespaces button', description: 'Toggles between the single selected namespace and every namespace at once. When on, the address gets "?all=1" and the table lists objects from the whole cluster (the Name column is the same, so look at the row actions or the side panel to see which namespace a row belongs to).' });
    } else {
      items.push({ name: 'cluster-scoped badge', description: 'Shown instead of a namespace picker. This kind of object belongs to the whole cluster, not to one namespace, so there is nothing to filter.' });
    }
    items.push({ name: 'Connection badge', description: 'Green "connected" means the cluster answered. Amber "not connected" means kubectl could not reach it (VPN off, cluster stopped, expired login).' });
    items.push({ name: 'Copy context', description: 'Copies a ready kubectl command that targets the selected context, for example: kubectl --context minikube get pods -A. Paste it in your own terminal.' });
    return { name: 'Toolbar', description: 'Sits under the page title and decides which cluster' + (namespaced ? ' and namespace' : '') + ' the page reads. Top-right of the page there are also Ask AI and Refresh buttons. ' + ASK_REFRESH, items };
  }

  function listCardPart(title, scopeText) {
    return {
      name: title + ' card',
      description: 'The main card. Its subtitle shows how many objects were returned (for example "12 objects") ' + scopeText + ' If there are more than 500 objects it says "showing first 500 of N" and the rest are not listed. If the cluster refuses the request (for example missing permission), a red banner explains the error and offers Refresh. If nothing matches you see an empty state such as "No ' + title.toLowerCase() + '".',
    };
  }

  function rowActionsPart(extra) {
    const items = [
      { name: 'Click a row', description: 'Opens the details side panel for that object (see "Details side panel").' },
      { name: 'Ask AI (sparkles icon)', description: 'Opens an AI question about this one object, with sanitized live context attached.' },
      { name: 'Copy name (copy icon)', description: 'Copies the object name to the clipboard so you can paste it in a command.' },
      { name: 'Details (info icon)', description: 'Same as clicking the row: opens the side panel.' },
    ];
    if (extra) for (const it of extra) items.push(it);
    return { name: 'Actions column', description: 'Small icon buttons at the end of every row.', items };
  }

  function podRowExtras() {
    return [
      { name: 'Logs (file icon)', description: 'Opens a side panel with the last 300 lines of the pod log. Footer has Fullscreen, Open shell, Previous instance (shows the log of the container before its last restart, press again to go back) and Copy logs.' },
      { name: 'Shell (terminal icon)', description: 'Opens a real interactive terminal inside the pod (kubectl exec -it ... -- sh). Type commands as if you had logged into that container. Closing the panel ends the session.' },
    ];
  }

  function sidePanelPart(actionsText, isPod) {
    const tabs = [
      { name: 'Summary tab', description: 'Key facts about the object in labelled sections (status, replicas, ports, conditions...), followed by Labels and Annotations shown as key=value tags. Labels are tags used to select objects; annotations are free-form notes added by tools.' },
      { name: 'Events tab', description: 'Recent cluster events about this object, newest first (Type, Reason, Object, Namespace, Count, Message, Last seen). The tab shows a count. Kubernetes only keeps events for a short time, so it can be empty.' },
    ];
    if (isPod) tabs.push({ name: 'Logs tab', description: 'Loads the last 300 log lines of the pod when you open the tab.' });
    tabs.push({ name: 'Commands tab', description: 'Ready-made kubectl commands for this exact object, each with a copy button and a run button. Run shows the output in another side panel. Commands tagged "writes" or "danger" ask for confirmation before running.' });
    tabs.push({ name: 'Manifest tab', description: 'The full object as JSON (the same data Kubernetes stores). Noisy bookkeeping such as last-applied-configuration is removed. This is JSON, not YAML.' });
    tabs.push({ name: 'Describe tab', description: 'The output of kubectl describe: a human-readable report including conditions and recent events. If it fails you see a "Describe output unavailable" notice.' });
    return {
      name: 'Details side panel',
      description: 'Opens from the right when you click a row. Tabs along the top, buttons in the footer. ' + actionsText,
      items: tabs,
    };
  }

  const READ_ONLY_FOOTER = 'This object type is read-only in OpsDeck: the footer shows "This object is read-only in OpsDeck" plus Ask AI, so you cannot change or delete it here.';
  const DELETE_ONLY_FOOTER = 'Footer has a red Delete button (it asks "Delete <name>?" first and then sends a real delete request to the selected cluster; Kubernetes may also remove objects that depend on it) and Ask AI.';

  function commandsPart(desc) {
    return {
      name: 'Ready-made kubectl commands',
      description: 'A collapsible card under the table, generated from the selected context and namespace. ' + desc + ' Every entry has a copy button and, when it is safe to run inside OpsDeck, a play button that runs it and shows the output. Entries marked "copy only" must be run in your own terminal; "write" and "danger" badges mean the command changes the cluster and OpsDeck asks you to confirm first.',
    };
  }

  const COMMON_HOW = [
    'Data comes live from the selected cluster by running real kubectl commands through OpsDeck. Nothing is cached or invented, and the page does not refresh by itself: press Refresh (or change context, namespace or scope) to read again.',
    'If kubectl is not installed you see a "kubectl is not installed" banner with an install link and the Local tools card; if no kubeconfig context exists you see "No kubeconfig context found" with an Import kubeconfig button.',
  ];

  const AGE_COL = { name: 'Age', meaning: 'How long ago the object was created.', example: '3d means created three days ago; 12m means twelve minutes ago.' };
  const NAME_COL = (what) => ({ name: 'Name', meaning: what });

  // Build a standard resource list page.
  function listPage(c) {
    const how = [c.how].concat(COMMON_HOW);
    const parts = [toolbarPart(c.namespaced), listCardPart(c.title, c.namespaced ? '(in the selected namespace, or the whole cluster with "All namespaces").' : '(this is a cluster-wide list).'), rowActionsPart(c.rowExtras), sidePanelPart(c.footerText, c.isPod), commandsPart(c.cmdText)];
    return {
      title: c.title,
      summary: c.summary,
      whenToUse: c.whenToUse,
      howItWorks: how,
      parts,
      tables: [{ name: c.title + ' table', description: c.tableDesc || 'One row per object. Cells with a coloured pill are status values.', columns: c.columns }],
      example: c.example,
      tips: c.tips,
    };
  }

  const data = {};

  // ------------------------------------------------------------------ overview
  data['kubernetes/overview'] = {
    title: 'Cluster overview',
    summary: 'A one-screen health check of the selected Kubernetes cluster: how many nodes and pods are healthy, which namespaces exist, the newest warnings, and the local tools OpsDeck uses.',
    whenToUse: [
      'You just connected a cluster and want to know it is alive.',
      'Something feels wrong and you want the quickest overall picture before drilling into Pods or Events.',
      'You need to switch cluster, import a kubeconfig, or start/stop a local Minikube cluster.',
    ],
    howItWorks: [
      'Kubernetes is a system that runs containers (small packaged apps) across a group of machines. A cluster is that whole group; you reach it through a context from a kubeconfig file. OpsDeck talks to it by running the real kubectl program with the context you selected, so every number here is read live from the cluster.',
      'The page loads once when you open it. Use Refresh in the top-right to read again. If the selected context does not answer, the page still shows your local configuration and the Cluster card explains why.',
      'Each card links onward: "All nodes" and "All namespaces" open the full lists.',
    ].concat(COMMON_HOW),
    parts: [
      { name: 'Page header', description: 'Subtitle shows the active context and the cluster server version once connected. Buttons: Import kubeconfig (copies a kubeconfig file you pick into OpsDeck storage), Ask AI, Refresh.' },
      toolbarPart(true),
      {
        name: 'Summary tiles',
        description: 'Four big numbers across the top.',
        items: [
          { name: 'Namespaces', description: 'How many namespaces exist, with how many are visible to you.' },
          { name: 'Nodes ready', description: 'Ready nodes out of all nodes, for example 3/3. Green when every node is ready, amber otherwise. Sub-text says "schedulable capacity".' },
          { name: 'Pods running', description: 'Number of running pods, with total and pending counts underneath (for example "42 total, 1 pending").' },
          { name: 'Services', description: 'Number of services, with the number of deployments underneath.' },
        ],
      },
      { name: 'Nodes card', description: 'Compact list of up to 8 nodes (the machines that run your pods): name and internal IP, Ready or the failure reason, roles, Kubernetes version, CPU, memory, pod capacity and age. A green or red dot shows readiness. "All nodes" opens the full Nodes page. If nodes cannot be read you see a "Nodes unavailable" banner.' },
      { name: 'Cluster card', description: 'When connected: Context, Cluster, Server address, Server version (with platform) and the selected Namespace. When not connected it shows "The cluster did not answer" or "No context selected" with the reason and a Retry button.' },
      { name: 'Namespaces card', description: 'Up to 10 namespaces with Status (Active in green, anything else amber), the number of pods in each, and when each was created. "All namespaces" opens the full list.' },
      { name: 'Warning events card', description: 'The latest Warning events from all namespaces: reason, the object, namespace, how many times it repeated, how long ago, and the message. Empty state: "No warning events".' },
      commandsPart('Examples: cluster info, nodes, all pods, warning events, API resources and the current context.'),
      { name: 'Local tools card', description: 'Shows kubectl (marked required), kind, minikube and Helm with a green version badge or a red "not installed" badge. "Install missing tools" downloads official releases into OpsDeck own storage (no sudo, no system-wide change) and shows a progress bar per tool.' },
      { name: 'Minikube card', description: 'Minikube is a tool that creates a small Kubernetes cluster on your own computer. The card shows the profile name and a badge (running, stopped, no profile, not installed). Start Minikube or Stop Minikube asks for confirmation, then runs only "minikube start" or "minikube stop".' },
    ],
    tables: [
      { name: 'Nodes card table', columns: [
        { name: 'Node', meaning: 'Node name, with its internal IP address underneath.', example: 'worker-1 with 10.0.0.12' },
        { name: 'Status', meaning: 'Ready (green) or the reason the node is not ready (red).', example: 'Ready; or KubeletNotReady' },
        { name: 'Roles', meaning: 'What the node does. Control plane nodes run the cluster brain; others run your apps.', example: 'control-plane' },
        { name: 'Version', meaning: 'Kubernetes (kubelet) version on that node.', example: 'v1.30.2' },
        { name: 'CPU', meaning: 'CPU cores available for pods.', example: '4' },
        { name: 'Memory', meaning: 'Memory available for pods.', example: '8039420Ki' },
        { name: 'Pods', meaning: 'Maximum number of pods the node can hold.', example: '110' },
        AGE_COL,
      ] },
      { name: 'Namespaces card table', columns: [
        { name: 'Namespace', meaning: 'Namespace name.', example: 'kube-system' },
        { name: 'Status', meaning: 'Active means usable; Terminating means it is being deleted.', example: 'Active' },
        { name: 'Pods', meaning: 'How many pods currently exist in it.', example: '7' },
        { name: 'Created', meaning: 'How long ago it was created.', example: '12d' },
      ] },
    ],
    example: {
      title: 'Example: confirm a new local cluster is healthy',
      steps: [
        'Open Cluster overview and pick your context in the toolbar (for example minikube).',
        'Check the Cluster card: it should list the server address and version and the toolbar badge should read "connected".',
        'Look at "Nodes ready": 1/1 in green means the node is fine. Amber means a node is not ready, so open Nodes.',
        'Look at "Pods running" and the Warning events card. Warnings such as FailedScheduling or BackOff point to a pod that needs attention: open Pods or Events.',
      ],
    },
    tips: [
      'Switching context only changes what OpsDeck reads; it never rewrites your kubeconfig.',
      'Stopping Minikube stops its workloads but keeps the cluster files on disk.',
      'Pending pods (a few for a short time) are normal right after a deploy; many for a long time is not.',
    ],
  };

  // ------------------------------------------------------------------ insights
  data['kubernetes/insights'] = {
    title: 'Intelligence',
    summary: 'An automatic, read-only analysis of the selected cluster: health, security, storage, network, resource requests, cost, GitOps and troubleshooting, turned into a list of findings.',
    whenToUse: [
      'You want to know what is wrong or risky without reading every resource page.',
      'You are reviewing a cluster for security hardening, wasted resources or missing storage defaults.',
      'You want to compare several clusters side by side.',
    ],
    howItWorks: [
      'OpsDeck reads the cluster with read-only kubectl calls and applies built-in rules. Values that could not be measured are reported as unknown or in the Limitations card, never as healthy.',
      'The analysis is a snapshot. It is cached for about 20 seconds, refreshed automatically every 90 seconds while the page stays open, and again when you press Refresh or change the scope. The footer line "Analysed N minutes ago" shows how fresh it is.',
      'Nothing on this page changes the cluster. The "Open" links on findings jump to the relevant module page.',
    ],
    parts: [
      { name: 'Page header', description: 'Title "Kubernetes intelligence". Buttons: "Cross-module view" (opens the cross-module Intelligence workspace) and Refresh.' },
      { name: 'Cluster scope card', description: 'Shows Context, Namespace, Nodes ready (for example 3 / 3), Pods running (for example 40 / 42) and a GitOps badge (green with tool names, or "Not detected"). The drop-down in its corner chooses "All namespaces" or "Current namespace" and re-runs the analysis.' },
      {
        name: 'Stat tiles',
        description: 'Six quick numbers; green means fine, orange or red means look closer.',
        items: [
          { name: 'Pods with problems', description: 'Pods that are not healthy, with the total restart count underneath.' },
          { name: 'Unavailable deployments', description: 'Deployments that do not have all wanted replicas available, out of all deployments.' },
          { name: 'Security issues', description: 'Number of pods that tripped a hardening rule, with counts of privileged pods and cluster-admin bindings.' },
          { name: 'Warning events', description: 'Warning events retained by the cluster, with the number of not-ready pods.' },
          { name: 'Storage claims', description: 'Number of persistent volume claims, total provisioned size and the default storage class (or "no default class").' },
          { name: 'Monthly cost', description: 'Estimated monthly cost of CPU and memory requests, or "Not priced" until prices are set in the Intelligence settings.' },
        ],
      },
      { name: 'Findings card', description: 'The main list. Each row has a severity badge (Critical red, Warning orange, Info cyan, Pass green, Unknown grey), a title, detail and evidence text, the resource it concerns and an "Open" link. Counts per severity are chips in the card corner. Empty state: "No cluster findings".' },
      { name: 'Nodes card', description: 'Table of nodes with State (Ready or Not ready), roles, CPU, memory and a detail message. If empty, RBAC (permissions) may not allow listing nodes.' },
      { name: 'Pod security card', description: 'Pods with hardening problems, shown as pill badges: privileged containers, host namespaces, hostPath volumes, extra capabilities, auto-mounted tokens. Empty state: "No pod security issues".' },
      { name: 'Storage card', description: 'Persistent volume claims with phase, storage class, requested size and actual capacity.' },
      { name: 'Network card', description: 'Services with type, cluster IP, an Endpoints badge (Ready, or orange "No endpoints" meaning no pod currently backs the service) and ports.' },
      { name: 'Troubleshooting card', description: 'Warning events grouped by object (count, reason pills, latest message). If any pod restarted three or more times a second table "Pods with three or more restarts" shows the pod, restart count and waiting reason.' },
      { name: 'Requests by namespace card', description: 'Per namespace: running containers, total CPU cores requested and memory requested. Useful to see who reserves the most.' },
      { name: 'Cost allocation card', description: 'Per namespace: pods, CPU cores, memory GB and a monthly cost, or "not priced". The subtitle shows the configured prices.' },
      { name: 'GitOps card', description: 'Detects Argo CD and Flux and lists workloads they manage. Warns that direct kubectl edits to managed objects may be reverted by the controller. Empty state: "No GitOps controller detected".' },
      { name: 'Multi-cluster comparison card', description: 'Press Compare to read every configured context separately (read-only). A table then shows each context: Reachable or Unreachable, Nodes ready, Pods running, Pods with problems, Deployments available, Warning events, plus comparison findings. Refresh re-reads. Unreachable contexts are listed, not hidden.' },
      { name: 'Limitations card', description: 'Plain list of what could not be checked (for example no metrics-server, or no permission).' },
    ],
    tables: [
      { name: 'Findings list', columns: [
        { name: 'Severity', meaning: 'How urgent the finding is.', example: 'Critical = fix now; Info = good to know' },
        { name: 'Title and detail', meaning: 'What the rule found and the evidence.', example: 'Privileged container: pod shop/api runs container "web" as privileged' },
      ] },
      { name: 'Multi-cluster table', columns: [
        { name: 'Context', meaning: 'Context name, marked "selected" for the active one, with its cluster underneath.', example: 'prod-eu' },
        { name: 'State', meaning: 'Reachable (green) or Unreachable (red).', example: 'Reachable' },
        { name: 'Nodes ready', meaning: 'Ready nodes / total nodes.', example: '3 / 3' },
        { name: 'Pods running', meaning: 'Running pods / total pods.', example: '40 / 42' },
        { name: 'Pods with problems', meaning: 'Pods that are failing or stuck.', example: '2' },
        { name: 'Deployments available', meaning: 'Fully available deployments / all deployments.', example: '9 / 10' },
        { name: 'Warning events', meaning: 'Number of retained Warning events.', example: '14' },
      ] },
    ],
    example: {
      title: 'Example: find out why the cluster feels unhealthy',
      steps: [
        'Open Intelligence and look at the stat tiles: red "Pods with problems 3" says three pods are unhealthy.',
        'Read the Findings card from the top; Critical items come first. Click "Open" on one to jump to the module page.',
        'Scroll to Troubleshooting. A pod with 12 restarts and waiting reason CrashLoopBackOff keeps crashing; open Pods and view its logs.',
        'Switch the scope to "Current namespace" if the list is too noisy, then press Refresh.',
      ],
    },
    tips: [
      'Unknown is not the same as healthy: read the Limitations card before trusting a green page.',
      'Monthly cost is only an estimate from CPU and memory requests and needs prices to be configured.',
      'Findings are rules of thumb, not proof; confirm in the real object before changing anything.',
    ],
  };

  // ------------------------------------------------------------------ topology
  data['kubernetes/topology'] = {
    title: 'Cluster map',
    summary: 'A live picture of how traffic flows through your cluster: Ingress to Service to Workload to Pod, grouped by namespace, with node health, warnings and an inventory of everything else.',
    whenToUse: [
      'You want to understand how an application is wired together.',
      'You need to see which pods run on which node, or which workloads are unhealthy.',
      'You are looking for the route a web request takes into a cluster.',
    ],
    howItWorks: [
      'OpsDeck reads pods, workloads, services, ingresses, nodes and events from every namespace and draws them as horizontal bands, one per namespace. Lines show relationships: "route" (an ingress sends traffic to a service), "selects" (a service picks pods by label) and "owns" (a workload created these pods).',
      'Read each band left to right: Ingresses (entry points from outside), Services (stable internal addresses), Workloads (Deployments, StatefulSets, DaemonSets that keep pods running) and Pods (the running containers).',
      'Secret values and ConfigMap values are never loaded into the map. The page reads once when opened; use Refresh to redraw. If the cluster does not answer the map is empty.',
    ].concat(COMMON_HOW),
    parts: [
      toolbarPart(false),
      { name: 'Summary tiles', description: 'Namespaces (and how many are in the map), Nodes ready (for example 3/3 with "all schedulable" or "N unhealthy"), Pods (healthy / total, with pending, failed and completed counts) and Workloads (total, with deployment, stateful and daemon counts).' },
      { name: 'Node health rail', description: 'A card listing every node as a button with a Ready badge. Hovering a node highlights the pods that run on it; clicking opens the node in a side panel. A badge shows "N/M ready".' },
      {
        name: 'Map card',
        description: 'The big drawing plus its controls.',
        items: [
          { name: 'Health badge', description: 'Shows "All healthy" (green) or "N issues" (amber/red) for the visible components.' },
          { name: 'Filter box', description: 'Type to filter by name, host, image, node, status, type, class or owner. Namespace names also match.' },
          { name: 'Namespace picker', description: 'Limit the map to one namespace or "All namespaces".' },
          { name: 'Problems button', description: 'Shows only unhealthy pods and workloads. If none, you see "No problems detected" with a Clear filters button.' },
          { name: 'Legend', description: 'Explains the three line kinds: route, selects, owns.' },
          { name: 'Zoom out, Zoom in, Fit to view, Expand map', description: 'Zoom buttons and a button that fits the whole graph in view; Expand map makes it larger and Esc shrinks it back. You can also drag to pan and scroll to zoom.' },
          { name: 'Namespace band', description: 'Left label shows the namespace, "N wl, M pods", a health flag (healthy, degraded or "N warn") and "N in, M svc". Click it to open a namespace summary panel. Empty namespaces appear as "no runnable components" and as pills under the map.' },
          { name: 'Component cards', description: 'Each ingress, service and workload is a card with icon, name, a short meta line (for example "3/3 ready, nginx:1.25") and a badge (status, route count or main port). Pods are smaller chips showing status and node. Colour shows health. Hovering highlights connected components.' },
          { name: 'Empty states', description: '"No runnable components" (nothing in the cluster), "No matching components" (filters too strict) or "No problems detected".' },
        ],
      },
      {
        name: 'Component side panel',
        description: 'Click any card, node or namespace label. It shows a status badge, key facts (for a pod: Status, Node, Ready, Restarts, Owner, Containers, Images; for workloads: Replicas, Available, Selector, Images; for a service: Type, Cluster IP, Ports, Selector; for an ingress: Class, Hosts, TLS, Backends; for a node: Roles, Internal IP, Kubelet, OS, Allocatable, Scheduled pods), "Graph links" pills you can click to jump to connected components, and a list of up to 12 related pods with Logs, Shell and Details icons.',
        items: [
          { name: 'Logs and Shell (pods only)', description: 'Footer buttons that open the pod log viewer or an interactive terminal in that pod.' },
          { name: 'Details & commands', description: 'Opens the full details panel (Summary, Events, Commands, Manifest, Describe, and Delete, Scale or Restart where allowed).' },
          { name: 'Ask AI', description: 'Ask the assistant about the selected object.' },
        ],
      },
      { name: 'Resources outside the flow', description: 'A row of counters for objects that are not part of the request flow (for example ConfigMaps, Secrets, PersistentVolumeClaims, Jobs, CronJobs). Each tile links to that resource list; empty ones are dimmed.' },
      { name: 'Warnings card', description: 'Up to 6 recent warning events with reason, object, namespace, message, repeat count and age. A badge shows the total or "clear". Clicking an entry opens that object details panel when it can be opened.' },
      commandsPart('Examples: cluster map data, nodes, services, ingresses and warning events.'),
    ],
    tables: [
      { name: 'Pod chip fields', description: 'Not a table; what each small pod chip shows.', columns: [
        { name: 'Name', meaning: 'Pod name.', example: 'shop-api-7c9d8-abcde' },
        { name: 'Status', meaning: 'Pod state and node on the second line.', example: 'Running, worker-2' },
      ] },
      { name: 'Service card fields', columns: [
        { name: 'Meta line', meaning: 'Service type and cluster IP.', example: 'ClusterIP, 10.96.14.2' },
        { name: 'Badge', meaning: 'First port, or "headless" for services without a cluster IP.', example: '8080' },
      ] },
      { name: 'Workload card fields', columns: [
        { name: 'Meta line', meaning: 'Ready replicas out of wanted, plus the first image.', example: '2/3 ready, api:1.4' },
        { name: 'Badge', meaning: 'Workload status such as Available, Progressing or Unavailable.', example: 'Progressing' },
      ] },
    ],
    example: {
      title: 'Example: trace why a website is down',
      steps: [
        'Open Cluster map and type the app name (for example "shop") in the filter box.',
        'Follow the band left to right: ingress "shop.example.com" with a route line to service "shop-web", then to deployment "shop-web" showing "0/2 ready".',
        'Click the deployment card to see its pods. Pods showing CrashLoopBackOff are the cause.',
        'Press the Logs icon on a pod in the side panel to read why it crashes.',
      ],
    },
    tips: [
      'Press the Problems button to hide everything that is healthy.',
      'A service with no lines to pods usually means its selector matches no pod labels.',
      'The map shows all namespaces; the namespace picker here only filters the drawing.',
    ],
  };

  // ------------------------------------------------------------------ contexts
  data['kubernetes/contexts'] = {
    title: 'Contexts',
    summary: 'Manage which clusters OpsDeck can connect to: see every kubeconfig source and its contexts, switch the active one, import a kubeconfig file, or remove an imported copy.',
    whenToUse: [
      'You want to connect to a new cluster (managed cloud, kind or Minikube).',
      'You need to switch between staging and production clusters.',
      'You want to remove a kubeconfig you imported earlier.',
    ],
    howItWorks: [
      'A kubeconfig is a file with connection details for one or more clusters. Inside it each context bundles a cluster address, a user and a default namespace. OpsDeck reads the files named in the KUBECONFIG variable and ~/.kube/config.',
      'Import kubeconfig lets you choose a file; OpsDeck copies it into its own storage and passes it along when it runs kubectl. OpsDeck never edits ~/.kube/config and never runs "kubectl config use-context".',
      'The page loads when you open it; use Refresh to re-read.',
    ],
    parts: [
      { name: 'Page header', description: 'Buttons: Import kubeconfig (file picker; shows "Kubeconfig imported" or "already imported"), Ask AI and Refresh.' },
      {
        name: 'Source cards',
        description: 'One card per kubeconfig source, two per row. The subtitle says "Imported copy in OpsDeck storage" or "Installed by the user or KUBECONFIG".',
        items: [
          { name: 'Context row', description: 'Context name with an "active" green badge for the one in use, and underneath cluster name, default namespace and server address (for example "minikube, default, https://192.168.49.2:8443").' },
          { name: 'Use button', description: 'Appears on contexts that are not active. Makes that context the active one for the whole workspace.' },
          { name: 'Remove copy (imported sources only)', description: 'Red button that asks for confirmation, then deletes only OpsDeck copy. The original file on disk is untouched.' },
          { name: 'No readable contexts', description: 'Empty state shown when a file has no valid context, with the error if one was found.' },
        ],
      },
      { name: 'No kubeconfig sources', description: 'Empty state with an Import kubeconfig button, shown when nothing was found. kind and Minikube write their config to ~/.kube/config automatically.' },
      commandsPart('Examples: list contexts, current context, a trimmed config view for the selected context and namespaces.'),
      { name: 'Local tools card', description: 'Shows kubectl (required), kind, minikube and Helm install status and an "Install missing tools" button.' },
    ],
    example: {
      title: 'Example: connect to a cloud cluster',
      steps: [
        'Download the kubeconfig file from your cloud provider.',
        'Press Import kubeconfig and choose the file.',
        'A new source card appears with its contexts. Press Use next to the one you want.',
        'Open Cluster overview and check the toolbar badge reads "connected".',
      ],
    },
    tips: [
      'Removing an imported copy does not delete your original kubeconfig file.',
      'If no kubectl is installed you are shown a banner first: use "Install missing tools" or install kubectl yourself.',
    ],
  };

  // ------------------------------------------------------------------ cluster-level lists
  data['kubernetes/namespaces'] = listPage({
    title: 'Namespaces',
    namespaced: false,
    summary: 'Lists every namespace in the cluster. A namespace is a named partition that groups related objects, such as one per team or per environment.',
    whenToUse: ['You want to see what namespaces exist and whether one is stuck terminating.', 'You are choosing which namespace to look into.'],
    how: 'Each row is one namespace. Namespaces separate names and, with quotas and policies, resources, so two teams can both have a pod called "api". Clicking a row shows labels, annotations, events and the manifest.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: namespaces with details, pods in a namespace, quotas and limit ranges, and describe namespace.',
    columns: [
      NAME_COL('Namespace name.'),
      { name: 'Status', meaning: 'Active (green) means usable; Terminating (amber) means deletion is in progress, often stuck on something that cannot be removed.', example: 'Active' },
      AGE_COL,
    ],
    example: { title: 'Example: find a namespace stuck deleting', steps: ['Open Namespaces and look for an amber Terminating status.', 'Click the row and open the Events tab and the Manifest tab for hints.', 'Copy a command from the Commands tab to inspect what remains inside.'] },
    tips: ['Namespaces are read-only here; nothing can be created or deleted from this page.', 'System namespaces such as kube-system hold the cluster own components: avoid touching them.'],
  });

  data['kubernetes/nodes'] = listPage({
    title: 'Nodes',
    namespaced: false,
    summary: 'Lists the machines (physical or virtual) that make up the cluster and run your pods, with readiness and capacity.',
    whenToUse: ['A pod is stuck Pending and you suspect there is no room.', 'A node shows NotReady and you need details.', 'You want to check Kubernetes versions per node.'],
    how: 'A node is one machine in the cluster. Control-plane nodes run the cluster brain; worker nodes run your apps. CPU, Memory and Pods show what the node can offer to pods (allocatable), not what is in use. Click a row for conditions, addresses, capacity, allocatable resources and taints (rules that repel pods).',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: nodes (wide), describe node, pods on this node and node metrics (needs metrics-server).',
    columns: [
      NAME_COL('Node name.'),
      { name: 'Status', meaning: 'Ready (green) or the reason it is not (red).', example: 'Ready; or NotReady' },
      { name: 'Roles', meaning: 'Role labels. "worker" is shown when a node has no special role.', example: 'control-plane' },
      { name: 'Version', meaning: 'Kubelet (node agent) version.', example: 'v1.30.2' },
      { name: 'CPU', meaning: 'Allocatable CPU cores.', example: '4' },
      { name: 'Memory', meaning: 'Allocatable memory.', example: '8039420Ki' },
      { name: 'Pods', meaning: 'Maximum pods this node can hold.', example: '110' },
      AGE_COL,
    ],
    example: { title: 'Example: investigate a NotReady node', steps: ['Open Nodes and find the red status.', 'Click the row, then read the Conditions section in the Summary tab (for example MemoryPressure or DiskPressure).', 'Open the Events tab for kubelet messages, then use the "Pods on node" command to see what is affected.'] },
    tips: ['Nodes are read-only here: OpsDeck does not cordon, drain or delete nodes.', 'Allocatable is a capacity figure; real usage needs metrics-server and the "Node metrics" command.'],
  });

  // ------------------------------------------------------------------ workloads
  data['kubernetes/pods'] = listPage({
    title: 'Pods',
    namespaced: true,
    isPod: true,
    summary: 'Lists pods, the smallest running unit in Kubernetes: one or more containers that run together on a node. This is where you read logs, open a shell and spot crashing apps.',
    whenToUse: ['An app is failing and you want to see its logs.', 'A pod keeps restarting or is stuck Pending.', 'You need a terminal inside a running container.'],
    how: 'Each row is one pod. Pods are usually created and replaced by a Deployment, StatefulSet, DaemonSet or Job, so names carry a random suffix. Status comes from the pod phase, or "Terminating" while it is being deleted. Restarts counts container restarts and turns amber when above zero.',
    rowExtras: podRowExtras(),
    footerText: 'Footer has Open shell, a red Delete button (asks for confirmation, then deletes the pod; a controller will normally create a replacement) and Ask AI. The Logs tab loads the last 300 lines.',
    cmdText: 'Examples: pods (wide), pods not running, describe, logs, previous logs, metrics (needs metrics-server) and copy-only follow-logs and shell.',
    columns: [
      NAME_COL('Pod name.'),
      { name: 'Ready', meaning: 'Containers passing their readiness check out of the total in the pod.', example: '1/2 means one of two containers is ready, so the pod receives no traffic yet' },
      { name: 'Restarts', meaning: 'Total container restarts. Amber when above zero.', example: '14 suggests a crash loop' },
      { name: 'Node', meaning: 'Machine the pod runs on; empty if not scheduled yet.', example: 'worker-2' },
      { name: 'IP', meaning: 'The pod internal cluster IP address.', example: '10.244.1.17' },
      { name: 'Status', meaning: 'Pod state. Running green, Pending amber, Failed red, Succeeded cyan, Terminating amber; waiting reasons such as CrashLoopBackOff appear when Kubernetes reports them.', example: 'Running' },
      AGE_COL,
    ],
    example: { title: 'Example: find why a pod keeps restarting', steps: ['Open Pods and spot a row with a high Restarts value, for example 14, and Ready 0/1.', 'Press the Logs (file) icon to read the last 300 lines; errors at the end usually explain the crash.', 'Press "Previous instance" to see the log of the container before its last restart.', 'Open the details panel and read the Events tab for reasons like OOMKilled or failed probes.'] },
    tips: ['Deleting a pod managed by a Deployment just makes Kubernetes start a new one; delete the Deployment to remove the app.', 'Pod shell tries "sh" inside the container; minimal images may not contain a shell.', 'Use "All namespaces" to find a pod when you do not know where it lives.'],
  });

  data['kubernetes/deployments'] = listPage({
    title: 'Deployments',
    namespaced: true,
    summary: 'Lists Deployments, the standard way to run a stateless app: you say which image and how many copies you want, and Kubernetes keeps that many pods running and handles updates.',
    whenToUse: ['You want to scale an app up or down.', 'You need to restart an app after changing config.', 'A rollout looks stuck (Progressing or Unavailable).'],
    how: 'Each row is one Deployment. It manages pods through a replica set: change the image and pods are replaced gradually (a rolling update). Status: Available (green) all replicas ready, Progressing (amber) some are, Unavailable (red) none, Scaled to zero (grey).',
    footerText: 'Footer has Scale (asks for a replica number from 0 to 1000; 0 stops all pods but keeps the Deployment), Restart rollout (asks for confirmation, then replaces pods one at a time), a red Delete button and Ask AI.',
    cmdText: 'Examples: describe, rollout status, rollout history, pods, and write commands for scale and restart.',
    columns: [
      NAME_COL('Deployment name.'),
      { name: 'Ready', meaning: 'Ready replicas out of the desired count.', example: '2/3 means one pod is not ready yet' },
      { name: 'Updated', meaning: 'Replicas already running the newest pod template.', example: '3' },
      { name: 'Available', meaning: 'Replicas ready for long enough to count as available.', example: '3' },
      { name: 'Image', meaning: 'Container image of the first container.', example: 'nginx:1.25' },
      { name: 'Status', meaning: 'Summary of the columns above.', example: 'Progressing' },
      AGE_COL,
    ],
    example: { title: 'Example: scale a Deployment to 5 replicas', steps: ['Open Deployments and click the row for "shop-api".', 'Press Scale in the footer and enter 5.', 'After the page reloads, the Ready column moves from 3/5 to 5/5 as new pods start.', 'If it stays below 5, open Pods and check the new pods for Pending or errors.'] },
    tips: ['Scaling to 0 is a quick way to pause an app without losing its configuration.', 'Restart rollout replaces pods gradually, so users should not see downtime.', 'Delete removes the Deployment and its pods.'],
  });

  data['kubernetes/statefulsets'] = listPage({
    title: 'StatefulSets',
    namespaced: true,
    summary: 'Lists StatefulSets, which run apps that need a stable identity and their own storage, such as databases and message brokers.',
    whenToUse: ['You run a database or queue inside the cluster and want to check it.', 'You need to scale or restart a stateful app.'],
    how: 'Unlike a Deployment, StatefulSet pods get fixed names (db-0, db-1) and start in order, and each can keep its own volume. Status is Ready (green) when ready replicas reach the desired count, Progressing (amber) otherwise, Scaled to zero (grey).',
    footerText: 'Footer has Scale (0 to 1000), Restart rollout, a red Delete button and Ask AI.',
    cmdText: 'Examples: describe, rollout status, rollout history, pods, plus write commands for scale and restart.',
    columns: [
      NAME_COL('StatefulSet name.'),
      { name: 'Ready', meaning: 'Ready replicas out of desired.', example: '2/3' },
      { name: 'Current', meaning: 'Replicas running the current revision.', example: '3' },
      { name: 'Updated', meaning: 'Replicas running the newest revision.', example: '3' },
      { name: 'Image', meaning: 'Image of the first container.', example: 'postgres:16' },
      { name: 'Status', meaning: 'Ready, Progressing or Scaled to zero.', example: 'Ready' },
      AGE_COL,
    ],
    example: { title: 'Example: check a database cluster after a restart', steps: ['Open StatefulSets and find "postgres".', 'Read Ready: 3/3 means every instance is back.', 'If it shows 2/3, click the row and open the Events tab, then look at the matching pod (postgres-2) on the Pods page.'] },
    tips: ['Deleting a StatefulSet usually leaves its volumes (claims) in place; check Volume claims afterwards.', 'Scale down removes the highest-numbered pod first.'],
  });

  data['kubernetes/daemonsets'] = listPage({
    title: 'DaemonSets',
    namespaced: true,
    summary: 'Lists DaemonSets, which run exactly one pod on every node (or a chosen set of nodes). Typical uses are log shippers, monitoring agents and network plugins.',
    whenToUse: ['You want to know whether a node agent runs on every node.', 'A new node has no log or monitoring agent.'],
    how: 'The count of pods follows the count of nodes, so there is no replica number to set. Status: Ready (green) when ready reaches desired, Progressing (amber) if some are available, Unavailable (red) if none.',
    footerText: 'Footer has Restart rollout (no Scale, since the count follows nodes), a red Delete button and Ask AI.',
    cmdText: 'Examples: describe, rollout status, rollout history, pods, and a write command for restart.',
    columns: [
      NAME_COL('DaemonSet name.'),
      { name: 'Desired', meaning: 'Nodes that should run a pod.', example: '3' },
      { name: 'Ready', meaning: 'Pods that are ready.', example: '2' },
      { name: 'Available', meaning: 'Pods available for long enough.', example: '2' },
      { name: 'Updated', meaning: 'Pods running the newest template.', example: '3' },
      { name: 'Image', meaning: 'Image of the first container.', example: 'fluent/fluent-bit:3.0' },
      { name: 'Status', meaning: 'Ready, Progressing or Unavailable.', example: 'Progressing' },
      AGE_COL,
    ],
    example: { title: 'Example: find a node missing its agent', steps: ['Open DaemonSets and compare Desired (3) with Ready (2).', 'Open Pods, filter by the DaemonSet name and look for the Node column that has no pod or a failing one.', 'Read that pod Events tab for the reason.'] },
    tips: ['System DaemonSets (for example kube-proxy in kube-system) are essential; restarting them briefly disturbs networking.'],
  });

  data['kubernetes/jobs'] = listPage({
    title: 'Jobs',
    namespaced: true,
    summary: 'Lists Jobs: one-off tasks that run a pod until it finishes successfully, such as a database migration or a batch import.',
    whenToUse: ['You want to know if a batch task finished or failed.', 'A CronJob started a Job and you need its result.'],
    how: 'A Job creates pods and retries on failure until the wanted number of completions succeed. Status: Complete (green), Failed (red), Running (cyan, pods active), Pending (amber).',
    footerText: DELETE_ONLY_FOOTER + ' Deleting a finished job also removes its pods and logs.',
    cmdText: 'Examples: jobs (wide), describe, logs of the job first pod and pods.',
    columns: [
      NAME_COL('Job name. Jobs from a CronJob end in a timestamp-like suffix.'),
      { name: 'Completions', meaning: 'Succeeded pods out of the wanted number.', example: '1/1 means done' },
      { name: 'Succeeded', meaning: 'Number of pods that finished successfully.', example: '1' },
      { name: 'Failed', meaning: 'Number of failed pods; red when above zero.', example: '3 means three attempts failed' },
      { name: 'Active', meaning: 'Pods running right now.', example: '1' },
      { name: 'Duration', meaning: 'Time from start to completion (or until now if still running).', example: '45s or 12m' },
      { name: 'Status', meaning: 'Complete, Failed, Running or Pending.', example: 'Failed' },
      AGE_COL,
    ],
    example: { title: 'Example: see why a migration job failed', steps: ['Open Jobs and click the red Failed row.', 'Use the Commands tab "Logs" entry and press play to read the first pod log.', 'Fix the cause, delete the old Job and start it again from your manifest (OpsDeck does not create Jobs).'] },
    tips: ['A Job that has finished stays listed until it is deleted.', 'Failed 3 usually means retries ran out (backoff limit), shown in the Summary tab.'],
  });

  data['kubernetes/cronjobs'] = listPage({
    title: 'CronJobs',
    namespaced: true,
    summary: 'Lists CronJobs: Jobs that Kubernetes starts on a schedule, like the Linux cron tool. Used for backups, reports and cleanups.',
    whenToUse: ['You want to confirm a scheduled task is running when expected.', 'A scheduled task seems paused (suspended).'],
    how: 'The Schedule column uses cron syntax (five fields: minute, hour, day of month, month, day of week). Each run creates a Job, which you can see on the Jobs page. Status: Suspended (amber), Active (green, a job is running now), Idle (grey).',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'Examples: cronjobs, describe, jobs, and a write command "Trigger now" that creates a one-off Job from the CronJob.',
    columns: [
      NAME_COL('CronJob name.'),
      { name: 'Schedule', meaning: 'Cron expression for when it runs.', example: '0 2 * * * means every day at 02:00' },
      { name: 'Suspended', meaning: 'Badge: "active" (green) if it will run on schedule or "suspended" (amber) if paused.', example: 'active' },
      { name: 'Active', meaning: 'Number of jobs running now.', example: '0' },
      { name: 'Last Schedule', meaning: 'Time of the last run.', example: 'a timestamp such as 2026-11-12T02:00:00Z' },
      { name: 'Status', meaning: 'Suspended, Active or Idle.', example: 'Idle' },
      AGE_COL,
    ],
    example: { title: 'Example: check last night backup ran', steps: ['Open CronJobs and find "nightly-backup" with schedule 0 2 * * *.', 'Look at Last Schedule to see it ran at 02:00.', 'Open Jobs to see whether the Job it created is Complete or Failed.'] },
    tips: ['Times are in UTC unless the CronJob sets a time zone.', 'Use the "Trigger now" command (it asks for confirmation) to run it once manually.'],
  });

  // ------------------------------------------------------------------ networking
  data['kubernetes/services'] = listPage({
    title: 'Services',
    namespaced: true,
    summary: 'Lists Services: stable network addresses that give a group of pods one name and IP, so other apps can reach them even as pods come and go.',
    whenToUse: ['An app cannot reach another app inside the cluster.', 'You need to know which port or external address an app is exposed on.'],
    how: 'A Service picks pods using its Selector (label match) and balances traffic between them. Type decides who can reach it: ClusterIP (inside only), NodePort (also on a port of every node), LoadBalancer (an external IP from the cloud), ExternalName (an alias to an outside DNS name).',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'Examples: services (wide), endpoints, describe, and a copy-only port-forward command.',
    columns: [
      NAME_COL('Service name, also its DNS name inside the namespace.'),
      { name: 'Type', meaning: 'ClusterIP (grey), NodePort (violet), LoadBalancer (cyan), ExternalName (amber).', example: 'LoadBalancer' },
      { name: 'Cluster IP', meaning: 'Internal virtual IP. "None" means a headless service.', example: '10.96.14.2' },
      { name: 'External', meaning: 'External IPs or load balancer address, if any.', example: '34.120.1.5' },
      { name: 'Ports', meaning: 'Service port, protocol and, for NodePort, the node port after an arrow.', example: '80/TCP->30080' },
      { name: 'Selector', meaning: 'Labels used to find the backing pods.', example: 'app=shop-web' },
      AGE_COL,
    ],
    example: { title: 'Example: find why a service has no backends', steps: ['Open Services and note the Selector of "shop-web" (app=shop-web).', 'Run the "Endpoints" command from the Commands tab; empty endpoints mean no ready pod matches.', 'Open Pods and check that pods carry the label app=shop-web and show Ready.'] },
    tips: ['A "pending" external address on a LoadBalancer usually means the cloud has not assigned one yet.', 'Port-forward is copy-only because it needs your own terminal.'],
  });

  data['kubernetes/ingresses'] = listPage({
    title: 'Ingresses',
    namespaced: true,
    summary: 'Lists Ingresses: rules that route web traffic from outside the cluster (by host name and path) to Services inside it.',
    whenToUse: ['A website is unreachable and you want to check its routing rules.', 'You need to see which host names and TLS settings exist.'],
    how: 'An Ingress is only a set of rules; an ingress controller (for example nginx) must be installed to act on them. Class tells which controller handles it. Address is filled in when the controller is exposed. The details panel Summary lists rules as host and path to service.',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'Examples: ingresses (wide), ingress classes (installed controllers) and describe.',
    columns: [
      NAME_COL('Ingress name.'),
      { name: 'Class', meaning: 'Which ingress controller handles it.', example: 'nginx' },
      { name: 'Hosts', meaning: 'Host names the rules answer to.', example: 'shop.example.com' },
      { name: 'TLS', meaning: '"yes" if HTTPS certificates are configured, otherwise "no".', example: 'yes' },
      { name: 'Address', meaning: 'External IP or host name assigned by the controller.', example: '203.0.113.10' },
      AGE_COL,
    ],
    example: { title: 'Example: check that HTTPS is configured', steps: ['Open Ingresses and look for your host in the Hosts column.', 'The TLS column should read "yes".', 'Click the row and read the Rules section for host/path to service mappings, then check the Services page that the target service exists.'] },
    tips: ['An empty Address often means the ingress controller is missing or not ready.', 'No Class on a cluster with several controllers can mean nobody handles the rule.'],
  });

  data['kubernetes/networkpolicies'] = listPage({
    title: 'Network policies',
    namespaced: true,
    summary: 'Lists NetworkPolicies: firewall-like rules that decide which pods may talk to which others.',
    whenToUse: ['Pods cannot reach each other and you suspect a policy blocks them.', 'You are reviewing how locked down a namespace is.'],
    how: 'By default every pod can reach every pod. Once a policy selects a pod, only the traffic the policy allows gets through. Types lists whether it controls Ingress (incoming) traffic, Egress (outgoing), or both. Enforcement needs a network plugin that supports policies.',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'Examples: policies, describe and pods with their labels (policies match by label).',
    columns: [
      NAME_COL('Policy name.'),
      { name: 'Pod selector', meaning: 'Labels of the pods the policy applies to. "All pods" means every pod in the namespace.', example: 'app=db' },
      { name: 'Types', meaning: 'Directions the policy controls.', example: 'Ingress, Egress' },
      AGE_COL,
    ],
    example: { title: 'Example: why can the web pod not reach the database?', steps: ['Open Network policies and look for a policy whose Pod selector is app=db.', 'Click it and read the Summary or Describe tab for the allowed sources.', 'Use the "Pods" command to check the web pod labels match an allowed source.'] },
    tips: ['A policy with an empty selector ("All pods") and Ingress type but no allow rules blocks all incoming traffic.', 'Deleting a policy opens traffic again, so be careful in production.'],
  });

  // ------------------------------------------------------------------ storage
  data['kubernetes/persistentvolumes'] = listPage({
    title: 'Persistent volumes',
    namespaced: false,
    summary: 'Lists PersistentVolumes (PVs): pieces of real storage (a cloud disk, an NFS share, a local folder) that are available to the cluster.',
    whenToUse: ['A volume claim is stuck Pending and you want to know whether a matching volume exists.', 'You want to see which claim uses which volume, or find leftover Released volumes.'],
    how: 'A PV is the storage itself; a claim (PVC) is a request for storage. Kubernetes binds them. Usually PVs are created automatically by a storage class. Status: Bound (green, used by a claim), Available (free), Released (amber, claim deleted but not yet recycled), Failed (red).',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: volumes, describe and claims in all namespaces.',
    columns: [
      NAME_COL('Volume name, often pvc- followed by a random id.'),
      { name: 'Capacity', meaning: 'Size of the volume.', example: '10Gi' },
      { name: 'Access', meaning: 'How it can be mounted: ReadWriteOnce (one node), ReadOnlyMany, ReadWriteMany (many nodes).', example: 'ReadWriteOnce' },
      { name: 'Reclaim', meaning: 'What happens when the claim is deleted: Delete (storage removed) or Retain (kept for manual cleanup).', example: 'Delete' },
      { name: 'Status', meaning: 'Bound, Available, Released or Failed.', example: 'Bound' },
      { name: 'Claim', meaning: 'Namespace and name of the claim using it.', example: 'shop/data-postgres-0' },
      { name: 'Class', meaning: 'Storage class that created it.', example: 'standard' },
      AGE_COL,
    ],
    example: { title: 'Example: find leftover volumes', steps: ['Open Persistent volumes and look for amber Released rows.', 'The Claim column shows which claim used it earlier.', 'With reclaim policy Retain, the data is still there: decide whether to reuse or clean it up with your own tools.'] },
    tips: ['PVs are read-only in OpsDeck: nothing can be deleted here.', 'A Retain policy protects data but leaves volumes (and cost) behind.'],
  });

  data['kubernetes/persistentvolumeclaims'] = listPage({
    title: 'Volume claims',
    namespaced: true,
    summary: 'Lists PersistentVolumeClaims (PVCs): requests for storage made by apps. A pod mounts a claim to get a disk that survives restarts.',
    whenToUse: ['A pod is stuck Pending waiting for storage.', 'You want to see how much storage each app asked for.'],
    how: 'A claim states a size, access mode and storage class. Kubernetes finds or creates a matching volume (PV) and binds it. Status: Bound (green) means ready, Pending (amber) means still waiting.',
    footerText: DELETE_ONLY_FOOTER + ' Deleting a claim can delete the data, depending on the volume reclaim policy.',
    cmdText: 'Examples: claims (wide), describe and a list of pods in the namespace that may mount the claim.',
    columns: [
      NAME_COL('Claim name.'),
      { name: 'Status', meaning: 'Bound, Pending, or Lost (red).', example: 'Bound' },
      { name: 'Volume', meaning: 'Name of the PV it is bound to.', example: 'pvc-3f9a...' },
      { name: 'Capacity', meaning: 'Actual size granted.', example: '10Gi' },
      { name: 'Access', meaning: 'Access modes.', example: 'ReadWriteOnce' },
      { name: 'Class', meaning: 'Storage class used.', example: 'standard' },
      AGE_COL,
    ],
    example: { title: 'Example: a database pod is Pending', steps: ['Open Volume claims and find "data-postgres-0".', 'If its Status is Pending, open the Events tab: messages like "no persistent volumes available" or "storageclass not found" explain why.', 'Check the Storage classes page for a default class.'] },
    tips: ['Deleting a claim in use by a running pod is risky; stop the pod first.', 'Pending with class empty usually means there is no default storage class.'],
  });

  data['kubernetes/storageclasses'] = listPage({
    title: 'Storage classes',
    namespaced: false,
    summary: 'Lists StorageClasses: templates that tell Kubernetes how to create storage automatically when a claim asks for it (which provider, what policy).',
    whenToUse: ['A claim is Pending and you need to know if a default class exists.', 'You want to see which storage backends the cluster offers.'],
    how: 'When a claim names a class (or no class, to use the default), the class provisioner creates a matching volume. The Default badge is green on the class used when a claim does not specify one.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: storage classes and describe (reclaim policy, binding mode, parameters).',
    columns: [
      NAME_COL('Class name.'),
      { name: 'Provisioner', meaning: 'The driver that creates the storage.', example: 'rancher.io/local-path' },
      { name: 'Reclaim', meaning: 'Default reclaim policy for volumes it creates (Delete or Retain).', example: 'Delete' },
      { name: 'Binding', meaning: 'When a volume is created: Immediate, or WaitForFirstConsumer (when a pod needs it).', example: 'WaitForFirstConsumer' },
      { name: 'Expansion', meaning: '"yes" if claims can be resized later.', example: 'yes' },
      { name: 'Default', meaning: 'Green "default" badge if it is the default class, else "no".', example: 'default' },
      AGE_COL,
    ],
    example: { title: 'Example: check there is a default class', steps: ['Open Storage classes.', 'Look for a green "default" badge in the Default column.', 'If none exists, claims without a class stay Pending.'] },
    tips: ['WaitForFirstConsumer is normal: claims stay Pending until a pod uses them.'],
  });

  // ------------------------------------------------------------------ configuration
  data['kubernetes/configmaps'] = listPage({
    title: 'ConfigMaps',
    namespaced: true,
    summary: 'Lists ConfigMaps: bundles of non-secret settings (key-value pairs or whole files) that pods read as environment variables or mounted files.',
    whenToUse: ['You want to know which settings an app gets.', 'An app behaves differently after a config change and you want to see the keys.'],
    how: 'A ConfigMap keeps configuration separate from the container image, so you can change settings without rebuilding. The Keys column counts entries. Pods usually need a restart to pick up changes.',
    footerText: DELETE_ONLY_FOOTER + ' Deleting a ConfigMap that pods use can break them.',
    cmdText: 'Examples: configmaps, describe and a keys-only command (names without values).',
    columns: [
      NAME_COL('ConfigMap name.'),
      { name: 'Keys', meaning: 'How many entries (text and binary) it holds.', example: '3 could be LOG_LEVEL, API_URL and app.conf' },
      AGE_COL,
    ],
    example: { title: 'Example: see which settings an app reads', steps: ['Open ConfigMaps and click "shop-config".', 'Read the Summary tab for key names and open the Manifest tab for the values.', 'To apply a change, restart the Deployment that uses it from the Deployments page.'] },
    tips: ['Never store passwords in a ConfigMap; use Secrets.', 'Values are visible in the Manifest and Describe tabs for ConfigMaps.'],
  });

  data['kubernetes/secrets'] = listPage({
    title: 'Secrets',
    namespaced: true,
    summary: 'Lists Secrets: objects that hold sensitive data such as passwords, tokens and TLS certificates. OpsDeck shows names, types and key counts, never the values.',
    whenToUse: ['You want to check a secret exists and has the expected keys.', 'A pod fails to start because a secret is missing.'],
    how: 'Secrets are meant for sensitive data that pods read as environment variables or files. Type tells their purpose, for example Opaque (generic) or kubernetes.io/tls (certificate). A footer on the card reminds you: "Secret values are never read into this view".',
    footerText: DELETE_ONLY_FOOTER + ' The Manifest tab never contains secret values, and the Commands tab omits JSON output for secrets.',
    cmdText: 'Examples: secrets, describe (key names and sizes only) and a keys-only command.',
    columns: [
      NAME_COL('Secret name.'),
      { name: 'Type', meaning: 'Kind of secret. kubernetes.io/tls is cyan; others such as Opaque are amber.', example: 'kubernetes.io/tls' },
      { name: 'Keys', meaning: 'Number of data entries.', example: '2 (tls.crt and tls.key)' },
      AGE_COL,
    ],
    example: { title: 'Example: verify a TLS secret exists', steps: ['Open Secrets and look for "shop-tls".', 'Type should read kubernetes.io/tls and Keys 2.', 'Click the row and use the Events tab or Describe tab for problems; key names show, values do not.'] },
    tips: ['Deleting a secret can break pods that use it; there is no undo.', 'Secrets are only base64-encoded in Kubernetes, not encrypted by default, which is why OpsDeck never displays them.'],
  });

  data['kubernetes/resourcequotas'] = listPage({
    title: 'Resource quotas',
    namespaced: true,
    summary: 'Lists ResourceQuotas: limits on how much a namespace may use in total (CPU, memory, number of pods and so on).',
    whenToUse: ['New pods are refused with "exceeded quota".', 'You want to see how close a namespace is to its limit.'],
    how: 'A quota sets a hard cap for the whole namespace. The Usage column shows used/limit for up to six resources. When a limit is reached Kubernetes refuses new objects.',
    footerText: DELETE_ONLY_FOOTER + ' Deleting a quota removes the cap.',
    cmdText: 'Examples: quotas and describe (hard limits and current usage).',
    columns: [
      NAME_COL('Quota name.'),
      { name: 'Usage', meaning: 'Used / hard limit per resource, comma separated.', example: 'pods 8/10, requests.cpu 3/4 means 8 of 10 pods and 3 of 4 CPU requested' },
      AGE_COL,
    ],
    example: { title: 'Example: a deployment cannot add pods', steps: ['Open Resource quotas in the namespace.', 'Read Usage, for example pods 10/10: the cap is reached.', 'Raise the quota with your own tools or free up capacity by scaling something else down.'] },
    tips: ['Quotas count requests, not real usage.', 'Open the details Summary tab for the full Hard and Used lists.'],
  });

  data['kubernetes/limitranges'] = listPage({
    title: 'Limit ranges',
    namespaced: true,
    summary: 'Lists LimitRanges: per-pod or per-container defaults and min/max sizes for CPU and memory inside a namespace.',
    whenToUse: ['Pods get unexpected CPU or memory values you did not set.', 'A pod is rejected because it asks for too much or too little.'],
    how: 'If a container does not state its own requests and limits, the LimitRange fills in defaults. It can also reject values outside min or max. The Limits column summarizes each type with the number of defaults and maxima.',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'Examples: limit ranges and describe (hard limits and current values).',
    columns: [
      NAME_COL('Limit range name.'),
      { name: 'Limits', meaning: 'Each limit type with how many default and max values it sets.', example: 'Container (2 defaults, 1 max)' },
      AGE_COL,
    ],
    example: { title: 'Example: why does my pod get 500m CPU?', steps: ['Open Limit ranges for the namespace.', 'Click the row and read the Summary tab: a default CPU limit of 500m is applied to containers without their own.', 'Set explicit resources in your Deployment to override it.'] },
    tips: ['Limit ranges apply only to new pods, not existing ones.'],
  });

  // ------------------------------------------------------------------ security
  data['kubernetes/serviceaccounts'] = listPage({
    title: 'Service accounts',
    namespaced: true,
    summary: 'Lists ServiceAccounts: identities that pods use when they talk to the Kubernetes API.',
    whenToUse: ['A pod gets "forbidden" errors from the API.', 'You want to know which identities exist in a namespace.'],
    how: 'Every pod runs as a service account (the "default" one unless set). Permissions come from Role bindings that point at the account. Automount says whether its token is mounted into pods automatically.',
    footerText: DELETE_ONLY_FOOTER + ' Pods using a deleted account may fail to start.',
    cmdText: 'Examples: service accounts, describe and a copy-only "Permissions" command (kubectl auth can-i --list as that account).',
    columns: [
      NAME_COL('Service account name.'),
      { name: 'Secrets', meaning: 'Number of secrets linked to it.', example: '0 on current Kubernetes versions' },
      { name: 'Pull secrets', meaning: 'Number of image pull secrets (for private image registries).', example: '1' },
      { name: 'Automount', meaning: 'Whether the API token is auto-mounted: yes, no, or default.', example: 'default' },
      AGE_COL,
    ],
    example: { title: 'Example: give a pod access to a private registry', steps: ['Open Service accounts and find the account the pod uses.', 'Check Pull secrets is at least 1.', 'If 0, the registry login must be added to the account with your own tools.'] },
    tips: ['Automount "no" improves security for pods that never call the API.', 'See Role bindings to learn what an account may do.'],
  });

  data['kubernetes/roles'] = listPage({
    title: 'Roles',
    namespaced: true,
    summary: 'Lists Roles: sets of permissions (RBAC rules) that apply inside one namespace, such as "may read pods".',
    whenToUse: ['You want to see what permissions a role grants.', 'You are auditing who can delete things in a namespace.'],
    how: 'A Role by itself grants nothing; a Role binding attaches it to a user, group or service account. Rules list verbs (get, list, create, delete...) on resources (pods, secrets...). Click a row to see each rule written as "verbs on resources".',
    footerText: DELETE_ONLY_FOOTER,
    cmdText: 'Examples: roles, describe (resources, verbs, API groups) and an "auth can-i" listing for the active user.',
    columns: [
      NAME_COL('Role name.'),
      { name: 'Rules', meaning: 'Number of permission rules.', example: '3' },
      { name: 'Verbs', meaning: 'Distinct actions granted across rules (first 8).', example: 'get, list, watch' },
      AGE_COL,
    ],
    example: { title: 'Example: check a read-only role', steps: ['Open Roles and click "pod-reader".', 'Read the Rules section, for example "get, list, watch on pods".', 'Open Role bindings to see who has this role.'] },
    tips: ['Verbs such as "*" or delete on secrets are powerful; look at them first.', 'For cluster-wide permissions see Cluster roles.'],
  });

  data['kubernetes/rolebindings'] = listPage({
    title: 'Role bindings',
    namespaced: true,
    summary: 'Lists RoleBindings: links that give a Role (or ClusterRole) to users, groups or service accounts inside one namespace.',
    whenToUse: ['You want to know who has access to a namespace.', 'A person or app is denied and you need to check its binding.'],
    how: 'A binding says "subject X gets role Y in this namespace". The Role column shows kind and name (Role/pod-reader or ClusterRole/view). Subjects shows up to four entries written as kind:name.',
    footerText: DELETE_ONLY_FOOTER + ' Deleting it removes the access it granted.',
    cmdText: 'Examples: role bindings and describe (role reference and subjects).',
    columns: [
      NAME_COL('Binding name.'),
      { name: 'Role', meaning: 'The Role or ClusterRole being granted.', example: 'ClusterRole/view' },
      { name: 'Subjects', meaning: 'Who receives it: kind:name, up to four.', example: 'ServiceAccount:ci-bot, User:anna' },
      AGE_COL,
    ],
    example: { title: 'Example: who can edit the shop namespace?', steps: ['Open Role bindings with namespace "shop".', 'Look for roles such as ClusterRole/edit or ClusterRole/admin.', 'Read the Subjects column to see the users and service accounts.'] },
    tips: ['A ClusterRole used in a RoleBinding only applies in this namespace.'],
  });

  data['kubernetes/clusterroles'] = listPage({
    title: 'Cluster roles',
    namespaced: false,
    summary: 'Lists ClusterRoles: permission sets that are defined for the whole cluster, including access to cluster-wide objects like nodes.',
    whenToUse: ['You want to know what built-in roles like admin, edit, view and cluster-admin allow.', 'You are auditing powerful roles.'],
    how: 'Like a Role, but not tied to a namespace. They can be granted cluster-wide (Cluster role binding) or reused inside one namespace (Role binding). The cluster-admin role can do anything.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: cluster roles, describe and an "auth can-i" listing for the active user.',
    columns: [
      NAME_COL('Role name. Names starting with system: belong to Kubernetes itself.'),
      { name: 'Rules', meaning: 'Number of permission rules.', example: '12' },
      { name: 'Verbs', meaning: 'Distinct actions granted (first 8).', example: 'get, list, watch, create' },
      AGE_COL,
    ],
    example: { title: 'Example: review the built-in view role', steps: ['Open Cluster roles and click "view".', 'Read the Rules in the Summary tab: only get, list and watch.', 'Open Cluster bindings or Role bindings to see who uses it.'] },
    tips: ['Cluster roles are read-only here.', 'Many system: roles are required for the cluster to work.'],
  });

  data['kubernetes/clusterrolebindings'] = listPage({
    title: 'Cluster bindings',
    namespaced: false,
    summary: 'Lists ClusterRoleBindings: links that give a ClusterRole to users, groups or service accounts across the whole cluster.',
    whenToUse: ['You want to know who has cluster-wide access, especially cluster-admin.', 'Auditing for overly broad permissions.'],
    how: 'Unlike a Role binding, the grant applies in every namespace and to cluster-wide objects. The Role column shows the granted role, Subjects shows up to four holders.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: cluster role bindings and describe.',
    columns: [
      NAME_COL('Binding name.'),
      { name: 'Role', meaning: 'The ClusterRole granted.', example: 'ClusterRole/cluster-admin' },
      { name: 'Subjects', meaning: 'Who gets it, as kind:name (up to four).', example: 'User:anna, Group:system:masters' },
      AGE_COL,
    ],
    example: { title: 'Example: find who is cluster-admin', steps: ['Open Cluster bindings.', 'Look for rows whose Role is ClusterRole/cluster-admin.', 'Read Subjects, and click the row for the full list.'] },
    tips: ['Few subjects should hold cluster-admin; extra ones are a security risk.', 'Read-only in OpsDeck.'],
  });

  // ------------------------------------------------------------------ helm
  data['kubernetes/helm'] = {
    title: 'Helm releases',
    summary: 'Lists applications installed in the cluster with Helm, the Kubernetes package manager.',
    whenToUse: ['You want to know which apps (charts) are installed and at which version.', 'You want to see whether a release deployed successfully.'],
    howItWorks: [
      'A chart is a packaged application; installing it creates a release (a named instance, for example "grafana"). Each upgrade increases the Revision number.',
      'The list is produced by the real Helm binary using the selected context. If Helm is not installed, the page shows an amber "Helm is not ready" notice with an "Open tools" button.',
      'This page is read-only and its rows do not open a side panel. The page reads once when opened; use Refresh to update.',
    ].concat(COMMON_HOW),
    parts: [
      toolbarPart(true),
      { name: 'Releases card', description: 'Subtitle shows the release count (and "showing first 500 of N" when truncated). Empty state: "No Helm releases".' },
      { name: 'Ready-made Helm commands', description: 'Copy-only commands for releases, status, history and values. They use --kube-context so they hit the selected cluster. Paste them in your own terminal; they cannot be run from here.' },
    ],
    tables: [{ name: 'Releases table', columns: [
      NAME_COL('Release name.'),
      { name: 'Namespace', meaning: 'Namespace the release lives in.', example: 'monitoring' },
      { name: 'Revision', meaning: 'Upgrade counter. 1 is the first install.', example: '4' },
      { name: 'Updated', meaning: 'When the release last changed.', example: 'a timestamp' },
      { name: 'Status', meaning: 'Release state reported by Helm.', example: 'deployed, failed or pending-upgrade' },
      { name: 'Chart', meaning: 'Chart name and version.', example: 'grafana-7.3.0' },
      { name: 'App version', meaning: 'Version of the application the chart installs.', example: '10.4.1' },
    ] }],
    example: {
      title: 'Example: check whether an upgrade succeeded',
      steps: ['Open Helm releases and turn on "All namespaces" if you do not know where it lives.', 'Find the release and read Status: "deployed" is good, "failed" is not.', 'Copy the "History" command and run it in your terminal to see earlier revisions.'],
    },
    tips: ['Helm is installed from Local tools if it is missing.', 'The Helm commands change nothing; they only read.'],
  };

  // ------------------------------------------------------------------ events
  data['kubernetes/events'] = listPage({
    title: 'Events',
    namespaced: true,
    summary: 'Lists cluster events: short messages Kubernetes records when something happens to an object, such as a pod being scheduled, an image failing to pull or a probe failing.',
    whenToUse: ['Something is not working and you want the cluster own explanation.', 'You want to see what happened recently in a namespace.'],
    how: 'Events are sorted newest first. They are kept only for a short time (about an hour), so older history is gone. Warning events are amber, normal ones are grey. Count says how often the same event repeated.',
    footerText: READ_ONLY_FOOTER,
    cmdText: 'Examples: recent events, only warnings, and events across all namespaces.',
    columns: [
      { name: 'Type', meaning: 'Normal (grey) or Warning (amber).', example: 'Warning' },
      { name: 'Reason', meaning: 'Short code for what happened.', example: 'BackOff, FailedScheduling, Pulled, Killing' },
      { name: 'Object', meaning: 'Kind and name of the object concerned.', example: 'Pod/shop-api-7c9d8-abcde' },
      { name: 'Namespace', meaning: 'Namespace of the object.', example: 'shop' },
      { name: 'Count', meaning: 'How many times it occurred.', example: '37 means repeated 37 times' },
      { name: 'Message', meaning: 'Human-readable detail (cut after 180 characters).', example: 'Back-off restarting failed container' },
      AGE_COL,
    ],
    example: { title: 'Example: find why a pod will not start', steps: ['Open Events and read the newest Warning rows.', 'A row "FailedScheduling, Pod/shop-api-..., 0/3 nodes are available: insufficient memory" says the pod has no room.', 'Click the row for the full event, then open Nodes to check capacity.'] },
    tips: ['If the list is empty the events have probably expired, not that nothing happened.', 'A high Count on a Warning usually means a loop that keeps failing.'],
  });

  // ------------------------------------------------------------------ console
  data['kubernetes/console'] = {
    title: 'Kubectl console',
    summary: 'Run real kubectl commands against the selected cluster from inside OpsDeck, with the context enforced and safety rules applied.',
    whenToUse: ['You know a kubectl command and want to run it quickly without leaving the app.', 'You want a ready example to start from.'],
    howItWorks: [
      'kubectl is the standard command-line tool for Kubernetes. Type a command that starts with kubectl and press Run. OpsDeck runs it with the selected context and, when you leave it out, adds the selected namespace automatically.',
      'Commands run without a host shell, so pipes, redirects and shell tricks do not work. Streaming flags (such as -f), port-forward, proxy, attach, edit and anything that changes kubeconfig are rejected. Pod terminals have their own Shell button on the Pods page.',
      'Only the result of the last command is shown. Use the arrow keys to recall earlier commands.',
    ].concat(COMMON_HOW),
    parts: [
      toolbarPart(true),
      { name: 'Console card', description: 'Subtitle shows the active context and namespace.', items: [
        { name: 'Suggestion chips', description: 'Up to four one-click examples (for example Pods, All resources, Events, Nodes). A chip fills the input; it does not run until you press Run.' },
        { name: 'Command input', description: 'Prompt "$" and a text box with placeholder "kubectl get pods -o wide". Press Up and Down to move through the commands you ran in this session.' },
        { name: 'Run', description: 'Runs the command. The button shows "Running..." while waiting. A failed command also shows an error toast.' },
        { name: 'Clear', description: 'Resets the output area to "Console cleared".' },
        { name: 'Output entry', description: 'Shows the full command, an exit badge (green "exit 0" on success, red "exit 1" or "timed out" on failure) and the output text. The expand icon opens the output fullscreen in a side panel, where Copy output is also available.' },
        { name: 'Empty state', description: '"No commands yet": type a command or pick a suggestion.' },
      ] },
      commandsPart('Examples: pods, all resources, events and nodes, plus copy-only commands to describe a pod or read its logs (replace POD with a real pod name).'),
    ],
    tables: [{ name: 'Safe command examples', description: 'Not a table in the app; examples of what you can type.', columns: [
      { name: 'kubectl get pods -o wide', meaning: 'List pods with node and IP in the selected namespace.', example: 'Output has columns NAME READY STATUS RESTARTS AGE IP NODE' },
      { name: 'kubectl get events --sort-by=.lastTimestamp', meaning: 'Newest events last.', example: 'Shows BackOff or FailedScheduling lines' },
      { name: 'kubectl describe pod shop-api-1', meaning: 'Detailed report about one pod.', example: 'Ends with an Events section' },
    ] }],
    example: {
      title: 'Example: list pods and read one log',
      steps: ['Open Kubectl console, click the "Pods" suggestion chip, and press Run.', 'Copy a pod name from the output.', 'Type "kubectl logs shop-api-1 --tail=50" and press Run; a green exit 0 shows the logs.', 'Press the Up arrow to recall and edit your previous command.'],
    },
    tips: ['Changing commands such as delete or scale work, so double-check before you press Run.', 'Interactive or streaming commands (logs -f, exec -it) will be refused; use the Pod Logs and Shell buttons instead.'],
  };

  // ------------------------------------------------------------------ tools
  data['kubernetes/tools'] = {
    title: 'Local tools',
    summary: 'Shows which command-line tools OpsDeck needs for Kubernetes (kubectl, kind, Minikube, Helm), installs missing ones, and controls a local Minikube cluster.',
    whenToUse: ['The Kubernetes pages say kubectl is not installed.', 'You want Helm so the Helm releases page works.', 'You want to start or stop a local Minikube cluster.'],
    howItWorks: [
      'OpsDeck looks for each tool on your PATH and in its own storage and reads real versions from the binaries.',
      'Install missing tools downloads official releases into OpsDeck app storage. It needs no sudo, makes no system-wide changes, and verifies downloads with checksums.',
      'The page reads once when opened; press Refresh to re-check.',
    ],
    parts: [
      { name: 'Local tools card', description: 'One row per tool: kubectl (marked "required"), kind, minikube and Helm.', items: [
        { name: 'Version badge', description: 'Green with the version when installed, red "not installed" otherwise, with a short explanation.' },
        { name: 'Install missing tools', description: 'Shows how many tools are missing and installs them all. Each tool gets a progress bar and message; the button reads "Installing..." meanwhile. A success toast lists what was installed.' },
      ] },
      { name: 'Minikube card', description: 'Minikube is a tool that runs a small Kubernetes cluster on your own computer. Shows the profile name and a badge (running green, stopped amber, no profile, not installed). Start Minikube (primary) or Stop Minikube (red) asks for confirmation and runs only minikube start or minikube stop. The button is disabled if Minikube is not installed.' },
      { name: 'Managed installs card', description: 'Lists tools OpsDeck installed itself with their version, how long ago and a green "managed" badge. The subtitle shows the storage folder. Empty state: "No managed installs yet".' },
      commandsPart('Examples: kubectl version, kind clusters, Minikube status and Helm version. All are copy-only, so they run in your own terminal.'),
      { name: 'What OpsDeck will not touch', description: 'A reminder: it never edits ~/.kube/config, never writes to system directories, never asks for sudo, and every command uses an explicit context argument.' },
    ],
    example: {
      title: 'Example: set up Kubernetes tools from scratch',
      steps: ['Open Local tools and check which rows are red.', 'Press "Install missing tools" and wait for each progress bar to finish.', 'Open Minikube card and press Start Minikube (confirm). It can take a minute.', 'Open Cluster overview; the toolbar badge should show "connected".'],
    },
    tips: ['kubectl is the only required tool; kind, Minikube and Helm are optional.', 'Installed copies live in OpsDeck storage and do not replace system ones.'],
  };

  Object.assign(OD.help, data);
})();
