'use strict';

/**
 * Content integrity tests. These run without Electron or Docker and verify the
 * compiled JSON rather than the authored sources, because the runtime only
 * ever reads the JSON.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const courseDir = path.join(root, 'content', 'courses');
const courses = fs.readdirSync(courseDir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join('content', 'courses', f)));
const coursesById = new Map(courses.map((c) => [c.id, c]));
const lessons = courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, courseId: c.id }))));
const lessonsById = new Map(lessons.map((l) => [l.id, l]));

test('the curriculum covers beginner through expert with real volume', () => {
  assert.ok(courses.length >= 18, `expected at least 18 courses, found ${courses.length}`);
  assert.ok(lessons.length >= 70, `expected at least 70 lessons, found ${lessons.length}`);
  const levels = new Set(courses.map((c) => c.level));
  for (const level of ['Beginner', 'Intermediate', 'Advanced']) {
    assert.ok(levels.has(level), `missing ${level} courses`);
  }
  const composeCourses = courses.filter((c) => c.id.includes('compose') || c.title.toLowerCase().includes('compose'));
  assert.ok(composeCourses.length >= 1, 'a dedicated Compose curriculum is required');
});

test('every lesson is complete and navigable', () => {
  for (const course of courses) {
    assert.ok(course.modules.length > 0, `${course.id} has no modules`);
    for (const module of course.modules) {
      assert.ok(module.lessons.length > 0, `${course.id}/${module.id} has no lessons`);
      for (const lesson of module.lessons) {
        assert.ok(lesson.objectives.length > 0, `${lesson.id} has no objectives`);
        assert.ok(lesson.sections.length > 0, `${lesson.id} has no content`);
        assert.ok(lesson.quiz && lesson.quiz.questions.length > 0, `${lesson.id} has no quiz`);
        for (const question of lesson.quiz.questions) {
          assert.ok(question.options.length >= 2, `${lesson.id} quiz has too few options`);
          assert.ok(Number.isInteger(question.answer), `${lesson.id} quiz answer is not an index`);
          assert.ok(question.answer >= 0 && question.answer < question.options.length, `${lesson.id} quiz answer is out of range`);
          assert.ok(question.explain, `${lesson.id} quiz has no explanation`);
        }
        for (const related of lesson.related || []) {
          assert.ok(lessonsById.has(related), `${lesson.id} links unknown lesson ${related}`);
        }
      }
    }
    for (const prerequisite of course.prerequisites || []) {
      assert.ok(coursesById.has(prerequisite), `${course.id} links unknown prerequisite ${prerequisite}`);
    }
  }
});

test('learning paths reference existing courses', () => {
  const pathsDir = path.join(root, 'content', 'paths');
  const paths = fs.readdirSync(pathsDir).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join('content', 'paths', f)));
  assert.ok(paths.length >= 6, `expected 6 learning paths, found ${paths.length}`);
  for (const p of paths) {
    assert.ok(p.stages.length > 0, `${p.id} has no stages`);
    for (const stage of p.stages) assert.ok(coursesById.has(stage.courseId), `${p.id} references unknown course ${stage.courseId}`);
    for (const id of p.completion?.courseIds || []) assert.ok(coursesById.has(id), `${p.id} completion references unknown course ${id}`);
  }
});

test('the command reference is complete and every entry has examples', () => {
  const reference = readJson('content/reference/commands.json');
  for (const kind of ['engine', 'compose', 'dockerfile', 'properties']) {
    assert.ok(Array.isArray(reference[kind]) && reference[kind].length > 0, `${kind} reference is empty`);
    for (const entry of reference[kind]) {
      assert.ok(entry.id && entry.summary && entry.syntax, `${kind}/${entry.id} is incomplete`);
      assert.ok(Array.isArray(entry.examples) && entry.examples.length > 0, `${kind}/${entry.id} has no examples`);
      for (const example of entry.examples) {
        assert.ok(example.command, `${kind}/${entry.id} has an example without a command`);
      }
      if (entry.lesson) assert.ok(lessonsById.has(entry.lesson), `${kind}/${entry.id} links unknown lesson ${entry.lesson}`);
    }
  }
  const total = reference.engine.length + reference.compose.length + reference.dockerfile.length + reference.properties.length;
  assert.ok(total >= 119, `expected at least 119 reference entries, found ${total}`);
});

test('diagrams connect only existing nodes and link real lessons', () => {
  const { diagrams } = readJson('content/reference/diagrams.json');
  const entries = Object.entries(diagrams);
  assert.ok(entries.length >= 9, `expected at least 9 diagrams, found ${entries.length}`);
  for (const [id, diagram] of entries) {
    const nodeIds = new Set(diagram.nodes.map((n) => n.id));
    assert.ok(nodeIds.size >= 2, `${id} needs at least two nodes`);
    for (const edge of diagram.edges || []) {
      assert.ok(nodeIds.has(edge.from) && nodeIds.has(edge.to), `${id} edge points at an unknown node`);
    }
    for (const node of diagram.nodes) {
      if (node.lesson) assert.ok(lessonsById.has(node.lesson), `${id} node links unknown lesson ${node.lesson}`);
    }
  }
});

test('troubleshooting guides have real patterns and ordered steps', () => {
  const { guides } = readJson('content/guides/troubleshooting.json');
  assert.ok(guides.length >= 12, `expected at least 12 guides, found ${guides.length}`);
  for (const guide of guides) {
    assert.ok(guide.title && guide.summary, `${guide.id} is incomplete`);
    assert.ok(guide.patterns.length > 0, `${guide.id} has no matching patterns`);
    assert.ok(guide.causes.length > 0, `${guide.id} has no causes`);
    assert.ok(guide.steps.length > 0, `${guide.id} has no steps`);
    for (const step of guide.steps) assert.ok(step.title && step.detail, `${guide.id} has an incomplete step`);
    for (const lesson of guide.lessons || []) assert.ok(lessonsById.has(lesson), `${guide.id} links unknown lesson ${lesson}`);
  }
});

test('standalone labs are safe by construction', () => {
  const { labs } = readJson('content/labs.json');
  assert.ok(labs.length >= 8, `expected at least 8 standalone labs, found ${labs.length}`);
  for (const lab of labs) {
    assert.ok(lab.title && lab.objectives.length > 0, `${lab.id} is missing objectives`);
    assert.ok(lab.steps.length > 0, `${lab.id} has no steps`);
    for (const step of lab.steps) {
      assert.ok(step.instruction, `${lab.id} has a step without an instruction`);
      assert.ok(step.command || step.file, `${lab.id} has a step with neither a command nor a file`);
      if (step.command) {
        assert.ok(!step.command.includes('&&'), `${lab.id} uses a shell chain`);
        assert.ok(!/--privileged|--network[= ]host|docker\.sock/.test(step.command), `${lab.id} uses a blocked option`);
      }
    }
  }
});

test('meta contains achievements and a glossary', () => {
  const meta = readJson('content/meta.json');
  assert.ok(meta.achievements.length >= 8, 'expected a meaningful achievement set');
  assert.ok(meta.glossary.length >= 20, 'expected a meaningful glossary');
  for (const item of meta.glossary) assert.ok(item.term && item.definition, 'glossary entry is incomplete');
});
