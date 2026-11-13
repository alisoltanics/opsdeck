'use strict';

/**
 * Line-by-line explanations for the code examples in Kubernetes lessons.
 * Built-in dictionaries cover kubectl, helm and Kubernetes YAML; every token of
 * a line is explained, with the YAML parent key for context.
 */
(function () {
  const OD = (window.OD = window.OD || {});

  const VERBS = {
    get: 'Lists objects, or shows one. Read-only.', describe: 'Shows one object in detail, including its recent Events. Read-only.',
    apply: 'Creates or updates objects from a manifest file so the cluster matches it (declarative).', create: 'Creates a new object once. Fails if it already exists.',
    delete: 'Deletes objects. Cannot be undone.', logs: 'Prints a container\'s standard output.', exec: 'Runs a command inside a running container.',
    run: 'Starts a Pod from an image quickly.', expose: 'Creates a Service for an existing workload.', scale: 'Changes the number of replicas.',
    rollout: 'Manages a rollout of a Deployment, StatefulSet or DaemonSet (status, history, restart, undo).', patch: 'Changes fields of an object in place.',
    label: 'Adds, changes or removes labels.', annotate: 'Adds, changes or removes annotations.', top: 'Shows CPU and memory usage (needs metrics-server).',
    config: 'Reads kubeconfig: clusters, users and contexts.', auth: 'Checks permissions (RBAC).', explain: 'Documents the fields of a resource type.',
    'api-resources': 'Lists every resource type the API server offers.', 'api-versions': 'Lists the API versions the server supports.', 'cluster-info': 'Shows the API server and core service addresses.',
    cordon: 'Marks a node unschedulable. Running Pods stay.', uncordon: 'Makes a node schedulable again.', drain: 'Evicts Pods from a node so it can be maintained.',
    taint: 'Adds a taint to a node so only tolerating Pods can run there.', wait: 'Blocks until a condition is met.', diff: 'Shows what apply would change.',
    events: 'Lists cluster events.', set: 'Changes a specific field, such as an image.', version: 'Prints client and server versions.', cp: 'Copies files to or from a container.',
    install: 'Installs a chart as a new release.', upgrade: 'Upgrades a release to a new chart or values.', uninstall: 'Removes a release.', rollback: 'Returns a release to an earlier revision.',
    list: 'Lists releases.', template: 'Renders chart templates locally without installing.', repo: 'Manages chart repositories.', search: 'Searches charts.', status: 'Shows a release\'s status.', history: 'Shows a release\'s revisions.', show: 'Shows chart information.',
  };
  const RES = {
    po: 'Pod', pod: 'Pod', pods: 'Pods', deploy: 'Deployment', deployment: 'Deployment', deployments: 'Deployments', rs: 'ReplicaSet', replicaset: 'ReplicaSet', sts: 'StatefulSet', statefulset: 'StatefulSet', ds: 'DaemonSet', daemonset: 'DaemonSet',
    job: 'Job', jobs: 'Jobs', cronjob: 'CronJob', cronjobs: 'CronJobs', svc: 'Service', service: 'Service', services: 'Services', ing: 'Ingress', ingress: 'Ingress', cm: 'ConfigMap', configmap: 'ConfigMap', configmaps: 'ConfigMaps',
    secret: 'Secret', secrets: 'Secrets', pv: 'PersistentVolume', pvc: 'PersistentVolumeClaim', sc: 'StorageClass', storageclass: 'StorageClass', ns: 'Namespace', namespace: 'Namespace', namespaces: 'Namespaces', node: 'Node', nodes: 'Nodes',
    sa: 'ServiceAccount', serviceaccount: 'ServiceAccount', role: 'Role', rolebinding: 'RoleBinding', clusterrole: 'ClusterRole', clusterrolebinding: 'ClusterRoleBinding', hpa: 'HorizontalPodAutoscaler', pdb: 'PodDisruptionBudget',
    netpol: 'NetworkPolicy', networkpolicy: 'NetworkPolicy', events: 'Events', endpoints: 'Endpoints', quota: 'ResourceQuota', resourcequota: 'ResourceQuota', limitrange: 'LimitRange',
  };
  const FLAGS = {
    '-n': 'Namespace to use (short for --namespace).', '--namespace': 'Namespace to use.', '-A': 'All namespaces.', '--all-namespaces': 'All namespaces.',
    '-o': 'Output format (wide, yaml, json, name, jsonpath=...).', '--output': 'Output format.', '-l': 'Label selector: only objects with these labels.', '--selector': 'Label selector.',
    '-f': 'Read objects from this file (or - for stdin).', '--filename': 'Read objects from this file.', '-w': 'Watch: keep printing changes.', '--watch': 'Watch for changes.',
    '--image': 'Container image to run.', '--replicas': 'Number of Pod copies.', '--port': 'Port the Service listens on.', '--target-port': 'Port on the Pod traffic is sent to.',
    '--previous': 'Show the logs of the previous (crashed) container.', '--tail': 'Show only the last N lines.', '--since': 'Only logs newer than this duration.', '-c': 'Container name inside the Pod.',
    '--container': 'Container name inside the Pod.', '--rm': 'Delete the Pod when the command ends.', '-it': 'Interactive terminal.', '-i': 'Keep stdin open.', '-t': 'Allocate a terminal.',
    '--dry-run': 'Show what would happen without changing anything.', '--show-labels': 'Add a LABELS column.', '--sort-by': 'Sort by a field.', '--field-selector': 'Filter by a field value.',
    '--from-literal': 'Add a key=value pair directly.', '--from-file': 'Load a value from a file.', '--as': 'Act as another user or ServiceAccount (impersonation).', '--set': 'Override a chart value.',
    '--create-namespace': 'Create the namespace if it is missing.', '--restart': 'Restart policy of the created Pod.', '--limits': 'Resource limits for the Pod.', '--requests': 'Resource requests for the Pod.',
    '--type': 'Type of the object, e.g. a Secret type.', '--cert': 'TLS certificate file.', '--key': 'TLS private key file.', '--list': 'List everything allowed.', '--ignore-daemonsets': 'Do not block on DaemonSet Pods.',
    '--delete-emptydir-data': 'Allow deleting emptyDir data during drain.', '--timeout': 'How long to wait.', '--revision': 'Revision number.', '--to-revision': 'Roll back to this revision.',
    '--overrides': 'Raw JSON merged into the generated object.', '--all': 'Apply to all objects of the type.', '--force': 'Force the action.', '--wait': 'Wait until finished.', '-p': 'Patch body (JSON) / port, by command.',
  };
  const YAML = {
    apiVersion: 'API group and version of this object type, e.g. v1 or apps/v1.', kind: 'The type of object (Pod, Deployment, Service...).', metadata: 'Identity of the object: name, namespace, labels, annotations.',
    name: 'Name of the object or item. Must be unique per type and namespace.', namespace: 'The namespace the object lives in.', labels: 'Key/value tags used by selectors to find this object.', annotations: 'Free-form notes for tools and humans. Not used for selection.',
    spec: 'The desired state: what you want to exist.', status: 'The observed state, written by Kubernetes. Do not set it.', replicas: 'How many Pod copies to keep running.', selector: 'Which Pods this object manages or targets, by labels.',
    matchLabels: 'Pods must have all of these labels.', matchExpressions: 'Label rules with operators like In, NotIn, Exists.', template: 'The Pod blueprint used to create Pods.', containers: 'The containers that run in the Pod.',
    initContainers: 'Containers that run to completion, in order, before the app containers start.', image: 'Container image to run (repository:tag).', imagePullPolicy: 'When to pull the image: Always, IfNotPresent or Never.',
    ports: 'Ports exposed by the container or Service.', containerPort: 'Port the app listens on inside the container.', port: 'Port number.', targetPort: 'Port on the Pod that receives the traffic.', nodePort: 'Port opened on every node (30000-32767).',
    protocol: 'TCP, UDP or SCTP.', env: 'Environment variables for the container.', envFrom: 'Load all keys of a ConfigMap or Secret as environment variables.', value: 'A literal value.', valueFrom: 'Take the value from another source (Secret, ConfigMap, field).',
    configMapKeyRef: 'Read one key from a ConfigMap.', secretKeyRef: 'Read one key from a Secret.', configMapRef: 'Reference a whole ConfigMap.', secretRef: 'Reference a whole Secret.', key: 'The key inside the ConfigMap or Secret.',
    volumes: 'Storage that Pods can mount.', volumeMounts: 'Where a volume appears inside the container.', mountPath: 'Directory inside the container where the volume is mounted.', readOnly: 'Mount without write access.',
    subPath: 'Mount only one file or subdirectory of the volume.', emptyDir: 'Scratch space that lives as long as the Pod.', persistentVolumeClaim: 'Use storage requested by a PVC.', claimName: 'Name of the PVC to use.', configMap: 'Mount a ConfigMap, or (in a volume) its files.',
    secret: 'Mount a Secret, or the Secret object itself.', resources: 'CPU and memory requests and limits.', requests: 'Amount the scheduler reserves for the container.', limits: 'Maximum the container may use.', cpu: 'CPU in cores or millicores (500m = half a core).', memory: 'Memory (128Mi, 1Gi).',
    'ephemeral-storage': 'Local disk scratch space.', storage: 'Disk size.', livenessProbe: 'Restarts the container when this check keeps failing.', readinessProbe: 'Removes the Pod from Services while this check fails.', startupProbe: 'Gives slow apps time to start before other probes begin.',
    httpGet: 'Probe by making an HTTP request.', path: 'URL path, or file path, depending on context.', tcpSocket: 'Probe by opening a TCP connection.', exec: 'Probe by running a command.', command: 'The command to run (replaces the image entrypoint).', args: 'Arguments passed to the command.',
    initialDelaySeconds: 'Seconds to wait before the first probe.', periodSeconds: 'Seconds between probes.', timeoutSeconds: 'Seconds before a probe counts as failed.', failureThreshold: 'Consecutive failures before acting.', successThreshold: 'Consecutive successes to be healthy again.',
    restartPolicy: 'What to do when a container exits: Always, OnFailure or Never.', serviceAccountName: 'ServiceAccount whose identity the Pod uses.', nodeSelector: 'Only run on nodes with these labels.', tolerations: 'Allow scheduling onto nodes with matching taints.',
    affinity: 'Rules that attract or repel Pods to nodes or other Pods.', securityContext: 'Security settings: user, privileges, filesystem.', runAsNonRoot: 'Refuse to start if the container would run as root.', runAsUser: 'Numeric user ID the process runs as.',
    allowPrivilegeEscalation: 'Whether the process can gain more privileges.', readOnlyRootFilesystem: 'Make the container filesystem read-only.', capabilities: 'Linux capabilities to add or drop.', drop: 'Capabilities to remove.',
    strategy: 'How updates replace old Pods.', rollingUpdate: 'Replace Pods gradually.', maxSurge: 'How many extra Pods may exist during an update.', maxUnavailable: 'How many Pods may be unavailable during an update.', type: 'The kind of strategy/Service/Secret/etc., by context.',
    serviceName: 'The headless Service that gives StatefulSet Pods stable DNS names.', volumeClaimTemplates: 'A PVC created per replica.', accessModes: 'How the volume can be mounted (ReadWriteOnce, ReadOnlyMany, ReadWriteMany).', storageClassName: 'Which StorageClass provisions the volume.',
    persistentVolumeReclaimPolicy: 'What happens to the volume when its claim is deleted: Retain or Delete.', capacity: 'Size of the volume.', hostPath: 'A directory on the node (for demos).', schedule: 'Cron schedule: minute hour day month weekday.',
    concurrencyPolicy: 'Allow, Forbid or Replace overlapping runs.', jobTemplate: 'The Job blueprint a CronJob creates.', completions: 'How many successful Pods the Job needs.', parallelism: 'How many Pods run at once.', backoffLimit: 'Retries before the Job is marked failed.',
    activeDeadlineSeconds: 'Maximum run time.', ttlSecondsAfterFinished: 'Delete the finished Job after this many seconds.', successfulJobsHistoryLimit: 'Finished Jobs to keep.', failedJobsHistoryLimit: 'Failed Jobs to keep.', suspend: 'Pause scheduling.',
    clusterIP: 'Virtual IP of the Service. "None" makes it headless.', externalName: 'DNS name this Service points to.', externalTrafficPolicy: 'Cluster or Local routing of external traffic.', sessionAffinity: 'Keep a client on the same Pod.',
    ingressClassName: 'Which ingress controller handles this Ingress.', rules: 'Routing or permission rules.', host: 'Hostname to match.', http: 'HTTP routing rules.', paths: 'List of path rules.', pathType: 'Exact, Prefix or ImplementationSpecific.',
    backend: 'Where matching traffic goes.', service: 'The Service name/port to use.', tls: 'TLS certificate settings.', hosts: 'Hostnames covered by the certificate.', secretName: 'Secret holding the TLS certificate and key.',
    podSelector: 'Pods the policy applies to (empty = all in the namespace).', policyTypes: 'Ingress, Egress or both.', ingress: 'Rules for incoming traffic (or the object type, by context).', egress: 'Rules for outgoing traffic.', from: 'Allowed traffic sources.', to: 'Allowed traffic destinations.',
    namespaceSelector: 'Select namespaces by label.', ipBlock: 'Select an IP range.', cidr: 'IP range, e.g. 10.0.0.0/16.', data: 'Key/value data. In a Secret values are base64.', stringData: 'Plain-text values; Kubernetes encodes them for you.', binaryData: 'Base64 binary data.', immutable: 'Prevent changes after creation.',
    subjects: 'Who gets the permissions (users, groups, ServiceAccounts).', roleRef: 'The Role or ClusterRole being granted.', apiGroups: 'API groups the rule covers ("" is the core group).', verbs: 'Allowed actions: get, list, watch, create, update, patch, delete.',
    resourceNames: 'Limit the rule to specific object names.', scaleTargetRef: 'The workload the autoscaler scales.', minReplicas: 'Lowest replica count.', maxReplicas: 'Highest replica count.', metrics: 'What the autoscaler measures.', target: 'The goal value for the metric.',
    averageUtilization: 'Target average usage as a percent of requests.', minAvailable: 'Pods that must stay up during voluntary disruption.', hard: 'Hard limits that are enforced.', default: 'Default limit applied when none is set.', defaultRequest: 'Default request applied when none is set.',
    max: 'Largest value allowed.', min: 'Smallest value allowed.', operator: 'How to compare: Equal, Exists, In...', effect: 'What the taint does: NoSchedule, PreferNoSchedule or NoExecute.', tolerationSeconds: 'How long to tolerate a NoExecute taint.',
    imagePullSecrets: 'Secrets used to pull private images.', hostNetwork: 'Use the node\'s network namespace.', terminationGracePeriodSeconds: 'Seconds allowed for graceful shutdown.', dnsPolicy: 'How DNS is set up for the Pod.', fsGroup: 'Group ID applied to mounted volumes.',
    updateStrategy: 'How a DaemonSet or StatefulSet applies updates.', partition: 'Only Pods with an ordinal at or above this number are updated.', revisionHistoryLimit: 'Old revisions kept for rollback.', minReadySeconds: 'Seconds a new Pod must be ready before it counts.',
    'current-context': 'The context kubectl uses by default.', clusters: 'Cluster definitions: API server address and CA.', users: 'Credentials for authenticating.', contexts: 'Named combinations of cluster + user + namespace.', cluster: 'A cluster entry / which cluster a context uses.',
    user: 'A user entry / which user a context uses.', server: 'API server URL.', 'certificate-authority-data': 'Base64 CA certificate used to trust the server.', token: 'Bearer token for authentication.', 'client-certificate-data': 'Base64 client certificate.', 'client-key-data': 'Base64 client private key.',
    replicaCount: 'Helm value: number of replicas the chart creates.', version: 'Chart or API version.', description: 'Human description.', appVersion: 'Version of the application the chart deploys.', dependencies: 'Charts this chart depends on.', repository: 'Where an image or chart comes from.', tag: 'Image tag.',
    nameserver: 'DNS server address.', search: 'Suffixes tried when resolving short names.', options: 'Resolver options, e.g. ndots.',
  };

  function leadingSpaces(line) { return line.length - line.trimStart().length; }

  function parentKeys(lines, index) {
    const chain = [];
    let indent = leadingSpaces(lines[index]);
    for (let i = index - 1; i >= 0 && indent > 0; i -= 1) {
      const l = lines[i];
      if (!l.trim() || /^\s*#/.test(l)) continue;
      const ind = leadingSpaces(l);
      if (ind < indent) {
        const m = /^\s*(?:-\s+)?([A-Za-z0-9_.\/-]+):/.exec(l);
        // A "- name: x" line is a list item, not a parent of its siblings.
        if (m && !/^\s*-\s/.test(l)) chain.unshift(m[1]);
        indent = ind;
      }
    }
    return chain;
  }

  function explainYaml(line, lines, index) {
    const raw = line.trim();
    if (!raw) return null;
    if (raw === '---') return { summary: 'Separates two objects in one file. Each block between --- lines is applied as its own object.', parts: [] };
    if (raw.startsWith('#')) return { summary: 'A comment. Kubernetes ignores it; it is there for people reading the file.', parts: [] };
    const parents = parentKeys(lines, index);
    const where = parents.length ? `Inside ${parents.join(' → ')}.` : 'Top level of the file.';
    const item = /^-\s+/.test(raw);
    const body = raw.replace(/^-\s+/, '');
    const m = /^([A-Za-z0-9_.\/-]+):\s*(.*)$/.exec(body);
    if (!m) {
      return item ? { summary: `A list item with the value "${body}".`, parts: [{ token: body, meaning: 'One entry of the list above.' }], where } : null;
    }
    const [, key, valueRaw] = m;
    const value = valueRaw.replace(/\s+#.*$/, '');
    const parts = [];
    const keyDoc = YAML[key] || (parents.includes('labels') || parents.includes('annotations') || parents.includes('matchLabels') || parents.includes('nodeSelector') ? 'A label/annotation key with its value.' : parents.includes('data') || parents.includes('stringData') ? 'A key stored in this ConfigMap/Secret; its value is what the app reads.' : null);
    parts.push({ token: `${key}:`, meaning: keyDoc || 'A field name. See the Kubernetes API reference for this resource.' });
    if (value) {
      let meaning = 'The value for this field.';
      if (key === 'kind') meaning = `Creates a ${value} object.`;
      else if (key === 'apiVersion') meaning = `Uses API version ${value}, which the ${value.includes('/') ? 'group ' + value.split('/')[0] : 'core group'} defines.`;
      else if (key === 'image') meaning = `Image ${value}. The part after ":" is the tag (version); without one it means "latest".`;
      else if (/^\d+(m|Mi|Gi|Ki)?$/.test(value) && /cpu|memory|storage/.test(key)) meaning = /m$/.test(value) ? `${parseInt(value, 10)} millicores = ${parseInt(value, 10) / 1000} of a CPU core.` : `${value} of ${key}.`;
      else if (value === '|' || value === '>' ) meaning = 'The next indented lines are one multi-line text value.';
      else if (value === '[]' || value === '{}') meaning = 'An empty list/map.';
      parts.push({ token: value, meaning });
    } else if (!item) parts.push({ token: '(nested)', meaning: 'The indented lines below belong to this key.' });
    return { summary: keyDoc || `Sets "${key}"${value ? ` to ${value}` : ''}.`, parts, where: item ? `${where} Starts a new list item (the "-").` : where };
  }

  function tokenize(s) {
    const out = []; let cur = ''; let q = '';
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (/\s/.test(ch)) { if (cur) out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function explainShell(line) {
    let raw = line.trim();
    if (!raw) return null;
    if (raw.startsWith('#')) return { summary: 'A comment. It is not executed.', parts: [] };
    raw = raw.replace(/^\$\s*/, '');
    const parts = [];
    const chunks = raw.split(/\s(\|\||&&|\|)\s/);
    let summary = '';
    chunks.forEach((chunk) => {
      if (chunk === '|') { parts.push({ token: '|', meaning: 'Pipe: sends the output of the left command into the right one.' }); return; }
      if (chunk === '&&') { parts.push({ token: '&&', meaning: 'Run the next command only if the previous one succeeded.' }); return; }
      if (chunk === '||') { parts.push({ token: '||', meaning: 'Run the next command only if the previous one failed.' }); return; }
      const t = tokenize(chunk);
      if (!t.length) return;
      let i = 0;
      const first = t[i];
      if (first === 'kubectl' || first === 'helm') {
        parts.push({ token: first, meaning: first === 'kubectl' ? 'The Kubernetes command-line client. It talks to the API server of the selected context.' : 'The Helm package manager for Kubernetes.' });
        i += 1;
        const verb = t[i];
        if (verb && VERBS[verb]) { parts.push({ token: verb, meaning: VERBS[verb] }); if (!summary) summary = `${first} ${verb}: ${VERBS[verb]}`; i += 1; }
        else if (!summary) summary = `Runs ${first}.`;
      } else {
        parts.push({ token: first, meaning: { grep: 'Keeps only the lines that match a pattern.', head: 'Keeps the first lines.', tail: 'Keeps the last lines.', base64: 'Encodes or decodes base64 (-d decodes).', sed: 'Edits or selects text by pattern.', cat: 'Prints a file.', less: 'Pages through long output.', curl: 'Makes an HTTP request.', wget: 'Downloads a URL.', nslookup: 'Looks up a DNS name.', echo: 'Prints text.', sh: 'Runs a shell.' }[first] || 'A command.' });
        if (!summary) summary = 'Runs a helper command.';
        i += 1;
      }
      for (; i < t.length; i += 1) {
        const a = t[i];
        const flag = a.split('=')[0];
        if (a === '--') { parts.push({ token: '--', meaning: 'Everything after this is the command to run inside the container, not an option for kubectl.' }); continue; }
        if (FLAGS[flag]) {
          const val = a.includes('=') ? a.slice(a.indexOf('=') + 1) : '';
          const next = !val && !a.includes('=') && t[i + 1] && !t[i + 1].startsWith('-') && !['-A', '--all-namespaces', '--rm', '-it', '-i', '-t', '-w', '--watch', '--previous', '--show-labels', '--list', '--all', '--force', '--wait', '--ignore-daemonsets', '--delete-emptydir-data', '--create-namespace'].includes(a) ? t[i + 1] : '';
          parts.push({ token: next ? `${a} ${next}` : a, meaning: FLAGS[flag] + (val ? ` Here: ${val}.` : next ? ` Here: ${next}.` : '') });
          if (next) i += 1;
        } else if (a.startsWith('-')) parts.push({ token: a, meaning: 'An option (flag). Run the command with --help to see what it does.' });
        else if (RES[a.replace(/s$/, '')] || RES[a]) parts.push({ token: a, meaning: `Resource type: ${RES[a] || RES[a.replace(/s$/, '')]}.` });
        else if (a.includes('/') && RES[a.split('/')[0]]) parts.push({ token: a, meaning: `${RES[a.split('/')[0]]} named "${a.split('/')[1]}".` });
        else if (/\.ya?ml$/.test(a)) parts.push({ token: a, meaning: 'A manifest file from this lesson.' });
        else if (a === '-') parts.push({ token: '-', meaning: 'Read from standard input.' });
        else parts.push({ token: a, meaning: 'An argument: usually the name of the object this command acts on, or a value.' });
      }
    });
    return { summary: summary || 'A shell command.', parts };
  }

  function explainText(line, lines, index) {
    const raw = line.trim();
    if (!raw) return null;
    if (/^\$\s/.test(raw)) return explainShell(raw);
    if (/^(kubectl|helm)\s/.test(raw)) return explainShell(raw);
    if (raw.startsWith('#')) return { summary: 'A comment or note about the sample.', parts: [] };
    if (/^[A-Za-z0-9_.\/-]+:\s/.test(raw) || /^[A-Za-z0-9_.\/-]+:$/.test(raw)) return explainYaml(line, lines, index);
    const cols = raw.split(/\s{2,}/);
    if (cols.length > 2) return { summary: 'A row of command output. Each column is a field of the object.', parts: cols.map((c) => ({ token: c, meaning: /^[A-Z][A-Z -]+$/.test(c) ? 'Column header.' : 'A value in this row.' })) };
    return { summary: 'A line of sample output or file content shown for illustration.', parts: [] };
  }

  function explain(line, lang, lines, index) {
    if (lang === 'yaml' || lang === 'yml') return explainYaml(line, lines, index);
    if (lang === 'text') return explainText(line, lines, index);
    return explainShell(line);
  }

  OD.lineHelp = { explain };
})();
