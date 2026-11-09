'use strict';

/**
 * Install the packaged OpsDeck build for the current user so it appears in the
 * desktop application list with its icon.
 *
 *   1. npm run pack            (builds release/linux-unpacked)
 *   2. npm run install:desktop (copies it and writes the .desktop entry)
 *
 * Re-run both after changing the app. Uninstall with:
 *   npm run uninstall:desktop
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const home = os.homedir();
const source = path.join(root, 'release', 'linux-unpacked');
const installDir = process.env.OPSDECK_INSTALL_DIR || path.join(home, '.local', 'opt', 'opsdeck');
const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
const applicationsDir = path.join(dataHome, 'applications');
const iconDir = path.join(dataHome, 'icons', 'hicolor', '512x512', 'apps');
const legacyIconDir = path.join(dataHome, 'icons');
const desktopFile = path.join(applicationsDir, 'opsdeck.desktop');

function fail(message) {
  console.error(`install-desktop: ${message}`);
  process.exit(1);
}

function run(command, args) {
  try {
    spawnSync(command, args, { stdio: 'ignore' });
  } catch {
    // Optional desktop helpers are not available everywhere.
  }
}

if (process.platform !== 'linux') {
  fail('this installer writes freedesktop entries and only runs on Linux.');
}

if (process.argv.includes('--uninstall')) {
  for (const target of [desktopFile, path.join(iconDir, 'opsdeck.png'), path.join(legacyIconDir, 'opsdeck.png')]) {
    fs.rmSync(target, { force: true });
  }
  fs.rmSync(installDir, { recursive: true, force: true });
  run('update-desktop-database', [applicationsDir]);
  run('gtk-update-icon-cache', ['-f', '-t', path.join(dataHome, 'icons', 'hicolor')]);
  console.log('OpsDeck removed from the application list.');
  process.exit(0);
}

if (!fs.existsSync(path.join(source, 'opsdeck'))) {
  fail('no packaged build found at release/linux-unpacked/opsdeck. Run `npm run pack` first.');
}

console.log(`Installing OpsDeck to ${installDir}`);
fs.rmSync(installDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(installDir), { recursive: true });
fs.cpSync(source, installDir, { recursive: true, verbatimSymlinks: true });
fs.chmodSync(path.join(installDir, 'opsdeck'), 0o755);

const iconSource = path.join(root, 'assets', 'icon.png');
if (!fs.existsSync(iconSource)) fail('assets/icon.png is missing.');
fs.mkdirSync(iconDir, { recursive: true });
fs.copyFileSync(iconSource, path.join(iconDir, 'opsdeck.png'));
fs.mkdirSync(legacyIconDir, { recursive: true });
fs.copyFileSync(iconSource, path.join(legacyIconDir, 'opsdeck.png'));

const executable = path.join(installDir, 'opsdeck');
const entry = `[Desktop Entry]
Type=Application
Version=1.0
Name=OpsDeck
GenericName=Operations Studio
Comment=Docker control plane with an interactive Docker Academy
Exec="${executable}" %U
TryExec=${executable}
Path=${home}
Icon=opsdeck
Terminal=false
Categories=Development;
Keywords=docker;containers;compose;devops;kubernetes;academy;learning;
StartupWMClass=OpsDeck
StartupNotify=true
`;

fs.mkdirSync(applicationsDir, { recursive: true });
fs.writeFileSync(desktopFile, entry, { mode: 0o755 });
fs.chmodSync(desktopFile, 0o755);

run('update-desktop-database', [applicationsDir]);
run('gtk-update-icon-cache', ['-f', '-t', path.join(dataHome, 'icons', 'hicolor')]);

console.log('Installed:');
console.log(`  executable  ${executable}`);
console.log(`  launcher    ${desktopFile}`);
console.log(`  icon        ${path.join(iconDir, 'opsdeck.png')}`);
console.log('\nOpsDeck should now appear in your application list. If it does not, log out and back in,');
console.log('or launch it once with: gtk-launch opsdeck');
