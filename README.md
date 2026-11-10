# OpsDeck — Operations Studio

A premium, local-first desktop control plane for Docker, with a complete interactive
Docker Academy built in. Docker is the first workspace; the shell is designed to host
Kubernetes, databases and observability workspaces next.

Everything runs on your machine. No account, no telemetry, no network calls from the
renderer. Docker commands go through `execFile('docker', ...)` — never a shell.

## What is inside

**Docker workspace**

- Overview with engine health, live samples and reclaimable disk
- Containers: state, ports, CPU/memory, logs, inspect, start/stop/restart/remove, and a real
  interactive shell — a host PTY from util-linux `script` attached to `docker exec -it` and
  rendered with xterm.js, so Tab completion, history, colours and Ctrl+C work from inside the
  container (bash with automatic sh fallback; a line-mode fallback keeps working without `script`)
- The shell drawer goes fullscreen with one click (or `Esc` to leave), and supports
  `Ctrl/Cmd+Shift+C`/`V` copy and paste
- Project view for containers: filter by Compose project or group the table by project,
  with running/service counts on every group
- Open a container's published TCP address in Firefox straight from its row or inspect drawer
- Images, volumes and networks with search, filters and safe destructive actions
- Compose projects: resolved config, logs and lifecycle controls
- Builds, registries, monitoring, event stream and a validated Docker terminal
  (safety consent is asked once and remembered across launches)
- Container logs open pinned to the newest line, with a Latest pill whenever you scroll back
- Settings for theme, interface scale, motion, transparency, daily goal and progress reset
- App-wide zoom from 50% to 250%: `Ctrl/Cmd +`, `Ctrl/Cmd −`, `Ctrl/Cmd 0`, `Ctrl/Cmd` + scroll,
  the topbar control, Settings or the command palette; the factor persists between launches

**Docker Academy**

- 18 courses and 70 lessons from beginner to advanced, including a dedicated Compose track
- 210 quiz questions with explanations, exercise prompts and lesson notes
- Interactive lessons: objectives, copyable code, callouts, tables, diagrams and knowledge checks
- Full command reference: 119 entries across Docker CLI, Compose CLI, Dockerfile instructions and Compose YAML properties, each with examples, expected output, mistakes and security notes — plus live flag help parsed from your installed CLI
- 12 troubleshooting guides with a paste-an-error pattern tester
- 9 interactive architecture, lifecycle, layer, network, storage and build diagrams
- 8 guided labs plus lesson-embedded labs with consent, validation and label-based Reset Lab
- 6 learning paths, global search, glossary, bookmarks, streaks and achievements

Progress, quiz scores, bookmarks, notes, settings and activity are stored locally in
SQLite (`~/.config/OpsDeck/academy.db` on Linux).

## Requirements

- Node.js 20+ and npm
- Linux, macOS or Windows for development
- Docker Engine for the Docker workspace and labs. The Academy content, reference,
  diagrams and guides work without Docker; live flag help and labs need the engine.

## Run from source

```bash
npm install
npm start          # normal launch
npm run dev        # development launch (DevTools enabled)
```

## Quality gates

```bash
npm run check      # syntax, content integrity, IPC bridge, CSP and security rules
npm test           # node:test suites for content and command validation
npm run smoke      # launches Electron, walks all 27 routes and tests the shell
```

The smoke test uses the real preload bridge and real IPC handlers. It exits non-zero
on any render, search, palette, theme or sidebar failure.

## Build and install as a desktop app (Linux)

```bash
npm run package          # electron-builder --dir + per-user desktop install
```

Or separately:

```bash
npm run pack             # writes release/linux-unpacked
npm run install:desktop  # copies the app and writes the launcher + icon
```

The installer writes:

- `~/.local/opt/opsdeck/` — the application
- `~/.local/share/applications/opsdeck.desktop` — the menu entry
- `~/.local/share/icons/hicolor/512x512/apps/opsdeck.png` — the icon

OpsDeck then appears in the application list. Launch it with `gtk-launch opsdeck`.
Remove it with `npm run uninstall:desktop`.

`npm run dist` produces an AppImage in `release/` via the same
[`electron-builder.yml`](./electron-builder.yml) configuration.

### Sandbox

Chromium's setuid sandbox helper (`chrome-sandbox`) must be owned by `root` with
mode `4755`, which a per-user install cannot do. Ubuntu's AppArmor policy also
blocks the unprivileged user-namespace fallback for apps started from the
desktop shell, so the generated launcher passes `--no-sandbox`; otherwise
clicking the icon aborts with `FATAL:setuid_sandbox_host.cc(158)` or
`No usable sandbox!`.

Hardening is still possible:

```bash
sudo chown root:root ~/.local/opt/opsdeck/chrome-sandbox
sudo chmod 4755 ~/.local/opt/opsdeck/chrome-sandbox
```

The generated launcher checks the helper on every start: once it is
root-owned and setuid, `--no-sandbox` is no longer passed, and no reinstall is
needed. Reinstalling the app resets the helper, so repeat the two commands
afterwards if you want the sandbox back.

The rest of the security model does not depend on the Chromium sandbox:
`contextIsolation` is on, `nodeIntegration` is off, the renderer runs under a
strict CSP, all content is local, and Docker access goes through a validated
IPC bridge. Docker commands are spawned with argument arrays, never a host
shell; the interactive terminal is the one exception, and its wrapper is a
fixed `stty …; exec docker exec -it <validated id> <bash|sh>` string passed to
util-linux `script`.

## Architecture

```
main.js                 Electron window, splash, single-instance lock, IPC bridge
preload.js              contextBridge surface: window.opsdeck
src/main/docker.js      Docker CLI adapter (execFile only, cached reads)
src/main/exec.js        container shell sessions: PTY via `script`, line-mode fallback
src/main/security.js    tokenizer + command/compose validation
src/main/store.js       sql.js SQLite store for learning progress
src/main/content.js     loads the compiled Academy JSON
src/main/labs.js        lab sandbox, hardening, file workspace, reset
src/main/ipc.js         IPC handlers
src/main/smoke.js       Electron route/interaction smoke test
src/renderer/           design system, shell, Docker views, Academy views
src/renderer/vendor/    vendored xterm.js + fit addon (MIT) for the container terminal
scripts/content/        authored Academy curriculum and reference sources
scripts/build-content.js validates and compiles sources into content/*.json
content/                runtime JSON (generated, committed)
```

The renderer uses classic deferred scripts attached to `window.OD` — no bundler, no
build step, no `file://` module CORS problems. A strict CSP allows only local scripts,
styles and fonts, and the renderer has no network access.

### Content pipeline

Edit files in `scripts/content/`, then run:

```bash
node scripts/build-content.js
```

The compiler validates duplicate IDs, missing lessons, prerequisites, quiz answers,
dependencies and references before writing `content/`. The runtime reads only the
compiled JSON, so content can be updated without touching application code.

### Lab safety model

- Explicit consent before the first command
- Allowlisted training images only
- One Docker command per step, no shell operators
- Blocked: privileged mode, host PID/IPC/network/user/UTS namespaces, device passthrough,
  added capabilities, host bind mounts and Docker socket mounts
- Hardened: CPU, memory and PID caps, `--rm` where appropriate
- Every resource carries `opsdeck.lab=1` and `opsdeck.lab.id=<lab>` so Reset Lab removes
  only that lab's containers, networks, volumes and files
- Compose files are validated before Compose reads them

The terminal and labs share the same validator. A command that fails validation never
reaches the Docker binary.

## Design

Dark-first with a designed light theme, custom tokens and components, Inter and
JetBrains Mono, a collapsible grouped sidebar, `Ctrl/Cmd+K` command palette,
`Ctrl/Cmd+B` sidebar toggle, `Ctrl/Cmd+Shift+F` Academy search, app-wide zoom
(`Ctrl/Cmd +`, `−`, `0`), keyboard navigation and reduced-motion support.

## License

Private project. All rights reserved.
