import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import roles from 'virtual:agent-roles';
import skills from 'virtual:skills';
import atlasOpsBacklog from './data/atlasops-backlog.json';
import atlasOpsData from './data/atlasops-sample.json';
import hq from './data/agent-hq.json';
import { Agent } from './agents/agent.js';
import { createCrew } from './agents/crew.js';
import { connectOfficeFeed, decidePermission } from './live/office-feed.js';
import { BOARD_COUNT, createReportStore } from './live/reports.js';
import { runDemoRoutine } from './agents/routine.js';
import { createPlayer } from './player/player.js';
import { createViewModes, VIEW_MODES } from './player/view-modes.js';
import { createComputers } from './ui/computers.js';
import { createInfoPanel } from './ui/info-panel.js';
import { createOfficeTv } from './ui/office-tv.js';
import { createReportsPanel } from './ui/reports-panel.js';
import { createOrientationGate } from './ui/orientation-gate.js';
import { createSkillsPanel } from './ui/skills-panel.js';
import { isTouchDevice } from './ui/touch-device.js';
import { createTouchControls } from './ui/touch-controls.js';
import { collectColliders } from './world/collision.js';
import { createInteractables } from './world/interactables.js';
import { createInteraction } from './world/interaction.js';
import { createCamera } from './world/settings/camera.js';
import { addLighting } from './world/settings/lighting.js';
import { accountTotal } from './world/hq/atlasops-wing.js';
import { TEAMS } from './world/hq/team-room.js';
import { buildOffice } from './world/settings/office.js';

const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // transparent, so the page's backdrop shows
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

// HTML overlay for name tags and status bubbles, kept crisp at any zoom.
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'label-layer';
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();

const office = buildOffice({ skills, hq, atlasOps: { data: atlasOpsData, backlog: atlasOpsBacklog } });
scene.add(office.group);
addLighting(scene, office.layout);

// Live agents: one per Claude Code session (and per running subagent), fed by the dev server from Claude Code hooks.
const colliders = collectColliders(office.group);
const agentCount = document.getElementById('agent-count');
const feedStatus = document.getElementById('feed-status');
let roleStats = {}; // role -> { done, failed } today, from the feed

// What a team board shows: the role definition (~/.claude/agents), who is at its desks, what's blocked or waiting
// on the user, and today's finished / failed subagent tasks.
const NEEDS_YOU = new Set(['waiting', 'error']);
const teamView = (room, cards) => {
  const atDesks = cards.filter((c) => c.room === room.id);
  return {
    role: roles[room.role],
    working: atDesks,
    blocked: atDesks.filter((c) => NEEDS_YOU.has(c.state)),
    done: roleStats[room.role]?.done ?? 0,
    failed: roleStats[room.role]?.failed ?? 0,
  };
};

// Banner listing agents waiting for a yes/no from the user; clicking it opens the first one's panel.
const needsYouBanner = document.getElementById('needs-you');
const showNeedsYou = () => {
  const asking = crew.askingPermission();
  needsYouBanner.hidden = !asking.length;
  if (!asking.length) return;
  const first = asking[0].data;
  needsYouBanner.querySelector('span').textContent =
    asking.length === 1 ? `${first.name} needs you: ${first.permission.summary}` : `${asking.length} agents need you`;
};
needsYouBanner.addEventListener('click', () => {
  const [first] = crew.askingPermission();
  if (first) showAgent(first);
});

// Redraws everything that reflects the crew: HUD count, planning board, team boards, desk monitors, status wall.
const refreshOffice = () => {
  showNeedsYou();
  const cards = crew.cards();
  const onBreak = crew.onBreak ? ` · ${crew.onBreak} on a break` : '';
  agentCount.textContent = `${crew.count} ${crew.count === 1 ? 'agent' : 'agents'} on the floor${onBreak}`;
  office.planningBoard.setCards(cards);

  const leads = cards.filter((c) => c.room === 'boardroom');
  const rows = [{ icon: '📋', name: 'Leads (boardroom)', color: 0x3b82c4, atDesks: leads.length, needsYou: leads.filter((c) => NEEDS_YOU.has(c.state)).length, done: '–', failed: '–' }];
  for (const room of TEAMS) {
    const view = teamView(room, cards);
    const zone = office.roleRooms[room.id];
    zone.setBoard(view);
    const seats = [null, null, null, null];
    for (const c of view.working) if (c.seat !== null) seats[c.seat] = c.state;
    zone.setSeats(seats);
    rows.push({ icon: room.icon, name: room.name, color: room.color, atDesks: view.working.length, needsYou: view.blocked.length, done: view.done, failed: view.failed });
  }
  office.statusWall.setRows(rows);
};

// Subagent reports pinned to each room's board. Their endpoints may not exist yet; the boards then stay empty.
const ROOM_BY_ROLE = Object.fromEntries(TEAMS.map((room) => [room.role, room]));
const reportStore = createReportStore({
  roles: TEAMS.map((room) => room.role),
  onChange: (role) => {
    office.roleRooms[ROOM_BY_ROLE[role].id].setReports(reportStore.list(role).slice(0, BOARD_COUNT));
    reportsPanel?.refresh(role);
  },
});
let reportsPanel;

const crew = createCrew({ scene, layout: office.layout, colliders, onChange: refreshOffice });
refreshOffice();
connectOfficeFeed({
  onAgent: (data) => {
    crew.upsert(data);
    refreshOffice();
  },
  onRemove: (id) => {
    crew.remove(id);
    refreshOffice();
  },
  onSync: (ids) => {
    crew.sync(ids);
    refreshOffice();
  },
  onStats: (stats) => {
    roleStats = stats.roles;
    refreshOffice();
  },
  onReport: (report) => reportStore.add(report),
  onStatus: (status) => {
    feedStatus.dataset.status = status;
    feedStatus.textContent = status === 'live' ? 'Live feed connected' : 'Live feed offline';
  },
});

for (const room of TEAMS) reportStore.load(room.role);
// Relative times on the boards age, so redraw them now and then.
setInterval(() => {
  for (const room of TEAMS) reportStore.touch(room.role);
}, 60_000);

// ?demo shows the scripted walk-through agent from before the live feed existed.
const agents = [];
if (new URLSearchParams(location.search).has('demo')) {
  const demo = new Agent({ name: 'Demo agent', color: 0x7a8aa0 });
  scene.add(demo.object);
  runDemoRoutine(demo, office.layout.spots);
  agents.push(demo);
}

const { camera, controls } = createCamera(renderer.domElement, office.layout);

const interactables = createInteractables(office.group, scene);
const player = createPlayer({ scene, camera, controls, layout: office.layout, colliders });

// View switcher: Overview / Third person / First person, via the buttons or V.
const viewSwitch = document.getElementById('view-switch');
const viewButtons = VIEW_MODES.map(({ id, label }) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.mode = id;
  button.addEventListener('click', () => view.setMode(id));
  viewSwitch.append(button);
  return button;
});
const showViewMode = (mode) => {
  document.body.dataset.view = mode;
  for (const b of viewButtons) b.classList.toggle('is-active', b.dataset.mode === mode);
};
const view = createViewModes({ camera, controls, domElement: renderer.domElement, player, onChange: showViewMode });
showViewMode(view.mode);
document.addEventListener('pointerlockchange', () => document.body.classList.toggle('is-locked', view.isLocked()));

// Skills board: hover highlights a skill, clicking it opens its details; clicking elsewhere on the board opens the list.
const skillsPanel = createSkillsPanel(skills);
const infoPanel = createInfoPanel();
// Game room TV: paste a YouTube link to play music while working; it keeps playing in a mini-player.
const officeTv = createOfficeTv({ tv: office.tv });
// Desk computers: open a URL on one, or share a window from the desktop onto its monitor.
const computers = createComputers({ setScreen: (info, texture) => office.roleRooms[info.room].setScreenContent(info.seat, texture) });
// In the player views, clicks aim from the crosshair (screen centre) once the mouse is captured, and are
// ignored before that (the first click only captures the mouse). Touch has no pointer lock, so a tap aims at the finger.
const screenCentre = new THREE.Vector2(0, 0);
const interaction = createInteraction(camera, renderer.domElement, {
  getPointer: () => (view.mode === 'overview' ? undefined : view.isLocked() ? screenCentre : isTouchDevice() ? undefined : null),
});
interaction.register(office.skillsBoard.surface, {
  onHover(uv) {
    office.skillsBoard.setHighlight(uv ? office.skillsBoard.skillAt(uv) : null);
    return true;
  },
  onClick(uv) {
    releasePointer();
    infoPanel.close();
    skillsPanel.open(office.skillsBoard.skillAt(uv));
  },
});

// Report boards: clicking one opens that room's reports, same as pressing E beside it.
for (const room of TEAMS) {
  interaction.register(office.roleRooms[room.id].reportSurface, {
    onClick: () => {
      releasePointer();
      reportsPanel.open(room);
    },
  });
}

// Knowledge hub: each filing box (and the sign) opens its page in Google Drive; the tooltip shows its full name.
const openInDrive = (item) => window.open(item.url, '_blank', 'noopener');
for (const box of office.knowledgeHub.boxes) {
  interaction.register(box.mesh, {
    onHover(uv) {
      box.setHighlight(Boolean(uv));
      renderer.domElement.title = uv ? `${box.item.title} — open in Google Drive` : '';
      return true;
    },
    onClick: () => openInDrive(box.item),
  });
}
interaction.register(office.knowledgeHub.sign, {
  onHover(uv) {
    renderer.domElement.title = uv ? `${hq.root.title} — open in Google Drive` : '';
    return true;
  },
  onClick: () => openInDrive(hq.root),
});

// AtlasOps wing panels. Spend, findings and scans come from the sample file until AtlasOps is connected (badged
// SAMPLE); the backlog is a snapshot of the HQ automation backlog.
const usd = (n) => `$${n.toFixed(2)}`;
function atlasPanel(panel) {
  const data = atlasOpsData;
  const sampleBadge = data.sample ? 'SAMPLE DATA — not connected' : undefined;
  const name = (id) => data.cloud_connections.find((c) => c.id === id)?.name ?? id;
  switch (panel) {
    case 'spend':
    case 'table':
      return {
        heading: panel === 'table' ? '🛰️ War table' : '🛰️ AtlasOps · Spend',
        badge: sampleBadge,
        note: `Actual spend, ${data.cost_by_service.period} (Cost Explorer is the source of truth). ${data.sample ? data.note : ''}`,
        sections: data.cloud_connections.map((c) => ({
          heading: `${c.name} · ${c.account_id} · ${usd(accountTotal(data, c.id))}`,
          rows: (data.cost_by_service[c.id] ?? []).map((s) => ({ title: s.service, subtitle: usd(s.amount) })),
        })),
      };
    case 'findings':
      return {
        heading: 'Findings',
        badge: sampleBadge,
        sections: ['critical', 'high', 'medium', 'low'].map((sev) => ({
          heading: sev,
          rows: data.aws_findings
            .filter((f) => f.severity === sev)
            .map((f) => ({ title: f.title, subtitle: `${name(f.connection)} · ${f.region} · ${f.category}${f.monthly_cost ? ` · ${usd(f.monthly_cost)}/mo` : ''}` })),
        })),
      };
    case 'scans':
      return {
        heading: 'Scan status',
        badge: sampleBadge,
        rows: data.aws_scan_results.map((s) => ({
          title: `${name(s.connection)} · ${s.region} — ${s.status}`,
          subtitle: s.scanned_at ? `${new Date(s.scanned_at).toLocaleString()} · ${s.resources} resources · ${s.findings} findings` : 'Never completed',
        })),
      };
    case 'backlog':
      return {
        heading: 'Automation backlog',
        badge: `${atlasOpsBacklog.items.length} items · next ${atlasOpsBacklog.nextId}`,
        note: `Every manual DevOps task becomes an AUTO item. ${atlasOpsBacklog.source}.`,
        sections: ['CRITICAL', 'HIGH', 'MED', 'LOW'].map((p) => ({
          heading: p,
          rows: atlasOpsBacklog.items
            .filter((i) => i.priority === p)
            .map((i) => ({ title: `${i.id} · ${i.title}`, subtitle: `${i.surfaces.join(' + ')} · ${i.freq} · effort ${i.effort}${i.note ? ` · ${i.note}` : ''}` })),
        })),
      };
    default:
      return {
        heading: 'Rule 4 capture desk',
        note: `Not connected yet. Once the office server watches session commands (aws, az, terraform/tofu, kubectl), each manual infra step shows up here as a card to capture as ${atlasOpsBacklog.nextId}.`,
      };
  }
}

// What pressing E does next to each kind of interactable (see userData.interact in the room builders).
// Panels need the mouse back, so opening one releases the captured pointer.
const releasePointer = () => {
  if (document.pointerLockElement) document.exitPointerLock();
};
const showInfo = (content) => {
  releasePointer();
  skillsPanel.close();
  officeTv.close();
  computers.close();
  infoPanel.open(content);
};
// An agent's panel. If it's waiting on a permission question held for the office, it gets Approve / Deny buttons.
function showAgent(member) {
  const info = crew.describe(member);
  const permission = member.data.permission;
  if (permission) {
    const secondsLeft = Math.max(0, Math.round((permission.until - Date.now()) / 1000));
    info.note = `Wants to run: ${permission.summary}\n\nAnswer here within ${secondsLeft}s, or it falls back to the terminal prompt.`;
    const answer = (behavior) => async (button) => {
      button.disabled = true;
      const ok = await decidePermission(permission.id, behavior);
      infoPanel.open({ ...info, actions: [], note: ok ? `${behavior === 'allow' ? 'Approved' : 'Denied'} — sent to ${member.data.name}.` : 'Too late: the question already went back to the terminal.' });
    };
    info.actions = [
      { label: 'Approve', kind: 'primary', onClick: answer('allow') },
      { label: 'Deny', kind: 'danger', onClick: answer('deny') },
    ];
  }
  showInfo(info);
}

reportsPanel = createReportsPanel({ infoPanel, store: reportStore, show: showInfo });

const interactHandlers = {
  agent: (item) => showAgent(item.member),
  'skills-board': () => {
    releasePointer();
    infoPanel.close();
    skillsPanel.open();
  },
  'knowledge-hub': () =>
    showInfo({
      heading: '📚 Knowledge hub',
      badge: `${hq.root.title} · Google Drive`,
      note: `Snapshot of the top level of ${hq.root.title}, taken ${hq.snapshotAt}. Each row opens in Google Drive.`,
      rowsHeading: `${hq.items.length} items`,
      rows: [
        { title: `Open ${hq.root.title}`, subtitle: 'The whole folder', url: hq.root.url },
        ...hq.items.map((item) => ({ title: item.title, subtitle: item.kind === 'folder' ? 'Folder' : 'Doc', url: item.url })),
      ],
    }),
  'planning-board': () => {
    const cards = crew.cards();
    showInfo({
      heading: '📋 Planning board',
      note: cards.length
        ? 'Live: one card per agent on the floor. Jira tickets will join these once Jira is linked.'
        : 'No agents on the floor right now. Start a Claude Code session and it shows up here.',
      rowsHeading: `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`,
      rows: cards.map((c) => ({ title: `${c.name} · ${office.planningBoard.columnFor(c.state)}`, subtitle: c.task || c.state })),
    });
  },
  'team-board': (item) => {
    const { team } = item.data;
    const view = teamView(team, crew.cards());
    const role = view.role;
    showInfo({
      heading: `${team.icon} ${team.name}`,
      badge: role?.model ? `${team.role} · ${role.model}` : team.role,
      note: role ? `${role.description}\n\n${role.brief}` : `No role file found for ${team.role} in ~/.claude/agents.`,
      sections: [
        { heading: `Now · ${view.working.length}/4 desks`, rows: view.working.map((c) => ({ title: c.name, subtitle: c.task || c.text || c.state })) },
        { heading: 'Blocked / needs you', rows: view.blocked.map((c) => ({ title: c.name, subtitle: c.text || c.state })) },
        { heading: 'Today', rows: [{ title: `${view.done} done · ${view.failed} failed`, subtitle: 'Subagent tasks finished in this zone since midnight (resets when the dev server restarts)' }] },
        { heading: 'Tools', rows: role ? [{ title: role.tools.join(', ') }] : [] },
      ],
    });
  },
  'report-board': (item) => reportsPanel.open(item.data.team),
  atlas: (item) => showInfo(atlasPanel(item.data.panel)),
  tv: () => {
    releasePointer();
    infoPanel.close();
    skillsPanel.close();
    computers.close();
    officeTv.open();
  },
  computer: (item) => {
    releasePointer();
    infoPanel.close();
    skillsPanel.close();
    officeTv.close();
    computers.open(item.data);
  },
  'status-wall': () => {
    const cards = crew.cards();
    showInfo({
      heading: '📋 Team status — today',
      note: 'Rolled up from every team board. Jira tickets and blockers join this once Jira is linked.',
      rows: TEAMS.map((room) => {
        const view = teamView(room, cards);
        return { title: `${room.icon} ${room.name}`, subtitle: `${view.working.length} at desks · ${view.blocked.length} need you · ${view.done} done · ${view.failed} failed` };
      }),
    });
  },
};

const prompt = document.getElementById('prompt');
let inReach = null;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || !inReach || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  e.preventDefault(); // a panel may focus a text field; don't let this E get typed into it
  interactHandlers[inReach.kind]?.(inReach);
});

// Touch devices: rotate-to-landscape gate plus joystick, look drag and buttons (no-ops on desktop).
const orientationGate = createOrientationGate();
const touchControls = createTouchControls({
  canvas: renderer.domElement,
  player,
  view,
  gate: orientationGate,
  interact: () => inReach && interactHandlers[inReach.kind]?.(inReach),
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;
  player.update(dt, elapsed);
  view.update();
  for (const agent of agents) agent.update(dt, elapsed);
  crew.update(dt, elapsed);
  office.atlasOps.update(elapsed);

  // Things in the room win; otherwise an agent standing or sitting close by can be checked on.
  inReach = interactables.update(player.avatar.position, elapsed);
  if (!inReach) {
    const member = crew.nearest(player.avatar.position, 1.4);
    if (member) inReach = { kind: 'agent', label: `${member.data.permission ? 'Answer' : 'Check on'} ${member.data.name}`, member };
  }
  prompt.hidden = !inReach;
  if (inReach) prompt.querySelector('span').textContent = inReach.label;
  touchControls.update(inReach?.label);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

// Handle for wiring agents in later (e.g. from the dev console or a socket layer).
window.theOffice = { scene, office, camera, controls, agents, crew, player, view };
