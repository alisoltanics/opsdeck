'use strict';

/**
 * Database engine registry.
 *
 * Every engine is described here once: how it is recognised during discovery,
 * which adapter implements it, and what the adapter can actually do. Engines
 * without a working adapter are listed as `planned` and are never advertised as
 * supported in the UI or allowed to be connected to.
 */

const ENGINES = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    family: 'relational',
    tone: 'cyan',
    defaultPort: 5432,
    dialect: 'postgres',
    adapter: 'postgres',
    capabilities: {
      sql: true, databases: true, schemas: true, views: true, materializedViews: true,
      functions: true, procedures: true, triggers: true, sequences: true, indexes: true,
      users: true, roles: true, extensions: true, metrics: true, transactions: true,
    },
    detect: {
      images: [/\bpostgres\b/i, /bitnami\/postgresql/i, /^pgvector/i, /timescale/i, /postgis/i],
      ports: [5432, 5433],
      envKeys: [/^POSTGRES_/i, /^PG/i],
      processes: ['postgres'],
      banners: [/PostgreSQL/i],
    },
  },
  {
    id: 'mysql',
    label: 'MySQL',
    family: 'relational',
    tone: 'orange',
    defaultPort: 3306,
    dialect: 'mysql',
    adapter: 'mysql',
    capabilities: {
      sql: true, databases: true, schemas: false, views: true, materializedViews: false,
      functions: true, procedures: true, triggers: true, sequences: false, indexes: true,
      users: true, roles: true, extensions: false, metrics: true, transactions: true,
    },
    detect: {
      images: [/\bmysql\b/i, /bitnami\/mysql/i, /mysql-server/i, /percona/i],
      ports: [3306, 3307],
      envKeys: [/^MYSQL_/i],
      processes: ['mysqld'],
      banners: [/MySQL/i, /MariaDB/i],
    },
  },
  {
    id: 'mariadb',
    label: 'MariaDB',
    family: 'relational',
    tone: 'orange',
    defaultPort: 3306,
    dialect: 'mysql',
    adapter: 'mysql',
    capabilities: {
      sql: true, databases: true, schemas: false, views: true, materializedViews: false,
      functions: true, procedures: true, triggers: true, sequences: true, indexes: true,
      users: true, roles: true, extensions: false, metrics: true, transactions: true,
    },
    detect: {
      images: [/\bmariadb\b/i, /bitnami\/mariadb/i],
      ports: [3306, 3307],
      envKeys: [/^MARIADB_/i, /^MYSQL_/i],
      processes: ['mariadbd'],
      banners: [/MariaDB/i],
    },
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    family: 'relational',
    tone: 'slate',
    defaultPort: 0,
    dialect: 'sqlite',
    adapter: 'sqlite',
    capabilities: {
      sql: true, databases: false, schemas: false, views: true, materializedViews: false,
      functions: false, procedures: false, triggers: true, sequences: false, indexes: true,
      users: false, roles: false, extensions: false, metrics: false, transactions: true,
    },
    detect: { images: [], ports: [], envKeys: [], processes: [], banners: [] },
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    family: 'document',
    tone: 'green',
    defaultPort: 27017,
    dialect: 'json',
    adapter: 'mongodb',
    capabilities: {
      sql: false, databases: true, collections: true, documents: true, indexes: true,
      aggregation: true, metrics: true, users: true, roles: true,
    },
    detect: {
      images: [/\bmongo(db)?\b/i, /bitnami\/mongodb/i, /mongo-express/i],
      ports: [27017, 27018],
      envKeys: [/^MONGO(_|DB)/i],
      processes: ['mongod'],
      banners: [/MongoDB/i],
    },
  },
  {
    id: 'redis',
    label: 'Redis',
    family: 'key-value',
    tone: 'red',
    defaultPort: 6379,
    dialect: 'redis',
    adapter: 'redis',
    capabilities: {
      keys: true, streams: true, metrics: true, serverInfo: true, slowlog: true,
      clients: true, memory: true,
    },
    detect: {
      images: [/^redis/i, /bitnami\/redis/i, /redis-stack/i, /valkey/i],
      ports: [6379, 6380],
      envKeys: [/^REDIS_/i],
      processes: ['redis-server', 'valkey-server'],
      banners: [/Redis/i, /Valkey/i],
    },
  },
  {
    id: 'elasticsearch',
    label: 'Elasticsearch',
    family: 'search',
    tone: 'violet',
    defaultPort: 9200,
    dialect: 'json',
    adapter: 'elastic',
    capabilities: { indices: true, documents: true, metrics: true, clusters: true },
    detect: {
      images: [/elasticsearch/i, /bitnami\/elasticsearch/i],
      ports: [9200, 9300],
      envKeys: [/^ELASTIC/i, /^ES_/i],
      processes: ['elasticsearch', 'java'],
      banners: [/Elasticsearch/i],
    },
  },
  {
    id: 'opensearch',
    label: 'OpenSearch',
    family: 'search',
    tone: 'violet',
    defaultPort: 9200,
    dialect: 'json',
    adapter: 'elastic',
    capabilities: { indices: true, documents: true, metrics: true, clusters: true },
    detect: {
      images: [/opensearch/i, /bitnami\/opensearch/i],
      ports: [9200, 9300],
      envKeys: [/^OPENSEARCH_/i, /^DISABLE_SECURITY/],
      processes: ['opensearch', 'java'],
      banners: [/OpenSearch/i],
    },
  },
  // ---- Planned engines: listed for discoverability, not connectable yet. ----
  { id: 'sqlserver', label: 'Microsoft SQL Server', family: 'relational', tone: 'red', defaultPort: 1433, dialect: 'tsql', adapter: null, planned: true, reason: 'No adapter yet — driver not bundled.', capabilities: {}, detect: { images: [/mssql/i, /sql-server/i], ports: [1433], envKeys: [/^MSSQL/i], processes: ['sqlservr'], banners: [/Microsoft SQL Server/i] } },
  { id: 'oracle', label: 'Oracle Database', family: 'relational', tone: 'red', defaultPort: 1521, dialect: 'oracle', adapter: null, planned: true, reason: 'No adapter yet — driver not bundled.', capabilities: {}, detect: { images: [/oracle.*database/i, /gvenzl\/oracle/i], ports: [1521], envKeys: [/^ORACLE_/i], processes: ['oracle', 'tnslsnr'], banners: [/Oracle/i] } },
  { id: 'cassandra', label: 'Cassandra', family: 'wide-column', tone: 'cyan', defaultPort: 9042, dialect: 'cql', adapter: null, planned: true, reason: 'No adapter yet — driver not bundled.', capabilities: {}, detect: { images: [/cassandra/i], ports: [9042], envKeys: [/^CASSANDRA_/i], processes: ['cassandra', 'java'], banners: [/Cassandra/i] } },
  { id: 'clickhouse', label: 'ClickHouse', family: 'columnar', tone: 'amber', defaultPort: 8123, dialect: 'clickhouse', adapter: null, planned: true, reason: 'No adapter yet.', capabilities: {}, detect: { images: [/clickhouse/i], ports: [8123, 9000], envKeys: [/^CLICKHOUSE_/i], processes: ['clickhouse'], banners: [/ClickHouse/i] } },
  { id: 'neo4j', label: 'Neo4j', family: 'graph', tone: 'cyan', defaultPort: 7687, dialect: 'cypher', adapter: null, planned: true, reason: 'No adapter yet.', capabilities: {}, detect: { images: [/neo4j/i], ports: [7687, 7474], envKeys: [/^NEO4J_/i], processes: ['java'], banners: [/Neo4j/i] } },
  { id: 'couchdb', label: 'CouchDB', family: 'document', tone: 'green', defaultPort: 5984, dialect: 'json', adapter: null, planned: true, reason: 'No adapter yet.', capabilities: {}, detect: { images: [/couchdb/i], ports: [5984], envKeys: [/^COUCHDB_/i], processes: ['couchdb', 'beam.smp'], banners: [/CouchDB/i] } },
  { id: 'influxdb', label: 'InfluxDB', family: 'time-series', tone: 'violet', defaultPort: 8086, dialect: 'influxql', adapter: null, planned: true, reason: 'No adapter yet.', capabilities: {}, detect: { images: [/influxdb/i], ports: [8086], envKeys: [/^INFLUX/], processes: ['influxd'], banners: [/InfluxDB/i] } },
  { id: 'firebird', label: 'Firebird', family: 'relational', tone: 'red', defaultPort: 3050, dialect: 'sql', adapter: null, planned: true, reason: 'No adapter yet.', capabilities: {}, detect: { images: [/firebird/i], ports: [3050], envKeys: [/^FIREBIRD/], processes: ['fbguard', 'fbserver'], banners: [/Firebird/i] } },
];

const BY_ID = new Map(ENGINES.map((engine) => [engine.id, engine]));

function get(id) {
  return BY_ID.get(String(id || '').toLowerCase()) || null;
}

function isConnectable(engine) {
  return Boolean(engine && engine.adapter && !engine.planned);
}

/** Public shape sent to the renderer — never includes adapter internals. */
function publicEngine(engine) {
  return {
    id: engine.id,
    label: engine.label,
    family: engine.family,
    tone: engine.tone,
    defaultPort: engine.defaultPort,
    dialect: engine.dialect,
    supported: isConnectable(engine),
    planned: Boolean(engine.planned),
    reason: engine.reason || '',
    capabilities: engine.capabilities || {},
  };
}

function all() {
  return ENGINES.map(publicEngine);
}

function supported() {
  return ENGINES.filter(isConnectable).map(publicEngine);
}

/** Match a container image reference against every engine signature. */
function matchImage(image) {
  const text = String(image || '');
  for (const engine of ENGINES) {
    for (const re of engine.detect.images || []) {
      if (re.test(text)) return engine;
    }
  }
  return null;
}

/** Match an exposed container port against engine default ports. */
function matchPort(port) {
  const value = Number(port);
  if (!value) return null;
  for (const engine of ENGINES) {
    if ((engine.detect.ports || []).includes(value)) return engine;
  }
  return null;
}

/** Match environment variable *names* (never values) against signatures. */
function matchEnvKeys(keys) {
  const list = Array.isArray(keys) ? keys : [];
  for (const engine of ENGINES) {
    for (const re of engine.detect.envKeys || []) {
      if (list.some((key) => re.test(String(key || '')))) return engine;
    }
  }
  return null;
}

function matchProcess(command) {
  const text = String(command || '').toLowerCase();
  if (!text) return null;
  for (const engine of ENGINES) {
    for (const proc of engine.detect.processes || []) {
      if (text.includes(String(proc).toLowerCase())) return engine;
    }
  }
  return null;
}

module.exports = {
  ENGINES, get, all, supported, isConnectable, publicEngine,
  matchImage, matchPort, matchEnvKeys, matchProcess,
};
