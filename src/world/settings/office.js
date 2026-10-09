import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildBoardroom, BOARDROOM_TILES, boardroomSpots, planningBoardSpan } from '../hq/boardroom.js';
import { ATLASOPS_ANNEX_TILES, ATLASOPS_TILES, atlasOpsWallSpan, buildAtlasOpsWing } from '../hq/atlasops-wing.js';
import { KNOWLEDGE_HUB_TILES, knowledgeHubSpan, knowledgeHubSpots } from '../hq/knowledge-hub.js';
import { buildGameRoom, GAME_ROOM_TILES, gameRoomSpots } from '../hq/game-room.js';
import { buildLobbyDecor } from '../hq/lobby.js';
import { roomBounds } from '../hq/room-parts.js';
import { plant } from '../hq/room-parts.js';
import { buildSkillsRoom, SKILLS_ROOM_TILES, skillsBoardSpan, skillsRoomSpots } from '../hq/skills-room.js';
import { buildRoleRoom, ROLE_ROOMS, roleRoomSpots, roleRoomWallSpans } from '../hq/team-room.js';

// Room size in tiles (1 tile = 1 world unit). Agents and furniture will be placed on this grid.
// Rows 0-7 of the left column: the boardroom (HQ), whose last two rows are the Docs & PM desks. Rows 0-5 beyond it:
// knowledge hub, skills room, the Tech Lead workspace, then open floor.
// Rows 6-15: open lobby — welcome rug by the entrance, the game room in the middle (rows 8-13), and the DevOps
// workspace as an island at its right end (rows 8-13).
// Rows 16-21: Frontend, Backend, QA, Code Review and Security workspaces.
// Columns 32-39, all rows: the AtlasOps wing (glass-walled, doors onto the lobby lanes), plus its annex at columns
// 26-31, rows 0-5, beside the Tech Lead workspace.
const WIDTH = 40;
const DEPTH = 22;
const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.25;
const WINDOW_WIDTH = 2.6;
const SIDE_DOOR_Z = 0; // world z of the entrance in the left wall, opening onto the middle of the lobby

const COLORS = {
  tileA: '#2a323d',
  tileB: '#252c36',
  grout: '#1b2128',
  wall: 0x1d2631,
  baseboard: 0x2a2118,
  frame: 0x5d5348,
  glass: 0xbfdcef,
  rug: 0x1b2530,
  rugBorder: 0x1f8f88,
};

const ROLE_ROOM_BY_ID = Object.fromEntries(ROLE_ROOMS.map((r) => [r.id, r]));

// Floating nameplates over each room, in the room's colour.
const ROOM_SIGNS = [
  { tiles: BOARDROOM_TILES, name: 'Boardroom', icon: '📋', color: 0x5b6b7a },
  { tiles: KNOWLEDGE_HUB_TILES, name: 'Knowledge hub', icon: '📚', color: 0xc0763a },
  { tiles: SKILLS_ROOM_TILES, name: 'Skills room', icon: '🧠', color: 0x4f6b5a },
  { tiles: GAME_ROOM_TILES, name: 'Game room', icon: '🎮', color: 0x2a2d4a },
  { tiles: ATLASOPS_TILES, name: 'AtlasOps', icon: '🛰️', color: 0x1aa3d9 },
  ...ROLE_ROOMS.map((r) => ({ tiles: r.tiles, name: r.name, icon: r.icon, color: r.color })),
];

export function buildOffice({ skills, hq, atlasOps }) {
  const group = new THREE.Group();
  group.name = 'office';

  const layout = {
    width: WIDTH,
    depth: DEPTH,
    wallHeight: WALL_HEIGHT,
    // Converts a tile coordinate (0..WIDTH-1, 0..DEPTH-1) to the world-space centre of that tile.
    tileToWorld(x, z) {
      return new THREE.Vector3(x - WIDTH / 2 + 0.5, 0, z - DEPTH / 2 + 0.5);
    },
    // Named areas of the floor, in tiles.
    rooms: {
      boardroom: BOARDROOM_TILES,
      knowledgeHub: KNOWLEDGE_HUB_TILES,
      skillsRoom: SKILLS_ROOM_TILES,
      gameRoom: GAME_ROOM_TILES,
      atlasOps: ATLASOPS_TILES,
      atlasOpsAnnex: ATLASOPS_ANNEX_TILES,
      ...Object.fromEntries(ROLE_ROOMS.map((r) => [r.id, r.tiles])),
    },
    // Walkable area for the player, in world coords.
    bounds: { minX: -WIDTH / 2, maxX: WIDTH / 2, minZ: -DEPTH / 2, maxZ: DEPTH / 2 },
  };
  const devops = ROLE_ROOM_BY_ID.devops.tiles;
  const welcomeRug = layout.tileToWorld(5.5, 10.5); // just inside the entrance
  // Named points agents walk between, in world coords.
  layout.spots = {
    entranceOutside: new THREE.Vector3(-WIDTH / 2 - 1.5, 0, SIDE_DOOR_Z),
    entranceInside: new THREE.Vector3(-WIDTH / 2 + 1.5, 0, SIDE_DOOR_Z),
    floorCentre: welcomeRug.clone().add(new THREE.Vector3(2.5, 0, -0.5)),
    welcomeRug,
    playerStart: new THREE.Vector3(-WIDTH / 2 + 2.5, 0, SIDE_DOOR_Z + 1),
    boardroom: boardroomSpots(layout),
    knowledgeHub: knowledgeHubSpots(layout),
    skillsRoom: skillsRoomSpots(layout),
    gameRoom: gameRoomSpots(layout),
    roles: Object.fromEntries(ROLE_ROOMS.map((r) => [r.id, roleRoomSpots(layout, r)])),
  };

  group.add(buildFloor());
  group.add(buildBackWall([planningBoardSpan(layout), knowledgeHubSpan(layout), skillsBoardSpan(layout), ...roleRoomWallSpans(layout), atlasOpsWallSpan(layout)]));
  group.add(buildSideWall());
  const boardroom = buildBoardroom(layout, hq);
  group.add(boardroom.group);

  const skillsRoom = buildSkillsRoom(layout, skills);
  group.add(skillsRoom.group);

  const roleRooms = Object.fromEntries(ROLE_ROOMS.map((room) => [room.id, buildRoleRoom(layout, room)]));
  for (const room of Object.values(roleRooms)) group.add(room.group);
  roleRooms.docs = boardroom.docs; // Docs & PM sits in the boardroom but is driven like a role room

  const gameRoom = buildGameRoom(layout);
  group.add(gameRoom.group);
  const atlasOpsWing = buildAtlasOpsWing(layout, atlasOps);
  group.add(atlasOpsWing.group);
  group.add(lobbyRug(welcomeRug));
  group.add(buildLobbyDecor(layout, roomBounds(layout, GAME_ROOM_TILES)));
  // Plants in the lobby's left corners and either side of the DevOps island's lobby face.
  const islandX = layout.tileToWorld(devops.x, 0).x - 0.5;
  for (const [x, z] of [[-WIDTH / 2 + 0.6, -2.2], [-WIDTH / 2 + 0.6, 4.4], [islandX - 0.5, -1.8], [islandX - 0.5, 1.8]]) {
    const lobbyPlant = plant(new THREE.Vector3(x, 0, z));
    // Only the pot (first child) casts a shadow; the leaf blobs are too small to matter.
    lobbyPlant.traverse((o) => {
      if (o.isMesh && o !== lobbyPlant.children[0]) o.castShadow = false;
    });
    group.add(lobbyPlant);
  }

  for (const sign of ROOM_SIGNS) group.add(roomSign(layout, sign));

  return {
    group,
    layout,
    roleRooms,
    skillsBoard: skillsRoom.board,
    knowledgeHub: boardroom.knowledgeHub,
    planningBoard: boardroom.planningBoard,
    statusWall: boardroom.statusWall,
    atlasOps: atlasOpsWing,
    tv: gameRoom.tv,
  };
}

// Round dark welcome rug with a teal border inside the entrance.
function lobbyRug(position) {
  const group = new THREE.Group();
  const border = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.MeshStandardMaterial({ color: COLORS.rugBorder, roughness: 1 }));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.1, 48), new THREE.MeshStandardMaterial({ color: COLORS.rug, roughness: 1 }));
  border.position.y = 0.004;
  inner.position.y = 0.006;
  for (const m of [border, inner]) {
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    group.add(m);
  }
  group.position.copy(position);
  return group;
}

function roomSign(layout, { tiles, name, icon, color }) {
  const el = document.createElement('div');
  el.className = 'room-sign';
  const c = new THREE.Color(color);
  el.style.setProperty('--room', `#${c.getHexString()}`);
  // Dark lettering on light colours (e.g. Tech Lead gold), white on the rest.
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  el.style.setProperty('--room-ink', luminance > 0.45 ? '#2b2a33' : '#ffffff');
  el.textContent = `${icon} ${name}`;
  const sign = new CSS2DObject(el);
  const centre = layout.tileToWorld(tiles.x + (tiles.width - 1) / 2, tiles.z + (tiles.depth - 1) / 2);
  sign.position.set(centre.x, 3.5, centre.z);
  return sign;
}

function buildFloor() {
  const texture = new THREE.CanvasTexture(drawTileCanvas());
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(WIDTH / 2, DEPTH / 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH, 0.2, DEPTH),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 })
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  floor.name = 'floor';
  return floor;
}

// 2x2 checker of tiles with grout lines; repeated across the floor.
function drawTileCanvas() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  ctx.fillStyle = COLORS.grout;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? COLORS.tileA : COLORS.tileB;
      ctx.fillRect(i * half + 2, j * half + 2, half - 4, half - 4);
    }
  }
  return canvas;
}

// Wall along the far (-z) edge, with a row of windows. Windows overlapping any of the
// `blocked` x-ranges (things mounted on the wall) are left out.
function buildBackWall(blocked) {
  const wall = new THREE.Group();
  wall.name = 'wall-back';
  const z = -DEPTH / 2 - WALL_THICKNESS / 2;
  const length = WIDTH + WALL_THICKNESS;

  wall.add(wallSlab(length, new THREE.Vector3(-WALL_THICKNESS / 2, 0, z), 0));
  wall.add(baseboard(length, new THREE.Vector3(-WALL_THICKNESS / 2, 0, z + WALL_THICKNESS / 2 + 0.03), 0));

  const windowCount = Math.round(WIDTH / 5.3);
  const spacing = WIDTH / windowCount;
  for (let i = 0; i < windowCount; i++) {
    const x = -WIDTH / 2 + spacing * (i + 0.5);
    const overlaps = blocked.some(({ minX, maxX }) => x + WINDOW_WIDTH / 2 > minX && x - WINDOW_WIDTH / 2 < maxX);
    if (overlaps) continue;
    wall.add(windowPane(new THREE.Vector3(x, 2.2, z + WALL_THICKNESS / 2 + 0.02), 0));
  }
  return wall;
}

// Wall along the left (-x) edge, with a doorway gap left open for agents to walk in.
function buildSideWall() {
  const wall = new THREE.Group();
  wall.name = 'wall-side';
  const x = -WIDTH / 2 - WALL_THICKNESS / 2;
  const rot = Math.PI / 2;
  const doorWidth = 2;
  const doorCentreZ = SIDE_DOOR_Z;

  const backLen = doorCentreZ - doorWidth / 2 + DEPTH / 2;
  const frontLen = DEPTH / 2 - (doorCentreZ + doorWidth / 2);
  const backZ = -DEPTH / 2 + backLen / 2;
  const frontZ = DEPTH / 2 - frontLen / 2;

  for (const [len, z] of [[backLen, backZ], [frontLen, frontZ]]) {
    wall.add(wallSlab(len, new THREE.Vector3(x, 0, z), rot));
    wall.add(baseboard(len, new THREE.Vector3(x + WALL_THICKNESS / 2 + 0.03, 0, z), rot));
  }

  // One window in the frontend zone (rows 16-21); the boardroom's stretch of this wall holds the team status wall.
  wall.add(windowPane(new THREE.Vector3(x + WALL_THICKNESS / 2 + 0.02, 2.2, DEPTH / 2 - 3), rot));
  return wall;
}

function wallSlab(length, position, rotationY) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, WALL_HEIGHT, WALL_THICKNESS),
    new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.95 })
  );
  mesh.position.set(position.x, WALL_HEIGHT / 2, position.z);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.solid = true;
  return mesh;
}

function baseboard(length, position, rotationY) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.18, 0.06),
    new THREE.MeshStandardMaterial({ color: COLORS.baseboard, roughness: 0.7 })
  );
  mesh.position.set(position.x, 0.09, position.z);
  mesh.rotation.y = rotationY;
  return mesh;
}

function windowPane(position, rotationY) {
  const pane = new THREE.Group();
  const w = WINDOW_WIDTH;
  const h = 1.8;

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: COLORS.glass, emissive: COLORS.glass, emissiveIntensity: 0.35, roughness: 0.2 })
  );
  pane.add(glass);

  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.6 });
  const bar = (bw, bh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), frameMat);
    m.position.set(x, y, 0.02);
    pane.add(m);
  };
  const t = 0.08;
  bar(w + t, t, 0, h / 2);
  bar(w + t, t, 0, -h / 2);
  bar(t, h, -w / 2, 0);
  bar(t, h, w / 2, 0);
  bar(t, h, 0, 0);

  pane.position.copy(position);
  pane.rotation.y = rotationY;
  return pane;
}
