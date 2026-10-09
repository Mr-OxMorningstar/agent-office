import * as THREE from 'three';
import { buildRoleProp } from './role-props.js';
import { buildReportBoard, REPORT_BOARD } from './report-board.js';
import { floorLamp, rug } from './hq-decor.js';
import { backWallDressing, tintedFloor, westWallDressing } from './office-decor.js';
import { carpet, FONT, fitText, plant, roomBounds, standLegs, wallBoard, zoneBorder } from './room-parts.js';

// Role workspaces: open-plan zones, one per agent role, each in a colour chosen for what the role does. No walls of
// their own: each zone is marked by its dark carpet, a slim glowing floor border in its colour and its furniture, and
// is panelled like the boardroom wherever it meets the office's back or side wall. The eight colours form four
// near-complementary pairs of roles that work together:
//   Frontend magenta  <-> QA green           (what users see / proof it works)
//   Backend blue      <-> DevOps orange      (stable systems / energy of shipping)
//   Code Review violet <-> Tech Lead gold    (scrutiny / direction)
//   Security crimson  <-> Docs & PM teal     (vigilance / clarity; Docs & PM sits in the boardroom)
// `role` matches the Claude Code subagent type that works here. `lobbySide` says which side faces the lobby:
// 'north' (-z, front row and the DevOps island) or 'south' (+z, back row, whose far side is the office's back wall).
export const ROLE_ROOMS = [
  { id: 'frontend', role: 'frontend-engineer', name: 'Frontend', icon: '🎨', color: 0xe0409b, prop: 'ui-screen', tiles: { x: 0, z: 16, width: 6, depth: 6 }, lobbySide: 'north' },
  { id: 'backend', role: 'backend-engineer', name: 'Backend', icon: '🗄️', color: 0x2f6feb, prop: 'server-rack', tiles: { x: 6, z: 16, width: 6, depth: 6 }, lobbySide: 'north' },
  { id: 'qa', role: 'qa-engineer', name: 'QA', icon: '🧪', color: 0x22b86a, prop: 'status-light', tiles: { x: 12, z: 16, width: 6, depth: 6 }, lobbySide: 'north' },
  { id: 'review', role: 'code-reviewer', name: 'Code Review', icon: '🔍', color: 0x7c4dff, prop: 'diff-screen', tiles: { x: 18, z: 16, width: 7, depth: 6 }, lobbySide: 'north' },
  { id: 'security', role: 'security-reviewer', name: 'Security', icon: '🛡️', color: 0xe5383b, prop: 'safe', tiles: { x: 25, z: 16, width: 7, depth: 6 }, lobbySide: 'north' },
  { id: 'devops', role: 'devops-engineer', name: 'DevOps', icon: '🚀', color: 0xf28c1c, prop: 'pipeline-screen', tiles: { x: 26, z: 8, width: 6, depth: 6 }, lobbySide: 'north' },
  { id: 'techlead', role: 'tech-lead', name: 'Tech Lead', icon: '🧭', color: 0xf2c21b, prop: 'architecture-board', tiles: { x: 20, z: 0, width: 6, depth: 6 }, lobbySide: 'south' },
];

// Docs & PM has no room of its own: it works from the boardroom (HQ), where its desks, team board and report board
// are built. `id` keys its seats, board and computers like a room's would.
export const DOCS_TEAM = { id: 'docs', role: 'docs-pm', name: 'Docs & PM', icon: '📝', color: 0x14b8b0 };

// Every team with a board: the role rooms plus Docs & PM.
export const TEAMS = [...ROLE_ROOMS, DOCS_TEAM];

export const DESK = { width: 1.4, depth: 0.7, height: 0.74 };
export const TEAM_BOARD = { width: 2.2, height: 1.5, standY: 1.5, wallY: 1.9 };
const POD_SHIFT = 0.4; // the desk pod sits a little back from the lobby side, leaving a walkway in front

const COLORS = {
  desk: 0x6b4a33,
  deskLegs: 0x1d242d,
  monitor: 0x22252b,
  board: '#fbfaf7',
  muted: '#7a7d86',
};

// Zone geometry relative to its lobby side: `dir` points from the lobby side into the zone.
function frame(layout, room) {
  const { min, max, centre } = roomBounds(layout, room.tiles);
  const north = room.lobbySide === 'north';
  const dir = north ? 1 : -1;
  const lobbyZ = north ? min.z : max.z;
  const farZ = north ? max.z : min.z;
  const podCentre = new THREE.Vector3(centre.x, 0, centre.z + dir * POD_SHIFT);
  return { min, max, centre, dir, lobbyZ, farZ, podCentre, againstWall: !north };
}

export function buildRoleRoom(layout, room) {
  const group = new THREE.Group();
  group.name = `role-room-${room.id}`;

  const { width, depth } = room.tiles;
  const { min, max, centre, dir, lobbyZ, farZ, podCentre, againstWall } = frame(layout, room);
  const at = (x, z) => new THREE.Vector3(x, 0, z);

  const floor = tintedFloor(room.color);
  group.add(carpet(width, depth, centre, floor.carpet));
  group.add(zoneBorder(min, max, room.color));
  group.add(rug(podCentre.x, podCentre.z, 3.8, 3.4, floor.rug, room.color));

  // Panelling in the room's colour where the zone backs onto the office's back or side wall.
  if (Math.abs(min.z + layout.depth / 2) < 0.01) group.add(backWallDressing(min.x, max.x, min.z, room.color));
  if (Math.abs(min.x + layout.width / 2) < 0.01) group.add(westWallDressing(min.z, max.z, min.x, room.color));

  const pod = buildDeskPod(room, podCentre);
  group.add(pod.group);

  // Team board: on the back wall in back-row zones, on a stand at the lobby edge elsewhere.
  const board = teamBoard(room, againstWall);
  if (againstWall) board.group.position.set(centre.x, TEAM_BOARD.wallY, farZ + 0.04);
  else board.group.position.set(min.x + 0.3 + TEAM_BOARD.width / 2, 0, lobbyZ + dir * 0.45);
  group.add(board.group);

  // Report board: on the back wall beside the team board in back-row zones; elsewhere on a stand along the zone's
  // left edge facing into it, behind the walkway and clear of the desks.
  const reports = buildReportBoard(room, againstWall);
  if (againstWall) reports.group.position.set(reportWallX(centre.x), REPORT_BOARD.wallY, farZ + 0.04);
  else {
    reports.group.position.set(min.x + 0.5, 0, lobbyZ + dir * 4.2);
    reports.group.rotation.y = Math.PI / 2;
  }
  group.add(reports.group);

  // Signature prop, placed so it faces the overview camera (which looks in from the office front): back-row zones
  // stand it in the far corner against the wall, facing into the zone; the rest stand it at the lobby edge, facing
  // the office front. A plant fills the far left corner.
  const prop = buildRoleProp(room.prop, room.color);
  if (againstWall) {
    prop.position.set(max.x - 0.75, 0, farZ - dir * 0.5);
    prop.rotation.y = Math.atan2(centre.x - prop.position.x, centre.z - prop.position.z);
  } else {
    prop.position.set(max.x - 0.8, 0, lobbyZ + dir * 0.4);
    prop.rotation.y = dir > 0 ? 0 : Math.PI;
  }
  group.add(prop);
  group.add(plant(at(min.x + 0.55, farZ - dir * 0.55)));
  if (!againstWall) {
    const lamp = floorLamp();
    lamp.position.set(max.x - 0.5, 0, farZ - dir * 0.5);
    group.add(lamp);
  }

  // A soft wash of the role colour over the zone.
  const light = new THREE.PointLight(room.color, 5, 7, 2);
  light.position.set(centre.x, 2.7, centre.z);
  group.add(light);

  return {
    group,
    // info: { role, working: [{ name, task, state }], blocked: [{ name, text, state }], done, failed }
    setBoard: (info) => board.draw(info),
    // Latest reports for this role, newest first.
    setReports: (list) => reports.draw(list),
    reportSurface: reports.surface,
    setSeats: pod.setSeats,
    setScreenContent: pod.setScreenContent,
  };
}

// A 2x2 pod of desks with chairs, around `podCentre`. Every desk computer is usable (E): open a URL on it or share a
// window to it. No marker, there are too many of them. Returns the group plus setSeats(states), one entry per desk (same
// order as the seats): the state of whoever sits there, or null if empty, and setScreenContent(seat, texture), which
// puts a texture (page card or live window) on a desk's monitor; null hands it back to the occupant glow.
export function buildDeskPod(room, podCentre) {
  const group = new THREE.Group();
  const screens = seatLayout(podCentre).map((seat, i) => {
    const d = desk(seat.desk, seat.facing, room.color);
    d.group.userData.interact = {
      kind: 'computer',
      label: 'Use this computer',
      marker: false,
      data: { id: `${room.id}-${i}`, room: room.id, seat: i, title: `${room.icon} ${room.name} · Desk ${i + 1}`, color: room.color },
    };
    group.add(d.group, chair(seat.chair, seat.facing, room.color));
    return d.screen;
  });
  const showing = new Set(); // desks whose monitor shows content (a page or a shared window)
  return {
    group,
    setSeats(states) {
      screens.forEach((screen, i) => {
        if (showing.has(i)) return; // content on screen wins over the occupant glow
        const look = SCREEN_LOOK[states[i] ?? 'empty'] ?? SCREEN_LOOK.idle;
        screen.material.emissive.setHex(look.color ?? room.color);
        screen.material.color.setHex(look.color ?? room.color);
        screen.material.emissiveIntensity = look.glow;
      });
    },
    setScreenContent(seat, texture) {
      const material = screens[seat].material;
      if (texture) showing.add(seat);
      else showing.delete(seat);
      material.map = texture;
      material.emissiveMap = texture;
      material.color.setHex(texture ? 0xffffff : room.color);
      material.emissive.setHex(texture ? 0xffffff : room.color);
      material.emissiveIntensity = texture ? 0.85 : SCREEN_LOOK.empty.glow;
      material.needsUpdate = true;
    },
  };
}

// How a desk monitor looks for the state of whoever sits at it. Colour defaults to the role colour.
const SCREEN_LOOK = {
  empty: { glow: 0.12 },
  idle: { glow: 0.45 },
  done: { glow: 0.45 },
  arriving: { glow: 0.45 },
  thinking: { glow: 0.9 },
  working: { glow: 1.5 },
  waiting: { glow: 1.5, color: 0xffb020 },
  error: { glow: 1.5, color: 0xe5383b },
};

// World-space x-ranges of boards mounted on the office's back wall, so the wall can keep windows clear of them.
export function roleRoomWallSpans(layout) {
  return ROLE_ROOMS.filter((r) => r.lobbySide === 'south').map((room) => {
    const { centre } = frame(layout, room);
    return { minX: reportWallX(centre.x) - REPORT_BOARD.width / 2 - 0.1, maxX: centre.x + TEAM_BOARD.width / 2 + 0.1 };
  });
}

// Centre x of the wall-mounted report board: left of the team board, with a gap between the frames.
const reportWallX = (centreX) => centreX - TEAM_BOARD.width / 2 - 0.2 - REPORT_BOARD.width / 2;

// Where agents sit in this zone: each desk's chair (agents path-find their own way there).
export function roleRoomSpots(layout, room) {
  const { podCentre, centre, dir, lobbyZ } = frame(layout, room);
  return {
    seats: seatLayout(podCentre).map((s) => ({ position: s.chair, facing: s.facing })),
    // Where idle agents stand: on the walkway between the lobby edge and the desks, facing into the zone.
    idle: [-0.7, 0.7].map((dx) => ({ position: new THREE.Vector3(centre.x + dx, 0, lobbyZ + dir * 1.2), facing: dir > 0 ? 0 : Math.PI, pose: 'stand' })),
  };
}

// Four desks in a 2x2 pod, two rows facing each other.
export function seatLayout(podCentre) {
  const seats = [];
  for (const x of [-DESK.width / 2 - 0.05, DESK.width / 2 + 0.05]) {
    for (const [dz, facing] of [[-1, 0], [1, Math.PI]]) {
      const deskPos = podCentre.clone().add(new THREE.Vector3(x, 0, dz * (DESK.depth / 2 + 0.02)));
      const chairPos = podCentre.clone().add(new THREE.Vector3(x, 0, dz * (DESK.depth + 0.45)));
      seats.push({ desk: deskPos, chair: chairPos, facing });
    }
  }
  return seats;
}

// Desk with a monitor whose screen glows in the role colour. `facing` points from the chair towards the desk.
// Returns the desk and its screen mesh (its glow shows whether someone is working there).
function desk(position, facing, roleColor) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(DESK.width, 0.05, DESK.depth),
    new THREE.MeshStandardMaterial({ color: COLORS.desk, roughness: 0.5 })
  );
  top.position.y = DESK.height;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const legMat = new THREE.MeshStandardMaterial({ color: COLORS.deskLegs, roughness: 0.6 });
  for (const x of [-DESK.width / 2 + 0.05, DESK.width / 2 - 0.05]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, DESK.height, DESK.depth - 0.1), legMat);
    leg.position.set(x, DESK.height / 2, 0);
    group.add(leg);
  }

  const monitorMat = new THREE.MeshStandardMaterial({ color: COLORS.monitor, roughness: 0.4 });
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.04), monitorMat);
  monitor.position.set(0, DESK.height + 0.32, 0.12);
  monitor.castShadow = true;
  group.add(monitor);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.32),
    new THREE.MeshStandardMaterial({ color: roleColor, emissive: roleColor, emissiveIntensity: 0.9, roughness: 0.3 })
  );
  screen.position.set(0, DESK.height + 0.32, 0.098);
  screen.rotation.y = Math.PI; // screen faces the chair
  group.add(screen);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), monitorMat);
  stand.position.set(0, DESK.height + 0.09, 0.14);
  group.add(stand);

  group.position.copy(position);
  group.rotation.y = facing;
  return { group, screen };
}

// Chair upholstered in the role colour.
function chair(position, facing, roleColor) {
  const group = new THREE.Group();
  const seat = new THREE.MeshStandardMaterial({ color: new THREE.Color(roleColor).multiplyScalar(0.85), roughness: 0.7 });
  const base = new THREE.MeshStandardMaterial({ color: COLORS.deskLegs, roughness: 0.6 });
  const part = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
  };
  part(0.48, 0.08, 0.48, 0, 0.46, 0, seat);
  part(0.48, 0.5, 0.07, 0, 0.74, -0.22, seat);
  part(0.06, 0.42, 0.06, 0, 0.21, 0, base);
  part(0.42, 0.04, 0.42, 0, 0.02, 0, base);
  group.position.copy(position);
  group.rotation.y = facing;
  return group;
}

// The zone's live board, marked interactable so the player can check it. Wall-mounted, or free-standing on legs.
// Returns { group, draw(info) }.
export function teamBoard(room, mounted) {
  const group = new THREE.Group();
  group.name = `team-board-${room.id}`;
  group.userData.interact = { kind: 'team-board', label: `Check the ${room.name} board`, data: { team: room } };

  const canvas = document.createElement('canvas');
  canvas.width = 880;
  canvas.height = Math.round(880 * (TEAM_BOARD.height / TEAM_BOARD.width));
  drawTeamBoard(canvas, room, {});
  const board = wallBoard(TEAM_BOARD.width, TEAM_BOARD.height, canvas);
  const draw = (info) => {
    drawTeamBoard(canvas, room, info);
    board.texture.needsUpdate = true;
  };

  if (mounted) {
    group.add(board.group);
    return { group, draw };
  }

  group.userData.solid = true;
  board.group.position.y = TEAM_BOARD.standY;
  group.add(board.group, standLegs(TEAM_BOARD.width, TEAM_BOARD.standY - TEAM_BOARD.height / 2));
  return { group, draw };
}

const STATE_ICONS = { waiting: '✋', error: '⚠️', arriving: '🚶', thinking: '💭', working: '🔧', done: '✅', idle: '💤' };

// Header (name + model), then OWNS (from the role file), NOW (who is at a desk), BLOCKED / NEEDS YOU, and a
// footer with today's finished and failed tasks.
function drawTeamBoard(canvas, room, { role, working = [], blocked = [], done = 0, failed = 0 }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const accent = `#${new THREE.Color(room.color).getHexString()}`;
  const ink = new THREE.Color(room.color).getHSL({}).l > 0.55 ? '#2b2a33' : '#ffffff';
  const pad = 30;

  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, w, 84);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = FONT(800, 44);
  ctx.fillText(`${room.icon}  ${room.name}`, pad, 44);
  if (role?.model) {
    ctx.textAlign = 'right';
    ctx.font = FONT(700, 26);
    ctx.fillText(role.model, w - pad, 44);
    ctx.textAlign = 'left';
  }

  const label = (text, y) => {
    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(800, 20);
    ctx.fillText(text, pad, y);
  };
  const line = (text, y, { weight = 500, size = 26, color = '#2b2a33' } = {}) => {
    ctx.fillStyle = color;
    ctx.font = FONT(weight, size);
    ctx.fillText(fitText(ctx, text, w - pad * 2), pad, y);
  };

  label('OWNS', 116);
  const owns = wrap(ctx, role?.description || `${room.role} — role file not found`, w - pad * 2, FONT(500, 25), 2);
  owns.forEach((text, i) => line(text, 150 + i * 32, { size: 25 }));

  label('NOW', 238);
  if (working.length) {
    working.slice(0, 2).forEach((a, i) => line(`${STATE_ICONS[a.state] ?? ''} ${a.name} — ${a.task || a.state}`, 272 + i * 34, { weight: 600 }));
  } else {
    line('No one at a desk', 272, { color: COLORS.muted });
  }

  label('BLOCKED / NEEDS YOU', 362);
  if (blocked.length) {
    blocked.slice(0, 2).forEach((a, i) => line(`${STATE_ICONS[a.state] ?? ''} ${a.name} — ${a.text || a.state}`, 396 + i * 34, { weight: 700, color: a.state === 'error' ? '#c62f32' : '#a86a00' }));
  } else {
    line('Nothing blocked', 396, { color: '#22874f', weight: 600 });
  }

  ctx.fillStyle = '#efece5';
  ctx.fillRect(0, h - 64, w, 64);
  line(`Done today  ${done}     Failed  ${failed}     Desks  ${working.length}/4`, h - 32, { weight: 700, size: 24 });
}

// Greedy word wrap into at most `maxLines`, the last one ellipsised if needed.
function wrap(ctx, text, max, font, maxLines) {
  ctx.font = font;
  const lines = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= max) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) lines[maxLines - 1] = fitText(ctx, `${lines[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, max);
  return lines.slice(0, maxLines);
}
