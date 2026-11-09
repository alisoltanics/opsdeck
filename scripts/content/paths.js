'use strict';

const path = (id, title, subtitle, level, duration, icon, accent, description, prerequisites, outcomes, courseIds) => ({
  id, title, subtitle, level, duration, icon, accent, description,
  prerequisites, outcomes,
  stages: courseIds.map((courseId, index) => ({
    title: `Stage ${index + 1}`,
    courseId,
    description: '',
  })),
  completion: { type: 'all_courses', courseIds },
});

const paths = [
  path('docker-beginner', 'Docker Beginner', 'Start from zero and run your first real container', 'Beginner', '4h 10m', 'seedling', 'green',
    'A gentle, complete introduction. Learn the model, install Docker, run containers, work with images and finish with a real project.',
    [], ['Explain containers and images', 'Run and inspect containers safely', 'Build and tag your first image', 'Use Compose for a small stack'],
    ['docker-fundamentals', 'docker-containers', 'docker-images', 'docker-compose']),
  path('docker-developer', 'Docker Developer', 'A daily workflow for building and shipping applications', 'Intermediate', '9h 30m', 'code', 'blue',
    'For application developers who need to containerise services, write production Dockerfiles, manage data and run a full local stack.',
    ['docker-beginner'], ['Write small, secure Dockerfiles', 'Use multi-stage builds and cache effectively', 'Run a database-backed app with Compose', 'Debug a failing container quickly'],
    ['docker-fundamentals', 'docker-images', 'dockerfile-masterclass', 'docker-volumes', 'docker-compose', 'real-world-projects']),
  path('compose-specialist', 'Docker Compose Specialist', 'Model and operate complete multi-container applications', 'Intermediate', '8h 15m', 'boxes', 'violet',
    'Become fluent in the Compose specification: services, networks, volumes, configuration, health, profiles and production discipline.',
    ['docker-beginner'], ['Design a network topology', 'Use secrets and configs correctly', 'Write health-aware dependencies', 'Deploy a single-host production stack'],
    ['docker-containers', 'docker-networking', 'docker-volumes', 'docker-compose', 'docker-production']),
  path('devops-engineer', 'DevOps Engineer', 'Build, publish, observe and operate container workloads', 'Advanced', '14h 20m', 'git-branch', 'cyan',
    'The full delivery path: image builds, registries, Compose deployments, monitoring, troubleshooting and production practices.',
    ['docker-developer'], ['Build and publish multi-platform images', 'Run a monitoring stack', 'Diagnose production failures', 'Operate a single-host deployment with backups'],
    ['dockerfile-masterclass', 'docker-build-buildkit', 'docker-compose', 'docker-registry', 'docker-monitoring', 'docker-production', 'docker-troubleshooting']),
  path('docker-administrator', 'Docker Administrator', 'Own the engine, hosts, contexts and maintenance', 'Advanced', '13h 50m', 'server-cog', 'amber',
    'For platform and infrastructure administrators responsible for Docker hosts, security, storage and maintenance.',
    ['docker-beginner'], ['Harden the daemon and containers', 'Manage contexts and remote engines', 'Plan disk and upgrade maintenance', 'Recover from failures with evidence'],
    ['docker-architecture', 'docker-networking', 'docker-security', 'docker-performance', 'docker-monitoring', 'docker-troubleshooting', 'daemon-config']),
  path('advanced-expert', 'Advanced Docker Expert', 'Master-level depth across build, security and operations', 'Expert', '20h 30m', 'crown', 'orange',
    'The complete advanced curriculum. Finish this path and you can design, secure, optimise and operate container platforms with confidence.',
    ['docker-administrator', 'devops-engineer'], ['Harden images and daemons end to end', 'Optimise builds and runtime performance', 'Run a supply-chain-aware registry workflow', 'Lead production readiness reviews'],
    ['docker-architecture', 'dockerfile-masterclass', 'docker-build-buildkit', 'docker-registry', 'docker-security', 'docker-performance', 'docker-monitoring', 'docker-troubleshooting', 'docker-production', 'daemon-config', 'real-world-projects']),
];

module.exports = { paths };
