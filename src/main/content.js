'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Academy content lives in plain JSON under /content so it can be edited or
 * replaced without rebuilding the application.
 */
class ContentService {
  constructor(app) {
    this.app = app;
    this.contentDir = app.isPackaged
      ? path.join(process.resourcesPath, 'content')
      : path.join(app.getAppPath(), 'content');
    this.version = null;
  }

  readJson(relative, fallback) {
    try {
      const raw = fs.readFileSync(path.join(this.contentDir, relative), 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.error(`Academy content error (${relative}):`, error.message);
      return fallback;
    }
  }

  readDir(relative) {
    try {
      return fs.readdirSync(path.join(this.contentDir, relative)).filter((f) => f.endsWith('.json')).sort();
    } catch {
      return [];
    }
  }

  load() {
    const courses = this.readDir('courses')
      .map((file) => this.readJson(path.join('courses', file), null))
      .filter(Boolean)
      .sort((a, b) => (a.order || 99) - (b.order || 99));

    for (const course of courses) {
      course.modules = course.modules || [];
      course.lessonCount = course.modules.reduce((sum, m) => sum + (m.lessons?.length || 0), 0);
      for (const mod of course.modules) {
        for (const lesson of mod.lessons || []) {
          lesson.courseId = course.id;
          lesson.moduleId = mod.id;
          lesson.moduleTitle = mod.title;
        }
      }
    }

    const paths = this.readDir('paths')
      .map((file) => this.readJson(path.join('paths', file), null))
      .filter(Boolean);
    const commands = this.readJson('reference/commands.json', { commands: [], dockerfile: [], compose: [] });
    const guides = this.readJson('guides/troubleshooting.json', { guides: [] });
    const diagrams = this.readJson('reference/diagrams.json', { diagrams: {} });
    const labs = this.readJson('labs.json', { labs: [] }).labs || [];
    const meta = this.readJson('meta.json', {
      version: '1.0.0',
      achievements: [],
      glossary: [],
      dailyGoalMinutes: 20,
    });

    this.version = meta.version || '1.0.0';
    return {
      courses,
      paths,
      commands,
      guides,
      diagrams,
      labs,
      meta,
      contentDir: this.contentDir,
      version: this.version,
      loadedAt: new Date().toISOString(),
    };
  }
}

module.exports = { ContentService };
