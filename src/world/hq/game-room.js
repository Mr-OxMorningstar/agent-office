import * as THREE from 'three';
import { box, CYBER, glow, matte } from './cyber-style.js';
import { armchair, floorLamp, rug } from './hq-decor.js';
import { carpet, plant, roomBounds, zoneBorder } from './room-parts.js';

// Game room: an open-plan lounge in the middle of the lobby where agents with nothing to do hang out instead of
// leaving — a ping-pong table, arcade cabinets, a couch facing a TV on a panelled backdrop, an armchair and bean bags,
// on a dark carpet with a rug and a warm lamp under the neon outline. Each spot an agent can take is listed by
// gameRoomSpots().
export const GAME_ROOM_TILES = { x: 12, z: 8, width: 10, depth: 6 };

const COLORS = {
  carpet: 0x1e2134,
  rug: 0x4a2430,
  rugBorder: 0xb9822f,
  armchair: 0xc2703d,
  neon: [0xff4fd8, 0x4fd8ff, 0xffd24f, 0x7dff6a], // one per side of the outline
  table: 0x1f6f5c,
  line: 0xffffff,
  cabinet: 0x1d1f2b,
  couch: 0x4a4f8a,
  wood: 0x5a3d2b,
  beanBags: [0xff7a59, 0x4fd8ff, 0xffd24f],
  lamp: 0xffb347,
  dark: 0x23262d,
};

// Furniture positions relative to the room centre (x right, z towards the office front).
const LAYOUT = {
  pingPong: { x: -2.4, z: -0.3, length: 2.2, width: 1.2 },
  cabinets: [{ x: 2.2, z: -2.4 }, { x: 3.4, z: -2.4 }],
  tv: { x: 2.8, z: -0.4 },
  couch: { x: 2.8, z: 2.1, seats: [-0.6, 0, 0.6] },
  beanBags: [{ x: -3.8, z: 2.2 }, { x: -2.6, z: 2.4 }, { x: -1.4, z: 2.2 }],
  rug: { x: 2.8, z: 0.85, width: 3.2, depth: 2.2 }, // under the couch, between it and the TV
  armchair: { x: 0.9, z: 1.0, facing: 2.21 }, // angled towards the TV
  lamp: { x: 4.55, z: 0.9 },
};

// Returns the room group plus `tv`, a handle for what the TV screen shows.
export function buildGameRoom(layout) {
  const group = new THREE.Group();
  group.name = 'game-room';
  const { width, depth } = GAME_ROOM_TILES;
  const { min, max, centre } = roomBounds(layout, GAME_ROOM_TILES);
  const at = (p, y = 0) => new THREE.Vector3(centre.x + p.x, y, centre.z + p.z);

  group.add(carpet(width, depth, centre, COLORS.carpet));
  group.add(zoneBorder(min, max, COLORS.neon));

  group.add(rug(centre.x + LAYOUT.rug.x, centre.z + LAYOUT.rug.z, LAYOUT.rug.width, LAYOUT.rug.depth, COLORS.rug, COLORS.rugBorder));
  group.add(pingPongTable(at(LAYOUT.pingPong)));
  for (const c of LAYOUT.cabinets) group.add(arcadeCabinet(at(c), c === LAYOUT.cabinets[0] ? 0xff4fd8 : 0x4fd8ff));
  const tv = tvOnStand(at(LAYOUT.tv));
  group.add(tv, tvBackdrop(at(LAYOUT.tv)));
  group.add(couch(at(LAYOUT.couch)));
  LAYOUT.beanBags.forEach((b, i) => group.add(beanBag(at(b), COLORS.beanBags[i])));
  group.add(plant(new THREE.Vector3(max.x - 0.55, 0, max.z - 0.55)));
  group.add(plant(new THREE.Vector3(min.x + 0.55, 0, min.z + 0.55)));

  const chair = armchair(COLORS.armchair, false);
  chair.position.copy(at(LAYOUT.armchair));
  chair.rotation.y = LAYOUT.armchair.facing;
  const lamp = floorLamp();
  lamp.position.copy(at(LAYOUT.lamp));
  group.add(chair, lamp);

  // Warm lamp light against the cool violet wash.
  const warm = new THREE.PointLight(COLORS.lamp, 4, 5, 2);
  warm.position.set(lamp.position.x, 1.35, lamp.position.z);
  group.add(warm);

  const light = new THREE.PointLight(0xb98cff, 6, 9, 2);
  light.position.set(centre.x, 2.7, centre.z);
  group.add(light);
  return { group, tv: tv.userData.tv };
}

// Where idle agents go: `pose` is 'sit' (couch, bean bags) or 'stand' (ping-pong ends, arcade); `facing` is the
// heading to turn to on arrival (0 = facing +z). Seats inside solid furniture have an `approach` point in front of
// them: agents path-find to that, then step onto the seat, instead of squeezing past the furniture's corners.
export function gameRoomSpots(layout) {
  const { centre } = roomBounds(layout, GAME_ROOM_TILES);
  const at = (x, z) => new THREE.Vector3(centre.x + x, 0, centre.z + z);
  const { pingPong, cabinets, couch: c, beanBags } = LAYOUT;
  return {
    spots: [
      ...c.seats.map((dx) => ({ position: at(c.x + dx, c.z), approach: at(c.x + dx, c.z - 0.9), facing: Math.PI, pose: 'sit' })),
      ...beanBags.map((b) => ({ position: at(b.x, b.z), approach: at(b.x, b.z - 0.9), facing: Math.PI, pose: 'sit' })),
      { position: at(pingPong.x - pingPong.length / 2 - 0.45, pingPong.z), facing: Math.PI / 2, pose: 'stand' },
      { position: at(pingPong.x + pingPong.length / 2 + 0.45, pingPong.z), facing: -Math.PI / 2, pose: 'stand' },
      ...cabinets.map((cab) => ({ position: at(cab.x, cab.z + 0.85), facing: Math.PI, pose: 'stand' })),
    ],
  };
}

function solidBox(w, h, d, color, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.position.set(position.x, h / 2, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.solid = true;
  return mesh;
}

function pingPongTable(position) {
  const { length, width } = LAYOUT.pingPong;
  const group = new THREE.Group();
  group.userData.solid = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, width), new THREE.MeshStandardMaterial({ color: COLORS.table, roughness: 0.5 }));
  top.position.y = 0.76;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);
  const lineMat = new THREE.MeshBasicMaterial({ color: COLORS.line });
  const centreLine = new THREE.Mesh(new THREE.BoxGeometry(length, 0.003, 0.02), lineMat);
  centreLine.position.y = 0.79;
  group.add(centreLine);
  const net = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, width + 0.1), new THREE.MeshStandardMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.85 }));
  net.position.y = 0.86;
  group.add(net);
  const legMat = new THREE.MeshStandardMaterial({ color: COLORS.dark });
  for (const x of [-length / 2 + 0.15, length / 2 - 0.15]) {
    for (const z of [-width / 2 + 0.12, width / 2 - 0.12]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), legMat);
      leg.position.set(x, 0.37, z);
      group.add(leg);
    }
  }
  group.position.set(position.x, 0, position.z);
  return group;
}

// Arcade cabinet facing +z, with a glowing screen and marquee in `glow`.
function arcadeCabinet(position, glow) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const body = new THREE.MeshStandardMaterial({ color: COLORS.cabinet, roughness: 0.5 });
  const lit = new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 1.2 });
  const box = (w, h, d, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(0, y, z);
    m.castShadow = true;
    group.add(m);
  };
  box(0.7, 1.75, 0.6, 0.875, 0, body);
  box(0.56, 0.42, 0.02, 1.25, 0.31, lit); // screen
  box(0.7, 0.16, 0.04, 1.68, 0.3, lit); // marquee
  box(0.6, 0.06, 0.25, 0.95, 0.38, body); // control deck
  group.position.set(position.x, 0, position.z);
  return group;
}

// Dark panelled backdrop right behind the TV with a warm top line and a teal base line, between two wood posts.
function tvBackdrop(tvPosition) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const width = 2.6;
  const height = 1.15;
  const centreY = 0.45 + height / 2;
  group.add(box(matte(CYBER.panel), width, height, 0.05, 0, centreY, 0));
  group.add(box(glow(CYBER.amber, 0.9), width, 0.03, 0.06, 0, 0.45 + height - 0.015, 0.005));
  group.add(box(glow(CYBER.teal, 0.8), width, 0.025, 0.06, 0, 0.45 + 0.0125, 0.005));
  for (const x of [-width / 2, width / 2]) group.add(box(matte(CYBER.wood, 0.7), 0.12, height + 0.1, 0.08, x, centreY, 0));
  group.position.set(tvPosition.x, 0, tvPosition.z - 0.22);
  return group;
}

function tvOnStand(position) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const dark = new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.5 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.35), new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.6 }));
  stand.position.y = 0.25;
  group.add(stand);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.06), dark);
  frame.position.y = 1.0;
  group.add(frame);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x3a6bd6, emissive: 0x3a6bd6, emissiveIntensity: 0.8 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.76), screenMat);
  screen.position.set(0, 1.0, 0.035);
  group.add(screen);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  group.userData.interact = { kind: 'tv', label: 'Play music on the TV' };
  // A texture is shown at full brightness (white base so it isn't tinted blue); null restores the plain blue.
  group.userData.tv = {
    setScreen(texture) {
      const blue = !texture;
      screenMat.map = texture;
      screenMat.emissiveMap = texture;
      screenMat.color.set(blue ? 0x3a6bd6 : 0xffffff);
      screenMat.emissive.set(blue ? 0x3a6bd6 : 0xffffff);
      screenMat.needsUpdate = true;
    },
  };
  group.position.set(position.x, 0, position.z);
  return group;
}

// Three-seat couch facing -z (towards the TV).
function couch(position) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const fabric = new THREE.MeshStandardMaterial({ color: COLORS.couch, roughness: 0.9 });
  const part = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fabric);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };
  part(2.0, 0.42, 0.8, 0, 0.21, 0); // seat
  part(2.0, 0.55, 0.2, 0, 0.6, 0.32); // back (behind the sitters, on the +z side)
  part(0.2, 0.55, 0.8, -1.0, 0.35, 0); // arms
  part(0.2, 0.55, 0.8, 1.0, 0.35, 0);
  group.position.set(position.x, 0, position.z);
  return group;
}

function beanBag(position, color) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  mesh.scale.set(1, 0.55, 1);
  mesh.position.set(position.x, 0.22, position.z);
  mesh.castShadow = true;
  mesh.userData.solid = true;
  return mesh;
}
