import * as THREE from 'three';
import { ATLASOPS_TILES } from './atlasops-wing.js';
import { BOARDROOM_TILES } from './boardroom.js';
import { box, CYBER, glow, trimLine } from './cyber-style.js';
import { drawMap, screenPanel } from './hq-decor.js';
import { westWallDressing } from './office-decor.js';
import { roomBounds } from './room-parts.js';
import { ROLE_ROOMS } from './team-room.js';

// The lobby and its two lanes, dressed as a command corridor: panelled west wall either side of the entrance with
// amber door jambs and a status screen, teal guide lines on the floor. The
// lines are flat strips and the wall dressing hangs on the wall, so none of it carries a collider.

const DOOR_HALF = 1; // half the width of the entrance gap in the west wall
const LANES_Z = [-4, 4]; // the lanes the AtlasOps doors open onto
const RUG_RADIUS = 2.4; // of the welcome rug built with the office
const SCREEN = { width: 1.8, height: 1, centreY: 1.9, z: 3 };

// `game` is the game room's { min, max }, which the guide lines stop short of.
export function buildLobbyDecor(layout, game) {
  const group = new THREE.Group();
  group.name = 'lobby-decor';
  const westX = -layout.width / 2;
  const doorZ = layout.spots.entranceInside.z;
  const byId = Object.fromEntries(ROLE_ROOMS.map((r) => [r.id, roomBounds(layout, r.tiles)]));
  const boardroom = roomBounds(layout, BOARDROOM_TILES);
  const atlas = roomBounds(layout, ATLASOPS_TILES);
  const rug = layout.spots.welcomeRug;

  // West wall: from the boardroom's corner to the door, and from the door to the Frontend zone.
  group.add(westWallDressing(boardroom.max.z, doorZ - DOOR_HALF, westX, CYBER.teal));
  group.add(westWallDressing(doorZ + DOOR_HALF, byId.frontend.min.z, westX, CYBER.teal));
  for (const z of [doorZ - DOOR_HALF - 0.03, doorZ + DOOR_HALF + 0.03]) group.add(box(glow(CYBER.amber, 1), 0.05, 2.4, 0.06, westX + 0.025, 1.2, z));

  const screen = screenPanel(SCREEN.width, SCREEN.height, 4, drawMap());
  screen.position.set(westX + 0.03, SCREEN.centreY, SCREEN.z);
  screen.rotation.y = Math.PI / 2;
  group.add(screen);

  // Guide lines: along the entrance axis (broken by the rug and the game room) and down both lanes to the AtlasOps doors.
  const teal = glow(CYBER.teal, 0.6);
  const amber = glow(CYBER.amber, 0.8);
  const at = (x, z) => new THREE.Vector3(x, 0, z);
  const line = (x0, x1, z) => group.add(trimLine(at(x0, z), at(x1, z), 0.012, teal, 0.012, 0.05));
  const cap = (x, z) => group.add(box(amber, 0.3, 0.012, 0.07, x, 0.013, z));
  const laneEnd = atlas.min.x - 0.4;
  line(westX + 0.4, rug.x - RUG_RADIUS - 0.15, doorZ);
  line(rug.x + RUG_RADIUS + 0.15, game.min.x - 0.25, doorZ);
  line(game.max.x + 0.25, byId.devops.min.x - 0.3, doorZ);
  line(westX + 1.2, laneEnd, LANES_Z[1]);
  line(boardroom.max.x + 0.4, laneEnd, LANES_Z[0]);
  for (const z of LANES_Z) cap(laneEnd, z);
  cap(westX + 0.55, doorZ);

  return group;
}
