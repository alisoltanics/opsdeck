'use strict';

/**
 * Academy views: dashboard, courses, lesson reader, paths, reference,
 * troubleshooting, labs, diagrams, glossary and search.
 */
(function () {
  const { esc, fmtNumber, timeAgo, dayKey, highlight, debounce } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const api = window.opsdeck;
  const rerender = () => (OD.app && OD.app.rerender ? OD.app.rerender() : location.reload());

  const state = {
    courseLevel: 'All',
    courseQuery: '',
    refQuery: '',
    refKind: 'engine',
    glossaryQuery: '',
    guideQuery: '',
    searchQuery: '',
    lab: { id: null, output: [], steps: {}, files: {}, dirty: false, running: false, consent: false, baseDir: '' },
    quiz: {},
  };
  let cleanup = [];
  function onCleanup(fn) { cleanup.push(fn); }
  function dispose() {
    for (const fn of cleanup) { try { fn(); } catch { /* ignore */ } }
    cleanup = [];
  }

  // ------------------------------------------------------------------ helpers

  function inline(text) {
    let out = esc(text);
    out = out.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" data-external="1" rel="noreferrer">$1</a>');
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  function prose(text) {
    return String(text || '').split(/\n{2,}/).filter(Boolean).map((p) => `<p>${inline(p)}</p>`).join('');
  }

  function levelBadge(level) {
    const cls = ['Beginner', 'Intermediate', 'Advanced', 'Expert'].includes(level) ? `level-${level}` : '';
    return `<span class="badge ${cls}">${esc(level || 'All levels')}</span>`;
  }

  function academyNav(active) {
    const links = [
      ['dashboard', 'academy', 'Dashboard', 'layout-dashboard'],
      ['courses', 'courses', 'Courses', 'graduation-cap'],
      ['paths', 'paths', 'Paths', 'map'],
      ['reference', 'reference', 'Reference', 'terminal'],
      ['troubleshooting', 'troubleshooting', 'Troubleshooting', 'wrench'],
      ['labs', 'labs', 'Labs', 'flask'],
      ['visuals', 'visuals', 'Visuals', 'network'],
      ['glossary', 'glossary', 'Glossary', 'book-open'],
      ['search', 'search', 'Search', 'search'],
    ];
    const k8s = OD.store.state.track === 'kubernetes';
    const visible = links.filter(([key]) => !(k8s && ['reference', 'troubleshooting', 'labs', 'glossary'].includes(key)));
    return `<nav class="academy-nav" aria-label="Academy sections">${visible.map(([key, href, label, ic]) => `<a href="#/academy${href === 'academy' ? '' : `/${href}`}" class="${active === key ? 'active' : ''}">${icon(ic, 13)}<span>${esc(label)}</span></a>`).join('')}</nav>`;
  }

  function sectionHead(opts) {
    return `<div class="section-head">
      <div>${opts.eyebrow ? `<div class="section-eyebrow">${icon(opts.icon || 'sparkles', 12)}${esc(opts.eyebrow)}</div>` : ''}<h2 class="section-title">${esc(opts.title)}</h2>${opts.sub ? `<p class="section-sub">${esc(opts.sub)}</p>` : ''}</div>
      ${opts.action ? `<div class="section-action">${opts.action}</div>` : ''}
    </div>`;
  }

  function miniCourse(course) {
    const stats = OD.store.courseStats(course);
    return `<a class="course-mini" href="#/academy/course/${esc(course.id)}">
      <span class="course-mini-icon icon-chip tone-${esc(course.accent || 'accent')}" style="--chip-size:30px">${icon(course.icon || 'graduation-cap', 14)}</span>
      <span class="course-mini-body"><span class="course-mini-title">${esc(course.title)}</span><span class="course-mini-sub">${esc(course.level)} · ${stats.completed}/${stats.total} lessons</span></span>
      <span class="course-mini-progress">${U.progressBar(stats.percent, course.accent || 'accent')}<span>${stats.percent}%</span></span>
    </a>`;
  }

  function courseCard(course) {
    const stats = OD.store.courseStats(course);
    const prereqs = OD.store.missingPrerequisites(course);
    return `<a class="course-card" href="#/academy/course/${esc(course.id)}">
      <div class="course-top">
        <span class="course-icon icon-chip tone-${esc(course.accent || 'accent')}" style="--chip-size:38px">${icon(course.icon || 'graduation-cap', 19)}</span>
        ${levelBadge(course.level)}
      </div>
      <div class="course-title">${esc(course.title)}</div>
      <div class="course-sub">${esc(course.subtitle)}</div>
      <div class="course-meta">
        <span>${icon('book-open', 11)}${course.lessonCount} lessons</span>
        <span>${icon('clock', 11)}${esc(course.duration)}</span>
        ${stats.completed ? `<span>${icon('circle-check', 11)}${stats.completed} done</span>` : ''}
      </div>
      ${prereqs.length ? `<div class="course-prereq">${icon('alert-triangle', 11)}Needs ${esc(prereqs[0].title)}</div>` : ''}
      <div class="course-foot">${U.progressBar(stats.percent, course.accent || 'accent')}<span class="pct">${stats.percent}%</span></div>
    </a>`;
  }

  // ------------------------------------------------------------------ diagrams

  function edgePath(a, b) {
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    return { ax, ay, bx, by, mx: (ax + bx) / 2, my: (ay + by) / 2 };
  }

  function diagramBlock(diagram, key, opts) {
    if (!diagram) return '';
    const w = diagram.width || 960;
    const h = diagram.height || 440;
    const nodes = diagram.nodes || [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = (diagram.edges || []).map((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return '';
      const p = edgePath(a, b);
      return `<line class="diagram-edge ${e.style === 'dashed' ? 'dashed' : ''}" x1="${p.ax}" y1="${p.ay}" x2="${p.bx}" y2="${p.by}" marker-end="url(#arrow-${esc(key)})"/>${e.label ? `<text class="diagram-edge-label" x="${p.mx}" y="${p.my - 4}" text-anchor="middle">${esc(e.label)}</text>` : ''}`;
    }).join('');
    const nodeHtml = nodes.map((n) => `<button type="button" class="diagram-node" data-diagram-node="${esc(n.id)}" data-kind="${esc(n.kind || '')}" style="left:${(n.x / w) * 100}%;top:${(n.y / h) * 100}%;width:${(n.w / w) * 100}%;height:${(n.h / h) * 100}%"><strong>${esc(n.label)}</strong><span>${esc(n.sub || '')}</span></button>`).join('');
    const first = nodes[0];
    const detail = first ? `<h4>${esc(first.label)}</h4><p>${esc(first.detail || '')}</p>${first.lesson ? `<a class="btn btn-sm btn-ghost" href="#/academy/lesson/${esc(first.lesson)}">${icon('graduation-cap', 12)}<span>Related lesson</span></a>` : ''}` : '';
    return `<div class="diagram-wrap" data-diagram="${esc(key)}" ${opts?.compact ? 'data-compact="1"' : ''}>
      <div class="diagram-stage" style="aspect-ratio:${w}/${h};${opts?.minHeight ? `min-height:${opts.minHeight}px;` : ''}">
        <svg class="diagram-edges" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
          <defs><marker id="arrow-${esc(key)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--border-strong)"/></marker></defs>
          ${edges}
        </svg>
        ${nodeHtml}
      </div>
      <div class="diagram-detail" id="dd-${esc(key)}">${detail}</div>
    </div>`;
  }

  function mountDiagrams(root) {
    root.querySelectorAll('.diagram-wrap[data-diagram]').forEach((wrap) => {
      const key = wrap.dataset.diagram;
      const baseKey = key.replace(/^lesson-.+?-\d+-/, '');
      const diagram = OD.store.diagramById(baseKey) || OD.store.diagramById(key);
      const detail = wrap.querySelector('.diagram-detail');
      if (!diagram || !detail) return;
      const nodes = new Map((diagram.nodes || []).map((n) => [n.id, n]));
      wrap.querySelectorAll('[data-diagram-node]').forEach((node) => {
        node.addEventListener('click', () => {
          const data = nodes.get(node.dataset.diagramNode);
          if (!data) return;
          wrap.querySelectorAll('.diagram-node').forEach((n) => n.classList.toggle('selected', n === node));
          detail.innerHTML = `<h4>${esc(data.label)}</h4><p>${esc(data.detail || '')}</p>${data.lesson ? `<a class="btn btn-sm btn-ghost" href="#/academy/lesson/${esc(data.lesson)}">${icon('graduation-cap', 12)}<span>Related lesson</span></a>` : ''}`;
        });
      });
    });
  }

  // ------------------------------------------------------------------ in-lesson runner

  function isK8sLesson(lesson) {
    return OD.store.courseById(lesson?.courseId)?.track === 'kubernetes';
  }

  // The text sent to the main-process runner, or null when nothing in the block can run.
  function lessonScript(section) {
    const code = String(section.code || '');
    const lang = section.language;
    if (lang === 'yaml') return /^\s*kind:/m.test(code) ? `cat <<'EOF' | kubectl apply -f -\n${code.replace(/\n?$/, '\n')}EOF` : null;
    if (lang && !['bash', 'sh', 'shell'].includes(lang)) return null;
    return /^\s*(kubectl|helm)\b/m.test(code) ? code : null;
  }

  function runBar(id, label) {
    return `<div class="lesson-run" data-run-id="${esc(id)}">
      <button type="button" class="btn btn-primary btn-sm" data-lesson-run="${esc(id)}">${icon('play', 12)}<span>${esc(label)}</span></button>
      <span class="faint text-xs">Runs on your selected Kubernetes context, right here.</span>
      <div class="lesson-run-out" data-run-out hidden></div>
    </div>`;
  }

  function runResultHtml(res) {
    if (!res || (res.ok === false && !res.steps)) return `<div class="lesson-run-err">${esc(res?.error || 'The command could not run.')}</div>`;
    const bar = `<div class="lesson-run-meta faint text-xs">${icon('cloud', 11)} ${esc(res.context || '')}${res.namespace ? ` · ${esc(res.namespace)}` : ''}</div>`;
    return bar + (res.steps || []).map((st) => {
      const body = [st.stdout, st.stderr].filter((t) => String(t || '').trim()).join('\n');
      const badge = st.skipped ? U.badge('skipped', 'slate') : st.ok ? U.badge('exit 0', 'green') : U.badge(`exit ${st.code}`, 'red');
      return `<div class="lesson-run-step ${st.skipped ? 'skip' : st.ok ? 'ok' : 'fail'}"><div class="lesson-run-cmd"><code><span class="faint">$</span> ${esc(st.command)}</code>${badge}</div>${body ? `<pre class="lesson-run-pre">${esc(body)}</pre>` : '<div class="faint text-xs">No output.</div>'}</div>`;
    }).join('');
  }

  async function runInLesson(lesson, id, host) {
    let script = null;
    if (id.startsWith('ex')) script = lesson.exercises?.[Number(id.slice(2))]?.command;
    else script = lessonScript(lesson.sections?.[Number(id.slice(1))] || {});
    const out = host.querySelector('[data-run-out]');
    const button = host.querySelector('[data-lesson-run]');
    if (!script || !out) return;
    if (/^\s*(kubectl\s+)?(apply|create|delete|scale|set|patch|run|label|annotate|taint|cordon|drain|uncordon|expose|autoscale|rollout\s+(restart|undo)|helm\s+(install|upgrade|uninstall|rollback))|\bhelm\s+(install|upgrade|uninstall|rollback)\b|kubectl\s+(apply|create|delete|scale|run|drain|taint)\b/m.test(script)) {
      const ok = await U.confirm({ title: 'Run this on your cluster?', message: `${script.trim().slice(0, 600)}\n\nThis changes resources on your selected Kubernetes context.`, confirmLabel: 'Run' });
      if (!ok) return;
    }
    const yamls = (lesson.sections || []).filter((x) => x.type === 'code' && x.language === 'yaml').map((x) => ({ title: x.title || '', code: x.code }));
    out.hidden = false;
    out.innerHTML = U.loader('Running…');
    const withTools = (html) => `<div class="lesson-run-tools"><button type="button" class="btn btn-ghost btn-xs" data-run-full>${icon('maximize', 12)}<span>Fullscreen</span></button></div>${html}`;
    if (button) button.disabled = true;
    try {
      out.innerHTML = withTools(runResultHtml(await window.opsdeck.kubernetes.runLesson({ script, yamls })));
    } catch (error) {
      out.innerHTML = runResultHtml({ ok: false, error: error.message });
    } finally {
      if (button) button.disabled = false;
    }
  }

  // ------------------------------------------------------------------ sections

  function sectionHtml(section, lesson, index) {
    if (!section) return '';
    if (section.type === 'text') {
      return `<section class="lesson-section">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}<div class="lesson-prose">${prose(section.body)}</div></section>`;
    }
    if (section.type === 'code') {
      const runnable = isK8sLesson(lesson) && lessonScript(section) != null;
      return `<section class="lesson-section">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}${U.codeBlock({ code: section.code, lang: section.language, title: section.language, output: section.output, note: section.note })}${runnable ? runBar(`s${index}`, section.language === 'yaml' ? 'Apply to cluster' : 'Run here') : ''}</section>`;
    }
    if (section.type === 'callout') {
      const toneMap = { tip: ['tip', 'sparkles'], info: ['info', 'info'], warning: ['warning', 'alert-triangle'], danger: ['danger', 'shield'] };
      const [tone, ic] = toneMap[section.tone] || ['info', 'info'];
      return `<div class="callout ${tone}"><span class="callout-icon">${icon(ic, 16)}</span><div class="callout-body"><strong>${esc(section.title || '')}</strong><p>${inline(section.body)}</p></div></div>`;
    }
    if (section.type === 'table') {
      return `<section class="lesson-section">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}<table class="lesson-table"><thead><tr>${(section.head || []).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${(section.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
    }
    if (section.type === 'steps') {
      return `<section class="lesson-section">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}<div class="steps-list">${(section.items || []).map((item, i) => {
        const label = typeof item === 'string' ? item : (item.title || item.label || '');
        const body = typeof item === 'string' ? '' : (item.body || item.detail || '');
        return `<div class="step-item"><span class="step-num">${i + 1}</span><div class="step-body"><strong>${esc(label)}</strong>${body ? `<p>${inline(body)}</p>` : ''}</div></div>`;
      }).join('')}</div></section>`;
    }
    if (section.type === 'list') {
      return `<section class="lesson-section">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}<div class="guide-list">${(section.items || []).map((item) => `<li>${icon('chevron-right', 13)}<span>${inline(typeof item === 'string' ? item : item.text || '')}</span></li>`).join('')}</div></section>`;
    }
    if (section.type === 'diagram') {
      const diagram = OD.store.diagramById(section.diagram);
      if (!diagram) return '';
      return `<section class="lesson-section">${section.title ? `<h2>${esc(section.title)}</h2>` : ''}${diagramBlock(diagram, `lesson-${lesson.id}-${index}-${section.diagram}`, { compact: true, minHeight: 320 })}${section.caption ? `<p class="muted text-xs mt-2">${esc(section.caption)}</p>` : ''}</section>`;
    }
    return '';
  }

  // ------------------------------------------------------------------ dashboard

  function quizStats() {
    const quizzes = Object.values(OD.store.state.progress.quizzes || {});
    const passed = quizzes.filter((q) => q.total && q.score / q.total >= 0.7).length;
    const perfect = quizzes.filter((q) => q.total && q.score === q.total).length;
    const avg = quizzes.length ? Math.round(quizzes.reduce((sum, q) => sum + (q.total ? (q.score / q.total) * 100 : 0), 0) / quizzes.length) : 0;
    return { taken: quizzes.length, passed, perfect, avg };
  }

  function refViewed() {
    try { return JSON.parse(localStorage.getItem('opsdeck.refViewed') || '[]'); } catch { return []; }
  }

  function markCommandViewed(id) {
    if (!id) return;
    const list = new Set(refViewed());
    if (list.has(id)) return;
    list.add(id);
    try { localStorage.setItem('opsdeck.refViewed', JSON.stringify([...list])); } catch { /* ignore */ }
    evaluateAchievements();
  }

  function labRunCount() {
    const raw = Number(localStorage.getItem('opsdeck.labRuns') || 0);
    return Number.isFinite(raw) ? raw : 0;
  }

  function bumpLabRuns() {
    try { localStorage.setItem('opsdeck.labRuns', String(labRunCount() + 1)); } catch { /* ignore */ }
    evaluateAchievements();
  }

  function achievementMet(condition, stats, quiz) {
    const value = condition?.value;
    switch (condition?.type) {
      case 'lessonsCompleted': return stats.completed >= Number(value);
      case 'coursesCompleted': return stats.completedCourses >= Number(value);
      case 'quizzesPassed': return quiz.passed >= Number(value);
      case 'perfectQuiz': return quiz.perfect >= Number(value);
      case 'streak': return (stats.streak?.current || 0) >= Number(value);
      case 'bookmarks': return stats.bookmarks >= Number(value);
      case 'notes': return stats.notes >= Number(value);
      case 'labRuns': return labRunCount() >= Number(value);
      case 'courseCompleted': { const course = OD.store.courseById(value); return !!course && OD.store.courseStats(course).percent === 100; }
      case 'commandsViewed': return refViewed().length >= Number(value);
      case 'pathsCompleted': return OD.store.index.pathList.some((p) => OD.store.pathStats(p).complete);
      default: return false;
    }
  }

  let evaluating = false;
  async function evaluateAchievements() {
    if (evaluating) return;
    evaluating = true;
    try {
      const stats = OD.store.overallStats();
      const quiz = quizStats();
      const unlocked = new Set((OD.store.state.progress.achievements || []).map((a) => a.id));
      const newly = (OD.store.state.academy.meta.achievements || []).filter((a) => !unlocked.has(a.id) && achievementMet(a.condition, stats, quiz));
      if (newly.length) {
        for (const a of newly) await OD.store.api.academy.unlockAchievement(a.id);
        await OD.store.refreshProgress();
        for (const a of newly) U.toast(`Achievement unlocked: ${a.title}`, 'success', { description: a.description, duration: 4600 });
        OD.app?.refreshSidebar?.();
      }
    } catch { /* ignore */ } finally {
      evaluating = false;
    }
  }

  function minutesToday() {
    const today = dayKey();
    let seconds = 0;
    for (const lesson of Object.values(OD.store.state.progress.lessons || {})) {
      if (lesson.updatedAt && dayKey(new Date(lesson.updatedAt)) === today) seconds += Number(lesson.seconds || 0);
    }
    return Math.round(seconds / 60);
  }

  function streakGrid(streak) {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = dayKey(d);
      days.push({ label: d.toLocaleDateString('en-US', { weekday: 'narrow' }), on: (streak.days?.[key] || 0) > 0 });
    }
    return `<div class="streak-grid">${days.map((d) => `<div class="streak-day"><i class="${d.on ? 'on' : ''}"></i><span>${esc(d.label)}</span></div>`).join('')}</div>`;
  }

  function achievementStrip() {
    const unlocked = new Set((OD.store.state.progress.achievements || []).map((a) => a.id));
    return `<div class="achievement-strip">${(OD.store.state.academy.meta.achievements || []).map((a) => `<div class="achievement ${unlocked.has(a.id) ? 'unlocked' : ''} tier-${esc(a.tier || 'bronze')}" title="${esc(a.description)}">
      <span class="medal">${icon(a.icon || 'trophy', 17)}</span><strong>${esc(a.title)}</strong><span>${unlocked.has(a.id) ? 'Unlocked' : esc(a.tier || '')}</span>
    </div>`).join('')}</div>`;
  }

  // Every lesson of the course in order, grouped by module, with its state.
  function roadmap(course, current) {
    const modules = course.modules || [];
    const total = course.lessonList.length;
    const done = course.lessonList.filter((l) => OD.store.isComplete(l.id)).length;
    const cells = modules.map((m) => `<div class="roadmap-module"><div class="roadmap-module-title">${esc(m.title)}</div><div class="roadmap-lessons">${(m.lessons || []).map((l) => {
      const full = course.lessonList.find((x) => x.id === l.id) || l;
      const n = course.lessonList.findIndex((x) => x.id === l.id) + 1;
      const isDone = OD.store.isComplete(l.id);
      const started = OD.store.progressFor(l.id)?.status === 'in_progress';
      const state = l.id === current.id ? 'current' : isDone ? 'done' : started ? 'progress' : 'todo';
      const label = state === 'current' ? 'You are here' : isDone ? 'Completed' : started ? 'In progress' : 'Not started';
      return `<a class="roadmap-dot ${state}" href="#/academy/lesson/${esc(l.id)}" title="${n}. ${esc(full.title)} — ${label}" aria-label="${n}. ${esc(full.title)} — ${label}" ${state === 'current' ? 'aria-current="step"' : ''}><span>${isDone ? icon('check', 11) : n}</span></a>`;
    }).join('')}</div></div>`).join('');
    return `<details class="roadmap" open><summary><span class="roadmap-title">${icon('map', 13)}Roadmap</span><span class="roadmap-count">${done} of ${total} complete</span><span class="roadmap-legend"><i class="done"></i>Done<i class="current"></i>Here<i class="progress"></i>Started<i class="todo"></i>Left</span></summary><div class="roadmap-body">${cells}</div></details>`;
  }

  function resumeCard() {
    const last = OD.store.resumeLesson();
    if (!last) return '';
    const stats = OD.store.courseStats(last.course);
    const done = OD.store.isComplete(last.id);
    return `<a class="continue-card resume-card" href="#/academy/lesson/${esc(last.id)}"><span class="continue-icon">${icon('play', 18)}</span><span class="continue-body"><span class="continue-label">Resume where you left off</span><span class="continue-title">${esc(last.title)}</span><span class="continue-meta">${esc(last.course.title)} · ${esc(last.moduleTitle || '')} · ${done ? 'completed' : 'in progress'} · ${stats.percent}% of the course</span>${U.progressBar(stats.percent, 'accent')}</span>${icon('arrow-right', 16)}</a>`;
  }

  async function renderDashboard() {
    await evaluateAchievements();
    const a = OD.store.overallStats();
    const quiz = quizStats();
    const next = OD.store.nextLesson();
    const recent = OD.store.recentLessons().slice(0, 5);
    const courses = OD.store.state.academy.courses;
    const paths = OD.store.index.pathList;
    const bookmarks = (OD.store.state.progress.bookmarks || []).map((b) => OD.store.lessonById(b.lessonId)).filter(Boolean).slice(0, 5);
    const goal = Number(OD.store.state.settings.dailyGoalMinutes || OD.store.state.academy.meta.dailyGoalMinutes || 20);
    const minutes = minutesToday();
    const goalPercent = Math.min(100, goal ? (minutes / goal) * 100 : 0);
    const activePath = paths.find((p) => { const s = OD.store.pathStats(p); return s.percent > 0 && !s.complete; }) || paths[0];
    const pathStat = activePath ? OD.store.pathStats(activePath) : null;

    return `<div class="page">
      ${academyNav('dashboard')}
      <div class="academy-hero">
        <div>
          <div class="academy-greeting">${icon('sparkles', 12)}${esc(OD.store.greet())} · Academy</div>
          <h1>${a.completed ? 'Keep the momentum.' : (OD.store.state.track === 'kubernetes' ? 'Build Kubernetes fluency, one lesson at a time.' : 'Build Docker fluency, one lesson at a time.')}</h1>
          <p>${a.lessons} lessons across ${a.courses} courses, with quizzes, labs, diagrams and a searchable command reference. Your progress is stored locally.</p>
          <div class="academy-hero-actions">
            ${next ? `<a class="btn btn-primary btn-lg" href="#/academy/lesson/${esc(next.id)}">${icon('play', 15)}<span>${a.completed ? 'Continue learning' : 'Start learning'}</span></a>` : ''}
            <a class="btn btn-secondary btn-lg" href="#/academy/courses">${icon('graduation-cap', 15)}<span>Browse courses</span></a>
            <a class="btn btn-ghost btn-lg" href="#/academy/search">${icon('search', 15)}<span>Search everything</span></a>
          </div>
          <div class="academy-hero-stats">
            <div class="hero-stat"><span>Lessons complete</span><strong>${a.completed} / ${a.lessons}</strong></div>
            <div class="hero-stat"><span>Courses complete</span><strong>${a.completedCourses} / ${a.courses}</strong></div>
            <div class="hero-stat"><span>Quiz average</span><strong>${quiz.avg}%</strong></div>
            <div class="hero-stat"><span>Achievements</span><strong>${a.achievements} / ${(OD.store.state.academy.meta.achievements || []).length}</strong></div>
          </div>
        </div>
        <div class="hero-side">
          <div class="goal-panel">
            ${OD.charts.donut(goalPercent, { size: 88, stroke: 8, center: `${minutes}m`, sub: `of ${goal}m`, color: goalPercent >= 100 ? 'var(--green)' : 'var(--accent)' })}
            <div class="goal-text">
              <h3>${goalPercent >= 100 ? 'Daily goal complete' : 'Today’s learning goal'}</h3>
              <p>${minutes} minutes studied today. ${goalPercent >= 100 ? 'Anything else is a bonus.' : `${Math.max(0, goal - minutes)} minutes to go.`}</p>
              <div class="goal-streak">${icon('flame', 13)}${a.streak.current} day streak · best ${a.streak.longest}</div>
              ${streakGrid(a.streak)}
            </div>
          </div>
        </div>
      </div>

      <div class="academy-grid-main">
        <div class="stack-3">
          ${resumeCard()}
          ${next && next.id !== OD.store.resumeLesson()?.id ? `<a class="continue-card" href="#/academy/lesson/${esc(next.id)}"><span class="continue-icon">${icon('play', 18)}</span><span class="continue-body"><span class="continue-label">Continue learning</span><span class="continue-title">${esc(next.title)}</span><span class="continue-meta">${esc(next.course.title)} · ${esc(next.duration)} · ${OD.store.courseStats(next.course).percent}% of the course</span></span>${icon('arrow-right', 16)}</a>` : ''}
          ${U.card({
            title: 'Your courses', icon: 'graduation-cap', sub: `${courses.length} courses · ${a.lessons} lessons`,
            actions: `<a class="btn btn-sm btn-ghost" href="#/academy/courses">All courses</a>`,
            body: `<div class="course-mini-list">${courses.slice(0, 8).map(miniCourse).join('')}</div>`,
          })}
          ${U.card({
            title: 'Recent lessons', icon: 'history', sub: recent.length ? 'Pick up where you stopped' : 'Lessons you open appear here',
            body: recent.length ? `<div class="course-mini-list">${recent.map((r) => `<a class="course-mini" href="#/academy/lesson/${esc(r.lesson.id)}"><span class="course-mini-icon icon-chip tone-${esc(r.lesson.course.accent || 'accent')}" style="--chip-size:30px">${icon(r.lesson.course.icon || 'book-open', 14)}</span><span class="course-mini-body"><span class="course-mini-title">${esc(r.lesson.title)}</span><span class="course-mini-sub">${esc(r.lesson.course.title)} · viewed ${esc(timeAgo(r.at))}</span></span>${icon('chevron-right', 14)}</a>`).join('')}</div>` : U.empty({ compact: true, icon: 'book-open', title: 'No recent lessons', body: 'Open any lesson and OpsDeck remembers your place.', action: next ? U.button({ label: 'Open first lesson', size: 'sm', variant: 'primary', attrs: `data-goto="#/academy/lesson/${esc(next.id)}"` }) : '' }),
          })}
          ${U.card({ title: 'Study activity', icon: 'activity', sub: 'Completions, quizzes, views and lab activity over 26 weeks', body: OD.charts.heatmap(OD.store.state.progress.activity, { weeks: 26 }) })}
        </div>
        <div class="stack-3">
          ${activePath && pathStat ? U.card({
            title: 'Learning path', icon: activePath.icon || 'map', sub: `${activePath.title} · ${pathStat.percent}% complete`,
            actions: `<a class="btn btn-sm btn-ghost" href="#/academy/paths/${esc(activePath.id)}">Open path</a>`,
            body: `<div class="stack-3"><div class="path-stages-preview">${(activePath.stages || []).map((s, i) => `<span class="path-stage-dot ${i < pathStat.doneCourses ? 'done' : i === pathStat.doneCourses ? 'active' : ''}"></span>`).join('')}</div><div class="muted text-sm">${pathStat.doneCourses} of ${pathStat.courses} courses complete · ${pathStat.completed}/${pathStat.lessons} lessons</div>${U.progressBar(pathStat.percent, 'violet')}</div>`,
          }) : ''}
          ${U.card({
            title: 'Bookmarks', icon: 'bookmark', sub: `${(OD.store.state.progress.bookmarks || []).length} saved lessons`,
            body: bookmarks.length ? `<div class="course-mini-list">${bookmarks.map((l) => `<a class="course-mini" href="#/academy/lesson/${esc(l.id)}"><span class="course-mini-icon icon-chip tone-amber" style="--chip-size:30px">${icon('bookmark', 13)}</span><span class="course-mini-body"><span class="course-mini-title">${esc(l.title)}</span><span class="course-mini-sub">${esc(l.course.title)}</span></span></a>`).join('')}</div>` : U.empty({ compact: true, icon: 'bookmark', title: 'No bookmarks', body: 'Use the bookmark action inside a lesson to save it here.' }),
          })}
          ${U.card({
            title: 'Quiz readiness', icon: 'target', sub: 'Knowledge checks across the curriculum',
            body: `<div class="stack-3"><div class="row" style="justify-content:space-between"><span class="muted text-sm">Quizzes taken</span><strong>${quiz.taken}</strong></div><div class="row" style="justify-content:space-between"><span class="muted text-sm">Passed (70%+)</span><strong>${quiz.passed}</strong></div><div class="row" style="justify-content:space-between"><span class="muted text-sm">Perfect scores</span><strong>${quiz.perfect}</strong></div>${U.progressBar(quiz.avg, quiz.avg >= 70 ? 'green' : 'amber')}<span class="text-xs muted">Average score ${quiz.avg}%</span></div>`,
          })}
          ${U.card({ title: 'Reference & labs', icon: 'terminal', sub: 'Do the thing, then read the explanation', body: `<div class="quick-grid">${[['#/academy/reference', 'CLI reference', 'terminal'], ['#/academy/labs', 'Guided labs', 'flask'], ['#/academy/troubleshooting', 'Troubleshooting', 'wrench'], ['#/academy/visuals', 'Diagrams', 'network']].map(([href, label, ic]) => `<a class="quick-link" href="${href}">${icon(ic, 15)}<span>${label}</span></a>`).join('')}</div>` })}
        </div>
      </div>

      ${sectionHead({ eyebrow: 'Milestones', icon: 'trophy', title: 'Achievements', sub: `${a.achievements} of ${(OD.store.state.academy.meta.achievements || []).length} unlocked. They are local to this device.` })}
      ${achievementStrip()}
    </div>`;
  }

  // ------------------------------------------------------------------ courses

  function renderCourses() {
    const courses = OD.store.state.academy.courses;
    const levels = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
    const q = state.courseQuery.trim().toLowerCase();
    const filtered = courses.filter((c) => (state.courseLevel === 'All' || c.level === state.courseLevel) && (!q || `${c.title} ${c.subtitle} ${c.description}`.toLowerCase().includes(q)));
    return `<div class="page">
      ${academyNav('courses')}
      ${resumeCard()}
      <div class="page-head">
        <div class="page-head-left"><div class="eyebrow">${icon('graduation-cap', 12)}Curriculum</div><h1 class="page-title">${OD.store.state.track === 'kubernetes' ? 'Kubernetes Academy' : 'Docker Academy'}</h1><p class="page-sub">${OD.store.state.track === 'kubernetes' ? 'Kubernetes' : 'Docker'} courses from first principles to expert operations. Every lesson has objectives, real commands, a knowledge check and a next step.</p></div>
        <div class="page-actions"><span class="badge tone-accent">${courses.length} courses</span><span class="badge tone-slate">${OD.store.allLessons().length} lessons</span>${OD.ai ? OD.ai.button({ kind: 'academy' }, { label: 'Ask AI about the Academy' }) : ''}</div>
      </div>
      <div class="toolbar">
        <label class="search-box">${icon('search', 14)}<input id="course-search" type="search" placeholder="Find a course…" value="${esc(state.courseQuery)}" /></label>
        <div class="filter-row">${levels.map((l) => `<button type="button" class="chip ${state.courseLevel === l ? 'active' : ''}" data-level="${l}">${l}</button>`).join('')}</div>
        <div class="toolbar-spacer"></div><span class="muted text-xs">${filtered.length} shown</span>
      </div>
      <div class="course-grid" id="course-grid">${filtered.map(courseCard).join('') || U.empty({ icon: 'search', title: 'No courses match', body: 'Clear the filter or search for a different term.' })}</div>
      ${U.card({ class: 'mt-4', title: 'How the Academy fits together', icon: 'map', sub: 'Courses are ordered, but every lesson stands alone', body: `<div class="outcome-grid">${(OD.store.state.track === 'kubernetes' ? [
        ['Foundations', 'Architecture, kubectl, the declarative model and Pods.'],
        ['Run workloads', 'Deployments, StatefulSets, DaemonSets, Jobs, probes and resources.'],
        ['Connect & configure', 'Services, Ingress, network policies, ConfigMaps, Secrets and storage.'],
        ['Operate & secure', 'Troubleshooting, RBAC, Helm, autoscaling and a production checklist.'],
      ] : [
        ['Foundations', 'Start with the container model, then the CLI and lifecycle.'],
        ['Build & ship', 'Dockerfiles, BuildKit, registries and supply chain security.'],
        ['Run in production', 'Compose, networking, storage, limits, logging, monitoring.'],
        ['Operate & recover', 'Troubleshooting, performance, daemon hardening and real projects.'],
      ]).map(([t, b]) => `<div class="outcome-item">${icon('check', 14)}<div><strong>${t}</strong><div class="muted text-xs">${b}</div></div></div>`).join('')}</div>` })}
    </div>`;
  }

  // ------------------------------------------------------------------ course detail

  function renderCourse(route) {
    const course = OD.store.courseById(route.parts[0]);
    if (!course) return notFound('Course not found', 'That course does not exist. It may have been removed from the content set.', '#/academy/courses', 'All courses');
    const stats = OD.store.courseStats(course);
    const missing = OD.store.missingPrerequisites(course);
    const next = stats.nextLesson || course.lessonList[0];
    let started = false;
    return `<div class="page">
      ${academyNav('courses')}
      <div class="course-detail-hero">
        <span class="course-detail-icon icon-chip tone-${esc(course.accent || 'accent')}" style="--chip-size:58px">${icon(course.icon || 'graduation-cap', 28)}</span>
        <div class="course-detail-body">
          <div class="pill-row">${levelBadge(course.level)}<span class="badge tone-slate">${esc(course.duration)}</span><span class="badge tone-slate">${course.lessonCount} lessons</span>${stats.percent === 100 ? `<span class="badge tone-green">Complete</span>` : ''}</div>
          <h1>${esc(course.title)}</h1>
          <div class="sub">${esc(course.description)}</div>
          <div class="course-detail-metrics">
            <span class="course-detail-metric">${icon('target', 13)}<strong>${stats.completed}/${stats.total}</strong> lessons</span>
            <span class="course-detail-metric">${icon('activity', 13)}<strong>${stats.percent}%</strong> complete</span>
            <span class="course-detail-metric">${icon('book-open', 13)}<strong>${(course.modules || []).length}</strong> modules</span>
            ${missing.length ? `<span class="course-detail-metric tone-text-amber">${icon('alert-triangle', 13)}Prerequisite: ${esc(missing.map((c) => c.title).join(', '))}</span>` : ''}
          </div>
          <div class="course-detail-metrics">
            ${next ? `<a class="btn btn-primary btn-md" href="#/academy/lesson/${esc(next.id)}">${icon(stats.completed ? 'play' : 'arrow-right', 14)}<span>${stats.completed ? 'Continue' : 'Start course'}</span></a>` : ''}
            ${OD.ai ? OD.ai.button({ kind: 'course', id: course.id, name: course.title }, { label: 'Ask AI about this course', size: 'md' }) : ''}
            ${next && OD.store.progressFor(next.id) ? `<span class="text-xs muted">Next: ${esc(next.title)}</span>` : ''}
          </div>
        </div>
        <div style="flex:0 0 120px;text-align:center">${OD.charts.donut(stats.percent, { size: 104, stroke: 9, color: `var(--${course.accent || 'accent'})`, sub: 'complete' })}</div>
      </div>

      ${missing.length ? U.infoBanner('Prerequisites are recommended, not locked', `Some lessons assume you have finished ${missing.map((c) => c.title).join(', ')}. You can continue, but foundational lessons will make this one easier.`, 'warning', `<a class="btn btn-sm btn-secondary" href="#/academy/course/${esc(missing[0].id)}">Open prerequisite</a>`) : ''}

      <div class="split-wide">
        <div>
          ${sectionHead({ eyebrow: 'Syllabus', icon: 'list', title: 'Modules and lessons', sub: `${course.lessonCount} lessons · ${esc(course.duration)}` })}
          ${(course.modules || []).map((mod, mi) => {
            const modProgress = mod.lessons.filter((l) => OD.store.isComplete(l.id)).length;
            const open = !started && mod.lessons.some((l) => !OD.store.isComplete(l.id));
            if (open) started = true;
            return `<div class="module ${open ? 'open' : ''}">
              <button type="button" class="module-head" data-module-toggle>
                <span class="module-index">${String(mi + 1).padStart(2, '0')}</span>
                <span class="module-title"><strong>${esc(mod.title)}</strong><span>${mod.lessons.length} lessons · ${modProgress} complete${mod.summary ? ` · ${esc(mod.summary)}` : ''}</span></span>
                <span class="module-toggle">${icon('chevron-down', 16)}</span>
              </button>
              <div class="module-body">${mod.lessons.map((lesson) => {
                const p = OD.store.progressFor(lesson.id);
                const quiz = OD.store.quizFor(lesson.id);
                return `<a class="lesson-row ${OD.store.isComplete(lesson.id) ? 'completed' : ''}" href="#/academy/lesson/${esc(lesson.id)}">
                  <span class="lesson-check">${OD.store.isComplete(lesson.id) ? icon('check', 11) : ''}</span>
                  <span class="lesson-row-body"><span class="lesson-row-title">${esc(lesson.title)}</span><span class="lesson-row-sub">${esc(lesson.summary)}</span></span>
                  <span class="lesson-row-meta">${p?.status === 'in_progress' && p.progress ? `<span class="badge tone-accent">${p.progress}%</span>` : ''}${quiz ? `<span class="score">${quiz.score}/${quiz.total}</span>` : ''}${lesson.quiz ? icon('target', 12) : ''}${lesson.lab ? icon('flask', 12) : ''}<span>${esc(lesson.duration)}</span></span>
                </a>`;
              }).join('')}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="stack-3">
          ${U.card({ title: 'What you will be able to do', icon: 'target', body: `<div class="stack-2">${(course.outcomes || []).map((o) => `<div class="outcome-item">${icon('check', 14)}<span>${esc(o)}</span></div>`).join('')}</div>` })}
          ${U.card({ title: 'Course facts', icon: 'info', body: U.kvRows([['Level', levelBadge(course.level), false], ['Duration', esc(course.duration), false], ['Lessons', String(course.lessonCount), false], ['Quizzes', String(course.lessonList.filter((l) => l.quiz).length), false], ['Labs', String(course.lessonList.filter((l) => l.lab).length), false], ['Module count', String((course.modules || []).length), false]]) })}
          ${U.card({ title: 'After this course', icon: 'arrow-right', body: `<div class="stack-2">${OD.store.state.academy.courses.filter((c) => (c.prerequisites || []).includes(course.id)).slice(0, 3).map((c) => `<a class="quick-link" href="#/academy/course/${esc(c.id)}">${icon(c.icon || 'graduation-cap', 14)}<span>${esc(c.title)}</span></a>`).join('') || '<span class="muted text-sm">This is a terminal course in the current curriculum. Explore the learning paths for a broader track.</span>'}</div>` })}
        </div>
      </div>
    </div>`;
  }

  function notFound(title, body, href, label) {
    return `<div class="page">${U.empty({ icon: 'search', title, body, action: `<a class="btn btn-primary btn-sm" href="${esc(href)}">${esc(label)}</a>` })}</div>`;
  }

  // ------------------------------------------------------------------ lesson reader

  function renderQuiz(lesson) {
    const quiz = lesson.quiz;
    if (!quiz || !(quiz.questions || []).length) return '';
    const qs = state.quiz[lesson.id] || { answers: {}, submitted: false, score: null };
    const persisted = OD.store.quizFor(lesson.id);
    const pass = Math.round((quiz.passScore || 70));
    const questionHtml = quiz.questions.map((q, qi) => {
      const selected = qs.answers[qi];
      return `<div class="quiz-q" data-quiz-q="${qi}">
        <div class="quiz-question"><span class="q-index">${String(qi + 1).padStart(2, '0')}</span>${esc(q.question)}</div>
        <div class="stack-2">${q.options.map((opt, oi) => {
          let cls = '';
          if (qs.submitted) {
            if (oi === q.answer) cls = 'correct';
            else if (selected === oi) cls = 'wrong';
          } else if (selected === oi) cls = 'selected';
          return `<label class="quiz-option ${cls}" data-quiz-option data-q="${qi}" data-i="${oi}"><span class="quiz-radio"></span><span>${esc(opt)}</span></label>`;
        }).join('')}</div>
        ${qs.submitted ? `<div class="quiz-explain"><strong>${selected === q.answer ? 'Correct.' : `Answer: ${esc(q.options[q.answer])}.`}</strong> ${inline(q.explain || '')}</div>` : ''}
      </div>`;
    }).join('');

    const score = qs.submitted ? qs.score : (persisted ? persisted.score : null);
    const total = qs.submitted ? qs.total : (persisted ? persisted.total : (quiz.questions || []).length);
    const passed = score != null && total && score / total >= (quiz.passScore || 70) / 100;
    return `<div class="quiz" id="lesson-quiz">
      <div class="quiz-head"><span class="icon-chip tone-violet" style="--chip-size:28px">${icon('target', 14)}</span><div style="flex:1"><strong>Knowledge check</strong><div><span>${quiz.questions.length} questions · pass at ${pass}%${persisted ? ` · best ${persisted.score}/${persisted.total}` : ''}</span></div></div>${score != null ? `<span class="badge tone-${passed ? 'green' : 'amber'}">${score}/${total}</span>` : ''}</div>
      <div class="quiz-body">${questionHtml}</div>
      <div class="quiz-foot">
        <div class="quiz-score">${qs.submitted ? `${icon(passed ? 'circle-check' : 'circle-x', 16)}<span class="score-num">${Math.round((qs.score / qs.total) * 100)}%</span><span class="${passed ? 'tone-text-green' : 'tone-text-amber'}">${passed ? 'Passed' : 'Keep going'}</span>` : `<span class="muted text-xs">Answers are saved locally. Explanations appear after you submit.</span>`}</div>
        <div class="row gap-2">
          ${qs.submitted ? U.button({ label: 'Try again', icon: 'rotate-ccw', size: 'sm', attrs: 'data-quiz-retry' }) : ''}
          ${qs.submitted ? '' : U.button({ label: 'Submit answers', icon: 'check', size: 'sm', variant: 'primary', attrs: 'data-quiz-submit' })}
        </div>
      </div>
    </div>`;
  }

  function renderExercises(lesson) {
    if (!(lesson.exercises || []).length) return '';
    return `<section class="lesson-section"><h2>Practice</h2><div class="exercise-grid">${lesson.exercises.map((ex) => `<div class="exercise-card">
      <h4>${icon('flask', 13)}${esc(ex.title)}</h4>
      <p>${esc(ex.prompt)}</p>
      ${ex.command ? (isK8sLesson(lesson) ? `<div class="cmd-cta">${U.commandLine(ex.command)}</div>${runBar(`ex${(lesson.exercises || []).indexOf(ex)}`, 'Run here')}` : `<div class="cmd-cta">${U.commandLine(ex.command, { run: true })}</div>`) : ''}
      ${ex.expected ? `<div class="expected"><strong>Expected:</strong> ${esc(ex.expected)}</div>` : ''}
      ${ex.hint ? `<div class="expected"><strong>Hint:</strong> ${esc(ex.hint)}</div>` : ''}
    </div>`).join('')}</div></section>`;
  }

  function renderLesson(route) {
    const lesson = OD.store.lessonById(route.parts[0]);
    if (!lesson) return notFound('Lesson not found', 'That lesson does not exist in the current content set.', '#/academy/courses', 'Browse courses');
    const course = lesson.course;
    const complete = OD.store.isComplete(lesson.id);
    const progress = OD.store.progressFor(lesson.id);
    const stats = OD.store.courseStats(course);
    const index = course.lessonList.findIndex((l) => l.id === lesson.id);
    const prev = index > 0 ? course.lessonList[index - 1] : null;
    const next = index >= 0 && index < course.lessonList.length - 1 ? course.lessonList[index + 1] : null;
    const bookmarked = OD.store.isBookmarked(lesson.id);
    const note = OD.store.noteFor(lesson.id);
    const quiz = OD.store.quizFor(lesson.id);
    const lab = lesson.lab ? OD.store.allLabs().find((l) => l.id === lesson.lab.id) : null;

    const sections = (lesson.sections || []).map((s, i) => sectionHtml(s, lesson, i)).join('');
    const related = (lesson.related || []).map((id) => OD.store.lessonById(id)).filter(Boolean);
    const commandEntries = (lesson.commands || []).map((cmd) => {
      const match = OD.store.index.commands.find((c) => c.command === cmd || c.name === cmd);
      return match ? `<a class="rail-link" href="#/academy/reference/${esc(match.id)}">${icon('terminal', 12)}<span class="mono">${esc(cmd)}</span></a>` : `<div class="rail-link"><span class="mono">${esc(cmd)}</span></div>`;
    }).join('');

    return `<div class="page">
      <div class="lesson-breadcrumb">
        <a href="#/academy">Academy</a>${icon('chevron-right', 11)}
        <a href="#/academy/course/${esc(course.id)}">${esc(course.title)}</a>${icon('chevron-right', 11)}
        <span>${esc(lesson.moduleTitle || '')}</span>
      </div>
      ${roadmap(course, lesson)}
      <div class="lesson-layout">
        <div class="lesson-main">
          <div class="lesson-topnav">
            ${prev ? `<a class="btn btn-sm btn-secondary" href="#/academy/lesson/${esc(prev.id)}">${icon('arrow-left', 13)}<span>Previous lesson</span></a>` : `<span class="btn btn-sm btn-secondary" aria-disabled="true" style="opacity:.45">${icon('arrow-left', 13)}<span>Previous lesson</span></span>`}
            ${next ? `<a class="btn btn-sm btn-primary" href="#/academy/lesson/${esc(next.id)}"><span>Next lesson</span>${icon('arrow-right', 13)}</a>` : ''}
          </div>
          <h1 class="lesson-title">${esc(lesson.title)}</h1>
          <p class="lesson-summary">${esc(lesson.summary)}</p>
          <div class="lesson-meta">
            ${levelBadge(lesson.level || course.level)}
            <span>${icon('clock', 12)}${esc(lesson.duration)}</span>
            <span>${icon('book-open', 12)}Lesson ${index + 1} of ${course.lessonList.length}</span>
            ${lesson.quiz ? `<span>${icon('target', 12)}Knowledge check</span>` : ''}
            ${lesson.lab ? `<span>${icon('flask', 12)}Guided lab</span>` : ''}
            ${quiz ? `<span class="tone-text-green">${icon('circle-check', 12)}Quiz ${quiz.score}/${quiz.total}</span>` : ''}
          </div>
          <div class="lesson-progress-band">
            <span>${complete ? 'Completed' : progress?.status === 'in_progress' ? 'In progress' : 'Not started'}</span>
            ${U.progressBar(complete ? 100 : progress?.progress || 0, complete ? 'green' : 'accent')}
            <span>${complete ? 100 : progress?.progress || 0}%</span>
          </div>

          <div class="lesson-body">
            ${sections}
            ${lesson.objectives?.length && false ? '' : ''}
            ${renderExercises(lesson)}
            ${lab ? `<section class="lesson-section"><h2>Guided lab</h2><div class="continue-card" style="cursor:default"><span class="continue-icon">${icon('flask', 18)}</span><span class="continue-body"><span class="continue-label">Hands-on sandbox</span><span class="continue-title">${esc(lab.title)}</span><span class="continue-meta">${esc(lab.description)}</span></span><a class="btn btn-primary btn-sm" href="#/academy/labs/${esc(lab.id)}">${icon('play', 13)}<span>Open lab</span></a></div></section>` : ''}
            ${lesson.quiz ? `<section class="lesson-section"><h2>Knowledge check</h2>${renderQuiz(lesson)}</section>` : ''}

            <div class="notes-card">
              <h3>${icon('notebook-pen', 14)}Your notes</h3>
              <div class="notes-tabs" role="tablist"><button type="button" class="chip active" data-notes-tab="edit">Write</button><button type="button" class="chip" data-notes-tab="preview">Preview</button><span class="faint text-xs">Markdown supported</span></div>
              <textarea class="input" id="lesson-notes" dir="auto" placeholder="Write what you want to remember. Notes are stored locally with SQLite.">${esc(note)}</textarea>
              <div class="notes-preview ai-answer" id="notes-preview" hidden></div>
              <div class="notes-foot"><span id="note-status">${note ? 'Saved locally' : 'Autosaves after you stop typing'}</span><span>${icon('lock', 11)} local only</span></div>
            </div>

            <div class="lesson-nav">
              ${prev ? `<a href="#/academy/lesson/${esc(prev.id)}"><span class="dir">${icon('arrow-left', 11)}Previous</span><span class="title">${esc(prev.title)}</span></a>` : `<a class="placeholder"><span class="dir">${icon('arrow-left', 11)}Previous</span><span class="title">Start of course</span></a>`}
              ${next ? `<a class="next" href="#/academy/lesson/${esc(next.id)}"><span class="dir">Next${icon('arrow-right', 11)}</span><span class="title">${esc(next.title)}</span></a>` : `<a class="next" href="#/academy/course/${esc(course.id)}"><span class="dir">Course${icon('arrow-right', 11)}</span><span class="title">Back to course overview</span></a>`}
            </div>
            ${!next && complete ? `<div class="mt-4">${U.infoBanner('Course complete', `You have finished every lesson in ${course.title}. Review the outcomes or continue to the next course.`, 'success', `<a class="btn btn-sm btn-primary" href="#/academy/courses">Browse courses</a>`)}</div>` : ''}
          </div>
        </div>

        <aside class="lesson-rail">
          <div class="rail-card">
            <h4>Objectives</h4>
            <div class="rail-objectives">${(lesson.objectives || []).map((o) => `<div class="rail-objective">${icon('check', 12)}<span>${esc(o)}</span></div>`).join('') || '<span class="muted text-xs">No objectives listed.</span>'}</div>
          </div>
          <div class="rail-card">
            <h4>Actions</h4>
            <div class="rail-actions">
              ${U.button({ label: complete ? 'Completed' : 'Mark complete', icon: complete ? 'circle-check' : 'check', variant: complete ? 'success' : 'primary', size: 'sm', attrs: `data-lesson-action="complete" ${complete ? 'disabled' : ''}` })}
              ${U.button({ label: bookmarked ? 'Bookmarked' : 'Bookmark', icon: 'bookmark', size: 'sm', variant: bookmarked ? 'subtle' : 'secondary', attrs: 'data-lesson-action="bookmark"' })}
              ${U.button({ label: 'Focus notes', icon: 'notebook-pen', size: 'sm', variant: 'secondary', attrs: 'data-lesson-action="notes"' })}
              ${OD.ai ? OD.ai.button({ kind: 'lesson', id: lesson.id, name: lesson.title }, { label: 'Ask AI', size: 'sm' }) : ''}
              ${prev ? `<a class="btn btn-sm btn-secondary" href="#/academy/lesson/${esc(prev.id)}">${icon('arrow-left', 13)}<span>Previous lesson</span></a>` : ''}
              ${next ? `<a class="btn btn-sm btn-secondary" href="#/academy/lesson/${esc(next.id)}">${icon('arrow-right', 13)}<span>Next lesson</span></a>` : ''}
            </div>
          </div>
          <div class="rail-card">
            <h4>Course progress</h4>
            <div class="rail-progress-label"><span>${esc(course.title)}</span><span>${stats.percent}%</span></div>
            ${U.progressBar(stats.percent, course.accent || 'accent')}
            <div class="muted text-xs mt-2">${stats.completed} of ${stats.total} lessons complete</div>
          </div>
          ${commandEntries ? `<div class="rail-card"><h4>Commands in this lesson</h4><div class="rail-links">${commandEntries}</div></div>` : ''}
          ${related.length ? `<div class="rail-card"><h4>Related lessons</h4><div class="rail-links">${related.map((l) => `<a class="rail-link" href="#/academy/lesson/${esc(l.id)}">${icon('book-open', 12)}<span>${esc(l.title)}</span></a>`).join('')}</div></div>` : ''}
          ${(lesson.sources || []).length ? `<div class="rail-card"><h4>Sources</h4><div class="rail-links">${lesson.sources.map((s) => `<a class="rail-link" href="${esc(s.url)}" data-external="1" rel="noreferrer">${icon('external-link', 12)}<span>${esc(s.title)}</span></a>`).join('')}</div></div>` : ''}
        </aside>
      </div>
    </div>`;
  }

  // Every line of a Kubernetes example gets a hover "?" that explains that line.
  function attachLineHelp(root, lesson) {
    root.querySelectorAll('.code-block').forEach((block) => {
      const lang = block.dataset.lang || 'bash';
      if (!['bash', 'sh', 'shell', 'yaml', 'yml', 'text'].includes(lang)) return;
      const code = block.querySelector('.code-pre code');
      if (!code || code.dataset.lined) return;
      const lines = code.textContent.replace(/\n$/, '').split('\n');
      code.dataset.lined = '1';
      code.innerHTML = lines.map((l, i) => `<span class="cl" data-line="${i}"><button type="button" class="cl-help" data-line-help="${i}" tabindex="-1" aria-label="Explain this line" title="Explain this line"></button><span class="cl-text">${esc(l)}\n</span></span>`).join('');
      code._lines = lines;
      code._lang = lang;
    });
  }

  function openLineHelp(code, index) {
    const lines = code._lines || [];
    const line = lines[index] || '';
    const info = OD.lineHelp?.explain(line, code._lang, lines, index);
    const body = info
      ? `<pre class="lh-line"><code>${esc(line)}</code></pre>
        <p class="lh-summary">${esc(info.summary)}</p>
        ${info.where ? `<p class="lh-where">${icon('map', 12)} ${esc(info.where)}</p>` : ''}
        ${info.parts?.length ? `<table class="lh-table"><thead><tr><th>Part</th><th>What it means</th></tr></thead><tbody>${info.parts.map((p) => `<tr><td><code>${esc(p.token)}</code></td><td>${esc(p.meaning)}</td></tr>`).join('')}</tbody></table>` : ''}`
      : `<p class="lh-summary">${line.trim() ? 'No built-in explanation for this line.' : 'This is an empty line. It only separates blocks to make the example easier to read.'}</p>`;
    U.modal({ title: 'What this line does', eyebrow: `Line ${index + 1}`, icon: 'help-circle', width: 'min(640px, 94vw)', body });
  }

  function mountLesson(root, route) {
    const lesson = OD.store.lessonById(route.parts[0]);
    if (!lesson) return;
    attachLineHelp(root, lesson);
    OD.store.recordView(lesson);
    if (!OD.store.isComplete(lesson.id)) {
      const existing = OD.store.progressFor(lesson.id);
      if (existing?.status !== 'in_progress') {
        OD.store.setLessonProgress(lesson, { status: 'in_progress', progress: Math.max(existing?.progress || 0, 5) });
      }
    }
    mountDiagrams(root);

    root.addEventListener('click', async (event) => {
      const lineBtn = event.target.closest('[data-line-help]');
      if (lineBtn) {
        event.preventDefault();
        event.stopPropagation();
        openLineHelp(lineBtn.closest('code'), Number(lineBtn.dataset.lineHelp));
        return;
      }
      const fullBtn = event.target.closest('[data-run-full]');
      if (fullBtn) {
        const box = fullBtn.closest('[data-run-out]');
        if (document.fullscreenElement) document.exitFullscreen(); else box?.requestFullscreen?.();
        return;
      }
      const runBtn = event.target.closest('[data-lesson-run]');
      if (runBtn) {
        event.preventDefault();
        await runInLesson(lesson, runBtn.dataset.lessonRun, runBtn.closest('[data-run-id]'));
        return;
      }
      const option = event.target.closest('[data-quiz-option]');
      if (option) {
        const cur = state.quiz[lesson.id] || { answers: {}, submitted: false };
        if (cur.submitted) return;
        const qi = Number(option.dataset.q);
        const oi = Number(option.dataset.i);
        cur.answers = { ...cur.answers, [qi]: oi };
        state.quiz[lesson.id] = cur;
        root.querySelectorAll(`[data-quiz-q="${qi}"] [data-quiz-option]`).forEach((el) => el.classList.toggle('selected', el === option));
        return;
      }
      if (event.target.closest('[data-quiz-submit]')) {
        const cur = state.quiz[lesson.id] || { answers: {}, submitted: false };
        const questions = lesson.quiz?.questions || [];
        const answers = questions.map((_, i) => cur.answers[i]);
        if (answers.some((a) => a === undefined)) { U.toast('Answer every question before submitting', 'warning'); return; }
        const score = questions.reduce((sum, q, i) => sum + (answers[i] === q.answer ? 1 : 0), 0);
        state.quiz[lesson.id] = { answers: cur.answers, submitted: true, score, total: questions.length };
        await OD.store.saveQuiz(lesson, score, questions.length, answers);
        root.querySelector('#lesson-quiz').outerHTML = renderQuiz(lesson);
        const pct = Math.round((score / questions.length) * 100);
        U.toast(pct >= (lesson.quiz?.passScore || 70) ? 'Knowledge check passed' : 'Knowledge check submitted', pct >= 70 ? 'success' : 'warning', { description: `${score} of ${questions.length} correct (${pct}%)` });
        evaluateAchievements();
        return;
      }
      if (event.target.closest('[data-quiz-retry]')) {
        state.quiz[lesson.id] = { answers: {}, submitted: false };
        root.querySelector('#lesson-quiz').outerHTML = renderQuiz(lesson);
        return;
      }
      const actionEl = event.target.closest('[data-lesson-action]');
      if (actionEl) {
        const action = actionEl.dataset.lessonAction;
        if (action === 'complete') {
          await OD.store.completeLesson(lesson);
          U.toast('Lesson complete', 'success', { description: lesson.title });
          evaluateAchievements();
          rerender();
        } else if (action === 'bookmark') {
          const res = await OD.store.toggleBookmark(lesson.id);
          actionEl.classList.toggle('btn-subtle', !!res?.bookmarked);
          actionEl.innerHTML = `${icon('bookmark', 15)}<span>${res?.bookmarked ? 'Bookmarked' : 'Bookmark'}</span>`;
          U.toast(res?.bookmarked ? 'Bookmark added' : 'Bookmark removed', 'success');
        } else if (action === 'notes') {
          const notes = root.querySelector('#lesson-notes');
          notes?.focus();
          notes?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    });

    const notes = root.querySelector('#lesson-notes');
    if (notes) {
      let last = notes.value;
      const save = debounce(async () => {
        if (notes.value === last) return;
        last = notes.value;
        await OD.store.saveNote(lesson.id, notes.value);
        const status = root.querySelector('#note-status');
        if (status) status.textContent = notes.value.trim() ? 'Saved locally · just now' : 'Note cleared';
        evaluateAchievements();
      }, 700);
      notes.addEventListener('input', save);
      const preview = root.querySelector('#notes-preview');
      root.querySelectorAll('[data-notes-tab]').forEach((tab) => tab.addEventListener('click', () => {
        const show = tab.dataset.notesTab === 'preview';
        root.querySelectorAll('[data-notes-tab]').forEach((t) => t.classList.toggle('active', t === tab));
        notes.hidden = show;
        preview.hidden = !show;
        if (show) {
          const text = notes.value.trim();
          preview.setAttribute('dir', OD.ai?.isRtlText?.(text) ? 'rtl' : 'ltr');
          preview.innerHTML = text && OD.ai?.formatAnswer ? OD.ai.formatAnswer(text) : '<p class="faint">Nothing to preview yet.</p>';
        }
      }));
      onCleanup(() => save.cancel());
    }

    if (state.quiz[lesson.id] === undefined && lesson.quiz?.questions?.length) {
      state.quiz[lesson.id] = { answers: {}, submitted: false };
    }
  }

  // ------------------------------------------------------------------ learning paths

  function renderPaths() {
    const paths = OD.store.index.pathList;
    return `<div class="page">
      ${academyNav('paths')}
      <div class="page-head">
        <div class="page-head-left"><div class="eyebrow">${icon('map', 12)}Guided tracks</div><h1 class="page-title">Learning paths</h1><p class="page-sub">Structured sequences with prerequisites and completion criteria. Each path links courses in the order that builds durable understanding.</p></div>
        <div class="page-actions"><span class="badge tone-violet">${paths.length} paths</span></div>
      </div>
      <div class="path-grid">${paths.map((p) => {
        const stats = OD.store.pathStats(p);
        return `<a class="path-card" href="#/academy/paths/${esc(p.id)}">
          <div class="path-head"><span class="path-icon icon-chip tone-${esc(p.accent || 'violet')}" style="--chip-size:40px">${icon(p.icon || 'map', 19)}</span><div><div class="path-title">${esc(p.title)}</div><div class="path-sub">${esc(p.subtitle)}</div></div>${stats.complete ? U.badge('complete', 'green', { dot: true }) : ''}</div>
          <div class="path-body">${esc(p.description)}</div>
          <div class="path-stages-preview">${(p.stages || []).map((s, i) => `<span class="path-stage-dot ${i < stats.doneCourses ? 'done' : i === stats.doneCourses && stats.percent > 0 ? 'active' : ''}"></span>`).join('')}</div>
          <div class="path-foot"><span>${stats.doneCourses}/${stats.courses} courses · ${stats.completed}/${stats.lessons} lessons</span><span class="badge tone-slate">${esc(p.level)} · ${esc(p.duration)}</span></div>
          ${U.progressBar(stats.percent, p.accent || 'violet')}
        </a>`;
      }).join('')}</div>
      ${U.card({ class: 'mt-4', title: 'How paths work', icon: 'info', sub: 'Courses remain independently browsable', body: `<div class="outcome-grid">${[
        ['Prerequisites', 'A path may recommend an earlier course. Recommendations are never locked.'],
        ['Completion', 'Finish every lesson in every stage course to complete the path.'],
        ['Progress', 'Path progress is derived from lesson completion. There is no separate checkbox.'],
        ['Badges', 'Completing any path unlocks the Path Finisher achievement.'],
      ].map(([t, b]) => `<div class="outcome-item">${icon('check', 14)}<div><strong>${t}</strong><div class="muted text-xs">${b}</div></div></div>`).join('')}</div>` })}
    </div>`;
  }

  function renderPath(route) {
    const path = OD.store.pathById(route.parts[0]);
    if (!path) return notFound('Path not found', 'That learning path does not exist.', '#/academy/paths', 'All paths');
    const stats = OD.store.pathStats(path);
    const courses = (path.stages || []).map((s) => ({ stage: s, course: OD.store.courseById(s.courseId) })).filter((x) => x.course);
    const nextStage = courses.find((x) => OD.store.courseStats(x.course).percent < 100);
    return `<div class="page">
      ${academyNav('paths')}
      <div class="path-detail-hero">
        <div class="pill-row"><span class="badge tone-violet">${esc(path.level)}</span><span class="badge tone-slate">${esc(path.duration)}</span><span class="badge tone-slate">${courses.length} courses</span>${stats.complete ? '<span class="badge tone-green">Complete</span>' : ''}</div>
        <h1 class="mt-2">${esc(path.title)}</h1>
        <p>${esc(path.description)}</p>
        <div class="academy-hero-actions">
          ${nextStage ? `<a class="btn btn-primary btn-md" href="#/academy/course/${esc(nextStage.course.id)}">${icon('play', 14)}<span>${stats.percent ? 'Continue path' : 'Start path'}</span></a>` : ''}
          <a class="btn btn-secondary btn-md" href="#/academy/paths">${icon('arrow-left', 14)}<span>All paths</span></a>
        </div>
        <div class="course-detail-metrics"><span class="course-detail-metric">${icon('book-open', 13)}<strong>${stats.completed}/${stats.lessons}</strong> lessons</span><span class="course-detail-metric">${icon('target', 13)}<strong>${stats.percent}%</strong> complete</span></div>
        <div class="mt-3">${U.progressBar(stats.percent, path.accent || 'violet')}</div>
      </div>
      <div class="split-wide">
        <div>
          ${sectionHead({ eyebrow: 'Sequence', icon: 'map', title: 'Stages' })}
          <div class="path-timeline">${courses.map(({ stage, course }, i) => {
            const cs = OD.store.courseStats(course);
            const done = cs.percent === 100;
            const active = !done && nextStage && nextStage.course.id === course.id;
            return `<div class="path-stage ${done ? 'done' : active ? 'active' : ''}">
              <span class="path-stage-num">${done ? icon('check', 13) : String(i + 1).padStart(2, '0')}</span>
              <div class="path-stage-body">
                <a class="path-stage-card" href="#/academy/course/${esc(course.id)}">
                  <span class="icon-chip tone-${esc(course.accent || 'accent')}" style="--chip-size:32px">${icon(course.icon || 'graduation-cap', 15)}</span>
                  <div style="flex:1;min-width:0"><div class="course-mini-title">${esc(course.title)}</div><div class="course-mini-sub">${esc(stage.title || `Stage ${i + 1}`)}${stage.description ? ` · ${esc(stage.description)}` : ''} · ${cs.completed}/${cs.total} lessons</div></div>
                  ${U.badge(done ? 'complete' : `${cs.percent}%`, done ? 'green' : active ? 'accent' : 'slate')}
                </a>
              </div>
            </div>`;
          }).join('')}</div>
        </div>
        <div class="stack-3">
          ${U.card({ title: 'Outcomes', icon: 'target', body: `<div class="stack-2">${(path.outcomes || []).map((o) => `<div class="outcome-item">${icon('check', 14)}<span>${esc(o)}</span></div>`).join('')}</div>` })}
          ${(path.prerequisites || []).length ? U.card({ title: 'Prerequisites', icon: 'alert-triangle', body: `<div class="stack-2">${path.prerequisites.map((id) => { const c = OD.store.courseById(id); return c ? `<a class="quick-link" href="#/academy/course/${esc(c.id)}">${icon('graduation-cap', 14)}<span>${esc(c.title)}</span></a>` : ''; }).join('')}</div>` }) : ''}
          ${U.card({ title: 'Completion criteria', icon: 'circle-check', body: `<p class="text-sm muted" style="line-height:1.6">Finish every lesson in all ${courses.length} stage courses. ${path.completion?.type === 'all_courses' ? 'This path is verified against every listed course.' : 'The Academy derives completion from lesson progress.'}</p><div class="mt-3">${U.progressBar(stats.percent, stats.complete ? 'green' : 'violet')}</div>` })}
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------ reference

  function refKinds() {
    return [
      ['engine', 'Docker CLI', 'terminal', OD.store.commandsFor('engine').length],
      ['compose', 'Compose CLI', 'boxes', OD.store.commandsFor('compose').length],
      ['dockerfile', 'Dockerfile', 'file-code', OD.store.commandsFor('dockerfile').length],
      ['property', 'YAML properties', 'list', OD.store.commandsFor('property').length],
    ];
  }

  function refKindLabel(kind) {
    return { engine: 'Docker CLI', compose: 'Compose CLI', dockerfile: 'Dockerfile', property: 'Compose property' }[kind] || 'Reference';
  }

  function refKindTone(kind) {
    return { engine: 'accent', compose: 'violet', dockerfile: 'green', property: 'cyan' }[kind] || 'slate';
  }

  function refEntryName(entry) {
    return entry.command || entry.name || entry.id;
  }

  function refGroup(entry) {
    if (entry.kind === 'dockerfile') return entry.group || 'Dockerfile instructions';
    if (entry.kind === 'property') return entry.group || 'Compose YAML';
    return entry.group || 'General';
  }

  function refMatches(entry) {
    const q = state.refQuery.trim().toLowerCase();
    if (!q) return true;
    const hay = `${refEntryName(entry)} ${entry.summary || ''} ${entry.description || ''} ${(entry.tags || []).join(' ')} ${entry.group || ''}`.toLowerCase();
    return q.split(/\s+/).every((token) => hay.includes(token));
  }

  function refEntries() {
    return OD.store.commandsFor(state.refKind).filter(refMatches);
  }

  function refRail(entries, activeId) {
    const groups = new Map();
    for (const entry of entries) {
      const key = refGroup(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const viewed = new Set(refViewed());
    const sections = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([group, list]) => `<div class="ref-group">
      <div class="ref-group-title">${esc(group)}<span>${list.length}</span></div>
      ${list.map((entry) => `<a class="ref-link ${entry.id === activeId ? 'active' : ''}" href="#/academy/reference/${esc(entry.id)}">
        <span class="mono">${esc(refEntryName(entry))}</span>
        ${viewed.has(entry.id) ? icon('circle-check', 11) : ''}
      </a>`).join('')}
    </div>`).join('');
    return `<aside class="reference-rail">
      <div class="ref-rail-head">
        <span class="badge tone-${esc(refKindTone(state.refKind))}">${esc(refKindLabel(state.refKind))}</span>
        <span class="muted text-xs">${entries.length} entries</span>
      </div>
      <div class="ref-rail-list">${sections || '<div class="muted text-sm" style="padding:12px">No matches.</div>'}</div>
    </aside>`;
  }

  function refSearchBar() {
    return `<div class="ref-toolbar">
      <label class="search-box">${icon('search', 14)}<input id="ref-search" type="search" placeholder="Search commands, flags, descriptions…" value="${esc(state.refQuery)}" /><span class="kbd">/</span></label>
      <div class="filter-row">${refKinds().map(([kind, label, ic, count]) => `<button type="button" class="chip ${state.refKind === kind ? 'active' : ''}" data-refkind="${kind}">${icon(ic, 12)}${esc(label)}<span class="chip-count">${count}</span></button>`).join('')}</div>
    </div>`;
  }

  function exampleBlock(example, index) {
    return `<div class="ref-example">
      <div class="ref-example-head"><span class="ref-example-num">${String(index + 1).padStart(2, '0')}</span><strong>${esc(example.title || 'Example')}</strong></div>
      ${U.commandLine(example.command, { run: true })}
      ${example.output ? `<div class="ref-example-output"><span>Output</span><pre>${esc(example.output)}</pre></div>` : ''}
      ${example.explain ? `<p class="ref-example-explain">${inline(example.explain)}</p>` : ''}
    </div>`;
  }

  function refList(items, cls) {
    if (!(items || []).length) return '';
    return `<ul class="ref-list ${cls || ''}">${items.map((item) => `<li>${icon('chevron-right', 12)}<span>${inline(item)}</span></li>`).join('')}</ul>`;
  }

  function refRelated(entry) {
    const links = (entry.related || []).map((name) => {
      const target = OD.store.index.commands.find((c) => c.command === name || c.name === name || c.id === name);
      if (target) return `<a class="quick-link" href="#/academy/reference/${esc(target.id)}">${icon('terminal', 13)}<span class="mono">${esc(name)}</span></a>`;
      return `<span class="quick-link static"><span class="mono">${esc(name)}</span></span>`;
    }).join('');
    return links ? `<div class="quick-grid">${links}</div>` : '';
  }

  function refDetail(entry) {
    const index = OD.store.commandsFor(entry.kind).findIndex((c) => c.id === entry.id);
    const list = OD.store.commandsFor(entry.kind);
    const prev = index > 0 ? list[index - 1] : null;
    const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
    const lesson = entry.lesson ? OD.store.lessonById(entry.lesson) : null;
    const syntax = entry.syntax || entry.command || entry.name || '';
    return `<article class="ref-detail" id="ref-detail" data-ref-id="${esc(entry.id)}">
      <div class="ref-detail-head">
        <div>
          <div class="pill-row">
            <span class="badge tone-${esc(refKindTone(entry.kind))}">${icon(entry.kind === 'dockerfile' ? 'file-code' : entry.kind === 'property' ? 'boxes' : 'terminal', 11)}${esc(refKindLabel(entry.kind))}</span>
            ${entry.group ? `<span class="badge tone-slate">${esc(entry.group)}</span>` : ''}
            ${(entry.tags || []).slice(0, 3).map((t) => `<span class="badge tone-slate mono">${esc(t)}</span>`).join('')}
          </div>
          <h1 class="ref-title mono">${esc(refEntryName(entry))}</h1>
          <p class="ref-summary">${esc(entry.summary || '')}</p>
        </div>
        <div class="ref-head-actions">
          ${lesson ? `<a class="btn btn-sm btn-secondary" href="#/academy/lesson/${esc(lesson.id)}">${icon('graduation-cap', 13)}<span>Lesson</span></a>` : ''}
          ${U.button({ label: 'Search', icon: 'search', size: 'sm', attrs: 'data-focus-ref-search="1"' })}
        </div>
      </div>

      ${syntax ? U.codeBlock({ code: syntax, lang: entry.kind === 'property' ? 'yaml' : 'bash', title: entry.kind === 'property' ? 'YAML shape' : 'Syntax' }) : ''}

      <div class="ref-live" id="ref-live-help">
        <div class="ref-live-head">${icon('activity', 13)}<span>Live flag discovery</span><span class="ref-live-note">read from the installed Docker CLI</span></div>
        <div class="ref-live-body">${U.loader('Reading local CLI help…')}</div>
      </div>

      ${entry.description ? `<section class="ref-section"><h2>What it does</h2><div class="lesson-prose">${prose(entry.description)}</div></section>` : ''}

      ${(entry.examples || []).length ? `<section class="ref-section"><h2>Examples</h2><div class="stack-3">${entry.examples.map(exampleBlock).join('')}</div></section>` : ''}
      ${(entry.advanced || []).length ? `<section class="ref-section"><h2>Advanced usage</h2><div class="stack-3">${entry.advanced.map(exampleBlock).join('')}</div></section>` : ''}
      ${entry.output ? `<section class="ref-section"><h2>Expected output</h2><div class="ref-output"><pre>${esc(entry.output)}</pre></div></section>` : ''}

      <div class="ref-split">
        ${(entry.mistakes || []).length ? `<section class="ref-section"><h2>${icon('alert-triangle', 14)}Common mistakes</h2>${refList(entry.mistakes, 'ref-mistakes')}</section>` : ''}
        ${(entry.security || []).length ? `<section class="ref-section"><h2>${icon('shield', 14)}Security notes</h2>${refList(entry.security, 'ref-security')}</section>` : ''}
      </div>

      ${(entry.related || []).length ? `<section class="ref-section"><h2>Related</h2>${refRelated(entry)}</section>` : ''}

      ${lesson ? `<div class="mt-4">${U.infoBanner('Go deeper', `This reference entry links to the lesson that explains the concepts behind it: ${lesson.title}.`, 'info', `<a class="btn btn-sm btn-secondary" href="#/academy/lesson/${esc(lesson.id)}">Open lesson</a>`)}</div>` : ''}

      <nav class="lesson-nav ref-nav">
        ${prev ? `<a href="#/academy/reference/${esc(prev.id)}"><span class="dir">${icon('arrow-left', 11)}Previous</span><span class="title mono">${esc(refEntryName(prev))}</span></a>` : '<span></span>'}
        ${next ? `<a class="next" href="#/academy/reference/${esc(next.id)}"><span class="dir">Next${icon('arrow-right', 11)}</span><span class="title mono">${esc(refEntryName(next))}</span></a>` : ''}
      </nav>
    </article>`;
  }

  function renderReference(route) {
    const selected = route.parts[0] ? OD.store.commandById(route.parts[0]) : null;
    if (selected) state.refKind = selected.kind;
    const entry = selected || null;
    const list = (entry ? OD.store.commandsFor(state.refKind) : refEntries());
    const entries = list;
    return `<div class="page reference-page">
      ${academyNav('reference')}
      <div class="page-head">
        <div class="page-head-left">
          <div class="eyebrow">${icon('terminal', 12)}Command reference</div>
          <h1 class="page-title">Every command, flag and property</h1>
          <p class="page-sub">Curated explanations with real examples, expected output and security notes — plus live help parsed from your installed Docker CLI.</p>
        </div>
        <div class="page-actions">
          <span class="badge tone-accent">${OD.store.index.commands.length} entries</span>
          ${U.button({ label: 'Search everything', icon: 'search', size: 'sm', attrs: 'data-goto=\"#/academy/search\"' })}
        </div>
      </div>
      ${refSearchBar()}
      <div class="reference-layout ${entry ? 'has-detail' : 'is-index'}">
        ${entry ? refRail(list, entry.id) : ''}
        <div class="reference-main">
          ${entry ? refDetail(entry) : refIndex(entries, list)}
        </div>
      </div>
    </div>`;
  }

  function refIndex(entries, list) {
    const groups = new Map();
    for (const entry of list) {
      const key = refGroup(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    const cards = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([group, items]) => `<section class="card ref-index-card">
      <div class="ref-index-head"><h3>${esc(group)}</h3><span class="badge tone-slate">${items.length}</span></div>
      <div class="ref-index-links">${items.map((entry) => `<a class="ref-index-link" href="#/academy/reference/${esc(entry.id)}">
        <span class="mono">${esc(refEntryName(entry))}</span>
        <span>${esc(entry.summary || '')}</span>
        ${icon('chevron-right', 12)}
      </a>`).join('')}</div>
    </section>`).join('');
    return `<div class="ref-index">
      ${list.length ? `<div class="ref-index-grid">${cards}</div>` : U.empty({ icon: 'search', title: 'No reference entries match', body: 'Try a different command verb or switch to another reference type.' })}
      ${U.card({
        class: 'mt-4', title: 'How this reference is maintained', icon: 'shield-check',
        sub: 'Authored content plus live CLI introspection',
        body: `<div class="outcome-grid">${[
          ['Examples first', 'Every entry has runnable examples with expected output and the reasoning behind flags.'],
          ['No outdated syntax', 'Where the engine is reachable, OpsDeck reads the installed CLI help for flags and usage.'],
          ['Security aware', 'Entries call out privileged mode, socket mounts, host namespaces and secret handling.'],
          ['Compose properties', 'YAML keys are documented separately from CLI flags so you know where they belong.'],
        ].map(([t, b]) => `<div class="outcome-item">${icon('check', 14)}<div><strong>${t}</strong><div class="muted text-xs">${b}</div></div></div>`).join('')}</div>`,
      })}
    </div>`;
  }

  function paintLiveHelp(root, entry) {
    const host = root.querySelector('#ref-live-help .ref-live-body');
    if (!host) return;
    if (!['engine', 'compose'].includes(entry.kind)) {
      host.innerHTML = `<p class="muted text-sm">Live CLI help applies to commands. ${entry.kind === 'property' ? 'This is a Compose YAML property, validated by the Compose schema.' : 'This is a Dockerfile instruction, resolved by the builder.'}</p>`;
      return;
    }
    api.docker.commandHelp(entry.command || entry.name).then((res) => {
      if (!res || res.ok === false || (!res.usage && !res.summary && !(res.options || []).length)) {
        host.innerHTML = `<p class="muted text-sm">Live help is unavailable. The Docker engine may be offline; the curated syntax and examples above are authoritative.</p>`;
        return;
      }
      const options = res.options || [];
      host.innerHTML = `
        ${res.usage ? `<div class="ref-help-usage"><span>Usage</span><code>${esc(res.usage)}</code></div>` : ''}
        ${res.summary ? `<p class="ref-help-summary">${esc(res.summary)}</p>` : ''}
        ${res.aliases ? `<div class="ref-help-meta"><span class="badge tone-slate mono">alias ${esc(res.aliases)}</span></div>` : ''}
        ${options.length ? `<details class="ref-help-options">
          <summary>${icon('list', 12)}${options.length} live flags<span>${icon('chevron-down', 12)}</span></summary>
          <div class="table-wrap"><table class="data-table compact"><thead><tr><th>Flag</th><th>Description</th><th>Default</th></tr></thead><tbody>${options.map((o) => `<tr><td class="cell-mono">${esc(o.flag || o.name || '')}</td><td>${esc(o.description || '')}</td><td class="cell-mono">${esc(o.default || '—')}</td></tr>`).join('')}</tbody></table></div>
        </details>` : ''}
        ${(res.commands || []).length ? `<details class="ref-help-options"><summary>${icon('terminal', 12)}Subcommands<span>${icon('chevron-down', 12)}</span></summary><div class="pill-row">${res.commands.map((c) => `<span class="badge tone-slate mono">${esc(c.name || c)}</span>`).join('')}</div></details>` : ''}
        <div class="ref-help-foot">${icon('info', 11)}Parsed from <span class="mono">docker ${esc((entry.command || '').replace(/^docker\s*/, ''))} --help</span> on this machine. Flag availability depends on your engine version.</div>`;
    }).catch(() => {
      host.innerHTML = `<p class="muted text-sm">Live help could not be read. The curated reference above remains available.</p>`;
    });
  }

  function mountReference(root, route) {
    const entry = route.parts[0] ? OD.store.commandById(route.parts[0]) : null;
    if (entry) markCommandViewed(entry.id);
    if (entry) paintLiveHelp(root, entry);
    const search = root.querySelector('#ref-search');
    const layout = root.querySelector('.reference-layout');
    const hasDetail = !!layout && layout.classList.contains('has-detail');
    const repaint = () => {
      const list = OD.store.commandsFor(state.refKind).filter(refMatches);
      if (hasDetail) {
        const rail = root.querySelector('.reference-rail');
        if (rail) rail.outerHTML = refRail(list, entry ? entry.id : '');
      } else {
        const host = root.querySelector('.ref-index');
        if (host) host.outerHTML = refIndex(list, list);
      }
    };
    search?.addEventListener('input', debounce(() => {
      state.refQuery = search.value;
      repaint();
    }, 160));
    root.querySelectorAll('[data-refkind]').forEach((chip) => chip.addEventListener('click', () => {
      state.refKind = chip.dataset.refkind;
      state.refQuery = '';
      location.hash = '#/academy/reference';
    }));
    root.querySelector('[data-focus-ref-search]')?.addEventListener('click', () => {
      const input = root.querySelector('#ref-search');
      if (!input) return;
      input.focus();
      input.select();
    });
  }

  // ------------------------------------------------------------------ troubleshooting

  function severityTone(severity) {
    return { high: 'red', critical: 'red', medium: 'amber', low: 'cyan' }[String(severity || '').toLowerCase()] || 'slate';
  }

  function guideMatches(guide) {
    const q = state.guideQuery.trim().toLowerCase();
    if (!q) return true;
    const hay = `${guide.title} ${guide.summary} ${guide.category} ${(guide.symptoms || []).join(' ')} ${(guide.causes || []).join(' ')} ${(guide.patterns || []).join(' ')}`.toLowerCase();
    return q.split(/\s+/).every((token) => hay.includes(token));
  }

  function guideCard(guide) {
    return `<a class="guide-card" href="#/academy/troubleshooting/${esc(guide.id)}">
      <div class="guide-card-top">
        <span class="icon-chip tone-${esc(severityTone(guide.severity))}" style="--chip-size:32px">${icon('wrench', 15)}</span>
        <div style="min-width:0">
          <div class="guide-card-title">${esc(guide.title)}</div>
          <div class="guide-card-cat">${esc(guide.category)}</div>
        </div>
        <span class="badge tone-${esc(severityTone(guide.severity))}">${esc(guide.severity || 'info')}</span>
      </div>
      <p class="guide-card-sum">${esc(guide.summary)}</p>
      <div class="guide-card-foot"><span>${icon('list', 11)}${(guide.steps || []).length} steps</span><span>${icon('book-open', 11)}${(guide.lessons || []).length} lessons</span>${icon('arrow-right', 13)}</div>
    </a>`;
  }

  function renderTroubleshooting() {
    const guides = OD.store.index.guideList;
    const categories = ['All', ...new Set(guides.map((g) => g.category))];
    const filtered = guides.filter((g) => (state.guideCategory === 'All' || !state.guideCategory || g.category === state.guideCategory) && guideMatches(g));
    return `<div class="page">
      ${academyNav('troubleshooting')}
      <div class="page-head">
        <div class="page-head-left">
          <div class="eyebrow">${icon('wrench', 12)}Diagnostics</div>
          <h1 class="page-title">Troubleshooting guides</h1>
          <p class="page-sub">Start from the symptom, not the guess. Each guide collects causes, evidence, ordered fixes and the lesson that explains the mechanism.</p>
        </div>
        <div class="page-actions"><a class="btn btn-sm btn-secondary" href="#/academy/lesson/logs-and-debugging">${icon('graduation-cap', 13)}<span>Debugging lesson</span></a></div>
      </div>
      <div class="toolbar">
        <label class="search-box">${icon('search', 14)}<input id="guide-search" type="search" placeholder="Search a symptom, error text or cause…" value="${esc(state.guideQuery)}" /></label>
        <div class="filter-row">${categories.map((c) => `<button type="button" class="chip ${((state.guideCategory || 'All') === c) ? 'active' : ''}" data-gcat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="toolbar-spacer"></div><span class="muted text-xs">${filtered.length} guides</span>
      </div>
      <div class="guide-grid">${filtered.map(guideCard).join('') || U.empty({ icon: 'search', title: 'No guides match', body: 'Try the raw error text, or open the pattern tester below.' })}</div>

      ${U.card({
        class: 'mt-4', title: 'Pattern tester', icon: 'activity',
        sub: 'Paste an error or log line. OpsDeck matches it against every known pattern and symptom.',
        body: `<div class="pattern-tester">
          <textarea class="input" id="pattern-input" rows="3" placeholder="permission denied while trying to connect to the docker daemon socket">${esc(state.patternText || '')}</textarea>
          <div class="pattern-result" id="pattern-result"></div>
        </div>`,
      })}

      <div class="mt-4">${U.infoBanner('Correlate with engine events', 'Docker events show state transitions; logs show process output; inspect shows configuration. Use all three before changing anything.', 'info', `<a class="btn btn-sm btn-secondary" href="#/events">Open events</a>`)}</div>
    </div>`;
  }

  function renderGuide(route) {
    const guide = OD.store.guideById(route.parts[0]);
    if (!guide) return notFound('Guide not found', 'That troubleshooting guide does not exist in the current content set.', '#/academy/troubleshooting', 'All guides');
    const related = OD.store.index.guideList.filter((g) => g.id !== guide.id && g.category === guide.category).slice(0, 4);
    const lessons = (guide.lessons || []).map((id) => OD.store.lessonById(id)).filter(Boolean);
    return `<div class="page">
      ${academyNav('troubleshooting')}
      <div class="lesson-breadcrumb"><a href="#/academy">Academy</a>${icon('chevron-right', 11)}<a href="#/academy/troubleshooting">Troubleshooting</a>${icon('chevron-right', 11)}<span>${esc(guide.category)}</span></div>
      <div class="guide-hero">
        <div>
          <div class="pill-row"><span class="badge tone-${esc(severityTone(guide.severity))}">${esc(guide.severity || 'info')} severity</span><span class="badge tone-slate">${esc(guide.category)}</span></div>
          <h1>${esc(guide.title)}</h1>
          <p>${esc(guide.summary)}</p>
        </div>
        <div class="guide-hero-actions">
          ${U.button({ label: 'Copy summary', icon: 'copy', size: 'sm', attrs: `data-copy-text=\"${esc(guide.title + ': ' + guide.summary)}\"` })}
          <a class="btn btn-sm btn-ghost" href="#/academy/troubleshooting">${icon('arrow-left', 13)}<span>All guides</span></a>
        </div>
      </div>

      <div class="guide-layout">
        <div class="guide-main">
          <section class="ref-section"><h2>${icon('activity', 14)}Symptoms</h2><ul class="ref-list">${(guide.symptoms || []).map((s) => `<li>${icon('chevron-right', 12)}<span>${inline(s)}</span></li>`).join('')}</ul></section>
          <section class="ref-section"><h2>${icon('search', 14)}Likely causes</h2><ul class="ref-list ref-mistakes">${(guide.causes || []).map((s) => `<li>${icon('chevron-right', 12)}<span>${inline(s)}</span></li>`).join('')}</ul></section>
          <section class="ref-section"><h2>${icon('wrench', 14)}Ordered fix</h2>
            <div class="guide-steps">${(guide.steps || []).map((step, i) => `<div class="guide-step">
              <span class="guide-step-num">${i + 1}</span>
              <div class="guide-step-body">
                <strong>${esc(step.title)}</strong>
                <p>${inline(step.detail)}</p>
                ${step.command ? U.commandLine(step.command, { run: step.command.startsWith('docker ') }) : ''}
                ${step.note ? `<div class="expected"><strong>Note:</strong> ${inline(step.note)}</div>` : ''}
              </div>
            </div>`).join('')}</div>
          </section>
          ${(guide.commands || []).length ? `<section class="ref-section"><h2>Commands used</h2><div class="quick-grid">${guide.commands.map((cmd) => `<div class="quick-link static"><span class="mono">${esc(cmd)}</span><button type="button" class="icon-btn" data-copy-text="${esc(cmd)}" title="Copy">${icon('copy', 12)}</button></div>`).join('')}</div></section>` : ''}
          <div class="mt-4">${U.infoBanner('Document the fix', 'Record the cause and the check that proved it. A fix without evidence is a guess that will return.', 'info')}</div>
        </div>
        <aside class="lesson-rail">
          <div class="rail-card"><h4>Matched patterns</h4><div class="rail-links">${(guide.patterns || []).map((p) => `<div class="rail-link"><span class="mono text-xs" style="overflow-wrap:anywhere">${esc(p)}</span></div>`).join('') || '<span class="muted text-xs">No automatic patterns.</span>'}</div></div>
          ${lessons.length ? `<div class="rail-card"><h4>Explain the mechanism</h4><div class="rail-links">${lessons.map((l) => `<a class="rail-link" href="#/academy/lesson/${esc(l.id)}">${icon('graduation-cap', 12)}<span>${esc(l.title)}</span></a>`).join('')}</div></div>` : ''}
          ${(guide.sources || []).length ? `<div class="rail-card"><h4>Primary sources</h4><div class="rail-links">${guide.sources.map((url) => `<a class="rail-link" href="${esc(url)}" data-external="1" rel="noreferrer">${icon('external-link', 12)}<span style="overflow-wrap:anywhere">${esc(url.replace(/^https?:\/\//, ''))}</span></a>`).join('')}</div></div>` : ''}
          ${related.length ? `<div class="rail-card"><h4>Related guides</h4><div class="rail-links">${related.map((g) => `<a class="rail-link" href="#/academy/troubleshooting/${esc(g.id)}">${icon('wrench', 12)}<span>${esc(g.title)}</span></a>`).join('')}</div></div>` : ''}
        </aside>
      </div>
    </div>`;
  }

  function paintPatternResult(host, text) {
    if (!host) return;
    const value = String(text || '').trim();
    if (!value) {
      host.innerHTML = `<div class="muted text-sm">Paste an error to see the best matching guide. Nothing leaves this device.</div>`;
      return;
    }
    const guide = OD.store.guideForText(value);
    if (!guide) {
      host.innerHTML = `<div class="pattern-none">${icon('search', 15)}<div><strong>No pattern matched</strong><span class="muted text-sm">Check the engine status, then search the error text in the guides above. Include the first line of stderr, not the whole trace.</span></div></div>`;
      return;
    }
    host.innerHTML = `<a class="pattern-hit" href="#/academy/troubleshooting/${esc(guide.id)}">
      <span class="icon-chip tone-${esc(severityTone(guide.severity))}" style="--chip-size:32px">${icon('wrench', 15)}</span>
      <div style="flex:1;min-width:0"><div class="pattern-hit-title">${esc(guide.title)}</div><div class="muted text-xs">${esc(guide.summary)}</div></div>
      <span class="badge tone-${esc(severityTone(guide.severity))}">${esc(guide.category)}</span>
      ${icon('arrow-right', 14)}
    </a>`;
  }

  function mountTroubleshooting(root) {
    const search = root.querySelector('#guide-search');
    search?.addEventListener('input', debounce(() => {
      state.guideQuery = search.value;
      rerender();
    }, 220));
    root.querySelectorAll('[data-gcat]').forEach((chip) => chip.addEventListener('click', () => {
      state.guideCategory = chip.dataset.gcat;
      rerender();
    }));
    const input = root.querySelector('#pattern-input');
    const result = root.querySelector('#pattern-result');
    if (input && result) {
      paintPatternResult(result, input.value);
      const run = debounce(() => {
        state.patternText = input.value;
        paintPatternResult(result, input.value);
      }, 180);
      input.addEventListener('input', run);
      onCleanup(() => run.cancel());
    }
  }

  // ------------------------------------------------------------------ visuals

  function renderVisuals(route) {
    const diagrams = [...OD.store.index.diagrams.values()];
    const id = route.parts[0];
    if (id) {
      const diagram = OD.store.diagramById(id);
      if (!diagram) return notFound('Diagram not found', 'That diagram does not exist in the current content set.', '#/academy/visuals', 'All diagrams');
      const nodeLessons = [...new Set((diagram.nodes || []).map((n) => n.lesson).filter(Boolean))].map((lid) => OD.store.lessonById(lid)).filter(Boolean);
      return `<div class="page">
        ${academyNav('visuals')}
        <div class="lesson-breadcrumb"><a href="#/academy">Academy</a>${icon('chevron-right', 11)}<a href="#/academy/visuals">Visuals</a>${icon('chevron-right', 11)}<span>${esc(diagram.title)}</span></div>
        <div class="page-head">
          <div class="page-head-left"><div class="eyebrow">${icon('network', 12)}Interactive diagram</div><h1 class="page-title">${esc(diagram.title)}</h1><p class="page-sub">${esc(diagram.description)}</p></div>
          <div class="page-actions"><a class="btn btn-sm btn-ghost" href="#/academy/visuals">${icon('arrow-left', 13)}<span>All diagrams</span></a></div>
        </div>
        <div class="diagram-layout">
          <div>${diagramBlock(diagram, `visual-${diagram.id}`, { minHeight: 380 })}</div>
          <aside class="lesson-rail">
            <div class="rail-card"><h4>How to read this</h4><p class="muted text-xs" style="line-height:1.6">Select any node to read what it does and jump to the lesson that explains it. Edges show request or data flow, not network cables.</p></div>
            ${nodeLessons.length ? `<div class="rail-card"><h4>Related lessons</h4><div class="rail-links">${nodeLessons.map((l) => `<a class="rail-link" href="#/academy/lesson/${esc(l.id)}">${icon('graduation-cap', 12)}<span>${esc(l.title)}</span></a>`).join('')}</div></div>` : ''}
            <div class="rail-card"><h4>Nodes</h4><div class="rail-links">${(diagram.nodes || []).map((n) => `<div class="rail-link"><span class="mono text-xs">${esc(n.label)}</span></div>`).join('')}</div></div>
            <div class="rail-card"><h4>Keep learning</h4><div class="rail-links"><a class="rail-link" href="#/academy/reference">${icon('terminal', 12)}<span>Command reference</span></a><a class="rail-link" href="#/academy/labs">${icon('flask', 12)}<span>Guided labs</span></a></div></div>
          </aside>
        </div>
      </div>`;
    }
    return `<div class="page">
      ${academyNav('visuals')}
      <div class="page-head">
        <div class="page-head-left"><div class="eyebrow">${icon('network', 12)}Visual models</div><h1 class="page-title">Diagrams that explain the system</h1><p class="page-sub">Architecture, lifecycle, layers, networking, Compose, storage and the build pipeline — each node links back to the lesson that covers it.</p></div>
        <div class="page-actions"><span class="badge tone-cyan">${diagrams.length} diagrams</span></div>
      </div>
      <div class="visual-grid">${diagrams.map((d) => `<a class="card visual-card" href="#/academy/visuals/${esc(d.id)}">
        <div class="visual-card-top"><span class="icon-chip tone-cyan" style="--chip-size:34px">${icon('network', 16)}</span><span class="badge tone-slate">${(d.nodes || []).length} nodes</span></div>
        <div class="visual-card-title">${esc(d.title)}</div>
        <div class="visual-card-sub">${esc(d.description)}</div>
        <div class="visual-card-foot"><span>${icon('compass', 11)}Interactive</span><span>${icon('graduation-cap', 11)}Linked lessons</span>${icon('arrow-right', 13)}</div>
      </a>`).join('')}</div>
      <div class="mt-4">${U.infoBanner('Models beat memorisation', 'When a command fails, find the layer it touches: client, daemon, image, container, network, volume. The diagram shows where evidence lives.', 'info', `<a class="btn btn-sm btn-secondary" href="#/academy/troubleshooting">Troubleshooting</a>`)}</div>
    </div>`;
  }

  // ------------------------------------------------------------------ glossary

  function renderGlossary() {
    const terms = (OD.store.state.academy.meta.glossary || []).slice().sort((a, b) => a.term.localeCompare(b.term));
    const letters = [...new Set(terms.map((t) => t.term[0].toUpperCase()))];
    const q = state.glossaryQuery.trim().toLowerCase();
    const filtered = terms.filter((t) => {
      if (state.glossaryLetter && state.glossaryLetter !== 'All' && t.term[0].toUpperCase() !== state.glossaryLetter) return false;
      if (!q) return true;
      return `${t.term} ${t.definition}`.toLowerCase().includes(q);
    });
    return `<div class="page">
      ${academyNav('glossary')}
      <div class="page-head">
        <div class="page-head-left"><div class="eyebrow">${icon('book-open', 12)}Vocabulary</div><h1 class="page-title">Glossary</h1><p class="page-sub">Precise language for containers, images, layers, registries, networks and orchestration. Consistency starts with shared definitions.</p></div>
        <div class="page-actions"><span class="badge tone-slate">${terms.length} terms</span></div>
      </div>
      <div class="toolbar">
        <label class="search-box">${icon('search', 14)}<input id="glossary-search" type="search" placeholder="Search a term or definition…" value="${esc(state.glossaryQuery)}" /></label>
        <div class="filter-row">${['All', ...letters].map((l) => `<button type="button" class="chip ${(state.glossaryLetter || 'All') === l ? 'active' : ''}" data-letter="${l}">${l}</button>`).join('')}</div>
        <div class="toolbar-spacer"></div><span class="muted text-xs">${filtered.length} shown</span>
      </div>
      <div class="glossary-grid">${filtered.map((t) => `<dl class="glossary-card"><dt>${highlight(t.term, state.glossaryQuery)}</dt><dd>${inline(t.definition)}</dd></dl>`).join('') || U.empty({ icon: 'search', title: 'No terms match', body: 'Try a shorter search or select All letters.' })}</div>
      <div class="mt-4">${U.infoBanner('Language is operational', 'Most Docker arguments come from using one word for two things. “Image” is not “container”, and “volume” is not “bind mount”.', 'info', `<a class="btn btn-sm btn-secondary" href="#/academy/visuals">See the models</a>`)}</div>
    </div>`;
  }

  function mountGlossary(root) {
    const search = root.querySelector('#glossary-search');
    search?.addEventListener('input', debounce(() => {
      state.glossaryQuery = search.value;
      rerender();
    }, 220));
    root.querySelectorAll('[data-letter]').forEach((chip) => chip.addEventListener('click', () => {
      state.glossaryLetter = chip.dataset.letter;
      rerender();
    }));
  }

  // ------------------------------------------------------------------ search

  function renderSearch() {
    const suggestions = [
      ['docker run', 'terminal'], ['docker compose up', 'boxes'], ['exit 137', 'wrench'],
      ['BuildKit', 'hammer'], ['bridge network', 'network'], ['volume', 'database'],
      ['multi-stage', 'file-code'], ['healthcheck', 'activity'],
    ];
    return `<div class="page">
      ${academyNav('search')}
      <div class="page-head">
        <div class="page-head-left"><div class="eyebrow">${icon('search', 12)}Global search</div><h1 class="page-title">Find anything in the Academy</h1><p class="page-sub">Courses, lessons, commands, flags, Dockerfile instructions, Compose properties, troubleshooting guides, diagrams, paths and glossary terms.</p></div>
      </div>
      <div class="search-page-input">${icon('search', 17)}<input id="academy-search-input" type="search" placeholder="Search lessons, commands, errors, properties…" value="${esc(state.searchQuery)}" autofocus /><span class="kbd">Esc</span></div>
      <div class="filter-row mb-4" id="search-types">${['All', 'Course', 'Lesson', 'Command', 'Dockerfile', 'Compose property', 'Troubleshooting', 'Learning path', 'Diagram', 'Glossary'].map((t) => `<button type="button" class="chip ${(state.searchType || 'All') === t ? 'active' : ''}" data-stype="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div id="search-results">${searchResultsHtml()}</div>
      <div class="mt-4">${U.card({
        title: 'Search tips', icon: 'info', sub: 'The index is local and instant',
        body: `<div class="outcome-grid">${[
          ['Search the error', 'Paste the first line of stderr. Troubleshooting patterns are indexed.'],
          ['Search the object', 'Type “volume”, “network” or “image” to see concepts and commands together.'],
          ['Search the tool', 'Type “compose” or “buildx” to narrow to a workflow.'],
          ['Use Cmd/Ctrl+K', 'The command palette jumps to any page without leaving the keyboard.'],
        ].map(([t, b]) => `<div class="outcome-item">${icon('check', 14)}<div><strong>${t}</strong><div class="muted text-xs">${b}</div></div></div>`).join('')}</div>`,
      })}
      ${!state.searchQuery ? `<div class="section-head"><div><div class="section-eyebrow">${icon('sparkles', 12)}Try</div><h2 class="section-title">Popular topics</h2></div></div><div class="pill-row">${suggestions.map(([s, ic]) => `<button type="button" class="chip" data-suggest="${esc(s)}">${icon(ic, 11)}${esc(s)}</button>`).join('')}</div>` : ''}
    </div>`;
  }

  function searchResultsHtml() {
    const q = state.searchQuery.trim();
    if (!q) {
      return `<div class="search-empty">${icon('search', 28)}<h3>Start typing to search ${OD.store.index.search.length} indexed entries</h3><p>Everything is searched locally: no network requests, no telemetry.</p></div>`;
    }
    let results = OD.store.search(q, 80);
    if (state.searchType && state.searchType !== 'All') results = results.filter((r) => r.type === state.searchType);
    if (!results.length) {
      return U.empty({ icon: 'search', title: `No results for “${q}”`, body: 'Try a broader term, the exact error text, or browse the reference and troubleshooting sections.', action: `<div class="row gap-2"><a class="btn btn-sm btn-secondary" href="#/academy/reference">Reference</a><a class="btn btn-sm btn-secondary" href="#/academy/troubleshooting">Troubleshooting</a></div>` });
    }
    const groups = new Map();
    for (const r of results) {
      if (!groups.has(r.type)) groups.set(r.type, []);
      groups.get(r.type).push(r);
    }
    return `<div class="search-summary">${icon('search', 12)}<span>${results.length} results for</span><strong>“${esc(q)}”</strong></div>${[...groups.entries()].map(([type, items]) => `<div class="search-group">
      <h3>${icon(items[0].icon || 'search', 12)}${esc(type)}<span class="badge tone-slate">${items.length}</span></h3>
      ${items.map((r) => `<a class="search-result" href="${esc(r.href)}">
        <span class="search-result-icon">${icon(r.icon || 'search', 14)}</span>
        <span class="search-result-body"><span class="search-result-title">${highlight(r.title, q)}</span><span class="search-result-sub">${highlight(r.subtitle || '', q)}</span></span>
        <span class="search-result-type">${esc(type)}</span>
      </a>`).join('')}
    </div>`).join('')}`;
  }

  function mountSearch(root) {
    const input = root.querySelector('#academy-search-input');
    const host = root.querySelector('#search-results');
    if (input) {
      const run = debounce(() => {
        state.searchQuery = input.value;
        if (host) host.innerHTML = searchResultsHtml();
      }, 150);
      input.addEventListener('input', run);
      onCleanup(() => run.cancel());
      setTimeout(() => input.focus(), 40);
    }
    root.querySelectorAll('[data-stype]').forEach((chip) => chip.addEventListener('click', () => {
      state.searchType = chip.dataset.stype;
      root.querySelectorAll('[data-stype]').forEach((c) => c.classList.toggle('active', c === chip));
      if (host) host.innerHTML = searchResultsHtml();
    }));
    root.querySelectorAll('[data-suggest]').forEach((chip) => chip.addEventListener('click', () => {
      state.searchQuery = chip.dataset.suggest;
      if (input) input.value = state.searchQuery;
      if (host) host.innerHTML = searchResultsHtml();
    }));
  }

  // ------------------------------------------------------------------ labs

  const LAB_CONSENT_KEY = 'opsdeck.labConsent';

  function labDoneKey(id) { return `opsdeck.lab.${id}`; }

  function loadLabDone(id) {
    try {
      const raw = JSON.parse(localStorage.getItem(labDoneKey(id)) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }

  function saveLabDone(id, done) {
    try { localStorage.setItem(labDoneKey(id), JSON.stringify(done)); } catch { /* ignore */ }
  }

  function labTemplateFiles(lab) {
    const files = {};
    for (const step of lab.steps || []) {
      if (step.file && step.content != null && files[step.file] === undefined) files[step.file] = step.content;
    }
    return files;
  }

  function initLabState(lab) {
    state.lab = {
      id: lab.id,
      done: loadLabDone(lab.id),
      output: [],
      files: labTemplateFiles(lab),
      activeFile: (lab.steps || []).find((s) => s.file)?.file || null,
      status: null,
      busy: false,
    };
  }

  function labBase(lab) {
    const base = state.lab.status?.baseDir || '';
    return base ? `${base}/${lab.id}` : '';
  }

  function labStepCommand(lab, step) {
    const base = labBase(lab);
    const raw = step.expect && !/^Write the /i.test(step.expect) ? step.expect : step.command;
    return String(raw || '').replace(/\{dir\}/g, base || '{dir}');
  }

  function labProgress(lab) {
    const done = state.lab.done || {};
    const total = (lab.steps || []).length || 1;
    const count = (lab.steps || []).filter((_, i) => done[i]).length;
    return { count, total, percent: Math.round((count / total) * 100) };
  }

  function labCards() {
    const labs = OD.store.allLabs();
    const standalone = labs.filter((l) => l.standalone);
    const embedded = labs.filter((l) => !l.standalone);
    const card = (lab) => {
      const done = loadLabDone(lab.id);
      const total = (lab.steps || []).length || 1;
      const count = (lab.steps || []).filter((_, i) => done[i]).length;
      return `<a class="lab-card card" href="#/academy/labs/${esc(lab.id)}">
        <div class="lab-card-top">
          <span class="icon-chip tone-${esc(lab.accent || 'green')}" style="--chip-size:36px">${icon(lab.icon || 'flask', 17)}</span>
          <span class="badge tone-${esc(lab.accent || 'green')}">${esc(lab.level || 'Beginner')}</span>
        </div>
        <div class="lab-card-title">${esc(lab.title)}</div>
        <div class="lab-card-sub">${esc(lab.subtitle || lab.description || lab.brief || '')}</div>
        <div class="lab-card-meta"><span>${icon('list', 11)}${total} steps</span><span>${icon('clock', 11)}${esc(lab.duration || '')}</span>${lab.courseTitle ? `<span>${icon('graduation-cap', 11)}${esc(lab.courseTitle)}</span>` : '<span class="badge tone-slate">Standalone</span>'}</div>
        <div class="lab-card-foot"><div style="flex:1">${U.progressBar(Math.round((count / total) * 100), count === total && total ? 'green' : lab.accent || 'green')}</div><span class="pct">${count}/${total}</span></div>
      </a>`;
    };
    return `<div class="stack-4">
      <div class="section-head"><div><div class="section-eyebrow">${icon('flask', 12)}Standalone labs</div><h2 class="section-title">Sandbox exercises</h2><p class="section-sub">Every resource is labelled, isolated and removable. Nothing touches your own containers.</p></div></div>
      <div class="lab-card-grid">${standalone.map(card).join('')}</div>
      ${embedded.length ? `<div class="section-head"><div><div class="section-eyebrow">${icon('graduation-cap', 12)}Inside lessons</div><h2 class="section-title">Lesson labs</h2></div></div><div class="lab-card-grid">${embedded.map(card).join('')}</div>` : ''}
    </div>`;
  }

  function labSafety(status) {
    const on = state.labConsent;
    return `<div class="lab-safety ${on ? 'on' : ''}">
      <span class="icon-chip tone-${on ? 'green' : 'amber'}" style="--chip-size:34px">${icon(on ? 'shield-check' : 'shield', 16)}</span>
      <div style="flex:1;min-width:0">
        <strong>${on ? 'Sandbox enabled' : 'Sandbox consent required'}</strong>
        <p>${on ? 'Commands are validated and hardened: no privileged mode, no host networking, no host bind mounts, no Docker socket, capped CPU and memory. Resources carry the opsdeck.lab labels so Reset Lab can remove them.' : 'Labs run real Docker commands on this machine. OpsDeck applies resource limits and rejects dangerous options, but you are still responsible for what you run. Enable the sandbox to continue.'}</p>
        ${status ? `<div class="lab-safety-facts"><span>${icon('box', 11)}${status.containers || 0} lab containers</span><span>${icon('network', 11)}${status.networks || 0} networks</span><span>${icon('database', 11)}${status.volumes || 0} volumes</span>${!status.available ? `<span class="tone-text-amber">${icon('alert-triangle', 11)}Docker offline</span>` : ''}</div>` : ''}
      </div>
      ${on ? '' : U.button({ label: 'Enable sandbox', icon: 'shield-check', variant: 'primary', size: 'sm', attrs: 'data-lab-consent="1"' })}
    </div>`;
  }

  async function renderLabs() {
    const status = await api.labs.status().catch((error) => ({ available: false, reason: error.message, containers: 0, networks: 0, volumes: 0 }));
    state.labConsent = state.labConsent || localStorage.getItem(LAB_CONSENT_KEY) === '1';
    const labs = OD.store.allLabs();
    return `<div class="page">
      ${academyNav('labs')}
      <div class="page-head">
        <div class="page-head-left"><div class="eyebrow">${icon('flask', 12)}Hands-on</div><h1 class="page-title">Guided labs</h1><p class="page-sub">Real commands, real containers, contained risk. Steps validate as you go and Reset Lab removes every labelled resource.</p></div>
        <div class="page-actions"><span class="badge tone-green">${labs.length} labs</span><span class="badge tone-slate">${labs.reduce((sum, l) => sum + (l.steps || []).length, 0)} steps</span></div>
      </div>
      ${labSafety(status)}
      ${labCards()}
      <div class="mt-4">${U.infoBanner('How reset works', 'Reset Lab runs compose down for the lab project, then removes containers, networks and volumes that carry this lab’s label and deletes its files. It never touches unrelated Docker resources.', 'warning')}</div>
    </div>`;
  }

  async function renderLab(route) {
    const lab = OD.store.allLabs().find((l) => l.id === route.parts[0]);
    if (!lab) return notFound('Lab not found', 'That lab does not exist in the current content set.', '#/academy/labs', 'All labs');
    if (!state.lab || state.lab.id !== lab.id) initLabState(lab);
    const status = await api.labs.status().catch((error) => ({ available: false, reason: error.message, containers: 0, networks: 0, volumes: 0, baseDir: '' }));
    state.lab.status = status;
    state.labConsent = state.labConsent || localStorage.getItem(LAB_CONSENT_KEY) === '1' || status.consentRequired === false;
    const progress = labProgress(lab);
    const files = Object.keys(state.lab.files || {});
    const brief = lab.brief || lab.description || '';
    const labList = OD.store.allLabs();

    return `<div class="page">
      ${academyNav('labs')}
      <div class="labs-layout">
        <aside class="lab-list">${labList.map((l) => {
          const p = l.id === lab.id ? progress : (() => { const d = loadLabDone(l.id); const t = (l.steps || []).length || 1; const c = (l.steps || []).filter((_, i) => d[i]).length; return { count: c, total: t, percent: Math.round((c / t) * 100) }; })();
          return `<a class="lab-item ${l.id === lab.id ? 'active' : ''}" href="#/academy/labs/${esc(l.id)}">
            <span class="lab-item-icon">${icon(l.icon || 'flask', 13)}</span>
            <span class="lab-item-body"><span class="lab-item-title">${esc(l.title)}</span><span class="lab-item-sub">${esc(l.level || '')} · ${p.count}/${p.total} done</span><span class="lab-item-progress">${U.progressBar(p.percent, p.percent === 100 ? 'green' : l.accent || 'green')}</span></span>
          </a>`;
        }).join('')}</aside>

        <div class="lab-workspace">
          <div class="lab-brief">
            <div class="pill-row"><span class="badge tone-${esc(lab.accent || 'green')}">${esc(lab.level || 'Beginner')}</span><span class="badge tone-slate">${esc(lab.duration || '')}</span>${lab.courseTitle ? `<span class="badge tone-violet">${esc(lab.courseTitle)}</span>` : ''}<span class="badge tone-slate">${progress.count}/${progress.total} steps</span></div>
            <h1 class="mt-2">${esc(lab.title)}</h1>
            <p>${esc(brief)}</p>
            <div class="objectives">${(lab.objectives || []).map((o) => `<span class="lab-objective">${esc(o)}</span>`).join('')}</div>
            <div class="mt-3">${U.progressBar(progress.percent, progress.percent === 100 ? 'green' : lab.accent || 'green')}</div>
          </div>

          ${labSafety(status)}

          <div class="lab-grid">
            <div class="lab-steps" id="lab-steps">${labStepsHtml(lab)}</div>
            <aside class="lab-side">
              ${files.length ? `<div class="lab-files"><div class="lab-files-head">${icon('file-code', 12)}Lab workspace</div><div id="lab-editor-host">${labEditorHtml(lab, files)}</div></div>` : ''}
              <div class="card" style="padding:13px">
                <h4 style="font-size:11px;margin-bottom:6px">${icon('info', 12)}Sandbox facts</h4>
                <div class="lab-note">${status.available ? `Docker is reachable. Lab files: <span class="mono">${esc(status.baseDir || '')}/${esc(lab.id)}</span>` : esc(status.reason || 'Docker is not reachable. Start the engine to run lab commands.')}</div>
              </div>
              ${(lab.notes || []).length ? `<div class="card" style="padding:13px"><h4 style="font-size:11px;margin-bottom:6px">${icon('notebook-pen', 12)}Notes</h4>${(lab.notes || []).map((n) => `<p class="lab-note">${esc(n)}</p>`).join('')}</div>` : ''}
            </aside>
          </div>

          <div class="lab-term">
            <div class="terminal-shell">
              <div class="term-head"><div class="term-lights"><i></i><i></i><i></i></div><span class="term-title">${esc(lab.id)} — sandbox</span><span>${status.available ? 'docker · hardened' : 'engine offline'}</span></div>
              <div class="term-body" id="lab-term-body">${labTerminalHtml()}</div>
              <form class="term-input-row" id="lab-term-form"><span class="p">$</span><input id="lab-term-input" type="text" autocomplete="off" spellcheck="false" placeholder="Click a step command or type docker ps" ${status.available ? '' : 'disabled'} /><button class="btn btn-sm btn-primary" type="submit" ${status.available ? '' : 'disabled'}>Run</button></form>
              <div class="term-hint">One Docker command per step · validated and hardened · Reset Lab removes every labelled resource</div>
            </div>
          </div>

          <div class="lab-reset-row">
            <p>${icon('alert-triangle', 13)} Reset removes this lab’s containers, networks, volumes and files. Your lesson progress stays intact.</p>
            ${U.button({ label: 'Reset Lab', icon: 'rotate-ccw', variant: 'danger', size: 'sm', attrs: 'data-lab-reset="1"' })}
          </div>
          ${lab.lessonId ? `<div class="mt-4">${U.infoBanner('This lab belongs to a lesson', 'Return to the lesson for the conceptual explanation and knowledge check.', 'info', `<a class="btn btn-sm btn-secondary" href="#/academy/lesson/${esc(lab.lessonId)}">Open lesson</a>`)}</div>` : ''}
        </div>
      </div>
    </div>`;
  }

  function labStepsHtml(lab) {
    return (lab.steps || []).map((step, i) => {
      const done = !!state.lab.done[i];
      const isFile = !!step.file;
      return `<div class="lab-step ${done ? 'done' : ''}" data-lab-step="${i}">
        <span class="lab-step-check">${done ? icon('check', 11) : i + 1}</span>
        <div class="lab-step-body">
          <div class="lab-step-instruction">${esc(step.instruction)}</div>
          ${isFile ? `<div class="row gap-2 mt-2">${U.button({ label: `Edit ${step.file}`, icon: 'file-code', size: 'sm', attrs: `data-lab-open-file="${esc(step.file)}"` })}${done ? '<span class="badge tone-green">Saved</span>' : ''}</div>` : `<div class="mt-2">${U.commandLine(labStepCommand(lab, step), { run: false })}${U.button({ label: 'Load command', icon: 'arrow-up-right', size: 'sm', attrs: `data-lab-fill="${esc(labStepCommand(lab, step))}"` })}</div>`}
          ${step.hint ? `<div class="lab-step-hint">${icon('info', 11)}${esc(step.hint)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function labEditorHtml(lab, files) {
    const active = state.lab.activeFile && files.includes(state.lab.activeFile) ? state.lab.activeFile : files[0];
    state.lab.activeFile = active;
    return `<div class="lab-file-tabs">${files.map((f) => `<button type="button" class="lab-file-tab ${f === active ? 'active' : ''}" data-lab-file="${esc(f)}">${esc(f)}</button>`).join('')}</div>
      <textarea class="lab-editor" id="lab-editor" spellcheck="false" aria-label="Lab file editor">${esc(state.lab.files[active] || '')}</textarea>
      <div class="lab-file-actions">${U.button({ label: 'Template', icon: 'file', size: 'sm', attrs: `data-lab-template="${esc(active)}"` })}${U.button({ label: 'Save file', icon: 'save', size: 'sm', variant: 'primary', attrs: 'data-lab-save="1"' })}</div>`;
  }

  function labTerminalHtml() {
    const out = state.lab.output || [];
    if (!out.length) {
      return `<div class="term-block"><div class="meta">${icon('flask', 12)}<span>Lab sandbox · Docker CLI only</span></div><pre>Commands are validated before execution. Host paths, privileged mode, host networking and the Docker socket are rejected. Load a step command or type your own.</pre></div>`;
    }
    return out.map((entry) => {
      const res = entry.res || {};
      const text = res.ok ? (res.stdout || '') : (res.stderr || res.error || '');
      return `<div class="term-block">
        <div class="term-line"><span class="p">$</span><span class="cmd">${esc(entry.command)}</span></div>
        <div class="meta"><span class="code ${res.ok ? 'ok' : ''}">${res.ok ? 'exit 0' : `exit ${res.code ?? 'blocked'}`}</span><span>${esc(new Date(entry.at).toLocaleTimeString('en-US', { hour12: false }))}</span>${res.blocked ? `<span>blocked</span>` : ''}${res.timedOut ? '<span>timed out</span>' : ''}</div>
        ${text ? `<pre>${esc(text)}</pre>` : ''}
        ${res.command && res.command !== entry.command ? `<div class="term-hardened">hardened: <span class="mono">${esc(res.command)}</span></div>` : ''}
      </div>`;
    }).join('');
  }

  function paintLab(root, lab) {
    const steps = root.querySelector('#lab-steps');
    if (steps) steps.innerHTML = labStepsHtml(lab);
    const term = root.querySelector('#lab-term-body');
    if (term) { term.innerHTML = labTerminalHtml(); term.scrollTop = term.scrollHeight; }
    const progress = labProgress(lab);
    root.querySelectorAll('.lab-brief .progress-fill').forEach((el) => { el.style.width = `${progress.percent}%`; });
    root.querySelectorAll('.lab-brief .badge.tone-slate').forEach((el) => {
      if (/\d+\/\d+ steps/.test(el.textContent)) el.textContent = `${progress.count}/${progress.total} steps`;
    });
  }

  function paintLabEditor(root, lab) {
    const host = root.querySelector('#lab-editor-host');
    if (!host) return;
    const files = Object.keys(state.lab.files || {});
    host.innerHTML = labEditorHtml(lab, files);
  }

  function labFileContentValid(name, content) {
    const text = String(content || '');
    if (!text.trim()) return false;
    if (/^dockerfile$/i.test(name)) return /^\s*FROM\s+\S+/im.test(text) && /^\s*(COPY|ADD|RUN|CMD|ENTRYPOINT)\b/im.test(text);
    if (/^docker-compose\.ya?ml$/i.test(name)) return /^\s*services\s*:/im.test(text);
    if (/\.ya?ml$/i.test(name)) return /^\s*(services|name|networks|volumes)\s*:/im.test(text);
    if (/\.html?$/i.test(name)) return /<[a-z!]/i.test(text);
    return true;
  }

  function tokensOf(value) {
    return String(value || '')
      .replace(/["']/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
  }

  function isSubsequence(haystack, needle) {
    if (!needle.length) return false;
    let i = 0;
    for (const token of haystack) {
      if (token === needle[i]) i += 1;
      if (i === needle.length) return true;
    }
    return false;
  }

  function matchLabStep(lab, command, res) {
    const runTokens = tokensOf(res.command || command);
    for (let i = 0; i < (lab.steps || []).length; i += 1) {
      const step = lab.steps[i];
      if (step.file || state.lab.done[i]) continue;
      const expected = tokensOf(labStepCommand(lab, step));
      if (!isSubsequence(runTokens, expected)) continue;
      if (step.output) {
        const text = `${res.stdout || ''}\n${res.stderr || ''}`;
        if (!text.includes(step.output)) return { step: i, matched: false, hint: `Command matched, but the expected output “${step.output}” was not found.` };
      }
      return { step: i, matched: true };
    }
    return null;
  }

  async function enableLabConsent() {
    if (state.labConsent) return true;
    const ok = await U.confirm({
      title: 'Enable the lab sandbox',
      message: 'Lab commands run against your local Docker engine. OpsDeck hardens every command and labels every resource, but it cannot undo the effects of a command you choose to run.',
      detail: 'Blocked: privileged mode, host PID/network/IPC, host bind mounts, Docker socket mounts, device passthrough, capability additions beyond the lab set. Capped: 0.5 CPU, 256 MB memory, 128 PIDs.',
      confirmLabel: 'I understand',
      tone: 'warning',
    });
    if (!ok) return false;
    state.labConsent = true;
    try { localStorage.setItem(LAB_CONSENT_KEY, '1'); } catch { /* ignore */ }
    await api.labs.consent().catch(() => ({ ok: false }));
    return true;
  }

  async function runLabCommand(lab, root, raw) {
    const command = String(raw || '').trim();
    if (!command || state.lab.busy) return;
    if (!(await enableLabConsent())) return;
    state.lab.busy = true;
    const res = await api.labs.run({ labId: lab.id, command, consent: true });
    state.lab.busy = false;
    state.lab.output.push({ command, res, at: Date.now() });
    if (state.lab.output.length > 60) state.lab.output.shift();

    if (!res.ok && res.blocked) {
      U.toast('Command blocked by the sandbox', 'warning', { description: res.error });
    } else if (!res.ok) {
      U.toast('Command failed', 'error', { description: (res.stderr || res.error || '').slice(0, 200) });
    }

    if (res.ok) {
      bumpLabRuns();
      const match = matchLabStep(lab, command, res);
      if (match && match.matched) {
        state.lab.done[match.step] = true;
        saveLabDone(lab.id, state.lab.done);
        const progress = labProgress(lab);
        U.toast(progress.count === progress.total ? 'Lab complete' : 'Step complete', 'success', { description: progress.count === progress.total ? 'Every step is done. Reset the lab to clean up resources.' : `${progress.count} of ${progress.total} steps` });
        evaluateAchievements();
      } else if (match && !match.matched) {
        U.toast('Close, but not validated', 'warning', { description: match.hint });
      }
    }

    const input = root.querySelector('#lab-term-input');
    if (input) { input.value = ''; input.focus(); }
    paintLab(root, lab);
  }

  function mountLab(root, route, lab) {
    const startConsent = async () => {
      const ok = await enableLabConsent();
      if (ok) rerender();
    };
    root.querySelectorAll('[data-lab-consent]').forEach((btn) => btn.addEventListener('click', startConsent));

    const form = root.querySelector('#lab-term-form');
    const input = root.querySelector('#lab-term-input');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value;
      runLabCommand(lab, root, value);
    });
    if (input) setTimeout(() => input.focus(), 60);

    root.addEventListener('click', async (event) => {
      const fill = event.target.closest('[data-lab-fill]');
      if (fill) {
        const target = root.querySelector('#lab-term-input');
        if (target) { target.value = fill.dataset.labFill; target.focus(); target.select(); }
        return;
      }
      const openFile = event.target.closest('[data-lab-open-file]');
      if (openFile) {
        state.lab.activeFile = openFile.dataset.labOpenFile;
        paintLabEditor(root, lab);
        return;
      }
      const tab = event.target.closest('[data-lab-file]');
      if (tab) {
        state.lab.activeFile = tab.dataset.labFile;
        paintLabEditor(root, lab);
        return;
      }
      const templateBtn = event.target.closest('[data-lab-template]');
      if (templateBtn) {
        const name = templateBtn.dataset.labTemplate;
        const step = (lab.steps || []).find((s) => s.file === name);
        state.lab.files[name] = step?.content || '';
        paintLabEditor(root, lab);
        U.toast('Template loaded', 'info', { description: name });
        return;
      }
      const saveBtn = event.target.closest('[data-lab-save]');
      if (saveBtn) {
        const name = state.lab.activeFile;
        const editor = root.querySelector('#lab-editor');
        if (!name || !editor) return;
        const content = editor.value;
        const res = await api.labs.writeFile({ labId: lab.id, name, content });
        if (!res.ok) {
          U.toast('File rejected', 'error', { description: res.error });
          return;
        }
        state.lab.files[name] = content;
        const index = (lab.steps || []).findIndex((s) => s.file === name);
        if (index >= 0) {
          if (labFileContentValid(name, content)) {
            state.lab.done[index] = true;
            saveLabDone(lab.id, state.lab.done);
            U.toast(`${name} saved`, 'success', { description: 'Step validated. Continue with the next step.' });
            evaluateAchievements();
          } else {
            U.toast(`${name} saved, but validation needs work`, 'warning', { description: 'A Dockerfile needs FROM plus a build instruction; Compose needs services.' });
          }
        }
        paintLab(root, lab);
        paintLabEditor(root, lab);
        return;
      }
      const reset = event.target.closest('[data-lab-reset]');
      if (reset) {
        const ok = await U.confirm({ title: `Reset ${lab.title}?`, message: 'Lab containers, networks and volumes carrying this lab’s label are removed, and its workspace files are deleted.', detail: `docker compose -p opsdeck-lab-${lab.id} down -v --remove-orphans`, confirmLabel: 'Reset Lab', tone: 'red' });
        if (!ok) return;
        reset.disabled = true;
        U.toast('Resetting lab…', 'info', { description: 'Removing labelled resources' });
        const res = await api.labs.reset(lab.id);
        if (res.ok) {
          state.lab.done = {};
          state.lab.output = [];
          state.lab.files = labTemplateFiles(lab);
          state.lab.activeFile = (lab.steps || []).find((s) => s.file)?.file || null;
          saveLabDone(lab.id, {});
          U.toast('Lab reset', 'success', { description: 'Every labelled resource was removed.' });
          rerender();
        } else {
          reset.disabled = false;
          U.toast('Reset failed', 'error', { description: res.error });
        }
      }
    });
  }

  // ------------------------------------------------------------------ dispatch

  async function render(route) {
    const parts = route.parts || [];
    const section = parts[0] || '';
    switch (section) {
      case 'courses': return renderCourses();
      case 'course': return renderCourse({ parts: [parts[1]] });
      case 'lesson': return renderLesson({ parts: [parts[1]] });
      case 'paths': return parts[1] ? renderPath({ parts: [parts[1]] }) : renderPaths();
      case 'reference': return renderReference({ parts: parts.slice(1) });
      case 'troubleshooting': return parts[1] ? renderGuide({ parts: [parts[1]] }) : renderTroubleshooting();
      case 'labs': return parts[1] ? renderLab({ parts: [parts[1]] }) : renderLabs();
      case 'visuals': return renderVisuals({ parts: parts.slice(1) });
      case 'glossary': return renderGlossary();
      case 'search': return renderSearch();
      case '':
      case 'dashboard':
      default: return renderDashboard();
    }
  }

  // Inline icons and styled runs sit directly against neighbouring text in places
  // where the container is not a flex row. Add the missing space after render.
  function fixSpacing(root) {
    const display = (el) => getComputedStyle(el).display;
    root.querySelectorAll('svg.icon').forEach((svg) => {
      const next = svg.nextSibling;
      const parent = svg.parentElement;
      if (!parent || /flex|grid/.test(display(parent))) return;
      if (next && next.nodeType === 3 && /^\S/.test(next.nodeValue)) svg.style.marginInlineEnd = '6px';
    });
    root.querySelectorAll('.lesson-prose strong, .lesson-prose a, .lesson-prose code, .callout-body strong, .callout-body a, .callout-body code, .step-body strong').forEach((el) => {
      const prev = el.previousSibling;
      const next = el.nextSibling;
      const tail = (n) => (n && n.nodeType === 3 ? n.nodeValue.slice(-1) : '');
      const head = (n) => (n && n.nodeType === 3 ? n.nodeValue.charAt(0) : '');
      if (/[\p{L}\p{N}]/u.test(tail(prev)) && el.textContent) el.style.marginInlineStart = '.25em';
      if (/[\p{L}\p{N}]/u.test(head(next))) el.style.marginInlineEnd = '.25em';
    });
  }

  function mount(root, route) {
    fixSpacing(root);
    const parts = route.parts || [];
    const section = parts[0] || '';
    switch (section) {
      case 'courses':
        root.querySelectorAll('[data-level]').forEach((chip) => chip.addEventListener('click', () => { state.courseLevel = chip.dataset.level; rerender(); }));
        root.querySelector('#course-search')?.addEventListener('input', (event) => {
          state.courseQuery = event.target.value;
          rerender();
          setTimeout(() => { const input = document.getElementById('course-search'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } }, 60);
        });
        return;
      case 'course':
        root.querySelectorAll('[data-module-toggle]').forEach((head) => head.addEventListener('click', () => {
          head.closest('.module')?.classList.toggle('open');
        }));
        return;
      case 'lesson':
        mountLesson(root, { parts: [parts[1]] });
        return;
      case 'reference':
        mountReference(root, { parts: parts.slice(1) });
        return;
      case 'troubleshooting':
        if (parts[1]) return;
        mountTroubleshooting(root);
        return;
      case 'labs':
        if (parts[1]) {
          const lab = OD.store.allLabs().find((l) => l.id === parts[1]);
          if (lab) mountLab(root, route, lab);
        } else {
          root.querySelectorAll('[data-lab-consent]').forEach((btn) => btn.addEventListener('click', async () => {
            if (await enableLabConsent()) rerender();
          }));
        }
        return;
      case 'visuals':
        mountDiagrams(root);
        return;
      case 'glossary':
        mountGlossary(root);
        return;
      case 'search':
        mountSearch(root);
        return;
      default:
        return;
    }
  }

  window.OD = window.OD || {};
  OD.views = OD.views || {};
  OD.views.academy = { render, mount, dispose };
})();
