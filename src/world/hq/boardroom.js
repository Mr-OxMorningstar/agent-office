import * as THREE from 'three';
import { carpet, frameMaterial, partitionWithDoor, roomBounds, wallBoard } from './room-parts.js';
import { buildKnowledgeHub } from './knowledge-hub.js';
import { buildDeskPod, DOCS_TEAM, seatLayout, teamBoard, TEAM_BOARD } from './team-room.js';
import { buildReportBoard, REPORT_BOARD } from './report-board.js';
import { buildHqDecor } from './hq-decor.js';

// Boardroom in the back-left corner, using the office's back and side walls as two of its walls.
// Bounds are in tiles, same grid as layout.tileToWorld. The back six rows hold the table, the planning board and the
// status wall; the two rows in front of them are the Docs & PM desks.
export const BOARDROOM_TILES = { x: 0, z: 0, width: 8, depth: 8 };
const TABLE_TILES = { x: 0, z: 0, width: 8, depth: 6 };

const DOOR_WIDTH = 1.6;
const DOOR_OFFSET = 1.4; // door centre, measured in from the boardroom's right edge
const HUB_OPENING_WIDTH = 1.6; // gap in the right-hand glass leading into the knowledge hub
const SEATS_PER_SIDE = 4;
const PARTITION_ACCENT = 0x2fd6c8; // glowing top rail on the glass

// Team status wall on the boardroom's west wall: one row per team, rolled up from the team boards.
const STATUS_WALL = { width: 3.6, height: 1.9, centreY: 1.95 };

// Live kanban on the back wall, centred on the table: one card per agent on the floor, in the column for its state.
const PLANNING_BOARD = { width: 4, height: 1.8, centreY: 1.9, columns: ['Needs you', 'In progress', 'Done'] };
const COLUMN_FOR_STATE = { waiting: 0, error: 0, arriving: 1, thinking: 1, working: 1, done: 2, idle: 2, leaving: 2 };
const STATE_ICONS = { waiting: '✋', error: '⚠️', arriving: '🚶', thinking: '💭', working: '🔧', done: '✅', idle: '💤', leaving: '👋' };

const COLORS = {
  carpet: 0x232c38,
  board: '#fbfaf7',
  boardInk: '#3a3f47',
  boardRule: '#c9ccd2',
  tableTop: 0x6b4a33,
  tableBase: 0x2f2b28,
  chair: 0x2e3440,
};

// Builds the boardroom together with its knowledge hub annex; `hq` is the knowledge snapshot shown in the hub.
export function buildBoardroom(layout, hq) {
  const group = new THREE.Group();
  group.name = 'boardroom';

  const { width, depth } = BOARDROOM_TILES;
  const { min, max, centre: suite } = roomBounds(layout, BOARDROOM_TILES);
  const { centre } = roomBounds(layout, TABLE_TILES);

  group.add(carpet(width, depth, suite, COLORS.carpet));

  // Front partition runs along max.z with a door gap near its right end; the side partition along max.x has an
  // opening through to the knowledge hub.
  const doorCentreX = max.x - DOOR_OFFSET;
  group.add(partitionWithDoor(new THREE.Vector3(min.x, 0, max.z), new THREE.Vector3(max.x, 0, max.z), new THREE.Vector3(doorCentreX, 0, max.z), DOOR_WIDTH, PARTITION_ACCENT));
  group.add(partitionWithDoor(new THREE.Vector3(max.x, 0, min.z), new THREE.Vector3(max.x, 0, max.z), new THREE.Vector3(max.x, 0, centre.z), HUB_OPENING_WIDTH, PARTITION_ACCENT));

  const knowledgeHub = buildKnowledgeHub(layout, hq);
  group.add(knowledgeHub.group);

  group.add(table(centre));
  group.add(buildHqDecor({ min, max, centre: suite }, centre));
  const board = planningBoard(new THREE.Vector3(centre.x, PLANNING_BOARD.centreY, min.z + 0.04));
  group.add(board.group);
  const statusWall = teamStatusWall();
  statusWall.group.position.set(min.x + 0.04, STATUS_WALL.centreY, centre.z);
  statusWall.group.rotation.y = Math.PI / 2; // faces into the room from the west wall
  group.add(statusWall.group);
  for (const seat of seatPositions(centre)) {
    group.add(chair(seat.position, seat.facing));
  }

  // Docs & PM works from here: desks in the front strip, its team board on the east wall and its report board on the
  // back wall beside the planning board.
  const pod = buildDeskPod(DOCS_TEAM, docsPodCentre(min, max));
  const docsBoard = teamBoard(DOCS_TEAM, true);
  docsBoard.group.position.set(max.x - 0.09, TEAM_BOARD.wallY, max.z - 2.1);
  docsBoard.group.rotation.y = -Math.PI / 2; // faces into the room from the east wall
  const docsReports = buildReportBoard(DOCS_TEAM, true);
  docsReports.group.position.set(docsReportsX(min), REPORT_BOARD.wallY, min.z + 0.04);
  group.add(pod.group, docsBoard.group, docsReports.group);
  const docs = {
    setBoard: (info) => docsBoard.draw(info),
    setReports: (list) => docsReports.draw(list),
    reportSurface: docsReports.surface,
    setSeats: pod.setSeats,
    setScreenContent: pod.setScreenContent,
  };

  return { group, knowledgeHub, planningBoard: board, statusWall, docs };
}

const docsPodCentre = (min, max) => new THREE.Vector3(min.x + 2.4, 0, max.z - 1.8);
const docsReportsX = (min) => min.x + 1;

// World-space x-range the planning board covers on the back wall, so the wall can keep windows clear of it.
export function planningBoardSpan(layout) {
  const { centre } = roomBounds(layout, TABLE_TILES);
  const { min } = roomBounds(layout, BOARDROOM_TILES);
  return { minX: docsReportsX(min) - REPORT_BOARD.width / 2, maxX: centre.x + PLANNING_BOARD.width / 2 };
}

// Points agents can walk between: in through the door, down the aisle past the table end, and up to the board.
export function boardroomSpots(layout) {
  const { min, max } = roomBounds(layout, BOARDROOM_TILES);
  const { centre } = roomBounds(layout, TABLE_TILES);
  const doorX = max.x - DOOR_OFFSET;
  const aisleX = max.x - 0.45;
  const boardZ = min.z + 0.7;
  return {
    doorOutside: new THREE.Vector3(doorX, 0, max.z + 0.8),
    doorInside: new THREE.Vector3(doorX, 0, max.z - 0.6),
    aisleFront: new THREE.Vector3(aisleX, 0, max.z - 1.2),
    aisleBack: new THREE.Vector3(aisleX, 0, boardZ),
    atBoard: new THREE.Vector3(centre.x, 0, boardZ),
    board: new THREE.Vector3(centre.x, 0, min.z),
    seats: seatPositions(centre),
    // The Docs & PM desks' chairs, in the same order as their desks.
    docsSeats: seatLayout(docsPodCentre(min, max)).map((s) => ({ position: s.chair, facing: s.facing })),
    // Where idle agents stand: between the planning board and the table, facing the board.
    idle: [-3, -1, 1, 3].map((dx) => ({ position: new THREE.Vector3(centre.x + dx, 0, min.z + 0.9), facing: Math.PI, pose: 'stand' })),
  };
}

function table(centre) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const length = 4.4;
  const width = 1.6;

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.08, width),
    new THREE.MeshStandardMaterial({ color: COLORS.tableTop, roughness: 0.45 })
  );
  top.position.y = 0.76;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.tableBase, roughness: 0.6 });
  for (const x of [-length / 3, length / 3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, width * 0.7), baseMat);
    leg.position.set(x, 0.36, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  group.position.set(centre.x, 0, centre.z);
  return group;
}

// The board plus setCards(cards), which redraws it. A card is { name, task, state, color }.
function planningBoard(position) {
  const group = new THREE.Group();
  group.name = 'planning-board';
  group.userData.interact = { kind: 'planning-board', label: 'Check the planning board' };
  const { width, height, columns } = PLANNING_BOARD;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 / (width / height));
  drawBoardCanvas(canvas, columns, []);
  const board = wallBoard(width, height, canvas);
  group.add(board.group);

  const tray = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 0.04, 0.12), frameMaterial());
  tray.position.set(0, -height / 2 - 0.08, 0.06);
  group.add(tray);

  group.userData.columns = columns;
  group.position.copy(position);
  return {
    group,
    columnFor: (state) => columns[COLUMN_FOR_STATE[state] ?? 1],
    setCards(cards) {
      drawBoardCanvas(canvas, columns, cards);
      board.texture.needsUpdate = true;
    },
  };
}

const CARD = { height: 78, gap: 10, pad: 14 };

function drawBoardCanvas(canvas, columns, cards) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const colWidth = w / columns.length;
  const headerHeight = 64;

  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = COLORS.boardRule;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, headerHeight);
  ctx.lineTo(w - 24, headerHeight);
  for (let i = 1; i < columns.length; i++) {
    ctx.moveTo(i * colWidth, 20);
    ctx.lineTo(i * colWidth, h - 20);
  }
  ctx.stroke();

  ctx.fillStyle = COLORS.boardInk;
  ctx.font = '600 34px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  columns.forEach((name, i) => {
    const count = cards.filter((c) => (COLUMN_FOR_STATE[c.state] ?? 1) === i).length;
    ctx.fillText(count ? `${name} · ${count}` : name, (i + 0.5) * colWidth, headerHeight / 2 + 4);
  });

  // Cards stack down each column; whatever doesn't fit is summarised as "+N more".
  const fit = Math.floor((h - headerHeight - CARD.pad * 2) / (CARD.height + CARD.gap));
  columns.forEach((_, col) => {
    const inColumn = cards.filter((c) => (COLUMN_FOR_STATE[c.state] ?? 1) === col);
    const shown = inColumn.length > fit ? inColumn.slice(0, fit - 1) : inColumn;
    shown.forEach((card, row) => drawCard(ctx, card, col * colWidth + CARD.pad, headerHeight + CARD.pad + row * (CARD.height + CARD.gap), colWidth - CARD.pad * 2));
    if (shown.length < inColumn.length) {
      ctx.fillStyle = COLORS.boardInk;
      ctx.font = '600 24px system-ui, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`+${inColumn.length - shown.length} more`, (col + 0.5) * colWidth, headerHeight + CARD.pad + shown.length * (CARD.height + CARD.gap) + CARD.height / 2);
    }
  });
}

function drawCard(ctx, card, x, y, width) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = COLORS.boardRule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, width, CARD.height, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `#${new THREE.Color(card.color).getHexString()}`;
  ctx.beginPath();
  ctx.roundRect(x, y, 12, CARD.height, [10, 0, 0, 10]);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.boardInk;
  ctx.font = '700 26px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(`${STATE_ICONS[card.state] ?? ''} ${card.name}`, x + 26, y + 26, width - 40);
  ctx.fillStyle = '#6b6f78';
  ctx.font = '500 21px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(fitText(ctx, card.task || card.state, width - 40), x + 26, y + 57);
}

// Roll-up of every role workspace: who is at desks, what needs the user, and today's finished / failed tasks.
// setRows(rows) redraws it; a row is { icon, name, color, atDesks, needsYou, done, failed }.
function teamStatusWall() {
  const group = new THREE.Group();
  group.name = 'team-status-wall';
  group.userData.interact = { kind: 'status-wall', label: 'Check team status' };
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = Math.round(1200 * (STATUS_WALL.height / STATUS_WALL.width));
  drawStatusWall(canvas, []);
  const board = wallBoard(STATUS_WALL.width, STATUS_WALL.height, canvas);
  group.add(board.group);
  return {
    group,
    setRows(rows) {
      drawStatusWall(canvas, rows);
      board.texture.needsUpdate = true;
    },
  };
}

function drawStatusWall(canvas, rows) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const pad = 36;
  const cols = [
    { title: 'Team', x: pad + 34, align: 'left' },
    { title: 'At desks', x: 640, align: 'center' },
    { title: 'Needs you', x: 820, align: 'center' },
    { title: 'Done', x: 980, align: 'center' },
    { title: 'Failed', x: 1110, align: 'center' },
  ];

  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.boardInk;
  ctx.font = '800 44px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Team status — today', pad, 52);

  ctx.font = '700 22px system-ui, "Segoe UI", sans-serif';
  ctx.fillStyle = '#7a7d86';
  for (const c of cols) {
    ctx.textAlign = c.align;
    ctx.fillText(c.title.toUpperCase(), c.x, 112);
  }

  const rowH = Math.min(62, (h - 150) / Math.max(rows.length, 1));
  rows.forEach((row, i) => {
    const y = 150 + i * rowH + rowH / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = '#f2efe8';
      ctx.fillRect(pad - 10, y - rowH / 2, w - pad * 2 + 20, rowH);
    }
    ctx.fillStyle = `#${new THREE.Color(row.color).getHexString()}`;
    ctx.beginPath();
    ctx.arc(pad + 12, y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.boardInk;
    ctx.font = '700 30px system-ui, "Segoe UI", sans-serif';
    ctx.fillText(`${row.icon}  ${row.name}`, cols[0].x, y);

    // Non-zero counts in an alert column (needs you, failed) are coloured; zeros and "–" stay muted.
    const cell = (value, col, alert) => {
      const flagged = alert && typeof value === 'number' && value > 0;
      ctx.textAlign = 'center';
      ctx.fillStyle = flagged ? alert : typeof value === 'number' && value > 0 ? COLORS.boardInk : '#b5b1a8';
      ctx.font = `${flagged ? 800 : 600} 30px system-ui, "Segoe UI", sans-serif`;
      ctx.fillText(String(value), cols[col].x, y);
    };
    cell(row.atDesks, 1);
    cell(row.needsYou, 2, '#c47f00');
    cell(row.done, 3);
    cell(row.failed, 4, '#c62f32');
  });
}

// Shortens text with an ellipsis until it fits `max` pixels at the current font.
function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

// Seats along both long sides plus one at each end. `facing` is the Y rotation that points the chair at the table.
function seatPositions(centre) {
  const seats = [];
  const spacing = 1;
  for (let i = 0; i < SEATS_PER_SIDE; i++) {
    const x = centre.x + (i - (SEATS_PER_SIDE - 1) / 2) * spacing;
    seats.push({ position: new THREE.Vector3(x, 0, centre.z - 1.25), facing: 0 });
    seats.push({ position: new THREE.Vector3(x, 0, centre.z + 1.25), facing: Math.PI });
  }
  seats.push({ position: new THREE.Vector3(centre.x - 2.75, 0, centre.z), facing: Math.PI / 2 });
  seats.push({ position: new THREE.Vector3(centre.x + 2.75, 0, centre.z), facing: -Math.PI / 2 });
  return seats;
}

function chair(position, facing) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.chair, roughness: 0.7 });
  const part = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
  };

  part(0.5, 0.08, 0.5, 0, 0.46, 0); // seat
  part(0.5, 0.55, 0.07, 0, 0.75, -0.24); // back
  part(0.06, 0.42, 0.06, 0, 0.21, 0); // stem
  part(0.44, 0.04, 0.44, 0, 0.02, 0); // base

  group.position.copy(position);
  group.rotation.y = facing;
  return group;
}
