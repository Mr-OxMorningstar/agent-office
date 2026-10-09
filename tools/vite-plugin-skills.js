import fs from 'node:fs';
import path from 'node:path';
import { readFrontMatter, virtualModulePlugin } from './markdown-source.js';

// Exposes the SKILL.md files under each source as `import skills from 'virtual:skills'`, and reloads the page
// when any of them change. `depth` is how many folder levels sit between the source dir and each skill folder.
export default function skillsPlugin({ sources }) {
  return virtualModulePlugin({
    name: 'office-skills',
    id: 'virtual:skills',
    watchDirs: sources.map((s) => s.dir),
    isSource: (file) => file.endsWith('SKILL.md'),
    load: () => readSkills(sources),
  });
}

function readSkills(sources) {
  const seen = new Set();
  const skills = [];
  for (const source of sources) {
    for (const file of findSkillFiles(source.dir, source.depth ?? 1)) {
      const skill = parseSkill(file);
      if (!skill || seen.has(skill.name)) continue; // earlier sources win on duplicate names
      seen.add(skill.name);
      skills.push({ ...skill, source: source.label });
    }
  }
  return skills;
}

function findSkillFiles(dir, depth) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (depth === 1) {
    return entries.map((e) => path.join(dir, e.name, 'SKILL.md')).filter((f) => fs.existsSync(f)).sort();
  }
  return entries.flatMap((e) => findSkillFiles(path.join(dir, e.name), depth - 1));
}

function parseSkill(file) {
  const parsed = readFrontMatter(file);
  if (!parsed) return null;
  const { meta, body } = parsed;
  const name = meta.name ?? path.basename(path.dirname(file));
  return { name, description: String(meta.description ?? '').trim(), body };
}
