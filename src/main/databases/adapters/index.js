'use strict';

const registry = require('../registry');

const FACTORIES = {
  postgres: () => require('./postgres'),
  mysql: () => require('./mysql'),
  sqlite: () => require('./sqlite'),
  mongodb: () => require('./mongodb'),
  redis: () => require('./redis'),
  elastic: () => require('./elastic'),
};

/**
 * Create an adapter instance for a profile. Credentials are passed separately
 * so they never become part of the persisted profile object.
 */
function createAdapter(profile, secrets = {}) {
  const engine = registry.get(profile?.engine);
  if (!engine) throw new Error('Unknown database engine.');
  if (!registry.isConnectable(engine)) {
    throw new Error(`${engine.label} is not supported yet. ${engine.reason || ''}`.trim());
  }
  const loader = FACTORIES[engine.adapter];
  if (!loader) throw new Error(`No adapter is registered for ${engine.label}.`);
  return loader().create(profile, secrets);
}

module.exports = { createAdapter };
