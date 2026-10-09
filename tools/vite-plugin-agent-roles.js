import fs from 'node:fs';
import path from 'node:path';
import { readFrontMatter, virtualModulePlugin } from './markdown-source.js';

// Exposes the Claude Code subagent definitions (~/.claude/agents/*.md) as `import roles from 'virtual:agent-roles'`,
// keyed by agent name. Team boards show what each role owns straight from these files, so editing a role file
// updates its board.
export default function agentRolesPlugin({ dir }) {
  return virtualModulePlugin({
    name: 'office-agent-roles',
    id: 'virtual:agent-roles',
    watchDirs: [dir],
    isSource: (file) => file.endsWith('.md'),
    load: () => readRoles(dir),
  });
}

function readRoles(dir) {
  if (!fs.existsSync(dir)) return {};
  const roles = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const parsed = readFrontMatter(path.join(dir, file));
    if (!parsed) continue;
    const { meta, body } = parsed;
    const name = meta.name ?? path.basename(file, '.md');
    // First paragraph is the role's brief; the "Standing rules" paragraph is shared by every role.
    const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    roles[name] = {
      name,
      description: String(meta.description ?? '').trim(),
      model: meta.model ?? null,
      tools: String(meta.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      brief: paragraphs.find((p) => !p.startsWith('Standing rules')) ?? '',
    };
  }
  return roles;
}
