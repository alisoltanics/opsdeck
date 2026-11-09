'use strict';

// Authoring helpers. These produce the same JSON shape the renderer consumes.
const text = (title, body) => ({ type: 'text', title, body });
const code = (language, source, opts = {}) => ({
  type: 'code', language, code: source,
  title: opts.title || null, output: opts.output || null, note: opts.note || null,
});
const callout = (tone, title, body) => ({ type: 'callout', tone, title, body });
const table = (head, rows) => ({ type: 'table', head, rows });
const diagram = (name, caption = '') => ({ type: 'diagram', diagram: name, caption });
const steps = (items) => ({ type: 'steps', items });
const list = (title, items) => ({ type: 'list', title, items });
const term = (term, definition) => ({ term, definition });

const q = (question, options, answer, explain) => ({ question, options, answer, explain });
const quiz = (questions, passScore = 70) => ({ passScore, questions });
const ex = (title, prompt, expected, opts = {}) => ({
  title, prompt,
  command: opts.command || null,
  expected: expected || null,
  hint: opts.hint || null,
  solution: opts.solution || null,
});

function lesson(id, title, duration, summary, objectives, sections, extra = {}) {
  return {
    id, title, duration, summary, objectives, sections,
    exercises: extra.exercises || [],
    quiz: extra.quiz || null,
    lab: extra.lab || null,
    related: extra.related || [],
    tags: extra.tags || [],
    commands: extra.commands || [],
    sources: extra.sources || [],
    level: extra.level || null,
  };
}

function mod(id, title, summary, lessons) {
  return { id, title, summary, lessons };
}

function course(id, order, title, subtitle, level, duration, icon, accent, description, outcomes, modules, prerequisites = []) {
  return { id, order, title, subtitle, level, duration, icon, accent, description, outcomes, modules, prerequisites };
}

const docs = (title, path) => ({ title, url: `https://docs.docker.com/${path}` });
const ref = (title, path) => ({ title, url: `https://docs.docker.com/reference/${path}` });

module.exports = { text, code, callout, table, diagram, steps, list, term, q, quiz, ex, lesson, mod, course, docs, ref };
