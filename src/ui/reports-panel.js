import { relativeTime } from '../live/reports.js';

// The info panel's view of one room's reports: a list, and a full-text page for the one picked. Every report
// field goes in as text (the info panel never parses HTML), as they come from agent output.
export function createReportsPanel({ infoPanel, store, show }) {
  let team = null;
  let selectedId = null;
  let heading = null; // what the panel was last opened with here, to tell if something else has replaced it

  const render = (keepScroll) => {
    const reports = store.list(team.role);
    const selected = reports.find((r) => r.id === selectedId);
    heading = `${team.icon} ${team.name} · Reports`;
    const content = selected
      ? {
          heading,
          badge: selected.outcome === 'failed' ? 'FAILED' : 'DONE',
          note: `${selected.name || 'Agent'} · ${relativeTime(selected.at)}\n${selected.task}`,
          actions: [{ label: '← All reports', onClick: () => open(team) }],
          text: selected.text || 'This report has no text.',
          keepScroll,
        }
      : {
          heading,
          note: reports.length ? 'Reports from subagents that finished in this room, newest first. Pick one to read it in full.' : 'No reports yet. When a subagent finishes here, its final report is pinned to this board.',
          rows: reports.map((r) => ({
            title: `${r.outcome === 'failed' ? '⚠️ ' : ''}${r.name || 'Agent'} · ${relativeTime(r.at)}`,
            subtitle: r.task || r.text,
            failed: r.outcome === 'failed',
            onClick: () => {
              selectedId = r.id;
              render(false);
            },
          })),
          keepScroll,
        };
    if (selectedId && !selected) selectedId = null;
    if (keepScroll) infoPanel.open(content);
    else show(content);
  };

  function open(room) {
    team = room;
    selectedId = null;
    render(false);
  }

  return {
    open,
    // A report arrived for `role`: redraw if this room's reports are on screen, keeping the scroll position.
    refresh(role) {
      if (team?.role === role && infoPanel.isOpen && infoPanel.heading === heading) render(true);
    },
  };
}
