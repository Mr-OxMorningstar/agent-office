import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Live feed between Claude Code and the office page, served by the Vite dev server:
//   POST /api/office/events  <- raw Claude Code hook payloads (see tools/office-hook.mjs)
//   GET  /api/office/stream  -> Server-Sent Events: `agent` (create/update), `remove`, and `stats` (per-role
//                               finished/failed subagent tasks today)
//   GET  /api/office/reports?role=&limit= -> { reports }: the final reports of finished subagents, newest first (also
//                               pushed as the SSE event `report`); kept in REPORTS_FILE so they survive restarts
//   GET  /api/office/recent -> the last raw payloads' shape (event name + field names), for checking what hooks send
//   POST /api/office/permission <- Claude Code's PermissionRequest hook (type "http", synchronous). If an office page
//                               is open and visible, the request is held for up to PERMISSION_WAIT_MS so the user can
//                               answer in the office; otherwise (or on timeout) it gets an empty 200 = "no decision",
//                               and Claude Code asks in the terminal as usual.
//   POST /api/office/decide  <- the office page's Approve / Deny for a held permission request
//   POST /api/office/presence <- the office page reporting whether it is visible (heartbeat)
//   GET  /api/office/frame-check?url=... -> { embeddable, reason }: whether a site allows being shown in a frame
//                               (X-Frame-Options / CSP frame-ancestors), for the desk computers
// Every request must carry the dev server's own Host (DNS rebinding) and, if it has an Origin, the dev server's own
// origin. POSTs must be JSON. /events also needs the per-startup token that tools/office-hook.mjs reads from TOKEN_FILE.
// The plugin keeps the current agents in memory so a page that (re)connects gets a snapshot straight away.

const MAX_EVENT_BYTES = 256 * 1024; // the hook trims large tool inputs/results, so real events are far smaller
const MAX_PERMISSION_BYTES = 1_000_000; // carries the whole tool_input (e.g. a Write's content); over this, the terminal asks
const MAX_SMALL_BYTES = 16 * 1024; // presence and decide
const STALE_AFTER_MS = 30 * 60 * 1000; // sessions with no events for this long walk out
const DELEGATING_TOOLS = new Set(['Task', 'Agent']);
const PERMISSION_WAIT_MS = 60_000; // keep below the hook's own timeout (set to 75 s in settings.json)
const PRESENCE_TTL_MS = 45_000; // a page counts as watching if it reported visible this recently
const MAX_AGENTS = 200;
const MAX_CLIENTS = 20;
const MAX_PRESENCE = 50;
const MAX_ROLES = 100;
const MAX_TRACKED_IDS = 500;
const MAX_CWD = 260;
const MAX_NAME = 40;
const MAX_MESSAGE = 300;
const MAX_INPUT_STRING = 10_000; // per string in the tool_input shown on an approval card
const MAX_REPORT_TEXT = 20_000;
const MAX_REPORTS_PER_ROLE = 200;
const REPORTS_DEFAULT_LIMIT = 20;
const REPORTS_MAX_LIMIT = 100;
const REPORTS_FILE_MAX_BYTES = 5 * 1024 * 1024;
const REPORTS_FILE_MAX_LINES = 2000;
const TRANSCRIPT_TAIL_BYTES = 256 * 1024; // a hand-back message sits in the last few lines of a (huge) transcript
const STOP_WAIT_MS = 1500; // how long a finished sync agent waits for its SubagentStop, which may arrive after it
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const REPORTS_FILE = process.env.OFFICE_REPORTS_FILE ?? path.join(os.homedir(), '.claude', 'office', 'reports.jsonl');
const TOKEN_FILE = process.env.OFFICE_TOKEN_FILE ?? path.join(os.homedir(), '.claude', 'office', 'feed-token');

// Background agents return from the Agent tool straight away; the real end is SubagentStop. Structured fields win;
// the text form is only read when the whole response is a plain string that starts with the launch notice.
export function asyncLaunch(response) {
  if (response && typeof response === 'object') {
    if (response.isAsync !== true && response.status !== 'async_launched') return null;
    return { agentId: typeof response.agentId === 'string' ? response.agentId : null };
  }
  if (typeof response !== 'string' || !/^\s*Async agent launched\b/.test(response)) return null;
  return { agentId: response.match(/\bagentId: ([\w-]+)/)?.[1] ?? null };
}

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

// The token file is shared with the hooks and must survive restarts: an existing valid token is reused, and a new one
// is written (tmp file + rename) only when the file is missing or invalid.
function loadOrCreateToken(file) {
  const existing = readTokenFile(file);
  if (existing) return existing;
  const fresh = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, fresh, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return fresh;
}

function readTokenFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8').trim();
    return TOKEN_PATTERN.test(content) ? content : null;
  } catch {
    return null;
  }
}

export default function officeFeedPlugin() {
  const agents = new Map(); // id -> latest agent event
  const clients = new Set();
  const recent = [];
  const pendingSubagents = new Map(); // sessionId -> subagent ids without a tool_use_id, oldest first
  const finishedSubagents = new Set(); // subagent ids already counted, so PostToolUse and SubagentStop don't both count
  const stoppedAgents = new Map(); // `${session}:${agent id}` -> { at }: a SubagentStop that arrived before its launch result
  // Subagent tasks finished / failed per role today (local date), for the team boards. Resets at midnight and
  // when the dev server restarts (in memory only). No prototype, so a role named "__proto__" is just a key.
  let stats = { day: today(), roles: Object.create(null) };
  const pendingPermissions = new Map(); // permission id (random) -> { sessionId, res, timer }
  const presence = new Map(); // page id -> { visible, at }
  const reports = new Map(); // role -> reports, oldest first (at most MAX_REPORTS_PER_ROLE each)
  const reportTexts = new Map(); // `${session}:${agent id}` -> Promise of the report text read when its SubagentStop arrived
  const reportStore = createReportStore(REPORTS_FILE);

  const prunePresence = () => {
    for (const [page, p] of presence) if (Date.now() - p.at >= PRESENCE_TTL_MS) presence.delete(page);
  };
  const someoneWatching = () => [...presence.values()].some((p) => p.visible && Date.now() - p.at < PRESENCE_TTL_MS);

  // Answers a held PermissionRequest hook: with a decision ({ behavior, message? }) or with none, which hands the
  // question back to Claude Code's own prompt.
  const settlePermission = (permissionId, decision) => {
    const pending = pendingPermissions.get(permissionId);
    if (!pending) return false;
    pendingPermissions.delete(permissionId);
    clearTimeout(pending.timer);
    if (!pending.res.writableEnded) {
      if (decision) send(pending.res, 200, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } });
      else send(pending.res, 200);
    }
    const agent = agents.get(pending.sessionId);
    if (agent?.permission?.id === permissionId) {
      const text = decision ? (decision.behavior === 'allow' ? 'Approved in the office' : 'Denied in the office') : agent.text;
      upsert({ ...agent, permission: null, state: decision ? 'thinking' : agent.state, text, at: Date.now() });
    }
    return true;
  };

  const broadcast = (type, data) => {
    const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  };
  const upsert = (agent) => {
    if (!agents.has(agent.id) && agents.size >= MAX_AGENTS) return;
    agents.set(agent.id, agent);
    broadcast('agent', agent);
  };
  const remove = (id) => {
    if (!agents.delete(id)) return;
    broadcast('remove', { id });
  };

  // Names sessions after their project folder, numbering extra sessions in the same folder.
  const nameFor = (sessionId, cwd) => {
    const existing = agents.get(sessionId);
    if (existing) return existing.name;
    const base = cwd ? clip(path.basename(String(cwd)), MAX_NAME) || 'session' : 'session';
    const taken = new Set([...agents.values()].map((a) => a.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} #${n}`)) return `${base} #${n}`;
  };

  const handle = (raw) => {
    const sessionId = raw.session_id;
    const event = raw.hook_event_name;
    if (typeof sessionId !== 'string' || sessionId.length > 100 || !event) return;
    const cwd = typeof raw.cwd === 'string' ? raw.cwd.slice(0, MAX_CWD) : undefined;
    // Any later event from a session means its held permission question was settled elsewhere (e.g. the terminal).
    if (event !== 'PermissionRequest') {
      for (const [id, pending] of pendingPermissions) if (pending.sessionId === sessionId) settlePermission(id, null);
    }
    recent.push({ at: new Date().toISOString(), event, tool: raw.tool_name, fields: Object.keys(raw) });
    if (recent.length > 50) recent.shift();

    // `task` is what the session was last asked to do; it sticks until the next prompt.
    const task = event === 'UserPromptSubmit' ? clip(raw.prompt, 90) : agents.get(sessionId)?.task;
    const session = (state, text) =>
      upsert({ id: sessionId, kind: 'session', name: nameFor(sessionId, cwd), project: cwd ?? null, task, state, text, permission: null, at: Date.now() });

    switch (event) {
      case 'SessionStart':
        return session('idle', 'Session started');
      case 'UserPromptSubmit':
        return session('thinking', `New task: ${clip(raw.prompt, 70)}`);
      case 'PreToolUse':
        if (DELEGATING_TOOLS.has(raw.tool_name)) return startSubagent(raw, cwd);
        return session('working', describeTool(raw.tool_name, raw.tool_input));
      case 'PostToolUse':
        if (DELEGATING_TOOLS.has(raw.tool_name)) return finishSubagent(raw, cwd);
        return session('thinking', `Done: ${shortToolName(raw.tool_name)}`);
      case 'PostToolUseFailure':
        if (DELEGATING_TOOLS.has(raw.tool_name)) return finishSubagent(raw, cwd);
        return session('error', `Failed: ${describeTool(raw.tool_name, raw.tool_input)}`);
      case 'SubagentStart':
        return bindSubagent(raw);
      case 'SubagentStop':
        return stopSubagent(raw, cwd);
      case 'PermissionRequest':
        return session('waiting', `Wants to run: ${describeTool(raw.tool_name, raw.tool_input)}`);
      case 'Notification': {
        const message = raw.message ?? '';
        const needsPermission = raw.notification_type === 'permission_prompt' || /permission/i.test(message);
        return session(needsPermission ? 'waiting' : 'idle', message || 'Waiting for you');
      }
      case 'Stop':
        return session('done', 'Finished — your turn');
      case 'StopFailure':
        return session('error', 'Stopped with an error');
      case 'SessionEnd':
        for (const a of [...agents.values()]) if (a.parentId === sessionId) remove(a.id);
        pendingSubagents.delete(sessionId);
        return remove(sessionId);
      default:
        return undefined;
    }
  };

  // A Task/Agent tool call puts a subagent on the floor until the matching PostToolUse
  // (or, for a background agent, until its SubagentStop).
  const startSubagent = (raw, cwd) => {
    const sessionId = raw.session_id;
    const input = raw.tool_input ?? {};
    const role = clip(input.subagent_type ?? 'general-purpose', MAX_NAME);
    const id = `${sessionId}:${raw.tool_use_id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`;
    if (!raw.tool_use_id) pendingSubagents.set(sessionId, [...(pendingSubagents.get(sessionId) ?? []), id]);

    upsert({ id: sessionId, ...agents.get(sessionId), name: nameFor(sessionId, cwd), kind: 'session', state: 'thinking', text: `Delegated to ${role}`, at: Date.now() });
    const assignment = clip(input.description ?? input.prompt ?? 'Working', 60);
    upsert({ id, kind: 'subagent', parentId: sessionId, role, name: role, task: assignment, state: 'working', text: assignment, at: Date.now() });
  };

  const countFinished = (role, failed) => {
    if (stats.day !== today()) stats = { day: today(), roles: Object.create(null) };
    const key = role in stats.roles || Object.keys(stats.roles).length < MAX_ROLES ? role : 'other';
    const entry = (stats.roles[key] ??= { done: 0, failed: 0 });
    entry[failed ? 'failed' : 'done'] += 1;
    broadcast('stats', stats);
  };

  // Tells a session a subagent reported back, unless the session has already finished its turn.
  const reportBack = (sessionId, cwd) => {
    const parent = agents.get(sessionId);
    if (parent && (parent.state === 'done' || parent.state === 'idle')) return;
    upsert({ ...parent, id: sessionId, kind: 'session', name: nameFor(sessionId, cwd), state: 'thinking', text: 'Subagent reported back', at: Date.now() });
  };

  const addReport = (report) => {
    if (!reports.has(report.role) && reports.size >= MAX_ROLES) return;
    const list = reports.get(report.role) ?? [];
    list.push(report);
    if (list.length > MAX_REPORTS_PER_ROLE) list.shift();
    reports.set(report.role, list);
  };
  for (const report of reportStore.load()) addReport(report);

  // Keeps a finished subagent's final report. The text comes from its SubagentStop (read in stopSubagent); `fallback`
  // is whatever the finishing tool call itself carried. Runs in the background so hook handling isn't held up.
  const captureReport = async (entry, agentId, sessionId, failed, fallback) => {
    try {
      const key = agentId ? `${sessionId}:${agentId}` : null;
      let text = key ? await reportTexts.get(key) : '';
      if (key) reportTexts.delete(key);
      text ||= fallback;
      // The sync agent's PostToolUse can beat its SubagentStop; give the stop a moment.
      for (let waited = 0; !text && key && waited < STOP_WAIT_MS; waited += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        text = await reportTexts.get(key);
        if (text) reportTexts.delete(key);
      }
      const report = {
        id: crypto.randomUUID(),
        role: entry.role,
        name: entry.name,
        task: entry.task ?? '',
        text: String(text || '(no report text)').slice(0, MAX_REPORT_TEXT),
        outcome: failed ? 'failed' : 'done',
        at: Date.now(),
      };
      addReport(report);
      reportStore.append(report, [...reports.values()].flat());
      broadcast('report', report);
    } catch {
      // A report that can't be kept must not affect the feed.
    }
  };

  // Removes a subagent, counts it once, keeps its report and tells its session it reported back.
  const completeSubagent = (id, sessionId, cwd, failed, { agentId, fallback } = {}) => {
    const entry = agents.get(id);
    const role = entry?.role;
    if (role) countFinished(role, failed);
    if (entry?.kind === 'subagent') captureReport(entry, agentId ?? entry.agentId, sessionId, failed, fallback);
    remove(id);
    finishedSubagents.add(id);
    if (finishedSubagents.size > MAX_TRACKED_IDS) finishedSubagents.delete(finishedSubagents.values().next().value);
    reportBack(sessionId, cwd);
  };

  const findByAgentId = (sessionId, agentId) =>
    [...agents.values()].find((a) => a.kind === 'subagent' && a.parentId === sessionId && a.agentId === agentId);

  const finishSubagent = (raw, cwd) => {
    const sessionId = raw.session_id;
    const failed = raw.hook_event_name === 'PostToolUseFailure';
    const launch = failed ? null : asyncLaunch(raw.tool_response);
    let id = raw.tool_use_id ? `${sessionId}:${raw.tool_use_id}` : null;
    if (!id) {
      const queue = pendingSubagents.get(sessionId) ?? [];
      id = launch ? queue[0] : queue.shift();
      if (!launch) pendingSubagents.set(sessionId, queue);
    }
    if (launch) {
      const entry = id ? agents.get(id) : null;
      if (!entry) return undefined;
      if (launch.agentId && stoppedAgents.delete(`${sessionId}:${launch.agentId}`)) {
        return completeSubagent(id, sessionId, cwd, false, { agentId: launch.agentId });
      }
      upsert({ ...entry, async: true, ...(launch.agentId && { agentId: launch.agentId }) });
      if (!raw.tool_use_id) pendingSubagents.set(sessionId, (pendingSubagents.get(sessionId) ?? []).filter((q) => q !== id));
      return undefined;
    }
    if (id && finishedSubagents.has(id)) return undefined; // SubagentStop already reported it
    if (!id || !agents.has(id)) return reportBack(sessionId, cwd);
    const agentId = agents.get(id).agentId ?? (typeof raw.tool_response?.agentId === 'string' ? raw.tool_response.agentId : undefined);
    if (agentId) stoppedAgents.delete(`${sessionId}:${agentId}`);
    return completeSubagent(id, sessionId, cwd, failed, { agentId, fallback: responseText(raw) });
  };

  // SubagentStart tells which agent id belongs to the oldest launched subagent of that role without one yet.
  const bindSubagent = (raw) => {
    if (!raw.agent_id || findByAgentId(raw.session_id, raw.agent_id)) return;
    const entry = [...agents.values()].find((a) => a.kind === 'subagent' && a.parentId === raw.session_id && !a.agentId && a.role === raw.agent_type);
    if (entry) upsert({ ...entry, agentId: raw.agent_id });
  };

  const stopSubagent = (raw, cwd) => {
    const entry = raw.agent_id ? findByAgentId(raw.session_id, raw.agent_id) : null;
    if (typeof raw.agent_id === 'string') {
      reportTexts.set(`${raw.session_id}:${raw.agent_id}`, readReportText(raw));
      if (reportTexts.size > MAX_TRACKED_IDS) reportTexts.delete(reportTexts.keys().next().value);
    }
    // Only a launch-confirmed background agent ends here; a sync agent's PostToolUse / PostToolUseFailure says how it went.
    if (entry?.async) return completeSubagent(entry.id, raw.session_id, cwd, false);
    if (typeof raw.agent_id === 'string') {
      stoppedAgents.set(`${raw.session_id}:${raw.agent_id}`, { at: Date.now() }); // stopped before its launch result arrived?
      if (stoppedAgents.size > MAX_TRACKED_IDS) stoppedAgents.delete(stoppedAgents.keys().next().value);
    }
    return undefined;
  };

  return {
    name: 'office-feed',
    configureServer(server) {
      // Only the real dev server owns the feed: a middleware-mode / SSR server (scripts loading modules) has no
      // httpServer and must not touch the token or reports files.
      if (server.config.server.middlewareMode || !server.httpServer) return;
      const port = server.config.server.port;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      fs.mkdirSync(path.dirname(REPORTS_FILE), { recursive: true });
      // Re-read when the file changes, so the server and the hooks agree even if something rewrites it.
      let token = loadOrCreateToken(TOKEN_FILE);
      let tokenMtime = fs.statSync(TOKEN_FILE).mtimeMs;
      const currentToken = () => {
        try {
          const { mtimeMs } = fs.statSync(TOKEN_FILE);
          if (mtimeMs !== tokenMtime) {
            tokenMtime = mtimeMs;
            token = readTokenFile(TOKEN_FILE) ?? token;
          }
        } catch {
          // File gone: keep the token in memory.
        }
        return token;
      };

      const sweep = setInterval(() => {
        const cutoff = Date.now() - STALE_AFTER_MS;
        for (const a of [...agents.values()]) {
          // A background agent can outlive the stale window while its session is still active.
          if (a.kind === 'subagent' && a.agentId && (agents.get(a.parentId)?.at ?? 0) >= cutoff) continue;
          if (a.at < cutoff) remove(a.id);
        }
        for (const [key, s] of stoppedAgents) if (s.at < cutoff) stoppedAgents.delete(key);
        prunePresence();
      }, 60_000);
      sweep.unref();
      server.httpServer?.on('close', () => clearInterval(sweep));

      const hasToken = (req) => {
        const given = Buffer.from(String(req.headers['x-office-token'] ?? ''));
        const expected = Buffer.from(currentToken());
        return given.length === expected.length && crypto.timingSafeEqual(given, expected);
      };

      // First in line: refuses a foreign Host (DNS rebinding) and, on the feed's own paths, a foreign Origin or a POST
      // that isn't JSON (so a web page can't send it as a "simple" cross-site request).
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host;
        if (!host || !allowedHosts.has(host.toLowerCase())) return send(res, 403, { error: 'forbidden host' });
        if (!/^\/api\/office(\/|\?|$)/i.test(req.url)) return next();
        const origin = req.headers.origin;
        if (origin !== undefined && origin !== `http://${host}`) return send(res, 403, { error: 'forbidden origin' });
        if (req.method === 'POST' && !/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
          return send(res, 415, { error: 'application/json only' });
        }
        next();
      });

      server.middlewares.use('/api/office/events', (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        if (!hasToken(req)) return send(res, 401, { error: 'missing or wrong token' });
        readJson(req, MAX_EVENT_BYTES)
          .then((raw) => {
            handle(raw);
            send(res, 204);
          })
          .catch((err) => send(res, 400, { error: err.message }));
      });

      server.middlewares.use('/api/office/stream', (req, res) => {
        if (clients.size >= MAX_CLIENTS) return send(res, 503, { error: 'too many listeners' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        for (const agent of agents.values()) res.write(`event: agent\ndata: ${JSON.stringify(agent)}\n\n`);
        res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
        res.write('event: ready\ndata: {}\n\n');
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
      });

      server.middlewares.use('/api/office/reports', (req, res) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
        const params = new URL(req.url, 'http://office.local').searchParams;
        const role = params.get('role');
        const asked = Number.parseInt(params.get('limit') ?? '', 10);
        const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), REPORTS_MAX_LIMIT) : REPORTS_DEFAULT_LIMIT;
        const pool = role === null ? [...reports.values()].flat() : (reports.get(role) ?? []);
        send(res, 200, { reports: pool.toSorted((a, b) => b.at - a.at).slice(0, limit) });
      });

      server.middlewares.use('/api/office/recent', (req, res) => send(res, 200, recent));

      server.middlewares.use('/api/office/permission', (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        readJson(req, MAX_PERMISSION_BYTES)
          .then((raw) => {
            handle(raw);
            if (!someoneWatching() || typeof raw.session_id !== 'string') return send(res, 200); // no decision: the terminal asks
            // The office shows one question per session; an older one still held goes back to the terminal.
            for (const [id, pending] of pendingPermissions) if (pending.sessionId === raw.session_id) settlePermission(id, null);
            const permissionId = crypto.randomUUID();
            const timer = setTimeout(() => settlePermission(permissionId, null), PERMISSION_WAIT_MS);
            pendingPermissions.set(permissionId, { sessionId: raw.session_id, res, timer });
            req.on('close', () => {
              if (!res.writableEnded) settlePermission(permissionId, null);
            });
            const agent = agents.get(raw.session_id);
            const input = limitInput(raw.tool_input);
            upsert({
              ...agent,
              permission: {
                id: permissionId,
                tool: raw.tool_name,
                summary: describeTool(raw.tool_name, raw.tool_input),
                input: input.value,
                truncated: input.truncated,
                until: Date.now() + PERMISSION_WAIT_MS,
              },
            });
          })
          .catch((err) => send(res, 400, { error: err.message }));
      });

      server.middlewares.use('/api/office/decide', (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        readJson(req, MAX_SMALL_BYTES)
          .then(({ id, behavior, message }) => {
            if (behavior !== 'allow' && behavior !== 'deny') return send(res, 400, { error: 'behavior must be allow or deny' });
            const reason = typeof message === 'string' && message ? message.slice(0, MAX_MESSAGE) : 'Denied by the user from the office.';
            const decision = behavior === 'deny' ? { behavior, message: reason } : { behavior };
            send(res, settlePermission(id, decision) ? 204 : 404);
          })
          .catch((err) => send(res, 400, { error: err.message }));
      });

      server.middlewares.use('/api/office/frame-check', (req, res) => {
        if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
        const target = new URL(req.url, 'http://office.local').searchParams.get('url');
        frameCheck(target).then((result) => send(res, 200, result));
      });

      server.middlewares.use('/api/office/presence', (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
        readJson(req, MAX_SMALL_BYTES)
          .then(({ page, visible }) => {
            prunePresence();
            const key = String(page ?? '').slice(0, 64);
            if (key && (presence.has(key) || presence.size < MAX_PRESENCE)) presence.set(key, { visible: Boolean(visible), at: Date.now() });
            send(res, 204);
          })
          .catch((err) => send(res, 400, { error: err.message }));
      });
    },
  };
}

// True for addresses a public web page has no business reaching: private, link-local, shared, multicast and
// reserved ranges. Loopback is allowed (local dev sites on the desk computers).
function isPrivateAddress(address) {
  if (net.isIPv6(address)) {
    const a = address.toLowerCase();
    if (a === '::1') return false;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return a === '::' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith('ff');
  }
  const [a, b] = address.split('.').map(Number);
  if (a === 127) return false;
  return a === 0 || a === 10 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function resolvesPublicly(hostname) {
  const records = await dns.lookup(hostname.replace(/^\[|\]$/g, ''), { all: true });
  return records.length > 0 && records.every((r) => !isPrivateAddress(r.address));
}

// Reads a site's framing headers. Blocked: X-Frame-Options DENY/SAMEORIGIN, or a CSP frame-ancestors that doesn't
// allow any origin. embeddable is null when the site couldn't be reached. Uses HEAD (GET if the site refuses it) and
// follows a few redirects by hand so every hop can be checked against the private ranges.
async function frameCheck(url) {
  let parsed;
  try {
    parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('not http(s)');
  } catch {
    return { embeddable: false, reason: 'Not an http(s) URL' };
  }
  try {
    let method = 'HEAD';
    for (let hops = 0; hops <= 3; ) {
      if (!(await resolvesPublicly(parsed.hostname))) return { embeddable: null, reason: 'Address not allowed' };
      const res = await fetch(parsed, { method, redirect: 'manual', signal: AbortSignal.timeout(6000) });
      res.body?.cancel().catch(() => {});
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
        method = 'GET';
        continue;
      }
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location) {
        parsed = new URL(location, parsed);
        if (!/^https?:$/.test(parsed.protocol)) return { embeddable: null, reason: 'Redirected to a non-http(s) URL' };
        hops += 1;
        continue;
      }
      const xfo = (res.headers.get('x-frame-options') ?? '').toLowerCase();
      if (xfo.includes('deny') || xfo.includes('sameorigin')) return { embeddable: false, reason: `X-Frame-Options: ${xfo}` };
      const ancestors = (res.headers.get('content-security-policy') ?? '').match(/frame-ancestors([^;]*)/i)?.[1]?.trim();
      if (ancestors !== undefined && !ancestors.split(/\s+/).includes('*')) return { embeddable: false, reason: `CSP frame-ancestors ${ancestors || "'none'"}` };
      return { embeddable: true, reason: 'No framing restrictions' };
    }
    return { embeddable: null, reason: 'Too many redirects' };
  } catch (err) {
    return { embeddable: null, reason: `Couldn't reach it (${err.cause?.code ?? err.code ?? err.name})` };
  }
}

// A tool response's own text, for when no SubagentStop carried the report (office-hook.mjs drops nested content).
function responseText(raw) {
  const r = raw.tool_response;
  if (typeof r === 'string') return r;
  return [r?.result, r?.text, r?.error, raw.error].find((v) => typeof v === 'string' && v) ?? '';
}

// The final report of the subagent a SubagentStop describes. Prefers the message it handed back (a SubagentHandback /
// SendMessage call at the end of its transcript, where the last assistant text is only a preamble), then the stop's
// own last_assistant_message, then the transcript's last assistant text. Never rejects.
async function readReportText(raw) {
  const fromStop = typeof raw.last_assistant_message === 'string' ? raw.last_assistant_message : '';
  const found = await readTranscriptTail(raw.agent_transcript_path);
  return found.handback || fromStop || found.text;
}

async function readTranscriptTail(file) {
  const found = { handback: '', text: '' };
  if (typeof file !== 'string' || !file.endsWith('.jsonl')) return found;
  let handle;
  try {
    // Only the Claude Code projects folder is readable, whatever path the payload names (symlinks and .. resolved).
    const [real, root] = await Promise.all([fs.promises.realpath(file), fs.promises.realpath(PROJECTS_DIR)]);
    const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
    if (!norm(real).startsWith(norm(root) + path.sep)) return found;
    handle = await fs.promises.open(real, 'r');
    const { size } = await handle.stat();
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n');
    if (size > length) lines.shift(); // starts mid-line
    for (const line of lines.reverse()) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry?.message?.role !== 'assistant' || !Array.isArray(entry.message.content)) continue;
      const blocks = entry.message.content;
      const call = blocks.findLast((b) => b.type === 'tool_use' && (b.name === 'SubagentHandback' || b.name === 'SendMessage'));
      if (typeof call?.input?.message === 'string' && call.input.message) {
        found.handback = call.input.message;
        break;
      }
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (text && !found.text) found.text = text;
    }
  } catch {
    // Unreadable or missing transcript: the other sources are used.
  } finally {
    await handle?.close().catch(() => {});
  }
  return found;
}

// reports.jsonl: one report per line, appended without blocking; rewritten with the newest ones once it grows too big.
function createReportStore(file) {
  let queue = Promise.resolve();
  let lines = 0;
  let bytes = 0;
  const valid = (r) =>
    r && typeof r.id === 'string' && typeof r.role === 'string' && typeof r.name === 'string' && typeof r.task === 'string' &&
    typeof r.text === 'string' && (r.outcome === 'done' || r.outcome === 'failed') && Number.isFinite(r.at);
  return {
    load() {
      const loaded = [];
      try {
        const content = fs.readFileSync(file, 'utf8');
        bytes = Buffer.byteLength(content);
        for (const line of content.split('\n')) {
          if (!line) continue;
          lines += 1;
          try {
            const r = JSON.parse(line);
            if (valid(r)) loaded.push({ id: r.id, role: r.role, name: r.name, task: r.task, text: r.text.slice(0, MAX_REPORT_TEXT), outcome: r.outcome, at: r.at });
          } catch {
            // A torn line (e.g. a crash mid-write) is skipped.
          }
        }
      } catch {
        // No file yet.
      }
      return loaded.sort((a, b) => a.at - b.at);
    },
    // `all` is every report kept in memory, used if the file has to be rewritten.
    append(report, all) {
      const line = `${JSON.stringify(report)}\n`;
      lines += 1;
      bytes += Buffer.byteLength(line);
      let keep = null;
      if (lines > REPORTS_FILE_MAX_LINES || bytes > REPORTS_FILE_MAX_BYTES) {
        // Back down to 3/4 of the limits, keeping the newest.
        keep = [];
        let size = 0;
        for (const r of all.toSorted((a, b) => b.at - a.at)) {
          const l = `${JSON.stringify(r)}\n`;
          size += Buffer.byteLength(l);
          if (keep.length >= REPORTS_FILE_MAX_LINES * 0.75 || size > REPORTS_FILE_MAX_BYTES * 0.75) break;
          keep.push(l);
        }
        keep.reverse();
        lines = keep.length;
        bytes = keep.reduce((n, l) => n + Buffer.byteLength(l), 0);
      }
      const write = keep
        ? () => fs.promises.writeFile(`${file}.tmp`, keep.join(''), { mode: 0o600 }).then(() => fs.promises.rename(`${file}.tmp`, file))
        : () => fs.promises.appendFile(file, line, { mode: 0o600 });
      queue = queue.then(write).catch(() => {}); // the in-memory copy still serves the page
    },
  };
}

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// The tool_input as shown on an approval card: whole, except that very long strings and deep nesting are cut.
function limitInput(input) {
  let truncated = false;
  const walk = (v, level) => {
    if (typeof v === 'string') {
      if (v.length <= MAX_INPUT_STRING) return v;
      truncated = true;
      return v.slice(0, MAX_INPUT_STRING);
    }
    if (v === null || typeof v !== 'object') return v;
    if (level >= 4) {
      truncated = true;
      return null;
    }
    if (Array.isArray(v)) {
      if (v.length > 50) truncated = true;
      return v.slice(0, 50).map((item) => walk(item, level + 1));
    }
    return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, walk(item, level + 1)]));
  };
  const value = walk(input ?? null, 0);
  return { value, truncated };
}

function send(res, status, body) {
  res.statusCode = status;
  if (body === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// One-line summary of a tool call for the agent's speech bubble.
function describeTool(name = 'tool', input = {}) {
  const file = (p) => (p ? path.basename(p) : '');
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      return `$ ${clip(input.command, 60)}`;
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `${name} ${file(input.file_path ?? input.notebook_path)}`;
    case 'Grep':
      return `Search code for "${clip(input.pattern, 40)}"`;
    case 'Glob':
      return `Find files ${clip(input.pattern, 40)}`;
    case 'WebFetch':
      return `Fetch ${hostname(input.url)}`;
    case 'WebSearch':
      return `Web search "${clip(input.query, 40)}"`;
    default:
      return shortToolName(name);
  }
}

// mcp__claude_ai_Google_Drive__search_files -> "Google_Drive › search_files"
function shortToolName(name = 'tool') {
  const mcp = name.match(/^mcp__(.+?)__(.+)$/);
  if (!mcp) return name;
  return `${mcp[1].replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, '')} › ${mcp[2]}`;
}

function hostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'a page';
  }
}

function clip(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
