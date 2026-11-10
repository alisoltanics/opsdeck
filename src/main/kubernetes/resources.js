'use strict';

/**
 * Kubernetes resource catalog.
 *
 * Each definition maps a UI section to a real kubectl resource, the columns it
 * exposes and a trimmer that turns raw API objects into renderer-safe rows.
 *
 * Secrets and ConfigMaps are metadata-only: their values never enter a row.
 * Every other trimmer keeps the fields a human needs to understand the object
 * without copying full manifests into the renderer.
 */

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function cell(value, opts = {}) {
  const raw = text(value);
  return { text: raw === '' ? '—' : raw, ...opts };
}

function mono(value, opts = {}) {
  return cell(value, { mono: true, ...opts });
}

function strong(value, opts = {}) {
  return cell(value, { strong: true, mono: true, ...opts });
}

function badge(value, tone) {
  return cell(value, { badge: true, tone: tone || 'slate' });
}

function age(value) {
  return value ? { text: text(value), age: true } : cell('');
}

function row(item, cells, extra = {}) {
  const metadata = item?.metadata || {};
  return {
    name: text(metadata.name),
    namespace: text(metadata.namespace),
    created: metadata.creationTimestamp || null,
    sortAt: metadata.creationTimestamp ? Date.parse(metadata.creationTimestamp) : 0,
    cells,
    ...extra,
  };
}

function labelsText(selector) {
  const entries = Object.entries(selector || {});
  if (!entries.length) return '';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function firstImage(item) {
  const containers = item?.spec?.template?.spec?.containers || [];
  return containers[0]?.image || '';
}

function allImages(item) {
  const containers = item?.spec?.template?.spec?.containers || [];
  return containers.map((container) => container.image).filter(Boolean);
}

function duration(start, end) {
  if (!start) return '';
  const from = Date.parse(start);
  const to = end ? Date.parse(end) : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return '';
  const seconds = Math.floor((to - from) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function phaseTone(phase) {
  switch (text(phase)) {
    case 'Running':
    case 'Active':
    case 'Bound':
    case 'Available':
    case 'Ready':
      return 'green';
    case 'Pending':
    case 'Progressing':
    case 'Released':
      return 'amber';
    case 'Failed':
    case 'Error':
    case 'Lost':
      return 'red';
    case 'Succeeded':
    case 'Complete':
      return 'cyan';
    default:
      return 'slate';
  }
}

function trimPod(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const containers = spec.containers || [];
  const statuses = status.containerStatuses || [];
  const total = containers.length;
  const ready = statuses.filter((entry) => entry.ready).length;
  const restarts = statuses.reduce((sum, entry) => sum + (Number(entry.restartCount) || 0), 0);
  const phase = status.phase || 'Unknown';
  const deleting = Boolean(item?.metadata?.deletionTimestamp);
  const statusText = deleting ? 'Terminating' : (status.reason || phase);
  const tone = deleting ? 'amber' : phaseTone(phase);
  return row(item, [
    strong(item?.metadata?.name),
    mono(`${ready}/${total}`),
    mono(String(restarts), { tone: restarts ? 'amber' : '' }),
    mono(spec.nodeName),
    mono(status.podIP),
    badge(statusText, tone),
    age(item?.metadata?.creationTimestamp),
  ], { images: allImages(item), status: statusText, ready, total, restarts });
}

function trimDeployment(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const desired = Number(spec.replicas ?? 0);
  const ready = Number(status.readyReplicas || 0);
  const updated = Number(status.updatedReplicas || 0);
  const available = Number(status.availableReplicas || 0);
  const complete = desired === 0 || (ready >= desired && available >= desired);
  const statusText = desired === 0 ? 'Scaled to zero' : complete ? 'Available' : available > 0 ? 'Progressing' : 'Unavailable';
  const tone = desired === 0 ? 'slate' : complete ? 'green' : available > 0 ? 'amber' : 'red';
  return row(item, [
    strong(item?.metadata?.name),
    mono(`${ready}/${desired}`),
    mono(String(updated)),
    mono(String(available)),
    mono(firstImage(item)),
    badge(statusText, tone),
    age(item?.metadata?.creationTimestamp),
  ], { images: allImages(item), status: statusText, desired, ready });
}

function trimStatefulSet(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const desired = Number(spec.replicas ?? 0);
  const ready = Number(status.readyReplicas || 0);
  const current = Number(status.currentReplicas || 0);
  const updated = Number(status.updatedReplicas || 0);
  const complete = desired === 0 || ready >= desired;
  const statusText = desired === 0 ? 'Scaled to zero' : complete ? 'Ready' : 'Progressing';
  const tone = desired === 0 ? 'slate' : complete ? 'green' : 'amber';
  return row(item, [
    strong(item?.metadata?.name),
    mono(`${ready}/${desired}`),
    mono(String(current)),
    mono(String(updated)),
    mono(firstImage(item)),
    badge(statusText, tone),
    age(item?.metadata?.creationTimestamp),
  ], { images: allImages(item), status: statusText, desired, ready });
}

function trimDaemonSet(item) {
  const status = item?.status || {};
  const desired = Number(status.desiredNumberScheduled || 0);
  const ready = Number(status.numberReady || 0);
  const available = Number(status.numberAvailable || 0);
  const updated = Number(status.updatedNumberScheduled || 0);
  const complete = desired === 0 || ready >= desired;
  const statusText = complete ? 'Ready' : available > 0 ? 'Progressing' : 'Unavailable';
  const tone = complete ? 'green' : available > 0 ? 'amber' : 'red';
  return row(item, [
    strong(item?.metadata?.name),
    mono(String(desired)),
    mono(String(ready)),
    mono(String(available)),
    mono(String(updated)),
    mono(firstImage(item)),
    badge(statusText, tone),
    age(item?.metadata?.creationTimestamp),
  ], { images: allImages(item), status: statusText, desired, ready });
}

function jobCondition(status, type) {
  return (status?.conditions || []).find((condition) => condition.type === type && condition.status === 'True');
}

function trimJob(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const completions = Number(spec.completions ?? 1);
  const succeeded = Number(status.succeeded || 0);
  const failed = Number(status.failed || 0);
  const active = Number(status.active || 0);
  const complete = Boolean(jobCondition(status, 'Complete')) || succeeded >= completions;
  const jobFailed = Boolean(jobCondition(status, 'Failed'));
  const statusText = complete ? 'Complete' : jobFailed ? 'Failed' : active > 0 ? 'Running' : 'Pending';
  const tone = complete ? 'green' : jobFailed ? 'red' : active > 0 ? 'cyan' : 'amber';
  return row(item, [
    strong(item?.metadata?.name),
    mono(`${succeeded}/${completions}`),
    mono(String(succeeded)),
    mono(String(failed), { tone: failed ? 'red' : '' }),
    mono(String(active)),
    cell(duration(status.startTime, status.completionTime)),
    badge(statusText, tone),
    age(item?.metadata?.creationTimestamp),
  ], { status: statusText, completions, succeeded, failed, active });
}

function trimCronJob(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const active = Array.isArray(status.active) ? status.active.length : 0;
  const suspended = spec.suspend === true;
  const statusText = suspended ? 'Suspended' : active > 0 ? 'Active' : 'Idle';
  const tone = suspended ? 'amber' : active > 0 ? 'green' : 'slate';
  return row(item, [
    strong(item?.metadata?.name),
    mono(spec.schedule),
    badge(suspended ? 'suspended' : 'active', suspended ? 'amber' : 'green'),
    mono(String(active)),
    cell(status.lastScheduleTime || status.lastSuccessfulTime || ''),
    badge(statusText, tone),
    age(item?.metadata?.creationTimestamp),
  ], { status: statusText, schedule: spec.schedule, suspended, active });
}

function trimService(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const type = spec.type || 'ClusterIP';
  const external = [
    ...(Array.isArray(spec.externalIPs) ? spec.externalIPs : []),
    ...((status.loadBalancer?.ingress || []).map((entry) => entry.ip || entry.hostname).filter(Boolean)),
  ];
  const ports = (spec.ports || []).map((port) => {
    const protocol = port.protocol ? `/${port.protocol}` : '';
    const nodePort = port.nodePort ? `→${port.nodePort}` : '';
    return `${port.port ?? ''}${protocol}${nodePort}`;
  }).filter(Boolean).join(', ');
  const tone = type === 'LoadBalancer' ? 'cyan' : type === 'NodePort' ? 'violet' : type === 'ExternalName' ? 'amber' : 'slate';
  return row(item, [
    strong(item?.metadata?.name),
    badge(type, tone),
    mono(spec.clusterIP),
    mono(external.join(', ')),
    mono(ports),
    mono(labelsText(spec.selector)),
    age(item?.metadata?.creationTimestamp),
  ], { type, clusterIP: spec.clusterIP || '' });
}

function trimIngress(item) {
  const spec = item?.spec || {};
  const annotations = item?.metadata?.annotations || {};
  const ingressClass = spec.ingressClassName || annotations['kubernetes.io/ingress.class'] || '';
  const hosts = (spec.rules || []).map((rule) => rule.host).filter(Boolean);
  const address = (item?.status?.loadBalancer?.ingress || []).map((entry) => entry.ip || entry.hostname).filter(Boolean);
  return row(item, [
    strong(item?.metadata?.name),
    mono(ingressClass),
    mono(hosts.join(', ')),
    cell((spec.tls || []).length ? 'yes' : 'no'),
    mono(address.join(', ')),
    age(item?.metadata?.creationTimestamp),
  ], { hosts, class: ingressClass });
}

function trimNetworkPolicy(item) {
  const spec = item?.spec || {};
  const selector = labelsText(spec.podSelector?.matchLabels) || (spec.podSelector && !Object.keys(spec.podSelector).length ? 'All pods' : '');
  return row(item, [
    strong(item?.metadata?.name),
    mono(selector),
    mono((spec.policyTypes || []).join(', ')),
    age(item?.metadata?.creationTimestamp),
  ], { policyTypes: spec.policyTypes || [] });
}

function trimPersistentVolume(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  const claim = spec.claimRef ? `${spec.claimRef.namespace || ''}/${spec.claimRef.name || ''}`.replace(/^\//, '') : '';
  return row(item, [
    strong(item?.metadata?.name),
    mono(spec.capacity?.storage),
    mono((spec.accessModes || []).join(', ')),
    mono(spec.persistentVolumeReclaimPolicy),
    badge(status.phase || 'Unknown', phaseTone(status.phase)),
    mono(claim),
    mono(spec.storageClassName),
    age(item?.metadata?.creationTimestamp),
  ], { phase: status.phase || '' });
}

function trimPersistentVolumeClaim(item) {
  const spec = item?.spec || {};
  const status = item?.status || {};
  return row(item, [
    strong(item?.metadata?.name),
    badge(status.phase || 'Unknown', phaseTone(status.phase)),
    mono(spec.volumeName),
    mono(status.capacity?.storage),
    mono((spec.accessModes || []).join(', ')),
    mono(spec.storageClassName),
    age(item?.metadata?.creationTimestamp),
  ], { phase: status.phase || '' });
}

function trimStorageClass(item) {
  const annotations = item?.metadata?.annotations || {};
  const isDefault = annotations['storageclass.kubernetes.io/is-default-class'] === 'true';
  return row(item, [
    strong(item?.metadata?.name),
    mono(item?.provisioner),
    mono(item?.reclaimPolicy),
    mono(item?.volumeBindingMode),
    cell(item?.allowVolumeExpansion ? 'yes' : 'no'),
    badge(isDefault ? 'default' : 'no', isDefault ? 'green' : 'slate'),
    age(item?.metadata?.creationTimestamp),
  ], { provisioner: item?.provisioner || '', isDefault });
}

function trimConfigMap(item) {
  const keys = Object.keys(item?.data || {}).length + Object.keys(item?.binaryData || {}).length;
  return row(item, [
    strong(item?.metadata?.name),
    mono(String(keys)),
    age(item?.metadata?.creationTimestamp),
  ], { keys });
}

function trimSecret(item) {
  const keys = Object.keys(item?.data || {}).length + Object.keys(item?.stringData || {}).length;
  return row(item, [
    strong(item?.metadata?.name),
    badge(item?.type || 'Opaque', item?.type === 'kubernetes.io/tls' ? 'cyan' : 'amber'),
    mono(String(keys)),
    age(item?.metadata?.creationTimestamp),
  ], { type: item?.type || 'Opaque', keys });
}

function trimResourceQuota(item) {
  const hard = item?.status?.hard || {};
  const used = item?.status?.used || {};
  const usage = Object.keys(hard).slice(0, 6).map((key) => `${key} ${used[key] || 0}/${hard[key]}`).join(', ');
  return row(item, [
    strong(item?.metadata?.name),
    mono(usage),
    age(item?.metadata?.creationTimestamp),
  ], { resources: Object.keys(hard).length });
}

function trimLimitRange(item) {
  const limits = (item?.spec?.limits || []).map((limit) => {
    const defaults = Object.keys(limit.default || {}).length;
    const maximum = Object.keys(limit.max || {}).length;
    return `${limit.type || 'Container'} (${defaults} defaults, ${maximum} max)`;
  });
  return row(item, [
    strong(item?.metadata?.name),
    mono(limits.join(', ')),
    age(item?.metadata?.creationTimestamp),
  ], { types: (item?.spec?.limits || []).map((limit) => limit.type) });
}

function trimServiceAccount(item) {
  const secrets = Array.isArray(item?.secrets) ? item.secrets.length : 0;
  const pullSecrets = Array.isArray(item?.imagePullSecrets) ? item.imagePullSecrets.length : 0;
  const automount = item?.automountServiceAccountToken === undefined ? 'default' : item.automountServiceAccountToken ? 'yes' : 'no';
  return row(item, [
    strong(item?.metadata?.name),
    mono(String(secrets)),
    mono(String(pullSecrets)),
    cell(automount),
    age(item?.metadata?.creationTimestamp),
  ], { secrets, pullSecrets });
}

function trimRole(item) {
  const rules = Array.isArray(item?.rules) ? item.rules.length : 0;
  const verbs = [...new Set((item?.rules || []).flatMap((rule) => rule.verbs || []))].slice(0, 8);
  return row(item, [
    strong(item?.metadata?.name),
    mono(String(rules)),
    mono(verbs.join(', ')),
    age(item?.metadata?.creationTimestamp),
  ], { rules, verbs });
}

function trimRoleBinding(item) {
  const role = item?.roleRef ? `${item.roleRef.kind || 'Role'}/${item.roleRef.name || ''}` : '';
  const subjects = (item?.subjects || []).slice(0, 4).map((subject) => `${subject.kind || ''}:${subject.name || ''}`);
  return row(item, [
    strong(item?.metadata?.name),
    mono(role),
    mono(subjects.join(', ')),
    age(item?.metadata?.creationTimestamp),
  ], { role, subjects: (item?.subjects || []).length });
}

function eventTime(item) {
  return item?.lastTimestamp || item?.eventTime || item?.firstTimestamp || item?.metadata?.creationTimestamp || null;
}

function trimEvent(item) {
  const involved = item?.involvedObject || {};
  const type = item?.type || 'Normal';
  const name = `${involved.kind || 'Object'}/${involved.name || ''}`;
  const when = eventTime(item);
  return row(item, [
    badge(type, type === 'Warning' ? 'amber' : 'slate'),
    cell(item?.reason),
    mono(name),
    mono(item?.metadata?.namespace),
    mono(String(item?.count || 1)),
    mono(text(item?.message).slice(0, 180)),
    age(when),
  ], {
    lastSeen: when,
    sortAt: when ? Date.parse(when) : 0,
    type,
    reason: item?.reason || '',
    object: name,
    message: text(item?.message),
  });
}

const RESOURCES = {
  pods: { label: 'Pods', resource: 'pods', namespaced: true, columns: ['Name', 'Ready', 'Restarts', 'Node', 'IP', 'Status', 'Age'], trim: trimPod },
  deployments: { label: 'Deployments', resource: 'deployments.apps', namespaced: true, columns: ['Name', 'Ready', 'Updated', 'Available', 'Image', 'Status', 'Age'], trim: trimDeployment },
  statefulsets: { label: 'StatefulSets', resource: 'statefulsets.apps', namespaced: true, columns: ['Name', 'Ready', 'Current', 'Updated', 'Image', 'Status', 'Age'], trim: trimStatefulSet },
  daemonsets: { label: 'DaemonSets', resource: 'daemonsets.apps', namespaced: true, columns: ['Name', 'Desired', 'Ready', 'Available', 'Updated', 'Image', 'Status', 'Age'], trim: trimDaemonSet },
  jobs: { label: 'Jobs', resource: 'jobs.batch', namespaced: true, columns: ['Name', 'Completions', 'Succeeded', 'Failed', 'Active', 'Duration', 'Status', 'Age'], trim: trimJob },
  cronjobs: { label: 'CronJobs', resource: 'cronjobs.batch', namespaced: true, columns: ['Name', 'Schedule', 'Suspended', 'Active', 'Last Schedule', 'Status', 'Age'], trim: trimCronJob },

  services: { label: 'Services', resource: 'services', namespaced: true, columns: ['Name', 'Type', 'Cluster IP', 'External', 'Ports', 'Selector', 'Age'], trim: trimService },
  ingresses: { label: 'Ingresses', resource: 'ingresses.networking.k8s.io', namespaced: true, columns: ['Name', 'Class', 'Hosts', 'TLS', 'Address', 'Age'], trim: trimIngress },
  networkpolicies: { label: 'Network policies', resource: 'networkpolicies.networking.k8s.io', namespaced: true, columns: ['Name', 'Pod selector', 'Types', 'Age'], trim: trimNetworkPolicy },

  persistentvolumes: { label: 'Persistent volumes', resource: 'persistentvolumes', namespaced: false, columns: ['Name', 'Capacity', 'Access', 'Reclaim', 'Status', 'Claim', 'Class', 'Age'], trim: trimPersistentVolume },
  persistentvolumeclaims: { label: 'Persistent volume claims', resource: 'persistentvolumeclaims', namespaced: true, columns: ['Name', 'Status', 'Volume', 'Capacity', 'Access', 'Class', 'Age'], trim: trimPersistentVolumeClaim },
  storageclasses: { label: 'Storage classes', resource: 'storageclasses.storage.k8s.io', namespaced: false, columns: ['Name', 'Provisioner', 'Reclaim', 'Binding', 'Expansion', 'Default', 'Age'], trim: trimStorageClass },

  configmaps: { label: 'ConfigMaps', resource: 'configmaps', namespaced: true, columns: ['Name', 'Keys', 'Age'], trim: trimConfigMap },
  secrets: { label: 'Secrets', resource: 'secrets', namespaced: true, columns: ['Name', 'Type', 'Keys', 'Age'], trim: trimSecret },
  resourcequotas: { label: 'Resource quotas', resource: 'resourcequotas', namespaced: true, columns: ['Name', 'Usage', 'Age'], trim: trimResourceQuota },
  limitranges: { label: 'Limit ranges', resource: 'limitranges', namespaced: true, columns: ['Name', 'Limits', 'Age'], trim: trimLimitRange },

  serviceaccounts: { label: 'Service accounts', resource: 'serviceaccounts', namespaced: true, columns: ['Name', 'Secrets', 'Pull secrets', 'Automount', 'Age'], trim: trimServiceAccount },
  roles: { label: 'Roles', resource: 'roles.rbac.authorization.k8s.io', namespaced: true, columns: ['Name', 'Rules', 'Verbs', 'Age'], trim: trimRole },
  rolebindings: { label: 'Role bindings', resource: 'rolebindings.rbac.authorization.k8s.io', namespaced: true, columns: ['Name', 'Role', 'Subjects', 'Age'], trim: trimRoleBinding },
  clusterroles: { label: 'Cluster roles', resource: 'clusterroles.rbac.authorization.k8s.io', namespaced: false, columns: ['Name', 'Rules', 'Verbs', 'Age'], trim: trimRole },
  clusterrolebindings: { label: 'Cluster role bindings', resource: 'clusterrolebindings.rbac.authorization.k8s.io', namespaced: false, columns: ['Name', 'Role', 'Subjects', 'Age'], trim: trimRoleBinding },

  events: { label: 'Events', resource: 'events', namespaced: true, columns: ['Type', 'Reason', 'Object', 'Namespace', 'Count', 'Message', 'Age'], trim: trimEvent, sortDescending: true },
};

const RESOURCE_SECTIONS = Object.keys(RESOURCES);

/**
 * Actions OpsDeck exposes for each section. Only namespaced built-ins can be
 * changed; cluster-scoped objects stay read-only so a single click cannot
 * remove a storage class, role or persistent volume.
 */
const RESOURCE_ACTIONS = {
  pods: ['delete'],
  deployments: ['scale', 'restart', 'delete'],
  statefulsets: ['scale', 'restart', 'delete'],
  daemonsets: ['restart', 'delete'],
  jobs: ['delete'],
  cronjobs: ['delete'],
  services: ['delete'],
  ingresses: ['delete'],
  networkpolicies: ['delete'],
  persistentvolumeclaims: ['delete'],
  configmaps: ['delete'],
  secrets: ['delete'],
  resourcequotas: ['delete'],
  limitranges: ['delete'],
  serviceaccounts: ['delete'],
  roles: ['delete'],
  rolebindings: ['delete'],
};

const ACTION_LABELS = { scale: 'Scale', restart: 'Restart', delete: 'Delete' };

const OBJECT_NAME_RE = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const ACTION_NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const MAX_REPLICAS = 1000;

function validObjectName(value) {
  return typeof value === 'string' && value.length <= 253 && OBJECT_NAME_RE.test(value);
}

function validActionNamespace(value) {
  return typeof value === 'string' && value.length <= 63 && ACTION_NAMESPACE_RE.test(value);
}

function actionsFor(section) {
  return [...(RESOURCE_ACTIONS[section] || [])];
}

function actionArgs(section, action, name, { namespace = '', replicas } = {}) {
  const def = RESOURCES[section];
  if (!def) throw new Error('Unknown Kubernetes resource.');
  const allowed = RESOURCE_ACTIONS[section] || [];
  if (!allowed.includes(action)) {
    throw new Error(`The ${ACTION_LABELS[action] || action || 'requested'} action is not available for ${def.label.toLowerCase()}.`);
  }
  if (!validObjectName(name)) throw new Error('The object name is not valid.');

  let ns = '';
  if (def.namespaced) {
    if (!validActionNamespace(namespace)) throw new Error('A valid namespace is required for this action.');
    ns = namespace;
  }

  let args;
  let requestedReplicas = null;
  if (action === 'scale') {
    requestedReplicas = Number(replicas);
    if (!Number.isInteger(requestedReplicas) || requestedReplicas < 0 || requestedReplicas > MAX_REPLICAS) {
      throw new Error(`Replicas must be a whole number between 0 and ${MAX_REPLICAS}.`);
    }
    args = ['scale', def.resource, name, `--replicas=${requestedReplicas}`];
  } else if (action === 'restart') {
    args = ['rollout', 'restart', `${def.resource}/${name}`];
  } else if (action === 'delete') {
    args = ['delete', def.resource, name, '--wait=false'];
  } else {
    throw new Error('Unknown Kubernetes action.');
  }
  return { args, namespace: ns, replicas: requestedReplicas };
}

const SENSITIVE_ANNOTATION = 'kubectl.kubernetes.io/last-applied-configuration';

function sanitizeManifest(input, section) {
  if (!input || typeof input !== 'object') return {};
  const value = JSON.parse(JSON.stringify(input));
  const scrubMetadata = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const entry of node) scrubMetadata(entry);
      return;
    }
    if (node.metadata && typeof node.metadata === 'object') {
      delete node.metadata.managedFields;
      if (node.metadata.annotations && typeof node.metadata.annotations === 'object') {
        delete node.metadata.annotations[SENSITIVE_ANNOTATION];
      }
    }
    for (const key of Object.keys(node)) scrubMetadata(node[key]);
  };
  scrubMetadata(value);
  if (section === 'secrets' || value.kind === 'Secret') {
    delete value.data;
    delete value.stringData;
  }
  return value;
}

module.exports = {
  RESOURCES,
  RESOURCE_SECTIONS,
  RESOURCE_ACTIONS,
  ACTION_LABELS,
  validObjectName,
  actionsFor,
  actionArgs,
  sanitizeManifest,
  __test: {
    trimPod,
    trimDeployment,
    trimStatefulSet,
    trimDaemonSet,
    trimJob,
    trimCronJob,
    trimService,
    trimIngress,
    trimNetworkPolicy,
    trimPersistentVolume,
    trimPersistentVolumeClaim,
    trimStorageClass,
    trimConfigMap,
    trimSecret,
    trimResourceQuota,
    trimLimitRange,
    trimServiceAccount,
    trimRole,
    trimRoleBinding,
    trimEvent,
    duration,
  },
};
