import * as THREE from 'three';
import { box, CYBER, glow, matte } from './cyber-style.js';

// Dressing shared by the rooms outside the boardroom, in the boardroom's cyber look: dark panelled walls with a wood
// band and glowing trim in the room's accent colour, dark carpets tinted by that colour, and floor guide lines.
// Everything here is decoration without colliders.

const WALL_HEIGHT = 4;
const BASE_CARPET = new THREE.Color(0x232c38); // the boardroom carpet

// Panelling sits a hair off the wall, so it is pushed back in depth to stay behind the window glass in front of it.
const panelMaterial = new THREE.MeshStandardMaterial({ color: CYBER.panel, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

// Dark carpet and rug colours (hex) tinted by a room's accent colour, so every room reads as part of one suite.
export function tintedFloor(accent) {
  const c = new THREE.Color(accent);
  return {
    carpet: BASE_CARPET.clone().lerp(c.clone().multiplyScalar(0.4), 0.3).getHex(),
    rug: BASE_CARPET.clone().lerp(c.clone().multiplyScalar(0.55), 0.5).getHex(),
  };
}

// Panelling for a wall `length` long, facing +z and centred on x. The wood band, cove line and top trim follow
// `accent`; `trimY` is the trim height, kept clear above whatever is mounted on the wall.
export function wallDressing(length, accent, trimY = 3.3) {
  const group = new THREE.Group();
  const line = glow(accent, 0.8);
  group.add(box(panelMaterial, length, WALL_HEIGHT, 0.012, 0, WALL_HEIGHT / 2, 0.006));
  group.add(box(matte(CYBER.wood, 0.7), length, 0.6, 0.026, 0, 0.5, 0.013));
  group.add(box(line, length, 0.025, 0.034, 0, 0.84, 0.017));
  group.add(box(line, length, 0.04, 0.034, 0, trimY, 0.017));
  const bar = Math.min(1.4, length - 0.4);
  group.add(box(glow(CYBER.amber, 0.9), bar, 0.04, 0.04, length / 2 - 0.2 - bar / 2, trimY - 0.12, 0.02));
  return group;
}

// Panelling over the wall at world z `z` between x0 and x1, facing +z (into the office).
export function backWallDressing(x0, x1, z, accent, trimY) {
  const group = wallDressing(x1 - x0, accent, trimY);
  group.position.set((x0 + x1) / 2, 0, z);
  return group;
}

// Panelling over the wall at world x `x` between z0 and z1, facing +x (into the office).
export function westWallDressing(z0, z1, x, accent, trimY) {
  const group = wallDressing(z1 - z0, accent, trimY);
  group.position.set(x, 0, (z0 + z1) / 2);
  group.rotation.y = Math.PI / 2;
  return group;
}
