'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.help = OD.help || {};
  Object.assign(OD.help, {
    'intelligence/overview': {
      title: 'Overview',
      summary: 'One read-only snapshot of everything OpsDeck can see: Docker, Kubernetes, databases, hosts and observability. Use it as the starting point of the Intelligence workspace.',
      whenToUse: [
        'You open OpsDeck and want to know in a few seconds whether anything needs attention.',
        'You want to jump from a summary number to the page that explains it (changes, timeline, environments, automation).',
      ],
      howItWorks: [
        'The page reads the unified resource inventory, the last 24 hours of events, the latest changes, firing or pending alerts, incidents and automations at the same moment. Nothing is invented: each number comes from a module that reported it.',
        'While you stay on this page it refreshes itself every 45 seconds (only when the window is visible). It also reloads when an automation event arrives. Use the Refresh button in the page header to reload immediately.',
        'Every Intelligence page has the same header: the page title, an Ask AI button (asks the assistant about this page) and a Refresh button. On Overview there are two extra buttons: Search everything (opens Global search) and Run a dry-run (opens Automation).',
      ],
      parts: [
        {
          name: 'Stat cards',
          description: 'Five cards at the top.',
          items: [
            { name: 'Resources', description: 'Total number of resources across all sources, with how many sources are reporting. Example: 132 resources, 4 sources reporting.' },
            { name: 'Need attention', description: 'Resources whose status is unhealthy or degraded, with the split underneath. Example: 3 need attention = 2 unhealthy + 1 degraded. The card turns orange when the number is above zero.' },
            { name: 'Change records', description: 'How many retained change records exist (differences found between snapshots).' },
            { name: 'Open alerts', description: 'Alerts that are firing or pending, plus how many incidents are not resolved or closed.' },
            { name: 'Automations', description: 'Number of enabled automations and how many are configured in total.' },
          ],
        },
        {
          name: 'Environment strip',
          description: 'Shown only when environments exist. One chip per environment with its resource count and number of unhealthy resources. Clicking a chip opens the Environments page.',
        },
        {
          name: 'Coverage by module',
          description: 'One row per module that reported resources (Docker, Kubernetes, Databases, Observability, Hosts). Each row shows the total, a green bar for the healthy share, and "N need attention" when some resources are unhealthy or degraded.',
        },
        {
          name: 'Source health',
          description: 'One row per collector with a state badge: collected (green) or unavailable (red). The detail column shows how long ago it was read, or the error. Each collector is isolated, so one failing source (for example Docker not running) does not hide the others.',
        },
        {
          name: 'Recent changes',
          description: 'The last few detected changes with time, severity badge, title, detail and module. The Open changes button goes to the Changes page.',
        },
        {
          name: 'Recent events',
          description: 'The last events from the past 24 hours (Docker, Kubernetes, databases, alerts, automation). The Open timeline button goes to the Unified timeline.',
        },
        {
          name: 'Favourites',
          description: 'Resources you pinned with the star button on the Resources page. Click a name to open it in its own workspace; click the star to remove it.',
        },
        {
          name: 'Read-only banner',
          description: 'A reminder that Intelligence only observes. It changes a resource only when you run an automation that passed its approval gate.',
        },
      ],
      example: {
        title: 'Example: morning health check',
        steps: [
          'Open Overview. The "Need attention" card shows 2 (1 unhealthy, 1 degraded).',
          'In Source health you see Kubernetes as unavailable with a connection error, so the cluster numbers are missing and not zero.',
          'Under Coverage by module, Docker shows "14 healthy, 1 need attention". Open Resources, filter module Docker and state unhealthy to find the container.',
          'Check Recent events for what happened just before it went unhealthy.',
        ],
      },
      tips: [
        'An empty "Recent changes" card on a fresh install is normal: the first snapshot is only a baseline and differences appear after the next collection.',
        'A source marked unavailable means its resources are missing from every total, not that they are healthy.',
      ],
    },

    'intelligence/graph': {
      title: 'Infrastructure graph',
      summary: 'A map of how your resources relate to each other across modules (a container uses an image, a pod runs on a node, a database lives in a container). Each relationship is labelled observed or inferred.',
      whenToUse: [
        'You need to know what depends on what before restarting or changing something.',
        'You want to see which resources are the most connected (and therefore the riskiest to touch).',
        'You want to check why OpsDeck thinks two resources are related.',
      ],
      howItWorks: [
        'The graph is built from data the modules already report: Docker labels, networks, mounts and Compose projects; Kubernetes ownership, selectors and node placement; discovered databases; and trace spans that name a peer service.',
        'Observed edges come directly from reported runtime data (for example "Mount pgdata" or "Pod spec.nodeName worker-1"). Inferred edges are weaker guesses (for example a database profile pointing at localhost:5432 that matches a published container port). OpsDeck never adds an edge just to make the picture look complete, so unrelated resources stay unconnected.',
        'The drawing shows the highest-degree nodes per module (up to 12 per module column). The tables below list more. Use Refresh to rebuild it.',
      ],
      parts: [
        {
          name: 'Filter bar',
          description: 'Three dropdowns and a counter.',
          items: [
            { name: 'All modules', description: 'Limit the graph to one module (Docker, Kubernetes, Databases, Observability, Hosts, Intelligence). Reloads the graph.' },
            { name: 'All environments', description: 'Limit the graph to resources assigned to one environment. Reloads the graph.' },
            { name: 'All relationships / Observed only / Inferred only', description: 'Show every edge, only the reliable ones, or only the guesses. This filter applies instantly to the drawing and the Relationships table.' },
            { name: 'Counter', description: 'Totals for the whole graph, for example 87 nodes, 112 edges, 96 observed, 16 inferred.' },
          ],
        },
        {
          name: 'Graph drawing',
          description: 'One column per module, one box per resource, curved lines for relationships. A solid line is an observed edge, a dashed or lighter line is an inferred edge (see the legend above the drawing). Each box shows the resource name, its kind and a small status dot. Hover a box or line for a tooltip (name, kind, status, environment, or relationship and confidence). Click a box to open that resource in its own workspace. The legend also says "Showing N of M nodes".',
        },
        {
          name: 'Notices',
          description: 'A "What this graph does not show" banner lists known blind spots reported by the builder. An "Isolated resources" banner tells you how many resources have no discovered relationship; they are listed without made-up edges.',
        },
        {
          name: 'Most connected resources',
          description: 'Top 30 resources sorted by degree (number of relationships). Links open the resource in its workspace.',
        },
        {
          name: 'Relationships',
          description: 'The first 40 visible edges with the evidence that produced each one.',
        },
      ],
      tables: [
        {
          name: 'Most connected resources',
          columns: [
            { name: 'Resource', meaning: 'Name (link) with its kind and namespace underneath.', example: 'api-7d9f · pod · shop' },
            { name: 'Module', meaning: 'Which workspace the resource belongs to.', example: 'Kubernetes' },
            { name: 'Status', meaning: 'healthy, degraded, unhealthy, stopped or unknown.', example: 'healthy' },
            { name: 'Environment', meaning: 'Assigned environment, or unassigned.', example: 'Production' },
            { name: 'Degree', meaning: 'How many relationships the resource has.', example: '9' },
          ],
        },
        {
          name: 'Relationships',
          columns: [
            { name: 'From', meaning: 'Source resource of the edge.', example: 'web-1' },
            { name: 'Relationship', meaning: 'Kind of link: runs-on, uses-image, attached-to, uses-volume, part-of, contains, scheduled-on, runs-in, connects-to, depends-on, observed-depends-on, selects, owns, routes.', example: 'uses-volume' },
            { name: 'To', meaning: 'Target resource of the edge.', example: 'pgdata' },
            { name: 'Confidence', meaning: 'observed (green) or inferred (amber).', example: 'inferred' },
            { name: 'Evidence', meaning: 'The exact fact that produced the edge.', example: 'localhost:5432 matches a published container port' },
          ],
        },
      ],
      example: {
        title: 'Example: what depends on this database?',
        steps: [
          'Open the graph and set the module filter to Databases.',
          'Find "orders-db" in the Most connected resources table and check its degree.',
          'Switch the confidence filter to Observed only to remove guesses.',
          'In Relationships, read the rows where orders-db appears: "runs-in" a container and "observed-depends-on" from an application service, with the trace evidence in the last column.',
        ],
      },
      tips: [
        'Treat inferred edges as hints to verify, not facts.',
        'A resource with no lines is not broken; it simply has no discovered relationship.',
        'The drawing is capped per module, so use the module filter to focus on a crowded area.',
      ],
    },

    'intelligence/resources': {
      title: 'Resources',
      summary: 'A single inventory of every resource each module reports: containers, pods, databases, hosts and more, with their state and environment.',
      whenToUse: [
        'You want to find a resource without remembering which workspace owns it.',
        'You want to see all unhealthy resources, or everything in one environment.',
        'You want to assign resources to environments or pin favourites.',
        'You want a quick look at a resource without leaving the page.',
      ],
      howItWorks: [
        'The list is the live snapshot collected from every module. The module, kind, state and environment dropdowns ask the backend to filter; the search box filters the loaded rows in place by name, kind, module, host, namespace or state.',
        'Rows are shown 60 per page. A warning banner appears under the table for any source that did not respond.',
      ],
      parts: [
        {
          name: 'Filter bar',
          items: [
            { name: 'Filter resources', description: 'Free-text filter on name, kind, module, host, namespace and status.' },
            { name: 'All modules / kinds / states / environments', description: 'Dropdowns. Kinds and states are built from what is currently in the inventory.' },
            { name: 'Counter', description: 'How many rows are shown, "of N" when a filter hides some, and when the snapshot was taken.' },
          ],
        },
        {
          name: 'Unified resource inventory',
          description: 'The table. A name link opens the resource in its native workspace (for example a container opens in Docker).',
          items: [
            { name: 'Inspect (eye icon)', description: 'Opens the resource side panel (see below) without leaving the page.' },
            { name: 'Ask AI icon', description: 'Asks the assistant about this specific resource.' },
            { name: 'Star icon', description: 'Adds or removes the resource from Favourites, which are listed on Overview.' },
            { name: 'Environment dropdown', description: 'Assign the resource to an environment directly in the row. Choosing Unassigned removes the assignment. The change is audited.' },
          ],
        },
        {
          name: 'Resource side panel',
          description: 'A drawer that opens from the eye icon. It is the same cross-module panel used elsewhere in OpsDeck, and it reads the same snapshot, timeline, change history and notes as the full pages, so there is no second source of truth.',
          items: [
            { name: 'Header', description: 'Name, id, module and kind, a status badge, an environment badge and the reported status detail. The Open workspace button jumps to the resource in its own module.' },
            { name: 'Facts', description: 'Module, kind, location (cluster, namespace, host), when it was observed, and its labels as key=value pairs.' },
            { name: 'Recent events', description: 'Up to 20 timeline events whose text mentions the resource name.' },
            { name: 'Recorded changes', description: 'Up to 20 changes recorded for this resource id (status, image, replicas and so on).' },
            { name: 'Investigation notes', description: 'Local notes saved for this resource.' },
            { name: 'Limitations', description: 'Small print about what the panel could not verify, when there is any.' },
            { name: 'Footer', description: 'Ask AI and Close.' },
          ],
        },
        {
          name: 'Pager',
          description: 'Previous and Next buttons with "Page 2 of 5", visible only when there is more than one page.',
        },
      ],
      tables: [
        {
          name: 'Unified resource inventory',
          columns: [
            { name: 'Resource', meaning: 'Name (link to the native workspace) with the status detail or kind underneath.', example: 'redis-cache · Up 3 hours (healthy)' },
            { name: 'Module', meaning: 'Which module reported it.', example: 'Docker' },
            { name: 'Kind', meaning: 'Type of resource.', example: 'container' },
            { name: 'State', meaning: 'healthy, degraded, unhealthy, stopped or unknown.', example: 'unhealthy' },
            { name: 'Environment', meaning: 'Editable dropdown with the assigned environment.', example: 'Staging' },
            { name: 'Location', meaning: 'Namespace, host or cluster, or a dash.', example: 'shop' },
            { name: '(actions)', meaning: 'Inspect, Ask AI and favourite buttons.', example: 'eye, sparkle, star' },
          ],
        },
      ],
      example: {
        title: 'Example: find and inspect an unhealthy container',
        steps: [
          'Choose module Docker and state unhealthy.',
          'You see "api-gateway", kind container, state unhealthy, location host-1.',
          'Click the eye icon. The panel shows status detail "health check failing", two timeline events about restarts and a recorded change "image changed" from 1 hour ago.',
          'Click Open workspace to go to the container in Docker, or star it to keep it on Overview.',
        ],
      },
      tips: [
        'Environment changes made here take effect immediately for the environment counts and filters.',
        'If a module is missing from the list, check the unavailable banner under the table or Source health on Overview.',
      ],
    },

    'intelligence/search': {
      title: 'Global search',
      summary: 'Search resources, timeline events and recorded changes across every workspace in one place.',
      whenToUse: [
        'You remember a name, namespace, host or status but not where it lives.',
        'You want everything related to one word, such as "payments", across modules.',
        'You want to repeat a useful search later.',
      ],
      howItWorks: [
        'Type a query and press Search (or Enter). The backend searches the unified inventory, the retained events and the recorded changes. Results are not auto-refreshed; press Search again to rerun.',
        'The module dropdown limits the search to one module. Nothing is shown until you search.',
      ],
      parts: [
        {
          name: 'Search form',
          items: [
            { name: 'Search box', description: 'Name, namespace, host, status or module. For example "payments" or "crashloop".' },
            { name: 'All modules', description: 'Restrict the search to one module.' },
            { name: 'Search', description: 'Runs the search.' },
            { name: 'Save search', description: 'Asks for a name and stores the current query and module filter.' },
          ],
        },
        {
          name: 'Saved searches',
          description: 'A row of chips, one per saved search. Clicking a chip fills the query and runs it.',
        },
        {
          name: 'Result counters',
          description: 'Four cards: Resources (with the time the search took in ms), Events, Changes and Actions (navigation shortcuts that match your words).',
        },
        {
          name: 'Action chips',
          description: 'Shortcuts to pages that match the query, for example typing "backup" may offer a link to a backup page. Each chip shows the module it leads to.',
        },
        {
          name: 'Resources, Events and Changes cards',
          description: 'Resources are shown in a table (resource link, module, state, environment). Events and Changes are shown as lists with time, severity badge, title, detail and module. The Events and Changes cards appear only when something matched.',
        },
      ],
      example: {
        title: 'Example: search for "checkout"',
        steps: [
          'Type checkout, leave All modules and press Search.',
          'Counters show Resources 4, Events 7, Changes 2, Actions 0.',
          'In Resources you see a Kubernetes deployment, two pods and a Docker container. In Changes you see "image changed" for the deployment.',
          'Click Save search and name it "Checkout" to reuse it from the chips.',
        ],
      },
      tips: [
        'Saved searches remember the module filter too.',
        'If a search returns nothing, try a shorter word or remove the module filter.',
      ],
    },

    'intelligence/timeline': {
      title: 'Unified timeline',
      summary: 'Real events from every module in one chronological list, newest first: Docker, Kubernetes, database activity, alerts, incidents, detected changes and automation runs.',
      whenToUse: [
        'Something broke and you want to know what happened around that time across all systems.',
        'You want to check whether an automation ran or an alert fired.',
      ],
      howItWorks: [
        'Events are read from each module as they happen; nothing is synthesized. Pick a time range, optionally narrow by module, severity or text, and the list reloads.',
        'On this page the list refreshes itself every 45 seconds while the window is visible. Rows are paged 50 at a time.',
      ],
      parts: [
        {
          name: 'Filter bar',
          items: [
            { name: 'Filter events', description: 'Text match on the events.' },
            { name: 'Range', description: 'Last hour, 6 hours, 24 hours (default), 7 days or 30 days.' },
            { name: 'All modules', description: 'Show events from one module only.' },
            { name: 'All severities', description: 'Info, Success, Warning, Error or Critical.' },
            { name: 'Counter', description: 'Total number of events in the range.' },
          ],
        },
        {
          name: 'Module chips',
          description: 'A strip showing how many events each module contributed, largest first.',
        },
        {
          name: 'Source warning',
          description: 'If some sources could not be read, a banner lists them so you know the timeline is incomplete.',
        },
        {
          name: 'Event stream',
          description: 'The table of events. Titles that have a link open the related module page.',
        },
        {
          name: 'Pager',
          description: 'Previous and Next buttons with "Page 1 of 3" when there are more than 50 events.',
        },
      ],
      tables: [
        {
          name: 'Event stream',
          columns: [
            { name: 'Time', meaning: 'Exact date and time with "x ago" underneath.', example: '13 Nov 14:02 / 6 minutes ago' },
            { name: 'Severity', meaning: 'info, success, warning, error or critical.', example: 'error' },
            { name: 'Module', meaning: 'Where the event came from.', example: 'Kubernetes' },
            { name: 'Event', meaning: 'Title (link when available) and detail.', example: 'Pod api-7d9f restarted / OOMKilled' },
            { name: 'Resource', meaning: 'The resource involved, or a dash.', example: 'api-7d9f' },
            { name: 'Tags', meaning: 'Free-form tags attached to the event.', example: 'automation, warning' },
          ],
        },
      ],
      example: {
        title: 'Example: what happened before the outage?',
        steps: [
          'Set Range to Last 6 hours and Severity to Warning.',
          'Scan the module chips: Kubernetes has the most events.',
          'Find "Pod api-7d9f restarted" at 14:02 and an "Automation run succeeded" at 14:05.',
          'Click the title to open the pod in Kubernetes, or use Root cause to rank hypotheses for that time window.',
        ],
      },
      tips: [
        'The severity filter selects exactly the chosen severity, not "this and above".',
        'A shorter range loads faster and is easier to read during an incident.',
      ],
    },

    'intelligence/changes': {
      title: 'Changes',
      summary: 'What appeared, disappeared or changed since the previous snapshot of your resources.',
      whenToUse: [
        'Something started failing and you want to know what changed just before.',
        'You want proof that a deployment changed an image or replica count.',
      ],
      howItWorks: [
        'OpsDeck stores a snapshot of all resources and compares each new snapshot with the previous one. The first snapshot is only a baseline and produces no change records; a "Baseline established" banner explains this.',
        'Detection runs on a schedule and also when you press Detect now. The page refreshes itself every 45 seconds and shows a toast when new changes are found. Up to 400 retained records are shown.',
        'Change kinds you may see: discovered (new resource), removed, status, image, replicas and configuration.',
      ],
      parts: [
        {
          name: 'Baseline banner',
          description: 'Shown when the stored data is only the first snapshot.',
        },
        {
          name: 'Filter bar',
          items: [
            { name: 'Filter changes', description: 'Text filter.' },
            { name: 'All modules', description: 'Limit to one module.' },
            { name: 'Counter', description: 'Number of retained change records.' },
            { name: 'Detect now', description: 'Takes a fresh snapshot and compares it with the stored one. A toast tells you how many changes were found, or "No changes since the last snapshot".' },
          ],
        },
        {
          name: 'Change history',
          description: 'The table of records, newest first. Title links open the related resource.',
        },
      ],
      tables: [
        {
          name: 'Change history',
          columns: [
            { name: 'Time', meaning: 'When the change was detected (not necessarily when it happened).', example: '13 Nov 10:15 / 3 hours ago' },
            { name: 'Severity', meaning: 'How important the change is.', example: 'warning' },
            { name: 'Module', meaning: 'Source module.', example: 'Docker' },
            { name: 'Kind', meaning: 'Type of change.', example: 'image' },
            { name: 'Change', meaning: 'Title and detail.', example: 'Image changed / nginx:1.25 to nginx:1.27' },
            { name: 'Resource', meaning: 'The resource that changed.', example: 'web-1' },
          ],
        },
      ],
      example: {
        title: 'Example: confirm a rollout',
        steps: [
          'After a deployment, click Detect now.',
          'A toast says "2 change(s) detected".',
          'Filter module Kubernetes. You see "replicas: 2 to 4" for deployment api and "image changed" for the same deployment.',
        ],
      },
      tips: [
        'On a new install, wait one more collection or press Detect now once so there is something to compare.',
        'Times are detection times, so a change made between two snapshots is recorded at the next detection.',
      ],
    },

    'intelligence/incidents': {
      title: 'Incidents',
      summary: 'A list of incidents from the observability store, shown next to the resources they involve, with a shortcut to investigate each one.',
      whenToUse: [
        'You want one list of open and past incidents with the services and resources affected.',
        'You want to start a root cause investigation from an incident.',
      ],
      howItWorks: [
        'Incidents are created by alert rules or by an automation action (Create incident). Nothing is generated just for display. The list loads up to 200 incidents and is refreshed when you press Refresh.',
        'Related alerts, metrics, logs and traces are joined only when you open an investigation.',
      ],
      parts: [
        {
          name: 'Top bar',
          items: [
            { name: 'Count', description: 'How many incidents were loaded from the observability store.' },
            { name: 'Open observability incidents', description: 'Opens the full incident manager in the Observability workspace, where you can acknowledge or resolve.' },
            { name: 'Investigate', description: 'Opens the Root cause page.' },
          ],
        },
        {
          name: 'Cross-module incidents table',
          description: 'Each title is a link that opens the incident drawer.',
          items: [
            { name: 'Ask AI icon', description: 'Asks the assistant about this incident.' },
            { name: 'Investigate button', description: 'Opens Root cause with this incident preselected.' },
          ],
        },
        {
          name: 'Incident drawer',
          description: 'Opened from the title. Shows the status and severity badges, the summary, and facts: Created, Updated, Services, Resources and Assignee (or unassigned). If the incident has a timeline, the last 12 entries are listed. Footer buttons: Close, Open in observability and Investigate.',
        },
      ],
      tables: [
        {
          name: 'Cross-module incidents',
          columns: [
            { name: 'Incident', meaning: 'Title (opens the drawer) with the summary underneath.', example: 'Checkout latency spike / p95 above 2 s' },
            { name: 'Severity', meaning: 'critical, major, minor, warning or info.', example: 'critical' },
            { name: 'Status', meaning: 'open or acknowledged (orange/cyan), resolved or closed (green).', example: 'acknowledged' },
            { name: 'Services', meaning: 'Up to 3 services involved.', example: 'checkout, payments' },
            { name: 'Resources', meaning: 'Up to 3 resources involved.', example: 'checkout-7d9f, orders-db' },
            { name: 'Updated', meaning: 'Time since the last update.', example: '12 minutes ago' },
            { name: '(actions)', meaning: 'Ask AI and Investigate.', example: '' },
          ],
        },
      ],
      example: {
        title: 'Example: investigate an open incident',
        steps: [
          'Find "Checkout latency spike" with status open and severity critical.',
          'Click its title to read the summary and timeline in the drawer.',
          'Click Investigate. The Root cause page opens with this incident selected and a 60 minute window.',
        ],
      },
      tips: [
        'This page is read-only. To acknowledge, assign or resolve an incident, use the Observability incident manager.',
        'An empty list means no incident exists yet, not that data failed to load (errors appear in a banner).',
      ],
    },

    'intelligence/rca': {
      title: 'Root cause',
      summary: 'Collects evidence around an alert, an incident or a resource and gives you facts, ranked hypotheses and an honest list of what could not be verified. It never claims a confirmed root cause.',
      whenToUse: [
        'An alert fired or an incident opened and you want a starting point instead of guessing.',
        'A service is slow and you want to know which metrics, logs, traces or changes moved first.',
      ],
      howItWorks: [
        'OpsDeck compares the chosen window with an equal-length baseline before it. It looks at metric movement, alerts, recorded changes, logs, traces and unhealthy resources, and turns each finding into a hypothesis with a confidence score.',
        'Confidence is a capped score built from the evidence found (for example a metric hypothesis grows with the size of the z-score and the percent change). A hypothesis scoring 65% or more is labelled high (red), 40% to 64% medium (orange) and below 40% low (grey).',
        'The investigation runs only when you press Investigate; it does not refresh by itself.',
      ],
      parts: [
        {
          name: 'Investigation form',
          items: [
            { name: 'Subject', description: 'Resource or service scope, Alert, or Incident.' },
            { name: 'Scope / Alert / Incident', description: 'For scope you type a service, namespace, container or host name. For Alert or Incident you pick from a list (unresolved alerts, and incidents, loaded when the page opens).' },
            { name: 'Window', description: 'Last 15 minutes, hour, 3 hours, 6 hours or 24 hours. This is the incident window; the baseline before it has the same length.' },
            { name: 'Broad scope', description: 'When ticked, metric series are not filtered by the scope text. Use it when your scope word does not appear in metric labels.' },
            { name: 'Investigate', description: 'Runs the analysis. The button shows "Investigating..." while it works.' },
            { name: 'Copy JSON', description: 'Appears after a result. Copies the full investigation as JSON.' },
          ],
        },
        {
          name: 'Report header',
          description: 'Title of the subject, the window start and end, the baseline length in minutes and how long the analysis took, with a badge for the subject type (manual, alert or incident).',
        },
        {
          name: 'Hypotheses, not verdicts',
          description: 'A banner with a short summary of the best explanation, or a message that none was produced.',
        },
        {
          name: 'Facts',
          description: 'Measured values and recorded records only.',
        },
        {
          name: 'Limitations',
          description: 'What the investigation could not verify, for example a missing log source or too few samples. If every source returned data it says there are no stated limitations.',
        },
        {
          name: 'Ranked hypotheses',
          description: 'Numbered cards, strongest first. Each shows a title, a label badge, a confidence percentage and bar, a bullet list of evidence and, when available, Next steps.',
        },
        {
          name: 'Metric movement',
          description: 'A table comparing the incident window with the baseline.',
        },
        {
          name: 'Affected resources',
          description: 'Resources involved, with module, kind and status (up to 40).',
        },
        {
          name: 'Correlated timeline',
          description: 'Events and changes from the window in time order with module badges.',
        },
      ],
      tables: [
        {
          name: 'Metric movement',
          columns: [
            { name: 'Metric', meaning: 'Metric label with the resource underneath.', example: 'Container memory / api-gateway' },
            { name: 'Before', meaning: 'Value during the baseline period.', example: '41' },
            { name: 'During', meaning: 'Value during the incident window.', example: '93' },
            { name: 'Delta', meaning: 'Percent change from before to during.', example: '+127%' },
            { name: 'z-score', meaning: 'How many standard deviations the new value is from the baseline. Larger means a more unusual jump.', example: '6.4' },
          ],
        },
      ],
      example: {
        title: 'Example: investigate a memory alert',
        steps: [
          'Set Subject to Alert and pick "Container memory high - api-gateway".',
          'Choose Window "Last hour" and press Investigate.',
          'Hypothesis 1: "Container memory rose sharply" at 78% (high). Evidence: 41 to 93 percent, z-score 6.4; a recorded image change 20 minutes earlier.',
          'Next steps suggest checking the new image. Limitations note that no traces were available.',
          'Click Copy JSON to attach the result to a ticket.',
        ],
      },
      tips: [
        'A hypothesis is a lead to check, not a confirmed cause.',
        'If nothing reaches the evidence threshold, widen the window or check that collectors are running.',
        'You can also arrive here from an incident row or the incident drawer with the form already filled in.',
      ],
    },

    'intelligence/reports': {
      title: 'Reports',
      summary: 'Generate summaries from retained metrics, alerts, incidents, logs and traces for a chosen period.',
      whenToUse: [
        'You need a summary of last week for a status meeting.',
        'You want min, average, maximum and p95 values for a set of metrics.',
        'You want to copy report data as JSON.',
      ],
      howItWorks: [
        'Reports are computed in the main process from the same stores as the dashboards, so they match what you see elsewhere. Pick a time range, then press Generate on a report type. Nothing is pre-filled; an empty report means no retained data matched.',
        'Report types are provided by the Observability service and include System performance, Server availability, Docker resource utilization, Kubernetes cluster health, Database performance, API availability, Application performance, Alert history and Incident history.',
      ],
      parts: [
        {
          name: 'Filter bar',
          items: [
            { name: 'Range', description: 'Last hour, 24 hours (default), 7 days or 30 days.' },
            { name: 'Observability reports', description: 'Link to the fuller report area in Observability.' },
          ],
        },
        {
          name: 'Report types',
          description: 'One tile per report type with its name, its id and a Generate button.',
        },
        {
          name: 'Report result',
          description: 'Appears after generating. The header shows the title, the range and when it was generated, with a Copy JSON button. The body is made of sections depending on the report type:',
          items: [
            { name: 'Metric section', description: 'A card titled by the metric with a table of series (see below).' },
            { name: 'Alerts in range / Incidents in range', description: 'Tables of alerts (name, severity, state, resource) and incidents (title, severity, status, resources).' },
            { name: 'Logs', description: 'Number of records, retention in days and counts by level.' },
            { name: 'Traces', description: 'Number of records, retention in days and the main services.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Metric section',
          columns: [
            { name: 'Resource', meaning: 'The series the numbers belong to.', example: 'host-1' },
            { name: 'Unit', meaning: 'Unit of the metric.', example: 'percent' },
            { name: 'Avg', meaning: 'Average over the range.', example: '37' },
            { name: 'Min', meaning: 'Lowest value.', example: '4' },
            { name: 'Max', meaning: 'Highest value.', example: '96' },
            { name: 'p95', meaning: '95% of samples were at or below this value.', example: '81' },
            { name: 'Last', meaning: 'Most recent value.', example: '35' },
          ],
        },
      ],
      example: {
        title: 'Example: weekly system report',
        steps: [
          'Set Range to Last 7 days.',
          'Click Generate on "System performance".',
          'Read the CPU card: avg 37, max 96, p95 81, so CPU is usually fine with short spikes.',
          'Click Copy JSON to paste the data into a document.',
        ],
      },
      tips: [
        'The range drop-down is applied when you press Generate; change it first.',
        'Short-lived data (logs, traces) is limited by its retention setting, which the report shows.',
      ],
    },

    'intelligence/environments': {
      title: 'Environments',
      summary: 'Group resources into Local, Development, Testing, Staging, Production or your own environments, using explicit assignments, rules and exact-token heuristics.',
      whenToUse: [
        'You want to see health per environment instead of per module.',
        'You want to filter Resources, Graph and Overview by environment.',
        'You want production resources recognised automatically by name or label.',
      ],
      howItWorks: [
        'A resource gets its environment in this order: an explicit assignment you made, then your rules (top to bottom), then a conservative heuristic. The heuristic only fires when an exact token such as prod, stg, qa or dev appears in the namespace, labels or name. Everything else stays unassigned until you map it.',
        'Built-in environments cannot be deleted; custom ones can be edited and deleted. Deleting an environment removes assignments and rules pointing at it, never the resources. Settings has a switch to turn heuristics off.',
      ],
      parts: [
        {
          name: 'Top bar',
          items: [
            { name: 'Unassigned counter', description: 'How many resources have no environment.' },
            { name: 'New environment', description: 'Opens a form with Name, Tone (badge colour) and Description. Saved environments are additive.' },
            { name: 'New rule', description: 'Opens the rule form (see below).' },
          ],
        },
        {
          name: 'Environment cards',
          description: 'One card per environment: name badge, number of resources, "custom" badge when you made it, description, a green bar for the healthy share and counts of healthy, unhealthy and degraded. Custom environments have Edit and Delete buttons. An extra Unassigned card appears while any resource has no environment.',
        },
        {
          name: 'Unassigned resources',
          description: 'First 80 resources with no environment. Use the dropdown in the Assign column to set one directly.',
        },
        {
          name: 'Rules',
          description: 'Rules are applied before heuristics, in order, each with Edit and Delete buttons. The rule form has these fields:',
          items: [
            { name: 'Field', description: 'What to match: Name, Labels, Namespace, Host, Image or Module.' },
            { name: 'Mode', description: 'Contains (plain text) or Regular expression.' },
            { name: 'Pattern', description: 'The text or regex, for example prod.' },
            { name: 'Environment', description: 'Which environment matching resources get.' },
            { name: 'Enabled', description: 'Untick to keep the rule without applying it.' },
          ],
        },
        {
          name: 'Heuristics banner',
          description: 'Reminds you that inference is conservative.',
        },
      ],
      tables: [
        {
          name: 'Rules',
          columns: [
            { name: 'Field', meaning: 'Which resource property is checked.', example: 'namespace' },
            { name: 'Mode', meaning: 'contains or regex.', example: 'contains' },
            { name: 'Pattern', meaning: 'The text or expression to match.', example: 'prod' },
            { name: 'Environment', meaning: 'Environment assigned on a match.', example: 'Production' },
            { name: 'State', meaning: 'enabled (green) or off.', example: 'enabled' },
          ],
        },
        {
          name: 'Unassigned resources',
          columns: [
            { name: 'Resource', meaning: 'Name (link).', example: 'billing-worker' },
            { name: 'Module', meaning: 'Source module.', example: 'Kubernetes' },
            { name: 'Kind', meaning: 'Resource kind.', example: 'pod' },
            { name: 'State', meaning: 'Health status.', example: 'healthy' },
            { name: 'Assign', meaning: 'Dropdown to set the environment.', example: 'Staging' },
          ],
        },
      ],
      example: {
        title: 'Example: map every production namespace',
        steps: [
          'Click New rule.',
          'Set Field to Namespace, Mode to Contains, Pattern to "prod-" and Environment to Production, then Save rule.',
          'The Production card count rises and the Unassigned card shrinks.',
          'Assign a leftover resource by hand in the Unassigned resources table.',
        ],
      },
      tips: [
        'Explicit assignments always beat rules and heuristics.',
        'A bad regex is the usual reason a rule does not match; try Contains first.',
        'Assignments, rule changes and environment edits are written to the Audit trail.',
      ],
    },

    'intelligence/automation': {
      title: 'Automation',
      summary: 'Build workflows that run on a schedule, when conditions are true, or when an event happens. They are dry-run first, approval-gated for anything disruptive, retried a bounded number of times, and fully audited.',
      whenToUse: [
        'You want a daily report or a notification when a metric crosses a threshold.',
        'You want an incident opened automatically when something breaks.',
        'You want to restart a container, Compose project or Kubernetes workload, but only after a human approves.',
        'You have a run waiting for approval and need to approve, reject or cancel it.',
      ],
      howItWorks: [
        'An automation (a "rule" or runbook) has four parts: a trigger (when to look), optional conditions (all must be true), a list of actions (what to do, up to 12) and an approval mode. The engine checks automations on a timer (default every 15 seconds, set in Settings) and also runs one when you press Run.',
        'Every execution creates a run record with a status. Runs are kept in a bounded history of the latest 500; this page shows the latest 60 in Recent runs and the latest 40 of them in the table. Each run is also written to the Audit trail.',
        'Safety model: Dry run evaluates conditions and lists what would happen but never executes an action. The four disruptive actions (restart container, restart Compose project, restart or scale Kubernetes workload) can only execute inside a run that has been approved. Database queries are read-only and are rejected if the database service would classify the SQL as destructive. A failed step caused by a network or timeout error is tried once more (2 attempts in total); other errors fail at once.',
        'If you turn automation off in Settings, schedule, condition and event triggers stop and Run is refused. Dry runs still work. The page shows a toast "Automation waiting for approval" when a run reaches the gate while you are on it.',
      ],
      parts: [
        {
          name: 'Stat cards',
          description: 'Four cards.',
          items: [
            { name: 'Automations', description: 'How many automations exist and how many are enabled.' },
            { name: 'Pending approval', description: 'Runs waiting for you at the approval gate. Turns orange when above zero.' },
            { name: 'Runs retained', description: 'How many runs are in the loaded history.' },
            { name: 'Engine', description: 'enabled or paused (from the Automation enabled setting). Scheduled and event triggers only fire while it is enabled.' },
          ],
        },
        {
          name: 'Dry-run banner',
          description: 'Reminds you that a dry run never executes an action and that a real run still stops at the approval gate when the automation asks for approval.',
        },
        {
          name: 'Waiting for approval',
          description: 'Appears only when at least one run is pending. Each row shows the automation, the trigger, the planned actions (destructive ones are tagged "(destructive)") and when it started. Always read the planned actions before acting.',
          items: [
            { name: 'Approve', description: 'Asks for confirmation ("Approve and run"), then executes all planned actions immediately. The approver is recorded and an automation-approved audit entry is written.' },
            { name: 'Reject', description: 'Asks for an optional reason and ends the run with status rejected. Nothing is executed. The audit entry has outcome denied.' },
            { name: 'Cancel', description: 'Ends the run as cancelled with the reason "Cancelled before approval". Use it when the run is no longer relevant.' },
          ],
        },
        {
          name: 'Automations list (rules and runbooks)',
          description: 'The table of workflows with a New automation button in the card header. Row buttons:',
          items: [
            { name: 'Edit', description: 'Opens the editor drawer (see below).' },
            { name: 'Dry run', description: 'Evaluates conditions and shows what would run, without executing anything. A toast says "Dry run completed" with the plan, for example "Would run 2 action(s): report, notify."' },
            { name: 'Run', description: 'After a confirmation, runs it now: conditions are checked against live data, then it either stops at the approval gate or executes. Manual runs use the trigger "manual".' },
            { name: 'Pause / Enable', description: 'Stops or resumes the triggers. A paused automation still can be dry-run.' },
            { name: 'Delete', description: 'Removes the workflow definition after confirmation. Past runs stay in the audit trail.' },
          ],
        },
        {
          name: 'Editor: general fields',
          items: [
            { name: 'Name and Description', description: 'Free text shown in the list.' },
            { name: 'Approval', description: 'Run without approval (never), Ask before destructive actions (destructive: only pauses if the list contains a restart or scale action), or Ask before every run (always).' },
            { name: 'Cooldown (minutes)', description: 'Minimum gap between runs for condition and event triggers (default 15, 0 to 10080). It prevents a still-true condition from firing again and again.' },
            { name: 'Enabled', description: 'Whether the triggers are active.' },
          ],
        },
        {
          name: 'Editor: trigger',
          items: [
            { name: 'Schedule', description: 'Either "Every (minutes)" (minimum 5) or "Or daily at" a HH:MM time. The list shows it as "Every 1 h" or "Daily at 08:00".' },
            { name: 'Condition', description: 'Runs when every condition below is true. It fires when the condition turns true, then respects the cooldown while it stays true.' },
            { name: 'Event', description: 'Runs when a matching timeline event appears. Fields: Modules (comma separated), Event kinds (comma separated), Minimum severity and Text match. Up to 3 new matching events are processed per check, and each event triggers at most one run.' },
          ],
        },
        {
          name: 'Editor: conditions',
          description: 'Add condition / trash icon. "All must match"; with none, the trigger runs directly. Three types:',
          items: [
            { name: 'Metric threshold', description: 'Metric name (from the observability catalog), Aggregation (avg, max, min, last, sum, count), Operator (>, >=, <, <=, ==, !=), Threshold and Window in minutes. Example: avg of system.cpu.usage > 85 over 5 minutes.' },
            { name: 'Resource status count', description: 'Module, optional Kind, Status (healthy, degraded, unhealthy, stopped, unknown), Operator and Threshold. Example: docker container unhealthy count > 0.' },
            { name: 'Open incidents', description: 'Status (open or acknowledged), Severity (any, critical, major, minor, warning, info), Operator and Threshold. Example: critical open incidents >= 1.' },
          ],
        },
        {
          name: 'Editor: actions',
          description: 'Add action / trash icon. Actions run in order, one after another. A failed action is recorded, the remaining ones still run, and the run ends as failed. Nine action types:',
          items: [
            { name: 'Send notification', description: 'Pick one or more channels (none selected means every enabled channel), a severity (info, warning, error, critical) and a message. An empty message sends a default text naming the automation.' },
            { name: 'Create incident', description: 'Title, Summary, Severity and Services (comma separated). Evidence from the conditions is attached.' },
            { name: 'Generate report', description: 'Report id (default system) and Hours (1 to 720).' },
            { name: 'Run diagnostics', description: 'Target (system, docker, kubernetes, database) and, for database only, the connection id.' },
            { name: 'Run read-only SQL', description: 'Connection, Database, SQL (default SELECT 1) and Row limit (1 to 1000). Statements the database guard considers destructive are rejected, so this cannot change data.' },
            { name: 'Restart container (destructive)', description: 'Choose a container from the Docker list. Needs approval.' },
            { name: 'Restart Compose project (destructive)', description: 'Choose a project. Runs docker compose restart for every service in it; volumes are not touched. Needs approval.' },
            { name: 'Restart Kubernetes workload (destructive)', description: 'Pick a detected Deployment, StatefulSet or DaemonSet (or type kind, namespace and name by hand when no cluster is detected). Performs a rolling restart. Needs approval.' },
            { name: 'Scale Kubernetes workload (destructive)', description: 'Same picker for Deployments and StatefulSets, plus Replicas (0 to 100). Zero stops every replica. Needs approval.' },
          ],
        },
        {
          name: 'Recent runs',
          description: 'History of executions, newest first, including dry runs, skipped runs and those triggered by schedules or events.',
        },
      ],
      tables: [
        {
          name: 'Automations table',
          description: 'One row per workflow.',
          columns: [
            { name: 'Name', meaning: 'Name and description.', example: 'Restart api on crash / Restarts the api pod when unhealthy' },
            { name: 'Trigger', meaning: 'How it starts.', example: 'When conditions match' },
            { name: 'Conditions', meaning: 'Number of conditions.', example: '2' },
            { name: 'Actions', meaning: 'Action types in order.', example: 'create-incident, k8s-restart' },
            { name: 'Approval', meaning: 'never (grey), destructive (orange) or always (red).', example: 'destructive' },
            { name: 'State', meaning: 'enabled or paused, with the last run status and time underneath ("never" if it has not run).', example: 'enabled / succeeded 2 hours ago' },
            { name: '(buttons)', meaning: 'Edit, Dry run, Run, Pause or Enable, Delete.', example: '' },
          ],
        },
        {
          name: 'Waiting for approval table',
          columns: [
            { name: 'Automation', meaning: 'Name with the reason text.', example: 'Restart api on crash / Waiting for explicit approval.' },
            { name: 'Trigger', meaning: 'What started the run: schedule, condition, event or manual.', example: 'condition' },
            { name: 'Planned actions', meaning: 'What will execute on approval; destructive steps are flagged.', example: 'k8s-restart (destructive)' },
            { name: 'Started', meaning: 'Time since the run was created.', example: '4 minutes ago' },
            { name: '(buttons)', meaning: 'Approve, Reject, Cancel.', example: '' },
          ],
        },
        {
          name: 'Recent runs table',
          columns: [
            { name: 'Started', meaning: 'When the run began.', example: '6 minutes ago' },
            { name: 'Automation', meaning: 'Which workflow ran.', example: 'Daily CPU report' },
            { name: 'Status', meaning: 'Badge, plus a cyan "dry run" badge for dry runs. Values: succeeded (green), failed (red), pending-approval (orange), dry-run (cyan), and grey for running, skipped, rejected and cancelled.', example: 'succeeded' },
            { name: 'Trigger', meaning: 'schedule, condition, event or manual.', example: 'manual' },
            { name: 'Steps', meaning: 'One entry per action: "type: ok" or the error. Falls back to the reason when there are no steps.', example: 'report: ok · notify: ok' },
            { name: 'Finished', meaning: 'When it ended, or a dash while still running or waiting.', example: '6 minutes ago' },
          ],
        },
        {
          name: 'Run status values',
          description: 'What each status means.',
          columns: [
            { name: 'running', meaning: 'Actions are executing right now.', example: 'running' },
            { name: 'succeeded', meaning: 'Every action finished without an error.', example: 'succeeded' },
            { name: 'failed', meaning: 'At least one action failed. The Steps column shows which and why.', example: 'k8s-restart: Choose a valid workload name.' },
            { name: 'skipped', meaning: 'Conditions were not met, so nothing ran (reason: "Conditions are not met.").', example: 'skipped' },
            { name: 'dry-run', meaning: 'A simulation that listed the planned actions without executing them.', example: 'Would run 2 action(s): report, notify.' },
            { name: 'pending-approval', meaning: 'Stopped at the approval gate. Needs Approve, Reject or Cancel.', example: 'pending-approval' },
            { name: 'rejected', meaning: 'A person rejected the run; nothing executed.', example: 'Rejected by the user.' },
            { name: 'cancelled', meaning: 'Cancelled before approval, or while running.', example: 'Cancelled before approval.' },
          ],
        },
      ],
      example: {
        title: 'Example: restart a deployment after approval',
        steps: [
          'Click New automation. Name it "Restart api on crash" and set Approval to "Ask before destructive actions". Leave Cooldown at 15.',
          'Trigger: Condition. Add a condition of type Resource status count: Module Kubernetes, Kind pod, Status unhealthy, Operator >, Threshold 0.',
          'Add action 1: Create incident, title "api pods unhealthy", severity major. Add action 2: Restart Kubernetes workload, pick "Deployments · shop/api". Save automation.',
          'Click Dry run on the new row. The toast says "Would run 2 action(s): create-incident, k8s-restart" and Recent runs shows a dry-run row. Nothing changed in the cluster.',
          'Later a pod goes unhealthy. The engine runs the automation, finds the condition true and stops: a row appears under Waiting for approval with "create-incident, k8s-restart (destructive)" and a warning toast.',
          'Check the planned actions and click Approve, then confirm "Approve and run". The incident is created, the deployment is rolled out, and the run shows succeeded with Steps "create-incident: ok · k8s-restart: ok".',
          'Open Audit trail to see automation-approval-requested, automation-approved, workload-restart and automation-run entries.',
        ],
      },
      tips: [
        'Always do a Dry run after editing an automation, especially one with a restart or scale action.',
        'If Approval is "Run without approval" and the list contains a destructive action, the run does not stop for a person; the destructive step simply fails with "This action needs explicit approval before it can run". Choose destructive or always for these actions.',
        'Use a cooldown on condition and event triggers so a persistent problem does not create a stream of runs or incidents.',
        'A schedule can be no more frequent than every 5 minutes.',
        'Approve executes immediately, including disruptive steps. Reject if you are not sure; you can always Run it again.',
        'The same workflow cannot run twice at once; a second start is refused with "This workflow is already running".',
        'Pending runs wait for you without a timeout, so check the Pending approval card regularly.',
      ],
    },

    'intelligence/audit': {
      title: 'Audit trail',
      summary: 'A time-ordered record of every sensitive action OpsDeck performed through the intelligence layer, so you can see who or what changed something and what the result was.',
      whenToUse: [
        'You want to confirm that an automation actually restarted something, and who approved it.',
        'You want to review environment changes, notifications or change detection runs.',
        'Someone asks "what did OpsDeck do last night?".',
      ],
      howItWorks: [
        'Entries are written by the main process when an action happens, newest first. Typical entries: environment-assign, environment-save, environment-rule-save, environment-delete, automation-save, automation-delete, automation-approval-requested, automation-approved, automation-rejected, automation-run, container-restart, compose-restart, workload-restart, workload-scale, notification-send, incident-create and change-detected.',
        'The page loads up to 400 entries when opened or refreshed. Read-only: you cannot edit or delete entries here.',
      ],
      parts: [
        {
          name: 'Filter bar',
          items: [
            { name: 'All modules', description: 'Show only entries for one module, for example Docker or Kubernetes.' },
            { name: 'Counter', description: 'Number of entries shown, newest first.' },
          ],
        },
        {
          name: 'Audit trail table',
          description: 'One row per audited action.',
        },
      ],
      tables: [
        {
          name: 'Audit trail',
          columns: [
            { name: 'Time', meaning: 'Exact time with "x ago" underneath.', example: '13 Nov 14:05 / 8 minutes ago' },
            { name: 'Outcome', meaning: 'success (green), failure (red), denied (orange, for example a rejected run) or pending (cyan, for example waiting for approval or an action just started).', example: 'denied' },
            { name: 'Action', meaning: 'What was done.', example: 'workload-restart' },
            { name: 'Module', meaning: 'Module that was acted on.', example: 'Kubernetes' },
            { name: 'Resource', meaning: 'Target of the action.', example: 'deployments/shop/api' },
            { name: 'Detail', meaning: 'Human readable description.', example: 'Approved rolling restart via automation Restart api on crash' },
          ],
        },
      ],
      example: {
        title: 'Example: trace one approved restart',
        steps: [
          'Filter module Kubernetes.',
          'Find workload-restart with outcome pending and detail "Approved rolling restart via automation Restart api on crash". This is written just before the restart is attempted.',
          'Clear the filter and look a few rows around it for automation-approved (who approved) and automation-run with outcome success.',
        ],
      },
      tips: [
        'A "pending" outcome on an action such as container-restart means the entry was written when the action started; the run result is in the matching automation-run entry.',
        'Deleting an automation does not delete its audit entries.',
      ],
    },

    'intelligence/settings': {
      title: 'Settings',
      summary: 'Preferences for the intelligence layer: whether automation runs, how often it checks, and whether environments may be guessed from names. Also shows the storage and health of the intelligence data.',
      whenToUse: [
        'You want to pause every automation at once, for example during maintenance.',
        'You want the automation engine to check more or less often.',
        'You want to turn off environment guessing.',
        'You want to know where the data is stored or why a refresh failed.',
      ],
      howItWorks: [
        'Settings are stored by the main process, not in the browser. Changes apply only after you press Save settings. The right-hand card is read-only status loaded each time you open or refresh the page.',
      ],
      parts: [
        {
          name: 'Collection and automation card',
          items: [
            { name: 'Automation enabled', description: 'When off, scheduled and condition triggers do not run and manual Run is refused. Manual dry runs still work.' },
            { name: 'Automation check interval (seconds)', description: 'How often the engine looks for due automations. Allowed 5 to 3600, default 15. A shorter interval reacts faster but checks more often.' },
            { name: 'Use environment heuristics', description: 'Allows inferring an environment from exact tokens (prod, stg, qa, dev and similar). Explicit assignments and rules always win.' },
            { name: 'Save settings', description: 'Stores the three values.' },
          ],
        },
        {
          name: 'Storage and status card',
          description: 'Read-only facts.',
          items: [
            { name: 'Data file', description: 'Path of the intelligence store on disk.' },
            { name: 'Loaded', description: 'yes (green) or no (red); no means the store could not be read.' },
            { name: 'Last refresh', description: 'When resources were last collected, how many were found and how long it took, for example "13 Nov 14:00 · 132 resources · 840 ms". Shows "Not run yet" before the first refresh.' },
            { name: 'Last error', description: 'The most recent collection error, or a dash.' },
            { name: 'Automation engine', description: 'enabled or disabled.' },
          ],
        },
        {
          name: 'Compatibility banner',
          description: 'Explains that the intelligence store is a separate, owner-only JSON file. Existing Docker, Kubernetes, database and observability data is untouched, and Intelligence never deletes their records.',
        },
      ],
      example: {
        title: 'Example: pause all automation for maintenance',
        steps: [
          'Untick Automation enabled and press Save settings.',
          'On the Automation page the Engine card now says paused.',
          'After maintenance, tick it again and save. Automations resume on their next check.',
        ],
      },
      tips: [
        'Pausing here is faster than pausing each automation, and does not change their own enabled state.',
        'If Last error keeps showing a message, open Source health on Overview to see which collector is failing.',
      ],
    },
  });
})();
