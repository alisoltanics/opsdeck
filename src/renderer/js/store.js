'use strict';

/**
 * Renderer state, derived indexes and the thin API facade.
 * Content is immutable; progress and settings come from SQLite via IPC.
 */
(function () {
  const api = window.opsdeck;
  const { timeAgo, fmtBytes } = OD.utils;

  const state = {
    booted: false,
    bootError: null,
    info: null,
    academy: {
      courses: [], paths: [], guides: { guides: [] }, diagrams: { diagrams: {} },
      labs: [], commands: { engine: [], compose: [], dockerfile: [], properties: [] },
      meta: { achievements: [], glossary: [], dailyGoalMinutes: 20 },
    },
    progress: {
      lessons: {}, quizzes: {}, quizzesByLesson: {}, bookmarks: [], notes: {},
      recent: [], achievements: [], activity: [], streak: { current: 0, longest: 0, todayActive: false, today: 0, days: {} },
      settings: {},
    },
    settings: {},
    status: null,
    route: { name: 'overview', parts: [] },
    history: { cpu: [], mem: [], net: [], at: [] },
    samples: [],
    sidebarCollapsed: false,
  };

  const index = {
    courses: new Map(),
    lessons: new Map(),
    lessonList: [],
    commands: [],
    commandMap: new Map(),
    guides: new Map(),
    guideList: [],
    paths: new Map(),
    pathList: [],
    diagrams: new Map(),
    search: [],
    labs: [],
  };

  const listeners = new Set();
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit() { for (const fn of listeners) fn(state); }

  function applySettings(settings) {
    state.settings = { ...(settings || {}) };
    state.sidebarCollapsed = settings?.sidebarCollapsed === true;
    const motion = settings?.motion || 'full';
    document.documentElement.dataset.motion = motion === 'reduced' ? 'reduced' : 'full';
    applyTheme();
    OD.i18n?.setLang(settings?.uiLanguage);
    document.documentElement.dataset.reduceTransparency = settings?.reduceTransparency ? 'true' : 'false';
  }

  // Every theme is a token set in styles/tokens.css. `tone` is used by the
  // quick toggle so it can flip between a light and a dark palette no matter
  // which branded theme is active.
  const THEMES = [
    { id: 'dark', label: 'OpsDeck Dark', tone: 'dark', icon: 'moon', swatch: '#0e141e', accent: '#2496ed' },
    { id: 'light', label: 'OpsDeck Light', tone: 'light', icon: 'sun', swatch: '#f4f6fa', accent: '#1479cc' },
    { id: 'system', label: 'Match system', tone: 'system', icon: 'monitor', swatch: 'linear-gradient(135deg, #f4f6fa 0 50%, #0e141e 50% 100%)', accent: '#64748b' },
    { id: 'vscode', label: 'VS Code Dark+', tone: 'dark', icon: 'code', swatch: '#1e1e1e', accent: '#007acc' },
    { id: 'github', label: 'GitHub Dark', tone: 'dark', icon: 'github', swatch: '#0d1117', accent: '#3fb950' },
    { id: 'chatgpt', label: 'ChatGPT', tone: 'dark', icon: 'sparkles', swatch: '#212121', accent: '#10a37f' },
  ];
  const THEME_IDS = new Set(THEMES.map((t) => t.id));
  function isThemeId(id) { return THEME_IDS.has(id); }
  function themeMeta(id = state.settings.theme) {
    return THEMES.find((t) => t.id === id) || THEMES[0];
  }

  function resolvedTheme() {
    const pref = state.settings.theme || 'dark';
    if (pref === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return THEME_IDS.has(pref) ? pref : 'dark';
  }

  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme();
  }

  async function setSetting(key, value) {
    state.settings = { ...state.settings, [key]: value };
    if (key === 'sidebarCollapsed') state.sidebarCollapsed = value === true;
    if (key === 'theme' || key === 'motion' || key === 'reduceTransparency' || key === 'uiLanguage') applySettings(state.settings);
    try {
      const res = await api.academy.setSetting({ key, value });
      return res;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  function unwrap(value, fallback = null) {
    if (value && value.ok === false) return fallback;
    return value ?? fallback;
  }

  async function boot() {
    const [info, boot, initialStatus] = await Promise.all([
      api.app.info().catch((error) => ({ ok: false, error: error.message })),
      api.academy.bootstrap().catch((error) => ({ ok: false, error: error.message })),
      refreshStatus(),
    ]);
    state.info = info;
    if (!boot || !boot.ok) {
      state.bootError = boot?.error || 'The Academy content could not be loaded.';
      state.academy = { courses: [], paths: [], guides: { guides: [] }, diagrams: { diagrams: {} }, labs: [], commands: { engine: [], compose: [], dockerfile: [], properties: [] }, meta: {} };
      state.progress = { lessons: {}, quizzes: {}, quizzesByLesson: {}, bookmarks: [], notes: {}, recent: [], achievements: [], activity: [], streak: { current: 0, longest: 0, todayActive: false, today: 0, days: {} }, settings: {} };
    } else {
      state.academy = boot.academy;
      state.progress = boot.progress || state.progress;
      state.bootError = null;
    }
    normalizeAcademy();
    state.academyFull = state.academy;
    buildIndex();
    applySettings(state.progress.settings || {});
    state.status = initialStatus;
    state.booted = true;
    emit();
    return state;
  }

  function normalizeAcademy() {
    const a = state.academy || {};
    a.courses = Array.isArray(a.courses) ? a.courses : [];
    a.paths = Array.isArray(a.paths) ? a.paths : [];
    a.labs = Array.isArray(a.labs) ? a.labs : [];
    a.commands = a.commands && typeof a.commands === 'object'
      ? {
        engine: Array.isArray(a.commands.engine) ? a.commands.engine : [],
        compose: Array.isArray(a.commands.compose) ? a.commands.compose : [],
        dockerfile: Array.isArray(a.commands.dockerfile) ? a.commands.dockerfile : [],
        properties: Array.isArray(a.commands.properties) ? a.commands.properties : [],
      }
      : { engine: [], compose: [], dockerfile: [], properties: [] };
    a.guides = a.guides && Array.isArray(a.guides.guides) ? a.guides : { guides: [] };
    a.diagrams = a.diagrams && a.diagrams.diagrams ? a.diagrams : { diagrams: {} };
    a.meta = a.meta || { achievements: [], glossary: [] };
    a.meta.achievements = Array.isArray(a.meta.achievements) ? a.meta.achievements : [];
    a.meta.glossary = Array.isArray(a.meta.glossary) ? a.meta.glossary : [];
  }

  // The Academy is two separate curricula. Everything the views and stats read
  // (courses, paths, reference, labs, diagrams, glossary) is scoped to one track.
  function trackOfCourse(course) { return course?.track === 'kubernetes' ? 'kubernetes' : 'docker'; }

  function scopeAcademy() {
    const full = state.academyFull;
    if (!full) return;
    const track = state.track;
    const courses = full.courses.filter((c) => trackOfCourse(c) === track);
    const ids = new Set(courses.map((c) => c.id));
    const diagrams = Object.fromEntries(Object.entries(full.diagrams.diagrams || {}).filter(([id]) => id.startsWith('k8s-') === (track === 'kubernetes')));
    const docker = track === 'docker';
    state.academy = {
      ...full,
      courses,
      paths: full.paths.filter((p) => (p.stages || []).every((st) => ids.has(st.courseId))),
      commands: docker ? full.commands : { engine: [], compose: [], dockerfile: [], properties: [] },
      guides: docker ? full.guides : { guides: [] },
      labs: docker ? full.labs : [],
      diagrams: { diagrams },
      meta: { ...full.meta, glossary: docker ? full.meta.glossary : [] },
    };
  }

  function setTrack(track) {
    const next = track === 'kubernetes' ? 'kubernetes' : 'docker';
    if (next === state.track && state.academy) return false;
    state.track = next;
    buildIndex();
    return true;
  }

  function trackForCourse(courseId) {
    const course = state.academyFull?.courses.find((c) => c.id === courseId);
    return course ? trackOfCourse(course) : null;
  }

  function trackForLesson(lessonId) {
    const course = state.academyFull?.courses.find((c) => c.modules.some((m) => (m.lessons || []).some((l) => l.id === lessonId)));
    return course ? trackOfCourse(course) : null;
  }

  function buildIndex() {
    if (state.academyFull === undefined || state.academyFull === null) state.academyFull = state.academy;
    state.track = state.track || 'docker';
    scopeAcademy();
    index.courses.clear();
    index.lessons.clear();
    index.commands = [];
    index.commandMap.clear();
    index.guides.clear();
    index.paths.clear();
    index.pathList = [];
    index.guideList = [];
    index.diagrams.clear();
    index.lessonList = [];

    for (const course of state.academy.courses) {
      index.courses.set(course.id, course);
      const lessons = [];
      for (const mod of course.modules || []) {
        for (const lesson of mod.lessons || []) {
          lessons.push(lesson);
          index.lessons.set(lesson.id, { ...lesson, course, module: mod });
          index.lessonList.push({ ...lesson, course, module: mod });
        }
      }
      course.lessonList = lessons;
      course.lessonCount = lessons.length;
    }

    const addCommands = (list, kind) => {
      for (const command of list) {
        const entry = { ...command, kind };
        index.commands.push(entry);
        index.commandMap.set(command.id, entry);
      }
    };
    addCommands(state.academy.commands.engine, 'engine');
    addCommands(state.academy.commands.compose, 'compose');
    addCommands(state.academy.commands.dockerfile, 'dockerfile');
    addCommands(state.academy.commands.properties, 'property');

    for (const guide of state.academy.guides.guides) {
      index.guides.set(guide.id, guide);
      index.guideList.push(guide);
    }
    for (const p of state.academy.paths) {
      index.paths.set(p.id, p);
      index.pathList.push(p);
    }
    for (const [id, diagram] of Object.entries(state.academy.diagrams.diagrams || {})) {
      index.diagrams.set(id, { id, ...diagram });
    }

    const lessonLabs = index.lessonList.filter((l) => l.lab).map((l) => ({
      ...l.lab,
      lessonId: l.id,
      courseId: l.course.id,
      courseTitle: l.course.title,
      standalone: false,
    }));
    const standalone = (state.academy.labs || []).map((l) => ({ ...l, standalone: true }));
    index.labs = [...standalone, ...lessonLabs];

    buildSearchIndex();
  }

  function buildSearchIndex() {
    const entries = [];
    for (const course of state.academy.courses) {
      entries.push({
        type: 'Course', icon: course.icon || 'graduation-cap', title: course.title,
        subtitle: `${course.level} · ${course.lessonCount} lessons`, href: `#/academy/course/${course.id}`,
        keywords: [course.subtitle, course.description, course.level, ...(course.outcomes || [])].join(' '),
      });
    }
    for (const lesson of index.lessonList) {
      entries.push({
        type: 'Lesson', icon: 'book-open', title: lesson.title,
        subtitle: `${lesson.course.title} · ${lesson.duration}`, href: `#/academy/lesson/${lesson.id}`,
        keywords: [lesson.summary, lesson.module.title, lesson.course.title, ...(lesson.objectives || []), ...(lesson.tags || []), ...(lesson.commands || [])].join(' '),
      });
    }
    for (const cmd of index.commands) {
      const type = cmd.kind === 'dockerfile' ? 'Dockerfile' : cmd.kind === 'property' ? 'Compose property' : 'Command';
      entries.push({
        type, icon: cmd.kind === 'dockerfile' ? 'file-code' : cmd.kind === 'property' ? 'boxes' : 'terminal',
        title: cmd.name || cmd.command,
        subtitle: cmd.summary || cmd.description?.slice(0, 90),
        href: `#/academy/reference/${cmd.id}`,
        keywords: [cmd.command, cmd.summary, cmd.description, cmd.group, ...(cmd.tags || []), ...(cmd.related || [])].join(' '),
      });
    }
    for (const guide of index.guideList) {
      entries.push({
        type: 'Troubleshooting', icon: 'wrench', title: guide.title,
        subtitle: guide.summary, href: `#/academy/troubleshooting/${guide.id}`,
        keywords: [guide.summary, guide.category, ...(guide.symptoms || []), ...(guide.causes || []), ...(guide.patterns || [])].join(' '),
      });
    }
    for (const p of index.pathList) {
      entries.push({
        type: 'Learning path', icon: p.icon || 'map', title: p.title,
        subtitle: `${p.level} · ${p.duration} · ${p.stages.length} courses`, href: `#/academy/paths/${p.id}`,
        keywords: [p.subtitle, p.description, ...(p.outcomes || []), ...(p.prerequisites || [])].join(' '),
      });
    }
    for (const term of state.academy.meta.glossary || []) {
      entries.push({
        type: 'Glossary', icon: 'book-open', title: term.term, subtitle: term.definition,
        href: `#/academy/glossary`, keywords: term.definition,
      });
    }
    for (const [id, diagram] of index.diagrams) {
      entries.push({
        type: 'Diagram', icon: 'network', title: diagram.title, subtitle: diagram.description,
        href: `#/academy/visuals/${id}`, keywords: [diagram.description, ...(diagram.nodes || []).map((n) => `${n.label} ${n.sub || ''} ${n.detail || ''}`)].join(' '),
      });
    }
    index.search = entries;
  }

  async function refreshStatus() {
    try {
      const status = await api.docker.status();
      state.status = status;
      emit();
      return status;
    } catch (error) {
      const status = { available: false, reason: error.message };
      state.status = status;
      return status;
    }
  }

  async function refreshAcademy(reload = false) {
    try {
      const res = reload ? await api.academy.reload() : await api.academy.bootstrap();
      if (res && res.ok) {
        state.academy = res.academy;
        state.progress = res.progress || state.progress;
        normalizeAcademy();
        state.academyFull = state.academy;
        buildIndex();
        applySettings(state.progress.settings || state.settings);
        emit();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function refreshProgress() {
    try {
      const res = await api.academy.progress();
      if (res && res.ok) {
        state.progress = res.progress || state.progress;
        emit();
        return state.progress;
      }
    } catch { /* ignore */ }
    return state.progress;
  }

  function courseById(id) { return index.courses.get(id) || null; }
  function lessonById(id) { return index.lessons.get(id) || null; }
  function commandById(id) { return index.commandMap.get(id) || null; }
  function guideById(id) { return index.guides.get(id) || null; }
  function pathById(id) { return index.paths.get(id) || null; }
  function diagramById(id) { return index.diagrams.get(id) || null; }
  function commandsFor(kind) { return index.commands.filter((c) => c.kind === kind); }
  function allLabs() { return index.labs; }
  function allLessons() { return index.lessonList; }

  function progressFor(lessonId) {
    return state.progress.lessons?.[lessonId] || null;
  }

  function isComplete(lessonId) {
    return progressFor(lessonId)?.status === 'completed';
  }

  function isBookmarked(lessonId) {
    return (state.progress.bookmarks || []).some((b) => b.lessonId === lessonId);
  }

  function noteFor(lessonId) {
    return state.progress.notes?.[lessonId]?.body || '';
  }

  function quizFor(lessonId) {
    return state.progress.quizzes?.[lessonId] || null;
  }

  function courseStats(course) {
    if (!course) return { total: 0, completed: 0, inProgress: 0, percent: 0, nextLesson: null };
    const lessons = course.lessonList || [];
    let completed = 0;
    let inProgress = 0;
    let nextLesson = null;
    for (const lesson of lessons) {
      const p = progressFor(lesson.id);
      if (p?.status === 'completed') completed += 1;
      else {
        if (!nextLesson) nextLesson = lesson;
        if (p?.status === 'in_progress' && p.progress > 0) inProgress += 1;
      }
    }
    return {
      total: lessons.length, completed, inProgress,
      percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
      nextLesson,
    };
  }

  function pathStats(path) {
    const courses = (path.stages || []).map((s) => courseById(s.courseId)).filter(Boolean);
    let total = 0;
    let completed = 0;
    let doneCourses = 0;
    for (const course of courses) {
      const stats = courseStats(course);
      total += stats.total;
      completed += stats.completed;
      if (stats.total && stats.completed === stats.total) doneCourses += 1;
    }
    return {
      courses: courses.length,
      doneCourses,
      lessons: total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      complete: courses.length > 0 && doneCourses === courses.length,
    };
  }

  function missingPrerequisites(course) {
    return (course?.prerequisites || [])
      .map((id) => courseById(id))
      .filter((c) => c && courseStats(c).percent < 100);
  }

  function overallStats() {
    const lessons = index.lessonList;
    const completed = lessons.filter((l) => isComplete(l.id)).length;
    const courses = state.academy.courses;
    const completedCourses = courses.filter((c) => courseStats(c).percent === 100).length;
    const quizzes = Object.values(state.progress.quizzes || {});
    const quizAvg = quizzes.length
      ? Math.round(quizzes.reduce((sum, q) => sum + (q.total ? (q.score / q.total) * 100 : 0), 0) / quizzes.length)
      : 0;
    const minutes = lessons.reduce((sum, l) => sum + (parseInt(l.duration, 10) || 0), 0);
    return {
      lessons: lessons.length,
      completed,
      percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
      courses: courses.length,
      completedCourses,
      quizzesTaken: quizzes.length,
      quizAvg,
      bookmarks: (state.progress.bookmarks || []).length,
      notes: Object.keys(state.progress.notes || {}).length,
      achievements: (state.progress.achievements || []).length,
      totalMinutes: minutes,
      streak: state.progress.streak || { current: 0, longest: 0, todayActive: false, today: 0, days: {} },
    };
  }

  function nextLesson() {
    const recent = state.progress.recent || [];
    for (const item of recent) {
      const lesson = lessonById(item.lessonId);
      if (lesson && !isComplete(lesson.id)) return lesson;
    }
    for (const lesson of index.lessonList) {
      if (!isComplete(lesson.id)) {
        const progress = progressFor(lesson.id);
        if (progress?.status === 'in_progress') return lesson;
      }
    }
    for (const lesson of index.lessonList) if (!isComplete(lesson.id)) return lesson;
    return index.lessonList[0] || null;
  }

  function recentLessons() {
    return (state.progress.recent || [])
      .map((r) => ({ ...r, lesson: lessonById(r.lessonId) }))
      .filter((r) => r.lesson);
  }

  function guideForText(text) {
    const haystack = String(text || '').toLowerCase();
    if (!haystack.trim()) return null;
    let best = null;
    let bestScore = 0;
    for (const guide of index.guideList) {
      let score = 0;
      for (const pattern of guide.patterns || []) {
        if (haystack.includes(String(pattern).toLowerCase())) score += 4;
      }
      for (const symptom of guide.symptoms || []) {
        const words = String(symptom).toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        if (words.some((w) => haystack.includes(w))) score += 1;
      }
      if (score > bestScore) { best = guide; bestScore = score; }
    }
    return bestScore > 0 ? best : null;
  }

  function lessonForError(text) {
    const guide = guideForText(text);
    return guide ? lessonById((guide.lessons || [])[0]) || null : null;
  }

  function contextLesson(kind, item) {
    if (kind === 'container') {
      const image = String(item?.image || '').toLowerCase();
      if (item?.compose) return lessonById('compose-architecture');
      if (/postgres|mysql|mongo|redis|mariadb/.test(image)) return lessonById('storage-and-volumes') || lessonById('compose-networks-volumes');
      if (/nginx|httpd|caddy|traefik/.test(image)) return lessonById('ports-and-publishing');
      if (item?.state && item.state !== 'running') return lessonById('container-lifecycle');
      return lessonById('run-exec-logs');
    }
    if (kind === 'image') {
      if (item?.dangling) return lessonById('cleanup-and-pruning');
      return lessonById('image-anatomy');
    }
    if (kind === 'compose') return lessonById('compose-architecture');
    if (kind === 'volume') return lessonById('storage-and-volumes');
    if (kind === 'network') return lessonById('bridge-dns');
    if (kind === 'build') return lessonById('buildkit-architecture');
    if (kind === 'registry') return lessonById('registry-auth');
    return null;
  }

  function search(query, limit = 40) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const entry of index.search) {
      const title = entry.title.toLowerCase();
      const subtitle = String(entry.subtitle || '').toLowerCase();
      const keywords = String(entry.keywords || '').toLowerCase();
      const hay = `${title} ${subtitle} ${keywords} ${entry.type.toLowerCase()}`;
      if (!tokens.every((t) => hay.includes(t))) continue;
      let score = 0;
      if (title === q) score += 120;
      else if (title.startsWith(q)) score += 90;
      else if (title.includes(q)) score += 60;
      if (subtitle.includes(q)) score += 22;
      if (keywords.includes(q)) score += 12;
      for (const token of tokens) {
        if (title.startsWith(token)) score += 8;
        else if (title.includes(token)) score += 4;
      }
      score += Math.max(0, 8 - entry.type.length / 4);
      scored.push({ ...entry, score });
    }
    return scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }

  // ---------------- progress mutations ----------------
  async function recordView(lesson) {
    if (!lesson) return;
    try {
      await api.academy.recordView({ lessonId: lesson.id, courseId: lesson.courseId || lesson.course?.id });
      await refreshProgress();
    } catch { /* ignore */ }
  }

  // The lesson the learner was last reading, finished or not.
  function resumeLesson() {
    const last = (state.progress.recent || []).map((r) => lessonById(r.lessonId)).find(Boolean);
    return last || null;
  }

  async function setLessonProgress(lesson, patch) {
    if (!lesson) return;
    const courseId = lesson.courseId || lesson.course?.id;
    try {
      await api.academy.setLesson({ lessonId: lesson.id, courseId, ...patch });
      await refreshProgress();
    } catch (error) {
      OD.ui.toast('Could not save progress', 'error', { title: 'Progress not saved', description: error.message });
    }
  }

  async function completeLesson(lesson) {
    await setLessonProgress(lesson, { status: 'completed', progress: 100, seconds: parseInt(lesson.duration, 10) * 60 || 0 });
  }

  async function saveQuiz(lesson, score, total, answers) {
    try {
      await api.academy.saveQuiz({ lessonId: lesson.id, courseId: lesson.courseId || lesson.course?.id, score, total, answers });
      await refreshProgress();
    } catch { /* ignore */ }
  }

  async function toggleBookmark(lessonId) {
    const res = await api.academy.toggleBookmark(lessonId);
    await refreshProgress();
    return res;
  }

  async function saveNote(lessonId, body) {
    const res = await api.academy.saveNote({ lessonId, body });
    await refreshProgress();
    return res;
  }

  async function unlockAchievement(id) {
    try { await api.academy.unlockAchievement(id); } catch { /* ignore */ }
  }

  async function resetProgress() {
    const res = await api.academy.reset();
    await refreshProgress();
    return res;
  }

  function pushSample(entry) {
    const at = Date.now();
    state.history.cpu.push(Number(entry.cpu) || 0);
    state.history.mem.push(Number(entry.mem) || 0);
    state.history.net.push(Number(entry.net) || 0);
    state.history.at.push(at);
    for (const key of ['cpu', 'mem', 'net', 'at']) {
      if (state.history[key].length > 60) state.history[key].shift();
    }
    state.samples.push({ at, ...entry });
    if (state.samples.length > 120) state.samples.shift();
  }

  function greet() {
    const h = new Date().getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function elapsedLabel(seconds) {
    if (!seconds) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  OD.utils.timeAgo = timeAgo;
  OD.utils.fmtBytes = fmtBytes;

  window.OD = window.OD || {};
  OD.store = {
    state, index, api, boot, subscribe, emit,
    refreshStatus, refreshAcademy, refreshProgress, refreshSettings: applySettings,
    applyTheme, resolvedTheme, themeMeta, themes: THEMES, setSetting, setTrack, trackForCourse, trackForLesson,
    courseById, lessonById, commandById, guideById, pathById, diagramById,
    commandsFor, allLabs, allLessons, labs: allLabs,
    progressFor, isComplete, isBookmarked, noteFor, quizFor,
    courseStats, pathStats, missingPrerequisites, overallStats, nextLesson, recentLessons,
    guideForText, lessonForError, contextLesson, search,
    recordView, resumeLesson, setLessonProgress, completeLesson, saveQuiz, toggleBookmark, saveNote,
    unlockAchievement, resetProgress, pushSample, greet, elapsedLabel,
  };
})();
