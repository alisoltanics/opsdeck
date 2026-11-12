'use strict';

/**
 * Cross-platform test entry point.
 *
 * `node --test test/*.test.js` relies on the shell expanding the glob, which
 * cmd.exe does not do, and newer Node versions no longer accept a bare
 * directory. This runner expands the list itself so `npm test` behaves the
 * same on Linux, macOS and Windows.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const testDir = path.join(root, 'test');

let files;
try {
  files = fs.readdirSync(testDir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join('test', name));
} catch (error) {
  console.error(`Cannot read the test directory: ${error.message}`);
  process.exit(1);
}

if (!files.length) {
  console.error('No test files found in test/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
