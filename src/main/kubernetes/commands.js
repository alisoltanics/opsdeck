'use strict';

/**
 * Ready-made kubectl commands.
 *
 * Commands are built from validated context/namespace/object names and are
 * shown to the user as copyable strings. They are never passed to a shell:
 * the console tokenizes them and executes kubectl with an argument array.
 */

const { RESOURCES } = require('./resources');

function quote(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function contextFlag(context) {
  return context ? `--context ${quote(context)}` : '';
}

function namespaceFlag(namespace) {
  return namespace ? `-n ${quote(namespace)}` : '';
}

function join(...parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function entry(label, command, description, tone = 'read', runnable = true) {
  return { label, command, description, tone, runnable };
}

/**
 * Helm, kind and Minikube are separate binaries, and some kubectl commands need
 * an interactive terminal or a real object name. Those are shown so they can be
 * copied, but the console only offers Run for safe, complete kubectl commands.
 */
function copyOnly(item) {
  return { ...item, runnable: false };
}

function objectRef(section, name) {
  const def = RESOURCES[section];
  if (!def) return quote(name);
  return `${def.resource}/${quote(name)}`;
}

function sectionCommands(section, opts = {}) {
  const context = opts.context || '';
  const namespace = opts.namespace || '';
  const name = opts.name || '';
  const all = opts.allNamespaces === true;
  const c = contextFlag(context);
  const n = namespaceFlag(namespace);
  const ref = name ? objectRef(section, name) : '';

  const get = (resource, extra = '') => join('kubectl get', resource, extra, all ? '-A' : n, c);
  const describe = (resource, placeholder = 'OBJECT') => join('kubectl describe', resource, quote(name || placeholder), n, c);
  const logs = (target) => join('kubectl logs', target || ref || 'POD', '--tail=200', n, c);
  const execShell = join('kubectl exec -it', ref || 'POD', '--', 'sh', n, c);

  switch (section) {
    case 'overview':
      return [
        entry('Cluster info', join('kubectl cluster-info', c), 'Endpoints and versions reported by the API server.'),
        entry('Nodes', join('kubectl get nodes -o wide', c), 'Readiness, roles, internal IPs and runtime versions.'),
        entry('All pods', join('kubectl get pods -A -o wide', c), 'Every pod in every namespace.'),
        entry('Warning events', join('kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp', c), 'Recent warning events ordered by time.'),
        entry('API resources', join('kubectl api-resources', c), 'Every resource type this cluster serves.'),
        entry('Current context', 'kubectl config current-context', 'The context kubectl would use by default.'),
      ];
    case 'topology':
      return [
        entry('Cluster map data', join('kubectl get pods,deployments,statefulsets,daemonsets,services,ingresses -A -o wide', c), 'The live objects behind the map in one command.'),
        entry('Nodes', join('kubectl get nodes -o wide', c), 'Node readiness, capacity and versions.'),
        entry('All services', join('kubectl get services -A -o wide', c), 'Service types, cluster IPs and selectors.'),
        entry('All ingresses', join('kubectl get ingresses -A -o wide', c), 'Hosts, classes and ingress addresses.'),
        entry('Warning events', join('kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp', c), 'Recent warnings across the cluster.'),
      ];
    case 'contexts':
      return [
        entry('Contexts', 'kubectl config get-contexts', 'All contexts visible to OpsDeck.'),
        entry('Current context', 'kubectl config current-context', 'The default context of the active kubeconfig.'),
        entry('Minified view', join('kubectl config view --minify', c), 'The selected context without certificate data.'),
        entry('Namespaces', join('kubectl get namespaces', c), 'Namespaces in the selected context.'),
      ];
    case 'namespaces':
      return [
        entry('Namespaces', join('kubectl get namespaces -o wide', c), 'Status and age for every namespace.'),
        entry('Pods in namespace', join('kubectl get pods -n', quote(namespace || 'default'), '-o wide', c), 'Workloads in the selected namespace.'),
        entry('Quotas', join('kubectl get resourcequotas,limitranges -n', quote(namespace || 'default'), c), 'Quota and limit range objects.'),
        entry('Describe namespace', join('kubectl describe namespace', quote(namespace || 'default'), c), 'Labels, annotations, status and quota usage.'),
      ];
    case 'nodes': {
      const node = name || 'NODE';
      return [
        entry('Nodes', join('kubectl get nodes -o wide', c), 'Capacity, addresses and versions.'),
        entry('Describe node', join('kubectl describe node', quote(node), c), 'Conditions, taints, capacity and pods.'),
        entry('Pods on node', join('kubectl get pods -A --field-selector spec.nodeName=' + quote(node), c), 'Every pod scheduled to this node.'),
        entry('Node metrics', join('kubectl top nodes', c), 'Live CPU and memory (requires metrics-server).'),
      ];
    }
    case 'pods': {
      const pod = name || 'POD';
      return [
        entry('Pods', join(get('pods', '-o wide')), 'Node, IP and readiness for every pod.'),
        entry('Not running', join('kubectl get pods -A --field-selector=status.phase!=Running', c), 'Pods that are pending, failed or unknown.'),
        entry('Describe', describe('pod', pod), 'Conditions, containers, events and volumes.'),
        entry('Logs', logs(name ? ref : pod), 'Last 200 lines from the first container.', 'read'),
        copyOnly(entry('Follow logs', join('kubectl logs -f', name ? ref : pod, n, c), 'Copy this into your own terminal; the console rejects streaming commands.', 'read')),
        copyOnly(entry('Shell', execShell, 'Use the Shell action on a pod row for a real interactive terminal.', 'write')),
        entry('Metrics', join('kubectl top pod', quote(pod), n, c), 'Live CPU and memory (requires metrics-server).'),
      ];
    }
    case 'deployments':
    case 'statefulsets':
    case 'daemonsets': {
      const def = RESOURCES[section];
      const target = name ? objectRef(section, name) : def.resource;
      return [
        entry(def.label, join(get(def.resource, '-o wide')), 'Desired, ready and available replicas.'),
        entry('Describe', join('kubectl describe', def.resource, name ? quote(name) : '', n, c), 'Strategy, conditions and pod template.'),
        entry('Rollout status', join('kubectl rollout status', target, n, c), 'Watch the current rollout until it settles.'),
        entry('Rollout history', join('kubectl rollout history', target, n, c), 'Revision history for this workload.'),
        entry('Pods', join('kubectl get pods', n, c, '-o wide'), 'Pods in the namespace; inspect labels to find this workload.'),
        entry('Scale', join('kubectl scale', target, '--replicas=3', n, c), 'Change the desired replica count.', 'write'),
        entry('Restart', join('kubectl rollout restart', target, n, c), 'Perform a rolling restart.', 'write'),
      ];
    }
    case 'jobs':
      return [
        entry('Jobs', join(get('jobs.batch', '-o wide')), 'Completions, duration and status.'),
        entry('Describe', describe('job', 'JOB'), 'Conditions and pod template.'),
        entry('Logs', join('kubectl logs', name ? objectRef(section, name) : 'job/JOB', '--tail=200', n, c), 'Logs from the first pod of the job.'),
        entry('Pods', join('kubectl get pods', n, c, '-o wide'), 'Pods created by this job.'),
      ];
    case 'cronjobs':
      return [
        entry('CronJobs', join(get('cronjobs.batch')), 'Schedule, suspend state and last run.'),
        entry('Describe', describe('cronjob', 'CRONJOB'), 'Schedule, concurrency policy and history.'),
        entry('Jobs', join('kubectl get jobs', n, c), 'Jobs created by this CronJob.'),
        entry('Trigger now', join('kubectl create job', `--from=cronjob/${quote(name || 'CRONJOB')}`, `${quote((name || 'cronjob') + '-manual')}`, n, c), 'Create a one-off Job from this CronJob.', 'write'),
      ];
    case 'services':
      return [
        entry('Services', join(get('services', '-o wide')), 'Type, cluster IP, ports and selectors.'),
        entry('Endpoints', join('kubectl get endpoints', n, c), 'Ready backend addresses for each service.'),
        entry('Describe', describe('service', 'SERVICE'), 'Ports, selector and endpoints.'),
        copyOnly(entry('Port forward', join('kubectl port-forward', name ? `service/${quote(name)}` : 'service/SERVICE', '8080:80', n, c), 'Copy this into your own terminal; port-forward needs an interactive client.', 'write')),
      ];
    case 'ingresses':
      return [
        entry('Ingresses', join(get('ingresses.networking.k8s.io', '-o wide')), 'Hosts, class and address.'),
        entry('Ingress classes', join('kubectl get ingressclasses', c), 'Installed ingress controllers.'),
        entry('Describe', describe('ingress', 'INGRESS'), 'Rules, paths, TLS and backend services.'),
      ];
    case 'networkpolicies':
      return [
        entry('Policies', join(get('networkpolicies.networking.k8s.io')), 'Policy types and pod selectors.'),
        entry('Describe', describe('networkpolicy', 'POLICY'), 'Ingress and egress rules.'),
        entry('Pods', join('kubectl get pods --show-labels', n, c), 'Labels used by policy selectors.'),
      ];
    case 'persistentvolumes':
      return [
        entry('Volumes', join('kubectl get persistentvolumes', c), 'Capacity, access modes and claim binding.'),
        entry('Describe', describe('persistentvolume', 'PV'), 'Storage class, claim and mount options.'),
        entry('Claims', join('kubectl get persistentvolumeclaims -A', c), 'Claims in every namespace.'),
      ];
    case 'persistentvolumeclaims':
      return [
        entry('Claims', join(get('persistentvolumeclaims', '-o wide')), 'Status, volume and capacity.'),
        entry('Describe', describe('persistentvolumeclaim', 'PVC'), 'Binding, storage class and events.'),
        entry('Mounted by', join('kubectl get pods', n, c, '-o jsonpath={range .items[*]}{.metadata.name}{"\\n"}{end}'), 'Pods in the namespace that may mount this claim.'),
      ];
    case 'storageclasses':
      return [
        entry('Storage classes', join('kubectl get storageclasses', c), 'Provisioners and default class.'),
        entry('Describe', describe('storageclass', 'CLASS'), 'Reclaim policy, binding mode and parameters.'),
      ];
    case 'configmaps':
      return [
        entry('ConfigMaps', join(get('configmaps')), 'Keys and age.'),
        entry('Describe', describe('configmap', 'CONFIGMAP'), 'Key names, values and metadata.'),
        entry('Keys only', join('kubectl get configmap', quote(name || 'CONFIGMAP'), '-o', quote('go-template={{range $k,$v := .data}}{{$k}}{{"\\n"}}{{end}}'), n, c), 'Data key names without rendering values.'),
      ];
    case 'secrets':
      return [
        entry('Secrets', join(get('secrets')), 'Names, types and key counts.'),
        entry('Describe', describe('secret', 'SECRET'), 'Key names and encoded sizes; values are never printed.'),
        entry('Keys only', join('kubectl get secret', quote(name || 'SECRET'), '-o', quote('go-template={{range $k,$v := .data}}{{$k}}{{"\\n"}}{{end}}'), n, c), 'Key names only. Values stay inside the cluster.'),
      ];
    case 'resourcequotas':
    case 'limitranges':
      return [
        entry(RESOURCES[section].label, join(get(RESOURCES[section].resource)), 'Usage and limits in the namespace.'),
        entry('Describe', join('kubectl describe', RESOURCES[section].resource, name ? quote(name) : '', n, c), 'Hard limits and current usage.'),
      ];
    case 'serviceaccounts':
      return [
        entry('Service accounts', join(get('serviceaccounts')), 'Secrets and pull secret references.'),
        entry('Describe', describe('serviceaccount', 'ACCOUNT'), 'Mount rules and referenced secrets.'),
        copyOnly(entry('Permissions', join('kubectl auth can-i --list', '--as=system:serviceaccount:' + quote(namespace || 'default') + ':' + quote(name || 'default'), n, c), 'Copy this into your own terminal; the console does not allow identity overrides.', 'write')),
      ];
    case 'roles':
    case 'clusterroles':
      return [
        entry(RESOURCES[section].label, join(get(RESOURCES[section].resource)), 'Rule counts and verbs.'),
        entry('Describe', join('kubectl describe', RESOURCES[section].resource, name ? quote(name) : '', n, c), 'Resources, verbs and API groups.'),
        entry('Can I', join('kubectl auth can-i --list', n, c), 'Permissions for the active user.', 'write'),
      ];
    case 'rolebindings':
    case 'clusterrolebindings':
      return [
        entry(RESOURCES[section].label, join(get(RESOURCES[section].resource)), 'Role and subject counts.'),
        entry('Describe', join('kubectl describe', RESOURCES[section].resource, name ? quote(name) : '', n, c), 'Role references and subjects.'),
      ];
    case 'events':
      return [
        entry('Recent events', join('kubectl get events', n, c, '--sort-by=.lastTimestamp'), 'Newest events first.'),
        entry('Warnings', join('kubectl get events', n, c, '--field-selector type=Warning --sort-by=.lastTimestamp'), 'Only warning events.'),
        entry('All namespaces', join('kubectl get events -A --sort-by=.lastTimestamp', c), 'Cluster-wide event stream.'),
      ];
    case 'helm':
      return [
        entry('Releases', join('helm list -A', context ? `--kube-context ${quote(context)}` : ''), 'Installed Helm releases.'),
        entry('Status', join('helm status', quote(name || 'RELEASE'), n, context ? `--kube-context ${quote(context)}` : ''), 'Release status and resources.'),
        entry('History', join('helm history', quote(name || 'RELEASE'), n, context ? `--kube-context ${quote(context)}` : ''), 'Revision history.'),
        entry('Values', join('helm get values', quote(name || 'RELEASE'), n, context ? `--kube-context ${quote(context)}` : ''), 'User-supplied values for the release.'),
      ].map(copyOnly);
    case 'tools':
      return [
        entry('kubectl version', 'kubectl version --client', 'Client version installed by OpsDeck.'),
        entry('Kind clusters', 'kind get clusters', 'Local kind clusters.'),
        entry('Minikube status', 'minikube status', 'Minikube profile state.'),
        entry('Helm version', 'helm version --short', 'Installed Helm version.'),
      ].map(copyOnly);
    case 'console':
      return [
        entry('Pods', join('kubectl get pods -o wide', n, c), 'Start with the selected namespace.'),
        entry('All resources', join('kubectl get all', n, c), 'Common workloads, services and pods.'),
        entry('Events', join('kubectl get events', n, c, '--sort-by=.lastTimestamp'), 'Recent namespace events.'),
        entry('Nodes', join('kubectl get nodes -o wide', c), 'Cluster nodes.'),
        copyOnly(entry('Describe pod', join('kubectl describe pod POD', n, c), 'Copy, then replace POD with a real pod name.')),
        copyOnly(entry('Logs', join('kubectl logs POD --tail=200', n, c), 'Copy, then replace POD with a real pod name.')),
      ];
    default:
      return [
        entry('Pods', join('kubectl get pods -o wide', n, c), 'Pods in the selected namespace.'),
        entry('All resources', join('kubectl get all', n, c), 'Common resources in the namespace.'),
        entry('Events', join('kubectl get events', n, c, '--sort-by=.lastTimestamp'), 'Recent events.'),
      ];
  }
}

function objectCommands(section, opts = {}) {
  const context = opts.context || '';
  const namespace = opts.namespace || '';
  const name = opts.name || '';
  const c = contextFlag(context);
  const n = namespaceFlag(namespace);
  const def = RESOURCES[section];
  if (!def || !name) return sectionCommands(section, opts);
  const ref = objectRef(section, name);

  const eventsEntry = entry('Events', join('kubectl get events', n, c, '--field-selector involvedObject.name=' + quote(name), '--sort-by=.lastTimestamp'), 'Events involving this object.');
  const keysEntry = entry('Keys', join('kubectl get', def.resource, quote(name), '-o', quote('go-template={{range $k,$v := .data}}{{$k}}{{"\\n"}}{{end}}'), n, c), 'Data key names only; values stay inside the cluster.');

  // Secret data must never be printed into the UI. JSON/YAML output is omitted
  // for Secrets; describe and the key-only template are safe.
  const commands = section === 'secrets'
    ? [
      entry('Describe', join('kubectl describe', def.resource, quote(name), n, c), 'Key names and encoded sizes; values are never printed.'),
      keysEntry,
      eventsEntry,
    ]
    : [
      entry('Describe', join('kubectl describe', def.resource, quote(name), n, c), 'Full status, conditions and recent events.'),
      entry('JSON', join('kubectl get', def.resource, quote(name), '-o json', n, c), 'Raw object as JSON for inspection.'),
      entry('JSONPath', join('kubectl get', def.resource, quote(name), '-o', 'jsonpath={.status}', n, c), 'Just the status object.'),
      eventsEntry,
    ];

  if (section === 'pods') {
    commands.push(
      entry('Logs', join('kubectl logs', quote(name), '--tail=200', n, c), 'Last 200 lines from the first container.'),
      entry('Previous logs', join('kubectl logs', quote(name), '--previous', '--tail=200', n, c), 'Logs from the previous container instance.'),
      copyOnly(entry('Shell', join('kubectl exec -it', quote(name), '--', 'sh', n, c), 'Use the Shell action on the pod row for a real interactive terminal.', 'write')),
      entry('Metrics', join('kubectl top pod', quote(name), n, c), 'Live CPU and memory (requires metrics-server).'),
    );
  } else if (section === 'deployments' || section === 'statefulsets' || section === 'daemonsets') {
    commands.push(
      entry('Rollout status', join('kubectl rollout status', ref, n, c), 'Watch the rollout until it settles.'),
      entry('Rollout history', join('kubectl rollout history', ref, n, c), 'Revision history.'),
    );
  } else if (section === 'services') {
    commands.push(entry('Endpoints', join('kubectl get endpoints', quote(name), n, c), 'Ready pod addresses for this service.'));
  } else if (section === 'configmaps') {
    commands.push(keysEntry);
  } else if (section === 'helm') {
    commands.push(entry('Status', join('helm status', quote(name), n, context ? `--kube-context ${quote(context)}` : ''), 'Release status.'));
  }

  return commands;
}

module.exports = { sectionCommands, objectCommands, quote };
