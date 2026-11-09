'use strict';

/**
 * Detailed Compose YAML property reference.
 *
 * Keys match the property names in reference.js. Every entry ships runnable
 * YAML, the reason behind the syntax, the mistakes that actually bite and the
 * security consequences. Content is authored against the Compose Specification
 * used by Docker Compose v2, not the retired version: "3" schema.
 */
const details = {
  services: {
    syntax: 'services:\n  <service-name>:\n    image: <image>\n    # or build: <context>',
    examples: [
      {
        title: 'Minimal stack',
        command: 'services:\n  web:\n    image: nginx:1.27-alpine\n    ports:\n      - "8080:80"',
        output: '',
        explain: 'The top-level services map is required in every Compose file. Each key becomes a service name and a DNS name on the project network.',
      },
      {
        title: 'Project name plus services',
        command: 'name: acme\n\nservices:\n  api:\n    build: .\n  db:\n    image: postgres:16-alpine',
        output: '',
        explain: 'name sets the Compose project name, which prefixes containers, networks and volumes. It keeps project resources identifiable in a busy engine.',
      },
    ],
    mistakes: [
      'services must be a map, not a list. A YAML list fails schema validation before any container starts.',
      'Do not add a top-level version field. It is obsolete in Compose v2 and produces a warning.',
    ],
    security: [],
    related: ['compose-image', 'compose-build'],
  },

  image: {
    syntax: 'image: [registry/]<name>[:<tag>|@<digest>]',
    examples: [
      {
        title: 'Pinned tag',
        command: 'services:\n  api:\n    image: ghcr.io/acme/api:1.4.2',
        output: '',
        explain: 'A full reference includes the registry, repository and tag. Pinning the version makes a deployment reproducible.',
      },
      {
        title: 'Build and tag together',
        command: 'services:\n  api:\n    build: .\n    image: ghcr.io/acme/api:local',
        output: '',
        explain: 'When build is present, image names the tag applied to the built result. It also lets other services reference the same image.',
      },
    ],
    mistakes: [
      'Using latest in production makes rollbacks ambiguous; two deploys can run different code under the same tag.',
      'A bare name is pulled from Docker Hub by default. Specify the registry when the image does not live there.',
    ],
    security: [
      'Pull from registries you trust and verify digests when supply-chain integrity matters.',
    ],
    related: ['compose-build'],
  },

  build: {
    syntax: 'build:\n  context: <path|url>\n  dockerfile: <file>\n  target: <stage>\n  args: <map>\n  platforms: <list>\n  cache_from: <list>\n  cache_to: <list>\n  secrets: <list>',
    examples: [
      {
        title: 'Multi-stage target',
        command: 'services:\n  api:\n    build:\n      context: .\n      dockerfile: Dockerfile\n      target: runtime',
        output: '',
        explain: 'target stops the build at a named stage, so development stages never reach the runtime image.',
      },
      {
        title: 'Build arguments',
        command: 'services:\n  api:\n    build:\n      context: .\n      args:\n        NODE_VERSION: "20"',
        output: '',
        explain: 'Build args feed ARG values into the Dockerfile. They are configuration, not secrets.',
      },
    ],
    mistakes: [
      'A relative context is resolved from the Compose file location, not from the shell working directory.',
      'Build args are recorded in image history and metadata; never pass credentials through them.',
    ],
    security: [
      'Use BuildKit secrets (build.secrets) instead of build args for tokens, keys and passwords.',
    ],
    related: ['compose-image'],
  },

  ports: {
    syntax: 'ports:\n  - "[HOST_IP:]<HOST_PORT>:<CONTAINER_PORT>[/<protocol>]"\n  - target: <port>\n    published: "<port>"\n    protocol: tcp\n    mode: host\n    host_ip: <ip>',
    examples: [
      {
        title: 'Short syntax',
        command: 'services:\n  web:\n    image: nginx:1.27-alpine\n    ports:\n      - "8080:80"',
        output: '',
        explain: 'The left side is the host port and the right side is the container port. Traffic to host 8080 reaches port 80 in the container.',
      },
      {
        title: 'Long syntax with host binding',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    ports:\n      - target: 3000\n        published: "3000"\n        host_ip: 127.0.0.1\n        protocol: tcp',
        output: '',
        explain: 'The long form makes the host interface explicit. Binding to 127.0.0.1 keeps the port off external interfaces.',
      },
    ],
    mistakes: [
      'Publishing to 0.0.0.0 exposes the port on every interface, including networks you did not intend.',
      'Reversing host and container ports produces a service that is reachable on the wrong port, or not at all.',
    ],
    security: [
      'Publish only ports that must be reachable from outside the host. Keep internal service ports on the project network.',
    ],
    related: ['compose-expose'],
  },

  expose: {
    syntax: 'expose:\n  - "<port>[/<protocol>]"',
    examples: [
      {
        title: 'Document an internal port',
        command: 'services:\n  api:\n    image: node:20-alpine\n    expose:\n      - "3000"',
        output: '',
        explain: 'expose records the port the service listens on for other services on the same network. It never publishes a host port.',
      },
    ],
    mistakes: [
      'expose does not make a port reachable from the host. Use ports for that.',
      'Exposing a port does not make the application listen on it; the process configuration must match.',
    ],
    security: [],
    related: ['compose-ports'],
  },

  environment: {
    syntax: 'environment:\n  KEY: value\n  OTHER: ""\n# or\nenvironment:\n  - KEY=value',
    examples: [
      {
        title: 'Map form',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    environment:\n      NODE_ENV: production\n      LOG_LEVEL: info',
        output: '',
        explain: 'The map form is the clearest for a fixed set of values. YAML scalars are converted to strings.',
      },
      {
        title: 'Pass a value from the shell',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    environment:\n      DATABASE_URL: "${DATABASE_URL}"',
        output: '',
        explain: 'Compose interpolates ${...} from the shell or .env before the container starts. The value still appears in inspect.',
      },
    ],
    mistakes: [
      'An empty value still defines the variable; it does not unset it.',
      'YAML converts unquoted yes or no to a boolean before Compose sees it. Quote values that must stay text.',
    ],
    security: [
      'Environment variables are visible in docker inspect and docker compose config. Use secrets for credentials.',
    ],
    related: ['compose-env-file', 'compose-secrets'],
  },

  env_file: {
    syntax: 'env_file: <path>\n# or\nenv_file:\n  - path: <path>\n    required: true',
    examples: [
      {
        title: 'Single file',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    env_file:\n      - .env.local',
        output: '',
        explain: 'The file is read from the Compose file directory. Each non-comment line becomes an environment variable in the container.',
      },
      {
        title: 'Optional file',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    env_file:\n      - path: .env.optional\n        required: false',
        output: '',
        explain: 'required: false lets a local override file be absent without failing the whole project.',
      },
    ],
    mistakes: [
      'A path is resolved relative to the Compose file, not the shell. A working directory override changes what you expect.',
      'Values in the environment section take precedence over env_file entries for the same key.',
    ],
    security: [
      'Never commit an env file containing live credentials. Add .env files to .gitignore.',
    ],
    related: ['compose-environment'],
  },

  depends_on: {
    syntax: 'depends_on:\n  - <service>\n# or\ndepends_on:\n  <service>:\n    condition: service_started|service_healthy|service_completed_successfully\n    restart: true',
    examples: [
      {
        title: 'Start order only',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    depends_on:\n      - db',
        output: '',
        explain: 'The short form waits until db has started, not until its process is ready to accept connections.',
      },
      {
        title: 'Wait for a healthy dependency',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    depends_on:\n      db:\n        condition: service_healthy',
        output: '',
        explain: 'The long form waits for the dependency health check to pass. db must define a healthcheck.',
      },
    ],
    mistakes: [
      'depends_on does not wait for an application to be ready unless condition: service_healthy is used.',
      'It does not restart dependents if the dependency dies later. The application still needs retries.',
    ],
    security: [],
    related: ['compose-healthcheck'],
  },

  healthcheck: {
    syntax: 'healthcheck:\n  test: ["CMD", "<command>", "<arg>"]\n  interval: 30s\n  timeout: 5s\n  retries: 3\n  start_period: 10s\n  start_interval: 5s\n  disable: false',
    examples: [
      {
        title: 'HTTP probe',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    healthcheck:\n      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]\n      interval: 15s\n      timeout: 3s\n      retries: 3\n      start_period: 20s',
        output: '',
        explain: 'The probe runs inside the container. start_period gives a slow starter time before failures count.',
      },
      {
        title: 'Shell probe',
        command: 'services:\n  db:\n    image: postgres:16-alpine\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 10s\n      retries: 5',
        output: '',
        explain: 'CMD-SHELL runs the string through the container shell, which is needed for pipes and redirection.',
      },
    ],
    mistakes: [
      'curl is missing from many minimal images. Use a tool that exists in the image or build one in.',
      'A health check that always exits 0 hides failures. Probe the dependency the service actually needs.',
    ],
    security: [
      'Health commands run inside the container with the service user. Do not put credentials in the test string.',
    ],
    related: ['compose-depends-on'],
  },

  volumes: {
    syntax: 'volumes:\n  - <volume-name>:<container-path>[:ro]\n  - type: volume|bind|tmpfs\n    source: <name|path>\n    target: <path>\n    read_only: true\n\n# top level\nvolumes:\n  <volume-name>: {}',
    examples: [
      {
        title: 'Named volume',
        command: 'services:\n  db:\n    image: postgres:16-alpine\n    volumes:\n      - db-data:/var/lib/postgresql/data\n\nvolumes:\n  db-data: {}',
        output: '',
        explain: 'A named volume is managed by Docker, survives container removal and is declared once at the top level.',
      },
      {
        title: 'Read-only bind mount',
        command: 'services:\n  web:\n    image: nginx:1.27-alpine\n    volumes:\n      - ./site:/usr/share/nginx/html:ro',
        output: '',
        explain: 'A path on the left is a bind mount from the host. :ro makes the mount read-only inside the container.',
      },
    ],
    mistakes: [
      'A short-syntax source without a slash is a named volume, not a host path. ./site and site mean different things.',
      'A named volume used by a service but missing from top-level volumes is created implicitly and is harder to manage.',
    ],
    security: [
      'Never mount /var/run/docker.sock into an application container; it grants control of the engine.',
      'Bind mounts expose host files and permissions. Prefer named volumes for application data.',
    ],
    related: ['compose-tmpfs', 'compose-read-only'],
  },

  networks: {
    syntax: 'services:\n  <service>:\n    networks:\n      - <network>\n\nnetworks:\n  <network>:\n    driver: bridge|overlay\n    internal: true',
    examples: [
      {
        title: 'Two-service private network',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    networks:\n      - backend\n  db:\n    image: postgres:16-alpine\n    networks:\n      - backend\n\nnetworks:\n  backend: {}',
        output: '',
        explain: 'Only services on backend can resolve and reach each other. The network is prefixed with the project name.',
      },
      {
        title: 'Internal network',
        command: 'networks:\n  backend:\n    internal: true',
        output: '',
        explain: 'internal: true removes the gateway, so services cannot reach the outside world through it.',
      },
    ],
    mistakes: [
      'A service can only reach a service on a shared network. The default network is not shared with another project.',
      'Network names are prefixed by the project unless name is set explicitly.',
    ],
    security: [
      'Use internal networks for databases and other services that should never reach the internet.',
    ],
    related: ['compose-volumes'],
  },

  secrets: {
    syntax: 'services:\n  <service>:\n    secrets:\n      - <secret>\n      - source: <secret>\n        target: <filename>\n        mode: 0400\n\nsecrets:\n  <secret>:\n    file: <path>\n# or\n    environment: <ENV_VAR>',
    examples: [
      {
        title: 'Mount a secret file',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    secrets:\n      - db_password\n\nsecrets:\n  db_password:\n    file: ./secrets/db_password.txt',
        output: '',
        explain: 'The secret appears as /run/secrets/db_password inside the container. It is not an environment variable.',
      },
      {
        title: 'Read a secret from the environment',
        command: 'secrets:\n  api_key:\n    environment: API_KEY',
        output: '',
        explain: 'The value comes from the host environment at deploy time and is mounted as a file, not exported into the container environment.',
      },
    ],
    mistakes: [
      'The application must read the secret from /run/secrets; it will not appear in env.',
      'Changing a secret file requires recreating the service for the new content to be mounted.',
    ],
    security: [
      'Compose secrets are files, not a vault. Protect the source file and restrict its mode.',
      'Do not bake secrets into images or commit them to the repository.',
    ],
    related: ['compose-environment', 'compose-configs'],
  },

  configs: {
    syntax: 'services:\n  <service>:\n    configs:\n      - <config>\n      - source: <config>\n        target: <path>\n\nconfigs:\n  <config>:\n    file: <path>',
    examples: [
      {
        title: 'Mount configuration',
        command: 'services:\n  nginx:\n    image: nginx:1.27-alpine\n    configs:\n      - source: nginx_conf\n        target: /etc/nginx/conf.d/default.conf\n\nconfigs:\n  nginx_conf:\n    file: ./nginx/default.conf',
        output: '',
        explain: 'Configs use the same mount mechanism as secrets but are suitable for non-sensitive content.',
      },
    ],
    mistakes: [
      'Configs are read-only inside the container; the application must not try to rewrite them.',
      'A config change requires recreating the service just like a secret change.',
    ],
    security: [
      'Do not use configs for passwords or keys. Use secrets instead.',
    ],
    related: ['compose-secrets'],
  },

  profiles: {
    syntax: 'services:\n  <service>:\n    profiles:\n      - <profile>\n# enable with: docker compose --profile <profile> up',
    examples: [
      {
        title: 'Opt-in debug tools',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n  adminer:\n    image: adminer:4\n    profiles:\n      - tools',
        output: '',
        explain: 'docker compose up starts only api. docker compose --profile tools up adds adminer.',
      },
    ],
    mistakes: [
      'A service with profiles does not start by default, even if another service depends on it.',
      'An enabled profile does not start services from other profiles. Each profile must be requested.',
    ],
    security: [
      'Put administrative and debugging services behind a profile so they are not exposed by a normal start.',
    ],
    related: ['compose-services'],
  },

  restart: {
    syntax: 'restart: "no" | on-failure[:<max-retries>] | always | unless-stopped',
    examples: [
      {
        title: 'Restart on failure',
        command: 'services:\n  worker:\n    image: acme/worker:1.4.2\n    restart: on-failure:5',
        output: '',
        explain: 'The container restarts up to five times after a non-zero exit. A clean exit stops the loop.',
      },
      {
        title: 'Survive daemon restarts',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    restart: unless-stopped',
        output: '',
        explain: 'unless-stopped restarts after daemon restarts but respects an explicit docker stop.',
      },
    ],
    mistakes: [
      'restart: always restarts even after a clean exit, which can hide a completed one-shot job.',
      'A restart loop is a symptom. Fix the failing process instead of increasing the retry count.',
    ],
    security: [],
    related: ['compose-healthcheck'],
  },

  deploy: {
    syntax: 'deploy:\n  replicas: <n>\n  resources:\n    limits:\n      cpus: "<cores>"\n      memory: <size>\n    reservations:\n      cpus: "<cores>"\n      memory: <size>',
    examples: [
      {
        title: 'Resource limits',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    deploy:\n      resources:\n        limits:\n          cpus: "0.50"\n          memory: 256M',
        output: '',
        explain: 'Limits cap the container. Docker Compose applies these on a single host for local deployments.',
      },
      {
        title: 'Replicas on a single host',
        command: 'services:\n  worker:\n    image: acme/worker:1.4.2\n    deploy:\n      replicas: 3',
        output: '',
        explain: 'Replica count is an orchestration feature. Compose honors it when scaling the project, not as a scheduler.',
      },
    ],
    mistakes: [
      'Replicas and placement are scheduling features; a one-shot docker compose up is not a Swarm scheduler.',
      'Memory values need a unit (256M). A bare number is parsed as bytes and surprises you.',
    ],
    security: [
      'Limits protect the host from a runaway container, but they are not a security boundary.',
    ],
    related: ['compose-restart'],
  },

  logging: {
    syntax: 'logging:\n  driver: json-file|local|syslog|journald|none\n  options:\n    max-size: "10m"\n    max-file: "3"',
    examples: [
      {
        title: 'Bounded json-file logs',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    logging:\n      driver: json-file\n      options:\n        max-size: "10m"\n        max-file: "3"',
        output: '',
        explain: 'Rotation keeps log files bounded. Without it, json-file logs grow until the disk fills.',
      },
    ],
    mistakes: [
      'The default json-file driver has no size limit. Long-running services eventually fill the disk.',
      'A driver must be available on the host; an unknown driver fails container creation.',
    ],
    security: [
      'Logs can contain personal data and tokens. Set retention deliberately and restrict access to the log files.',
    ],
    related: ['compose-deploy'],
  },

  command: {
    syntax: 'command: <string>\n# or\ncommand: ["<executable>", "<arg>"]',
    examples: [
      {
        title: 'Exec form',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    command: ["node", "server.js"]',
        output: '',
        explain: 'The list form runs without a shell, so signals reach the process directly.',
      },
      {
        title: 'Override a long-running command',
        command: 'services:\n  migrate:\n    image: acme/api:1.4.2\n    command: ["npm", "run", "migrate"]',
        output: '',
        explain: 'command replaces the image CMD. It does not touch ENTRYPOINT.',
      },
    ],
    mistakes: [
      'A string is run through /bin/sh -c, which changes signal handling and quoting.',
      'command does not replace ENTRYPOINT. If the entrypoint expects arguments, keep them compatible.',
    ],
    security: [],
    related: ['compose-entrypoint'],
  },

  entrypoint: {
    syntax: 'entrypoint: <string>\n# or\nentrypoint: ["<executable>", "<arg>"]',
    examples: [
      {
        title: 'Exec form entrypoint',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    entrypoint: ["/usr/local/bin/docker-entrypoint.sh"]',
        output: '',
        explain: 'entrypoint replaces the image ENTRYPOINT and receives command arguments after it.',
      },
    ],
    mistakes: [
      'Clearing an entrypoint with [] is sometimes needed for shell images, but can break the image contract.',
      'A shell-form entrypoint swallows signals. Prefer the exec form.',
    ],
    security: [],
    related: ['compose-command'],
  },

  user: {
    syntax: 'user: "<uid>[:<gid>]"',
    examples: [
      {
        title: 'Numeric user',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    user: "10001:10001"',
        output: '',
        explain: 'Numeric IDs work even when /etc/passwd has no matching name. The image must allow that user to write its paths.',
      },
    ],
    mistakes: [
      'A user that does not exist in /etc/passwd may still run by numeric UID, but tools that resolve names fail.',
      'Mounts and application directories must be writable by the chosen UID or the process exits immediately.',
    ],
    security: [
      'Run as non-root where possible. Check file ownership before switching the user.',
    ],
    related: ['compose-read-only'],
  },

  working_dir: {
    syntax: 'working_dir: <path>',
    examples: [
      {
        title: 'Set the process directory',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    working_dir: /app',
        output: '',
        explain: 'The container process starts in this directory. Relative paths in command resolve from here.',
      },
    ],
    mistakes: [
      'The directory must exist in the image; Compose does not create it for you.',
      'A relative path is resolved inside the container, not on the host.',
    ],
    security: [],
    related: ['compose-user'],
  },

  read_only: {
    syntax: 'read_only: true\n# combine with\ntmpfs:\n  - /tmp',
    examples: [
      {
        title: 'Read-only root with writable tmp',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    read_only: true\n    tmpfs:\n      - /tmp\n    volumes:\n      - api-cache:/var/cache/app\n\nvolumes:\n  api-cache: {}',
        output: '',
        explain: 'The root filesystem cannot be modified, while /tmp and the named volume stay writable.',
      },
    ],
    mistakes: [
      'Applications that write to the root filesystem fail at start. Audit writable paths first.',
      'read_only does not make mounted volumes read-only. Add :ro or read_only: true per mount.',
    ],
    security: [
      'A read-only root filesystem limits what an attacker can persist inside the container.',
    ],
    related: ['compose-tmpfs', 'compose-volumes'],
  },

  cap_drop: {
    syntax: 'cap_drop:\n  - ALL\ncap_add:\n  - <capability>',
    examples: [
      {
        title: 'Drop everything',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    cap_drop:\n      - ALL',
        output: '',
        explain: 'Start from no capabilities and add back only what the process demonstrably needs.',
      },
    ],
    mistakes: [
      'Dropping ALL without testing can break a service that relied on a default capability such as CHOWN.',
      'Adding capabilities back without a reason defeats the purpose of dropping them.',
    ],
    security: [
      'Never add SYS_ADMIN or NET_ADMIN unless the workload is genuinely privileged and isolated.',
    ],
    related: ['compose-security-opt'],
  },

  security_opt: {
    syntax: 'security_opt:\n  - no-new-privileges:true\n  - seccomp=<profile.json>\n  - apparmor=<profile>',
    examples: [
      {
        title: 'No privilege escalation',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    security_opt:\n      - no-new-privileges:true',
        output: '',
        explain: 'The process cannot gain privileges through setuid binaries or file capabilities.',
      },
    ],
    mistakes: [
      'Referencing a seccomp profile that does not exist on the host prevents the container from starting.',
      'Disabling seccomp or AppArmor removes a real boundary; do not do it to silence a permission error.',
    ],
    security: [
      'Keep the default seccomp profile. Prefer narrowing it rather than disabling it.',
    ],
    related: ['compose-cap-drop'],
  },

  tmpfs: {
    syntax: 'tmpfs:\n  - /tmp\n  - /run:size=64m,mode=1777',
    examples: [
      {
        title: 'Bounded tmpfs',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    read_only: true\n    tmpfs:\n      - /tmp:size=64m,mode=1777',
        output: '',
        explain: 'In-memory storage is ideal for ephemeral files on a read-only root. The size cap prevents memory exhaustion.',
      },
    ],
    mistakes: [
      'tmpfs contents are lost when the container stops and count against memory.',
      'An uncapped tmpfs can consume the host memory allocated to the container.',
    ],
    security: [
      'Cap tmpfs size so a compromised process cannot exhaust memory through temporary files.',
    ],
    related: ['compose-read-only'],
  },

  stop_grace_period: {
    syntax: 'stop_grace_period: <duration>',
    examples: [
      {
        title: 'Allow a slow shutdown',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    stop_grace_period: 30s',
        output: '',
        explain: 'Docker sends SIGTERM, waits the grace period, then sends SIGKILL. Give the application time to drain.',
      },
    ],
    mistakes: [
      'A grace period shorter than the application drain time turns a graceful shutdown into SIGKILL.',
      'The application must handle SIGTERM. A process that ignores it always reaches SIGKILL.',
    ],
    security: [],
    related: ['compose-restart'],
  },

  init: {
    syntax: 'init: true',
    examples: [
      {
        title: 'Enable the init process',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    init: true',
        output: '',
        explain: 'A tiny init runs as PID 1, reaps orphaned processes and forwards signals to the application.',
      },
    ],
    mistakes: [
      'init is not a substitute for handling signals in the application.',
      'Some images already include an init or an entrypoint that execs the process; adding another can be redundant.',
    ],
    security: [],
    related: ['compose-command'],
  },

  extra_hosts: {
    syntax: 'extra_hosts:\n  - "<hostname>:<ip>"\n# or\n  <hostname>: <ip>',
    examples: [
      {
        title: 'Map a host name',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    extra_hosts:\n      - "host.docker.internal:host-gateway"',
        output: '',
        explain: 'host-gateway resolves to the host address on Linux. It lets a container reach a service running on the host.',
      },
    ],
    mistakes: [
      'Hard-coding an IP breaks when the host network changes. Prefer host-gateway where supported.',
      'extra_hosts changes name resolution only; it does not open a firewall path.',
    ],
    security: [
      'Reaching the host from a container widens the attack surface. Use it deliberately.',
    ],
    related: ['compose-dns'],
  },

  dns: {
    syntax: 'dns:\n  - <ip>\ndns_search:\n  - <domain>\ndns_opt:\n  - <option>',
    examples: [
      {
        title: 'Custom resolver',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    dns:\n      - 1.1.1.1\n      - 8.8.8.8',
        output: '',
        explain: 'The container uses these resolvers instead of the host configuration for external names.',
      },
    ],
    mistakes: [
      'Custom DNS replaces the embedded Docker DNS for external lookups; service discovery on the project network still works.',
      'A resolver that is not reachable from the container breaks name resolution entirely.',
    ],
    security: [
      'DNS traffic can leak metadata. Use resolvers you trust.',
    ],
    related: ['compose-extra-hosts'],
  },

  ulimits: {
    syntax: 'ulimits:\n  nofile:\n    soft: <n>\n    hard: <n>\n  nproc: <n>',
    examples: [
      {
        title: 'Raise open-file limits',
        command: 'services:\n  api:\n    image: acme/api:1.4.2\n    ulimits:\n      nofile:\n        soft: 65536\n        hard: 65536',
        output: '',
        explain: 'The soft limit is the effective value; the hard limit caps what the process can raise.',
      },
    ],
    mistakes: [
      'A hard limit above the host limit fails at container start.',
      'Raising nofile without checking application connection pools can exhaust other resources.',
    ],
    security: [],
    related: ['compose-deploy'],
  },

  platform: {
    syntax: 'platform: <os>/<arch>\n# example\nplatform: linux/amd64',
    examples: [
      {
        title: 'Force an architecture',
        command: 'services:\n  legacy:\n    image: acme/legacy:1.0\n    platform: linux/amd64',
        output: '',
        explain: 'Useful when only a specific architecture is published. On an ARM host the image runs under emulation and is slower.',
      },
    ],
    mistakes: [
      'Emulated platforms are slower and may behave differently for native dependencies.',
      'The image must exist for the requested platform, or the pull fails.',
    ],
    security: [
      'Emulation layers widen the supply chain. Pin the platform only when the image requires it.',
    ],
    related: ['compose-build'],
  },
};

module.exports = { details };
