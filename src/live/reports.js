// Subagent reports pinned to each role room's board. The server (GET /api/office/reports and the `report` feed
// event) is optional: until it answers, every room simply has no reports. Report fields come from agent output, so
// they are normalised here and only ever rendered as text.
export const BOARD_COUNT = 5; // reports shown on a wall board
export const STORE_LIMIT = 20; // reports kept (and fetched) per room
const TEXT_LIMIT = 50_000; // the server sends up to ~20 KB; anything far beyond that is clipped

const str = (value) => (typeof value === 'string' ? value : '');

// A well-formed Report, or null if `raw` isn't one.
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id);
  const role = str(raw.role);
  const at = Number(raw.at);
  if (!id || !role || !Number.isFinite(at)) return null;
  return {
    id,
    role,
    name: str(raw.name),
    task: str(raw.task),
    text: str(raw.text).slice(0, TEXT_LIMIT),
    outcome: raw.outcome === 'failed' ? 'failed' : 'done',
    at,
  };
}

// Newest-first list with `report` merged in (replacing one with the same id), capped at `limit`.
export function mergeReport(list, report, limit = STORE_LIMIT) {
  const rest = list.filter((r) => r.id !== report.id);
  rest.push(report);
  rest.sort((a, b) => b.at - a.at);
  return rest.slice(0, limit);
}

// "just now", "5m ago", "3h ago", "2d ago".
export function relativeTime(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// One line of plain text: whitespace and control characters collapsed, cut to `max` characters with an ellipsis.
export function oneLine(text, max) {
  const flat = str(text).replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…` : flat;
}

// What a board row shows: who and when on top, the task underneath.
export function boardLine(report, now = Date.now(), { nameMax = 22, taskMax = 60 } = {}) {
  return {
    head: oneLine(report.name, nameMax) || 'Agent',
    time: relativeTime(report.at, now),
    task: oneLine(report.task, taskMax) || oneLine(report.text, taskMax) || 'No task recorded',
    failed: report.outcome === 'failed',
  };
}

// Per-room report lists. `onChange(role)` fires when a room's list changed.
export function createReportStore({ roles, onChange }) {
  const lists = new Map(roles.map((role) => [role, []]));

  const add = (raw) => {
    const report = normalizeReport(raw);
    if (!report || !lists.has(report.role)) return;
    lists.set(report.role, mergeReport(lists.get(report.role), report));
    onChange?.(report.role);
  };

  return {
    list: (role) => lists.get(role) ?? [],
    add,
    // Notifies listeners again without a data change (to redraw relative times).
    touch: (role) => onChange?.(role),
    // One GET per room; a missing endpoint, bad JSON or a network error just leaves the room empty.
    async load(role) {
      try {
        const res = await fetch(`/api/office/reports?role=${encodeURIComponent(role)}&limit=${STORE_LIMIT}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!Array.isArray(body?.reports)) return;
        let list = lists.get(role) ?? [];
        for (const raw of body.reports) {
          const report = normalizeReport(raw);
          if (report && report.role === role) list = mergeReport(list, report);
        }
        lists.set(role, list);
        onChange?.(role);
      } catch {
        // server not there yet
      }
    },
  };
}
