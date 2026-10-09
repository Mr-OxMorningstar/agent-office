#!/usr/bin/env node
// Claude Code hook: forwards the hook's JSON (stdin) to the office dev server's live feed.
// It prints nothing (UserPromptSubmit hooks add stdout to the conversation), gives up after a timeout,
// and always exits 0, so a closed office never slows down or breaks a Claude Code session.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FEED_URL = process.env.OFFICE_FEED_URL ?? 'http://127.0.0.1:5173/api/office/events';
const TOKEN_FILE = process.env.OFFICE_TOKEN_FILE ?? path.join(os.homedir(), '.claude', 'office', 'feed-token');
const ERROR_LOG = process.env.OFFICE_HOOK_ERROR_LOG ?? path.join(os.homedir(), '.claude', 'office', 'hook-errors.log');
const ERROR_LOG_MAX_BYTES = 100 * 1024;
const TIMEOUT_MS = 2000; // hooks run async, so waiting longer costs the session nothing and avoids dropping events
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// The feed only reads short fields, so large tool inputs and results (file contents, agent reports) are cut down
// before sending; this keeps every event well under the server's body limit.
const trimStrings = (obj, max) => {
  if (typeof obj === 'string') return obj.slice(0, max);
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v === null || typeof v !== 'object')
      .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, max) : v]),
  );
};
const slim = (text) => {
  try {
    const raw = JSON.parse(text);
    if ('tool_input' in raw) raw.tool_input = trimStrings(raw.tool_input, 1000);
    if ('tool_response' in raw) raw.tool_response = trimStrings(raw.tool_response, 2000);
    for (const key of ['prompt', 'message']) if (typeof raw[key] === 'string') raw[key] = raw[key].slice(0, 2000);
    return JSON.stringify(raw);
  } catch {
    return text;
  }
};

const isLoopback = (url) => {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

// One line per rejected event, so a stale token doesn't fail silently. The log is cut to its newest half when too big.
const logRejected = (status) => {
  try {
    let event = '?';
    try {
      event = String(JSON.parse(body).hook_event_name ?? '?').slice(0, 40);
    } catch {
      // Not JSON: logged as unknown.
    }
    fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
    if (fs.existsSync(ERROR_LOG) && fs.statSync(ERROR_LOG).size > ERROR_LOG_MAX_BYTES) {
      const tail = fs.readFileSync(ERROR_LOG, 'utf8').slice(-ERROR_LOG_MAX_BYTES / 2);
      fs.writeFileSync(ERROR_LOG, tail.slice(tail.indexOf('\n') + 1));
    }
    fs.appendFileSync(ERROR_LOG, `${new Date().toISOString()} ${event} ${status}\n`);
  } catch {
    // Logging must never disturb the session.
  }
};

let body = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) body += chunk;

if (isLoopback(FEED_URL)) {
  try {
    const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    const res = await fetch(FEED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token },
      body: slim(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) logRejected(res.status);
  } catch {
    // Office not running (or slow, or no token yet): ignore.
  }
}
process.exit(0);
