'use strict';

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

/** SQLite-backed local learning store (sql.js, persisted to userData). */
class AcademyStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
    this.SQL = null;
    this.persistTimer = null;
    this.ready = false;
  }

  async init() {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);
    this.SQL = await initSqlJs({ wasmBinary });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    let data = null;
    try {
      if (fs.existsSync(this.filePath)) data = new Uint8Array(fs.readFileSync(this.filePath));
    } catch { data = null; }
    this.db = data ? new this.SQL.Database(data) : new this.SQL.Database();
    this.migrate();
    this.ready = true;
    return this;
  }

  migrate() {
    this.db.run(`
      PRAGMA journal_mode = MEMORY;
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lesson_progress (
        lesson_id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress',
        progress INTEGER NOT NULL DEFAULT 0,
        seconds INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_progress_course ON lesson_progress(course_id);
      CREATE TABLE IF NOT EXISTS quiz_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL,
        course_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        answers TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quiz_lesson ON quiz_results(lesson_id);
      CREATE TABLE IF NOT EXISTS bookmarks (
        lesson_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notes (
        lesson_id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        lesson_id TEXT,
        course_id TEXT,
        meta TEXT,
        created_at TEXT NOT NULL,
        day TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_day ON activity(day);
      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recent (
        lesson_id TEXT PRIMARY KEY,
        course_id TEXT,
        viewed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lab_state (
        lab_id TEXT PRIMARY KEY,
        state TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    this.persistNow();
  }

  now() { return new Date().toISOString(); }
  day() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  }

  schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), 300);
  }

  persistNow() {
    if (!this.db) return;
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, Buffer.from(this.db.export()));
      fs.renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('Could not persist academy database:', error.message);
    }
  }

  activity(kind, lessonId, courseId, meta) {
    const at = this.now();
    this.db.run('INSERT INTO activity (kind, lesson_id, course_id, meta, created_at, day) VALUES (?,?,?,?,?,?)',
      [kind, lessonId || null, courseId || null, meta ? JSON.stringify(meta) : null, at, this.day()]);
    this.schedulePersist();
  }

  getSettings() {
    const rows = this.all('SELECT key, value FROM settings');
    const out = {};
    for (const row of rows) {
      try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
    }
    return out;
  }

  setSetting(key, value) {
    if (typeof key !== 'string' || key.length > 120) throw new Error('Invalid setting key');
    const serialized = JSON.stringify(value);
    if (serialized.length > 20000) throw new Error('Setting value is too large');
    this.db.run('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
      [key, serialized, this.now()]);
    this.schedulePersist();
    return { ok: true };
  }

  recordView({ lessonId, courseId }) {
    if (!lessonId) return { ok: false };
    const at = this.now();
    this.db.run('INSERT INTO recent (lesson_id, course_id, viewed_at) VALUES (?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET viewed_at=excluded.viewed_at',
      [lessonId, courseId || null, at]);
    this.activity('view', lessonId, courseId, null);
    this.schedulePersist();
    return { ok: true };
  }

  setLessonProgress({ lessonId, courseId, status, progress, seconds }) {
    if (!lessonId || !courseId) throw new Error('Lesson id and course id are required');
    const safeStatus = ['in_progress', 'completed', 'not_started'].includes(status) ? status : 'in_progress';
    const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    const safeSeconds = Math.max(0, Math.min(86400, Number(seconds) || 0));
    const existing = this.all('SELECT status, completed_at, seconds FROM lesson_progress WHERE lesson_id = ?', [lessonId])[0];
    const completedAt = safeStatus === 'completed' ? (existing?.completed_at || this.now()) : null;
    this.db.run(`INSERT INTO lesson_progress (lesson_id, course_id, status, progress, seconds, completed_at, updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(lesson_id) DO UPDATE SET course_id=excluded.course_id, status=excluded.status,
        progress=excluded.progress, seconds=MAX(lesson_progress.seconds, excluded.seconds),
        completed_at=COALESCE(lesson_progress.completed_at, excluded.completed_at), updated_at=excluded.updated_at`,
      [lessonId, courseId, safeStatus, safeProgress, safeSeconds, completedAt, this.now()]);
    this.activity(safeStatus === 'completed' ? 'complete' : 'study', lessonId, courseId, { progress: safeProgress });
    this.schedulePersist();
    return { ok: true };
  }

  saveQuiz({ lessonId, courseId, score, total, answers }) {
    if (!lessonId || !courseId) throw new Error('Lesson id and course id are required');
    const s = Math.max(0, Number(score) || 0);
    const t = Math.max(1, Number(total) || 1);
    this.db.run('INSERT INTO quiz_results (lesson_id, course_id, score, total, answers, created_at) VALUES (?,?,?,?,?,?)',
      [lessonId, courseId, s, t, JSON.stringify(answers || []), this.now()]);
    this.activity('quiz', lessonId, courseId, { score: s, total: t });
    this.schedulePersist();
    return { ok: true };
  }

  toggleBookmark(lessonId) {
    if (!lessonId) throw new Error('Lesson id is required');
    const exists = this.all('SELECT lesson_id FROM bookmarks WHERE lesson_id = ?', [lessonId])[0];
    if (exists) {
      this.db.run('DELETE FROM bookmarks WHERE lesson_id = ?', [lessonId]);
      this.schedulePersist();
      return { ok: true, bookmarked: false };
    }
    this.db.run('INSERT INTO bookmarks (lesson_id, created_at) VALUES (?,?)', [lessonId, this.now()]);
    this.schedulePersist();
    return { ok: true, bookmarked: true };
  }

  saveNote({ lessonId, body }) {
    if (!lessonId) throw new Error('Lesson id is required');
    const text = String(body || '').slice(0, 20000);
    if (!text.trim()) {
      this.db.run('DELETE FROM notes WHERE lesson_id = ?', [lessonId]);
    } else {
      this.db.run('INSERT INTO notes (lesson_id, body, updated_at) VALUES (?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at',
        [lessonId, text, this.now()]);
    }
    this.schedulePersist();
    return { ok: true };
  }

  unlockAchievement(id) {
    if (!id || typeof id !== 'string') return { ok: false };
    this.db.run('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?,?)', [id, this.now()]);
    this.schedulePersist();
    return { ok: true };
  }

  saveLabState(labId, state) {
    if (!labId) return { ok: false };
    this.db.run('INSERT INTO lab_state (lab_id, state, updated_at) VALUES (?,?,?) ON CONFLICT(lab_id) DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at',
      [labId, JSON.stringify(state || {}), this.now()]);
    this.schedulePersist();
    return { ok: true };
  }

  getProgress() {
    const lessonRows = this.all('SELECT * FROM lesson_progress');
    const quizzes = this.all('SELECT * FROM quiz_results ORDER BY created_at DESC');
    const bookmarks = this.all('SELECT * FROM bookmarks ORDER BY created_at DESC');
    const notes = this.all('SELECT * FROM notes ORDER BY updated_at DESC');
    const recent = this.all('SELECT * FROM recent ORDER BY viewed_at DESC LIMIT 24');
    const achievements = this.all('SELECT * FROM achievements ORDER BY unlocked_at');
    const days = this.all('SELECT day, COUNT(*) AS count, SUM(CASE WHEN kind = "complete" THEN 1 ELSE 0 END) AS completions FROM activity GROUP BY day ORDER BY day DESC LIMIT 180');
    const latestQuiz = {};
    for (const q of quizzes) if (!latestQuiz[q.lesson_id]) latestQuiz[q.lesson_id] = { score: q.score, total: q.total, at: q.created_at };

    const lessons = {};
    for (const row of lessonRows) {
      lessons[row.lesson_id] = {
        lessonId: row.lesson_id,
        courseId: row.course_id,
        status: row.status,
        progress: row.progress,
        seconds: row.seconds,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
      };
    }
    const quizzesByLesson = {};
    for (const q of quizzes) {
      (quizzesByLesson[q.lesson_id] ||= []).push({ id: q.id, score: q.score, total: q.total, at: q.created_at });
    }
    const dayMap = Object.fromEntries(days.map((d) => [d.day, Number(d.count)]));
    return {
      lessons,
      quizzes: latestQuiz,
      quizzesByLesson,
      bookmarks: bookmarks.map((b) => ({ lessonId: b.lesson_id, at: b.created_at })),
      notes: Object.fromEntries(notes.map((n) => [n.lesson_id, { body: n.body, updatedAt: n.updated_at }])),
      recent: recent.map((r) => ({ lessonId: r.lesson_id, courseId: r.course_id, at: r.viewed_at })),
      achievements: achievements.map((a) => ({ id: a.id, at: a.unlocked_at })),
      activity: days.map((d) => ({ day: d.day, count: Number(d.count), completions: Number(d.completions) })),
      streak: computeStreak(dayMap, this.day()),
      settings: this.getSettings(),
    };
  }

  resetProgress() {
    this.db.run('DELETE FROM lesson_progress; DELETE FROM quiz_results; DELETE FROM bookmarks; DELETE FROM notes; DELETE FROM activity; DELETE FROM achievements; DELETE FROM recent;');
    this.schedulePersist();
    return { ok: true };
  }
}

function computeStreak(dayMap, today) {
  const cursor = new Date(`${today}T12:00:00`);
  const fmt = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  let current = 0;
  if (!dayMap[fmt(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (dayMap[fmt(cursor)]) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const allDays = Object.keys(dayMap).sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const day of allDays) {
    if (prev) {
      const d = new Date(`${day}T12:00:00`);
      const p = new Date(`${prev}T12:00:00`);
      const diff = Math.round((d - p) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  return { current, longest, todayActive: !!dayMap[today], today: dayMap[today] || 0, days: dayMap };
}

module.exports = { AcademyStore, computeStreak };
