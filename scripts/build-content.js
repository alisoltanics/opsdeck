'use strict';

/**
 * Compiles the authored Academy content into plain JSON under /content.
 * Runtime code reads only JSON, so curriculum updates never require app code.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'content');

const groups = [
  require('./content/foundations'),
  require('./content/intermediate'),
  require('./content/advanced'),
  require('./content/projects'),
];
const { paths } = require('./content/paths');
const { commands } = require('./content/reference');
const { diagrams } = require('./content/diagrams');
const { guides } = require('./content/guides');
const { meta } = require('./content/meta');
const { labs } = require('./content/labs');

const courses = groups.flatMap((g) => g.courses);
const errors = [];
const lessonIds = new Set();
const courseIds = new Set();

for (const course of courses) {
  if (courseIds.has(course.id)) errors.push(`duplicate course id: ${course.id}`);
  courseIds.add(course.id);
  if (!course.modules.length) errors.push(`course has no modules: ${course.id}`);
  for (const mod of course.modules) {
    if (!mod.lessons.length) errors.push(`empty module: ${course.id}/${mod.id}`);
    for (const lesson of mod.lessons) {
      if (lessonIds.has(lesson.id)) errors.push(`duplicate lesson id: ${lesson.id}`);
      lessonIds.add(lesson.id);
      if (!lesson.sections.length) errors.push(`lesson has no sections: ${lesson.id}`);
      if (!lesson.objectives.length) errors.push(`lesson has no objectives: ${lesson.id}`);
      if (!lesson.quiz || !lesson.quiz.questions.length) errors.push(`lesson has no quiz: ${lesson.id}`);
    }
  }
}

for (const course of courses) {
  for (const prereq of course.prerequisites) {
    if (!courseIds.has(prereq)) errors.push(`unknown prerequisite ${prereq} on ${course.id}`);
  }
  for (const mod of course.modules) {
    for (const lesson of mod.lessons) {
      for (const rel of lesson.related) {
        if (!lessonIds.has(rel)) errors.push(`unknown related lesson ${rel} on ${lesson.id}`);
      }
    }
  }
}

for (const p of paths) {
  for (const c of p.completion.courseIds) {
    if (!courseIds.has(c)) errors.push(`path ${p.id} references unknown course ${c}`);
  }
}

if (errors.length) {
  console.error('Content validation failed:\n' + errors.join('\n'));
  process.exit(1);
}

fs.rmSync(path.join(out, 'courses'), { recursive: true, force: true });
fs.rmSync(path.join(out, 'paths'), { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'courses'), { recursive: true });
fs.mkdirSync(path.join(out, 'paths'), { recursive: true });
fs.mkdirSync(path.join(out, 'reference'), { recursive: true });
fs.mkdirSync(path.join(out, 'guides'), { recursive: true });

for (const course of courses) {
  fs.writeFileSync(path.join(out, 'courses', `${course.id}.json`), JSON.stringify(course, null, 2));
}
for (const p of paths) {
  fs.writeFileSync(path.join(out, 'paths', `${p.id}.json`), JSON.stringify(p, null, 2));
}
fs.writeFileSync(path.join(out, 'reference', 'commands.json'), JSON.stringify(commands, null, 2));
fs.writeFileSync(path.join(out, 'reference', 'diagrams.json'), JSON.stringify({ diagrams }, null, 2));
fs.writeFileSync(path.join(out, 'guides', 'troubleshooting.json'), JSON.stringify({ guides }, null, 2));
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(out, 'labs.json'), JSON.stringify({ labs }, null, 2));

const lessonCount = lessonIds.size;
const quizCount = courses.reduce((n, c) => n + c.modules.reduce((m, mod) => m + mod.lessons.reduce((k, l) => k + l.quiz.questions.length, 0), 0), 0);
console.log(`Academy content written to ${path.relative(root, out)}`);
console.log(`  courses: ${courses.length}`);
console.log(`  lessons: ${lessonCount}`);
console.log(`  quiz questions: ${quizCount}`);
console.log(`  paths: ${paths.length}`);
console.log(`  command entries: ${commands.engine.length + commands.compose.length + commands.dockerfile.length + commands.properties.length}`);
console.log(`  diagrams: ${Object.keys(diagrams).length}`);
console.log(`  troubleshooting guides: ${guides.length}`);
console.log(`  standalone labs: ${labs.length}`);
