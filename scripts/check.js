'use strict';

/**
 * Static validation for the OpsDeck repo.
 *
 * Run with `npm run check`. It verifies that:
 *   - every JavaScript file parses;
 *   - the compiled Academy content is complete and internally consistent;
 *   - the preload bridge and the IPC layer agree on channel names;
 *   - the renderer CSP stays strict;
 *   - the command validator still blocks dangerous Docker options.
 *
 * No Electron or Docker process is needed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const problems = [];
const notes = [];

function fail(message) { problems.push(message); }
function note(message) { notes.push(message); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }

// ---------------------------------------------------------------- files

const required = [
  'main.js',
  'preload.js',
  'package.json',
  'src/main/ipc.js',
  'src/main/docker.js',
  'src/main/security.js',
  'src/main/store.js',
  'src/main/content.js',
  'src/main/labs.js',
  'src/main/ai.js',
  'src/renderer/index.html',
  'src/renderer/js/app.js',
  'src/renderer/js/ai.js',
  'src/renderer/js/icons.js',
  'src/renderer/js/utils.js',
  'src/renderer/js/charts.js',
  'src/renderer/js/ui.js',
  'src/renderer/js/store.js',
  'src/renderer/js/docker-views.js',
  'src/renderer/js/academy-views.js',
  'src/renderer/styles/tokens.css',
  'src/renderer/styles/base.css',
  'src/renderer/styles/components.css',
  'src/renderer/styles/academy.css',
  'content/meta.json',
  'content/labs.json',
  'content/reference/commands.json',
  'content/reference/diagrams.json',
  'content/guides/troubleshooting.json',
  'assets/icon.png',
];
for (const rel of required) if (!exists(rel)) fail(`missing required file: ${rel}`);

// ---------------------------------------------------------------- syntax

const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'release' || entry.name === 'dist' || entry.name === 'out') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(full);
  }
}
walk(root);
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    fail(`syntax error in ${path.relative(root, file)}: ${String(error.stderr || error.message).split('\n')[0]}`);
  }
}
note(`${jsFiles.length} JavaScript files parse`);

// ---------------------------------------------------------------- content

const contentErrors = [];
const coursesDir = path.join(root, 'content', 'courses');
const courseFiles = fs.existsSync(coursesDir) ? fs.readdirSync(coursesDir).filter((f) => f.endsWith('.json')) : [];
const courses = courseFiles.map((f) => JSON.parse(fs.readFileSync(path.join(coursesDir, f), 'utf8')));

const courseIds = new Set();
const lessonIds = new Set();
let lessonCount = 0;
let quizCount = 0;

for (const course of courses) {
  if (!course.id || courseIds.has(course.id)) contentErrors.push(`duplicate or empty course id ${course.id}`);
  courseIds.add(course.id);
  if (!Array.isArray(course.modules) || !course.modules.length) contentErrors.push(`course ${course.id} has no modules`);
  if (!Array.isArray(course.prerequisites)) contentErrors.push(`course ${course.id} has no prerequisites array`);
  for (const module of course.modules || []) {
    if (!Array.isArray(module.lessons) || !module.lessons.length) contentErrors.push(`module ${course.id}/${module.id} has no lessons`);
    for (const lesson of module.lessons || []) {
      lessonCount += 1;
      if (!lesson.id || lessonIds.has(lesson.id)) contentErrors.push(`duplicate or empty lesson id ${lesson.id}`);
      lessonIds.add(lesson.id);
      if (!Array.isArray(lesson.objectives) || !lesson.objectives.length) contentErrors.push(`lesson ${lesson.id} has no objectives`);
      if (!Array.isArray(lesson.sections) || !lesson.sections.length) contentErrors.push(`lesson ${lesson.id} has no sections`);
      if (!lesson.quiz || !Array.isArray(lesson.quiz.questions) || !lesson.quiz.questions.length) {
        contentErrors.push(`lesson ${lesson.id} has no quiz`);
      }
      for (const [qi, question] of (lesson.quiz?.questions || []).entries()) {
        quizCount += 1;
        if (!Array.isArray(question.options) || question.options.length < 2) contentErrors.push(`quiz ${lesson.id}#${qi} needs at least two options`);
        if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= (question.options || []).length) {
          contentErrors.push(`quiz ${lesson.id}#${qi} has an invalid answer index`);
        }
        if (!question.explain) contentErrors.push(`quiz ${lesson.id}#${qi} has no explanation`);
      }
      for (const [si, section] of (lesson.sections || []).entries()) {
        if (!['text', 'code', 'callout', 'table', 'diagram', 'steps'].includes(section.type)) {
          contentErrors.push(`lesson ${lesson.id} section ${si} has unknown type ${section.type}`);
        }
      }
    }
  }
}

for (const course of courses) {
  for (const prereq of course.prerequisites || []) {
    if (!courseIds.has(prereq)) contentErrors.push(`course ${course.id} references unknown prerequisite ${prereq}`);
  }
  for (const module of course.modules || []) {
    for (const lesson of module.lessons || []) {
      for (const related of lesson.related || []) {
        if (!lessonIds.has(related)) contentErrors.push(`lesson ${lesson.id} references unknown related lesson ${related}`);
      }
      if (lesson.lab) {
        for (const [stepIndex, step] of (lesson.lab.steps || []).entries()) {
          if (!step.instruction || !step.command) contentErrors.push(`lab ${lesson.lab.id || lesson.id} step ${stepIndex} is incomplete`);
        }
      }
    }
  }
}

const commands = JSON.parse(read('content/reference/commands.json'));
for (const kind of ['engine', 'compose', 'dockerfile', 'properties']) {
  if (!Array.isArray(commands[kind]) || !commands[kind].length) contentErrors.push(`reference.${kind} is empty`);
}
for (const kind of ['engine', 'compose', 'dockerfile', 'properties']) {
  const seen = new Set();
  for (const entry of commands[kind] || []) {
    if (!entry.id) contentErrors.push(`reference.${kind} entry without id`);
    if (seen.has(entry.id)) contentErrors.push(`reference.${kind} duplicate id ${entry.id}`);
    seen.add(entry.id);
    if (!entry.summary) contentErrors.push(`reference.${kind}/${entry.id} has no summary`);
    if (!Array.isArray(entry.examples) || !entry.examples.length) contentErrors.push(`reference.${kind}/${entry.id} has no examples`);
    if (entry.lesson && !lessonIds.has(entry.lesson)) contentErrors.push(`reference.${kind}/${entry.id} links unknown lesson ${entry.lesson}`);
  }
}

const diagrams = JSON.parse(read('content/reference/diagrams.json')).diagrams;
for (const [id, diagram] of Object.entries(diagrams)) {
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length < 2) contentErrors.push(`diagram ${id} needs at least two nodes`);
  const nodeIds = new Set((diagram.nodes || []).map((n) => n.id));
  for (const edge of diagram.edges || []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) contentErrors.push(`diagram ${id} edge points at an unknown node`);
  }
}

const guides = JSON.parse(read('content/guides/troubleshooting.json')).guides;
for (const guide of guides) {
  if (!guide.id || !guide.title || !guide.summary) contentErrors.push(`guide ${guide.id || '?'} is incomplete`);
  if (!Array.isArray(guide.steps) || !guide.steps.length) contentErrors.push(`guide ${guide.id} has no steps`);
  if (!Array.isArray(guide.patterns) || !guide.patterns.length) contentErrors.push(`guide ${guide.id} has no patterns`);
}

const pathsDir = path.join(root, 'content', 'paths');
const paths = fs.existsSync(pathsDir) ? fs.readdirSync(pathsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(pathsDir, f), 'utf8'))) : [];
for (const p of paths) {
  for (const courseId of p.completion?.courseIds || []) {
    if (!courseIds.has(courseId)) contentErrors.push(`path ${p.id} references unknown course ${courseId}`);
  }
  for (const stage of p.stages || []) {
    if (!courseIds.has(stage.courseId)) contentErrors.push(`path ${p.id} stage references unknown course ${stage.courseId}`);
  }
}

const meta = JSON.parse(read('content/meta.json'));
if (!Array.isArray(meta.achievements) || !meta.achievements.length) contentErrors.push('meta.achievements is empty');
if (!Array.isArray(meta.glossary) || meta.glossary.length < 10) contentErrors.push('meta.glossary is too small');

const labs = JSON.parse(read('content/labs.json')).labs;
if (labs.length < 8) contentErrors.push('expected at least 8 standalone labs');
for (const lab of labs) {
  if (!Array.isArray(lab.steps) || !lab.steps.length) contentErrors.push(`lab ${lab.id} has no steps`);
  for (const [i, step] of (lab.steps || []).entries()) {
    if (!step.instruction) contentErrors.push(`lab ${lab.id} step ${i} has no instruction`);
    if (!step.command && !step.file) contentErrors.push(`lab ${lab.id} step ${i} has neither command nor file`);
  }
}

if (contentErrors.length) contentErrors.forEach((e) => fail(`content: ${e}`));
if (!courses.length) fail('no compiled courses found; run `node scripts/build-content.js`');
note(`${courses.length} courses, ${lessonCount} lessons, ${quizCount} quiz questions`);
note(`${commands.engine.length + commands.compose.length + commands.dockerfile.length + commands.properties.length} reference entries, ${Object.keys(diagrams).length} diagrams, ${guides.length} guides, ${paths.length} paths, ${labs.length} labs`);

// ---------------------------------------------------------------- IPC bridge

const preload = read('preload.js');
const ipcSource = read('src/main/ipc.js') + '\n' + read('main.js');
const invoked = new Set([...preload.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1]));
const sent = new Set([...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1]));
const handled = new Set([...ipcSource.matchAll(/(?:handle|ipcMain\.handle|ipcMain\.on)\('([^']+)'/g)].map((m) => m[1]));
for (const channel of invoked) if (!handled.has(channel)) fail(`preload invokes unregistered channel: ${channel}`);
for (const channel of sent) if (!handled.has(channel)) fail(`preload sends unregistered channel: ${channel}`);
note(`${invoked.size + sent.size} bridge channels are registered`);

// ---------------------------------------------------------------- CSP

const html = read('src/renderer/index.html');
const csp = (html.match(/Content-Security-Policy"[\s\S]*?content="([^"]+)"/) || [])[1] || '';
if (!csp) fail('index.html has no Content-Security-Policy');
for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
  if (csp && !csp.includes(directive)) fail(`CSP is missing: ${directive}`);
}
if (/unsafe-eval/.test(csp)) fail("CSP allows 'unsafe-eval'");
if (/script-src[^;]*https?:/.test(csp)) fail('CSP allows remote scripts');
if (!/connect-src 'none'/.test(csp)) fail("CSP should keep connect-src 'none'");
if (!/nodeIntegration:\s*false/.test(read('main.js'))) fail('BrowserWindow must keep nodeIntegration disabled');
if (!/contextIsolation:\s*true/.test(read('main.js'))) fail('BrowserWindow must keep contextIsolation enabled');
note('renderer CSP and window isolation are strict');

// ---------------------------------------------------------------- security rules

const { tokenize, validateTerminal, validateLab, validateComposeFile, isLabImage } = require('../src/main/security');
function expectBlocked(label, fn) {
  try {
    const result = fn();
    if (result && result.ok !== false) fail(`security: ${label} was not blocked`);
  } catch {
    // Throwing is also a valid block.
  }
}
function expectAllowed(label, fn) {
  try {
    const result = fn();
    if (!result || result.ok !== true) fail(`security: ${label} should be allowed (${result && result.threats ? result.threats.join(' ') : 'no result'})`);
  } catch (error) {
    fail(`security: ${label} should be allowed (${error.message})`);
  }
}

expectBlocked('privileged container', () => validateTerminal('docker run --privileged alpine'));
expectBlocked('host network', () => validateTerminal('docker run --network host alpine'));
expectBlocked('docker socket mount', () => validateTerminal('docker run -v /var/run/docker.sock:/var/run/docker.sock alpine'));
expectBlocked('host bind mount', () => validateTerminal('docker run -v /etc:/host alpine'));
expectBlocked('non-docker command', () => validateTerminal('rm -rf /'));
expectBlocked('chained commands', () => validateLab('docker ps && docker images', {}));
expectBlocked('privileged compose service', () => validateComposeFile('services:\n  web:\n    image: nginx\n    privileged: true\n'));
expectAllowed('read-only docker query', () => validateTerminal('docker ps --format {{.Names}}'));
expectAllowed('lab run with hardened options', () => validateLab('docker run -d --name lab-x nginx:1.27-alpine', {}));
if (!isLabImage('nginx:1.27-alpine')) fail('security: nginx:1.27-alpine should be an approved lab image');
if (isLabImage('random/untrusted:latest')) fail('security: untrusted images should not be approved for labs');
note('dangerous-option rules still block privileged, host and socket access');

// ---------------------------------------------------------------- report

for (const line of notes) console.log(`  ✓ ${line}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log('\nOpsDeck check passed.');
