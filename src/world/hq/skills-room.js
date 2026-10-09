import * as THREE from 'three';
import { box, CYBER, glow, matte } from './cyber-style.js';
import { armchair, floorLamp, floorTrim, rug } from './hq-decor.js';
import { backWallDressing } from './office-decor.js';
import { carpet, partition, partitionWithDoor, roomBounds, wallBoard } from './room-parts.js';

// Skills room in the back-right corner: a library board listing every skill we have, clickable per skill, in a panelled
// reading room with bookcases, a rug and a lamp-lit armchair.
export const SKILLS_ROOM_TILES = { x: 14, z: 0, width: 6, depth: 6 };

const DOOR_WIDTH = 1.6;
const DOOR_OFFSET = 1.4; // door centre, measured in from the room's left edge
const BOARD = { width: 4.4, height: 2.4, centreY: 1.9, canvasWidth: 2048 };
const COLUMNS = 3;

const COLORS = {
  carpet: 0x1f2e29,
  rug: 0x5a3a2a,
  rugBorder: 0xb9822f,
  fabric: 0x8a5a3a,
  lamp: 0xffb347,
  board: '#fbfaf7',
  ink: '#2b2a33',
  muted: '#7a7d86',
  chip: '#eef0f3',
  chipHover: '#2f6fb0',
  sources: ['#2f6fb0', '#8a5cb8', '#3f8a5c'], // dot colour per skill source, in source order
};

export function buildSkillsRoom(layout, skills) {
  const group = new THREE.Group();
  group.name = 'skills-room';

  const { width, depth } = SKILLS_ROOM_TILES;
  const { min, max, centre } = roomBounds(layout, SKILLS_ROOM_TILES);

  group.add(carpet(width, depth, centre, COLORS.carpet));
  group.add(partitionWithDoor(new THREE.Vector3(min.x, 0, max.z), new THREE.Vector3(max.x, 0, max.z), new THREE.Vector3(min.x + DOOR_OFFSET, 0, max.z), DOOR_WIDTH, CYBER.teal));
  group.add(partition(new THREE.Vector3(min.x, 0, min.z), new THREE.Vector3(min.x, 0, max.z), CYBER.teal));
  group.add(partition(new THREE.Vector3(max.x, 0, min.z), new THREE.Vector3(max.x, 0, max.z), CYBER.teal));
  group.add(backWallDressing(min.x, max.x, min.z, CYBER.teal, 3.4), floorTrim({ min, max, centre }));
  group.add(rug(centre.x, min.z + 2.3, 3.8, 2.6, COLORS.rug, COLORS.rugBorder));

  // Reading corner on the east side, clear of the door, the board and the idle row.
  const books = bookcase(2);
  books.position.set(max.x - 0.25, 0, min.z + 3.5);
  books.rotation.y = -Math.PI / 2; // faces west
  const chair = armchair(COLORS.fabric, false);
  chair.position.set(max.x - 0.9, 0, min.z + 5.35);
  chair.rotation.y = -Math.PI / 2;
  const lamp = floorLamp();
  lamp.position.set(max.x - 0.35, 0, min.z + 4.75);
  group.add(books, chair, lamp);

  // Warm lamp light against the cool trim.
  const warm = new THREE.PointLight(COLORS.lamp, 4, 5, 2);
  warm.position.set(lamp.position.x, 1.35, lamp.position.z);
  group.add(warm);

  const board = skillsBoard(skills);
  board.group.position.set(centre.x, BOARD.centreY, min.z + 0.04);
  group.add(board.group);

  return { group, board };
}

const spines = {};

// Row of book spines in warm, muted colours; one canvas shared by every shelf.
function spineTexture() {
  if (spines.texture) return spines.texture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1b1410';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const palette = ['#8a3b32', '#c2703d', '#b9822f', '#4f7a5c', '#3f6a8a', '#6b4a7a', '#d8cdb4'];
  let x = 4;
  for (let i = 0; x < canvas.width - 8; i++) {
    const w = 10 + ((i * 7) % 13);
    const h = 40 + ((i * 11) % 22);
    ctx.fillStyle = palette[(i * 3) % palette.length];
    ctx.fillRect(x, canvas.height - h, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(x + w - 2, canvas.height - h, 2, h);
    x += w + 1;
  }
  spines.texture = new THREE.CanvasTexture(canvas);
  spines.texture.colorSpace = THREE.SRGBColorSpace;
  return spines.texture;
}

// Wooden bookcase `length` wide facing +z, four shelves of books with a glowing strip under the top.
function bookcase(length) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const wood = matte(CYBER.wood, 0.7);
  const depth = 0.34;
  const height = 2;
  spines.front ??= new THREE.MeshStandardMaterial({ map: spineTexture(), roughness: 0.8 });
  const shelf = (w, h, d, x, y, z, material = wood) => group.add(box(material, w, h, d, x, y, z));
  for (const x of [-length / 2, length / 2]) shelf(0.05, height, depth, x, height / 2, 0);
  shelf(length, 0.04, depth, 0, height, 0);
  shelf(length, height, 0.02, 0, height / 2, -depth / 2 + 0.01);
  for (let level = 0; level < 4; level++) {
    const y = 0.1 + level * 0.46;
    shelf(length, 0.04, depth, 0, y, 0);
    const row = box(wood, length - 0.06, 0.38, depth - 0.1, 0, y + 0.21, -0.02);
    row.material = [wood, wood, wood, wood, spines.front, wood];
    group.add(row);
  }
  shelf(length - 0.06, 0.02, 0.03, 0, height - 0.04, depth / 2 - 0.02, glow(CYBER.amber, 0.9));
  return group;
}

// World-space x-range the skills board covers on the back wall, so the wall can keep windows clear of it.
export function skillsBoardSpan(layout) {
  const { centre } = roomBounds(layout, SKILLS_ROOM_TILES);
  return { minX: centre.x - BOARD.width / 2, maxX: centre.x + BOARD.width / 2 };
}

export function skillsRoomSpots(layout) {
  const { min, max, centre } = roomBounds(layout, SKILLS_ROOM_TILES);
  const doorX = min.x + DOOR_OFFSET;
  return {
    doorOutside: new THREE.Vector3(doorX, 0, max.z + 0.8),
    doorInside: new THREE.Vector3(doorX, 0, max.z - 0.6),
    atBoard: new THREE.Vector3(centre.x, 0, min.z + 1.2),
    board: new THREE.Vector3(centre.x, 0, min.z),
    // Where idle agents stand: in a row facing the board.
    idle: [-1.5, 0, 1.5].map((dx) => ({ position: new THREE.Vector3(centre.x + dx, 0, min.z + 1.5), facing: Math.PI, pose: 'stand' })),
  };
}

// The board surface plus hit-testing: skillAt(uv) maps a raycast UV to the skill chip under it.
function skillsBoard(skills) {
  const canvas = document.createElement('canvas');
  canvas.width = BOARD.canvasWidth;
  canvas.height = Math.round(BOARD.canvasWidth * (BOARD.height / BOARD.width));

  const sources = [...new Set(skills.map((s) => s.source))];
  const cells = layoutCells(skills, sources, canvas.width, canvas.height);
  const { group, surface, texture } = wallBoard(BOARD.width, BOARD.height, canvas);
  group.name = 'skills-board';
  group.userData.interact = { kind: 'skills-board', label: 'Browse the skills library' };

  let highlighted = null;
  const redraw = () => {
    drawBoard(canvas.getContext('2d'), canvas.width, skills.length, cells, highlighted);
    texture.needsUpdate = true;
  };
  redraw();

  return {
    group,
    surface,
    skillAt(uv) {
      const px = uv.x * canvas.width;
      const py = (1 - uv.y) * canvas.height;
      const cell = cells.find((c) => c.skill && px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h);
      return cell ? cell.skill : null;
    },
    setHighlight(skill) {
      if (skill === highlighted) return;
      highlighted = skill;
      redraw();
    },
  };
}

const PAD = 56;
const TITLE_HEIGHT = 130;
const HEADER_HEIGHT = 60;
const GAP = 14;

// Positions of section headers and skill chips on the canvas, grouped by source in COLUMNS columns.
function layoutCells(skills, sources, width, height) {
  const groups = sources.map((source) => skills.filter((s) => s.source === source));
  const rows = groups.reduce((n, g) => n + Math.ceil(g.length / COLUMNS), 0);
  const available = height - TITLE_HEIGHT - PAD - sources.length * HEADER_HEIGHT;
  const rowHeight = Math.min(72, available / Math.max(rows, 1));
  const colWidth = (width - PAD * 2) / COLUMNS;

  const cells = [];
  let y = TITLE_HEIGHT;
  groups.forEach((group, sourceIndex) => {
    cells.push({ header: sources[sourceIndex], count: group.length, x: PAD, y });
    y += HEADER_HEIGHT;
    group.forEach((skill, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      cells.push({ skill, sourceIndex, x: PAD + col * colWidth, y: y + row * rowHeight, w: colWidth - GAP, h: rowHeight - GAP });
    });
    y += Math.ceil(group.length / COLUMNS) * rowHeight;
  });
  return cells;
}

function drawBoard(ctx, width, total, cells, highlighted) {
  const font = (weight, size) => `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;

  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = font(700, 56);
  ctx.fillText('Skills library', PAD, 70);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.muted;
  ctx.font = font(500, 30);
  ctx.fillText(`${total} skills · click one to open it`, width - PAD, 74);

  ctx.textAlign = 'left';
  for (const cell of cells) {
    if (cell.header) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = font(700, 26);
      ctx.fillText(`${cell.header.toUpperCase()}  ·  ${cell.count}`, cell.x, cell.y + HEADER_HEIGHT / 2);
      continue;
    }

    const active = cell.skill === highlighted;
    ctx.fillStyle = active ? COLORS.chipHover : COLORS.chip;
    ctx.beginPath();
    ctx.roundRect(cell.x, cell.y, cell.w, cell.h, 12);
    ctx.fill();

    ctx.fillStyle = active ? '#ffffff' : COLORS.sources[cell.sourceIndex % COLORS.sources.length];
    ctx.beginPath();
    ctx.arc(cell.x + 26, cell.y + cell.h / 2, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = active ? '#ffffff' : COLORS.ink;
    ctx.font = font(600, 30);
    ctx.fillText(cell.skill.name, cell.x + 48, cell.y + cell.h / 2 + 2, cell.w - 60);
  }
}
