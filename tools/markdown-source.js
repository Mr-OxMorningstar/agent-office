import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// Shared by the plugins that turn Markdown files on disk (skills, agent role definitions) into virtual modules.

// Reads a Markdown file with front matter. Returns { meta, body }, or null if it has no front matter.
export function readFrontMatter(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { meta: parseMeta(match[1]), body: match[2].trim() };
}

// YAML first; failing that, plain `key: value` lines. Claude Code accepts front matter that strict YAML rejects,
// e.g. an unquoted description containing ": " ("Use to turn a request into a plan: reads the code...").
function parseMeta(source) {
  try {
    return YAML.parse(source) ?? {};
  } catch {
    const meta = {};
    let key = null;
    for (const line of source.split('\n')) {
      const field = line.match(/^([A-Za-z][\w-]*):\s?(.*)$/);
      if (field) {
        key = field[1];
        meta[key] = field[2].trim();
      } else if (key && /^\s+\S/.test(line)) {
        meta[key] = `${meta[key]} ${line.trim()}`.trim(); // indented continuation line
      }
    }
    return meta;
  }
}

// A Vite plugin exposing `load()`'s value as `import x from '<id>'`, reloading the page when a watched file changes.
export function virtualModulePlugin({ name, id, watchDirs, isSource, load }) {
  const resolvedId = '\0' + id;
  const isUnder = (file) => watchDirs.some((dir) => path.resolve(file).startsWith(path.resolve(dir)));

  return {
    name,
    resolveId(source) {
      if (source === id) return resolvedId;
    },
    load(source) {
      if (source !== resolvedId) return;
      return `export default ${JSON.stringify(load())};`;
    },
    configureServer(server) {
      server.watcher.add(watchDirs);
      const reload = (file) => {
        if (!isSource(file) || !isUnder(file)) return;
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', reload);
      server.watcher.on('change', reload);
      server.watcher.on('unlink', reload);
    },
  };
}
