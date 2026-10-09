// Subscribes to the dev server's live agent feed (tools/vite-plugin-office-feed.js). EventSource reconnects on its
// own; after each (re)connect the server replays every live agent and then sends `ready`, so onSync can drop
// agents that went away while the page was disconnected.
export function connectOfficeFeed({ onAgent, onRemove, onSync, onStats, onReport, onStatus }) {
  const source = new EventSource('/api/office/stream');
  let seen = new Set();

  source.addEventListener('open', () => {
    seen = new Set();
    onStatus?.('live');
  });
  source.addEventListener('error', () => onStatus?.('offline'));
  source.addEventListener('agent', (e) => {
    const agent = JSON.parse(e.data);
    seen.add(agent.id);
    onAgent(agent);
  });
  source.addEventListener('remove', (e) => onRemove(JSON.parse(e.data).id));
  source.addEventListener('stats', (e) => onStats?.(JSON.parse(e.data)));
  source.addEventListener('report', (e) => {
    try {
      onReport?.(JSON.parse(e.data));
    } catch {
      // a malformed report is dropped
    }
  });
  source.addEventListener('ready', () => onSync?.(seen));

  // Tell the server whether this page is open and visible, so it only holds permission questions for the office
  // while someone can actually answer them here.
  const page = Math.random().toString(36).slice(2);
  const reportPresence = () =>
    fetch('/api/office/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, visible: document.visibilityState === 'visible' }),
    }).catch(() => {});
  reportPresence();
  document.addEventListener('visibilitychange', reportPresence);
  setInterval(reportPresence, 20_000);

  return source;
}

// Answers a permission question an agent is waiting on. Resolves true if the agent got the answer.
export async function decidePermission(id, behavior) {
  try {
    const res = await fetch('/api/office/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, behavior }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
