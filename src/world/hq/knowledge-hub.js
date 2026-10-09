import * as THREE from 'three';
import { box, CYBER, glow } from './cyber-style.js';
import { floorTrim } from './hq-decor.js';
import { backWallDressing } from './office-decor.js';
import { carpet, partition, roomBounds, wallBoard } from './room-parts.js';

// Knowledge hub: the boardroom's annex, between the boardroom and the skills room. It stands for the knowledge base in
// Google Drive: one labelled filing box per top-level HQ folder/doc on a wall shelf, each opening its Drive page.
export const KNOWLEDGE_HUB_TILES = { x: 8, z: 0, width: 6, depth: 6 };

const SHELF = { width: 5.2, depth: 0.45, levels: 3, levelHeight: 0.85, slotsPerLevel: 4 };
const BOX = { width: 1.0, height: 0.6, depth: 0.38 };
const SIGN = { width: 3.4, height: 0.55, centreY: 3.2 };
const TRIM_Y = 3.75; // above the sign

const COLORS = {
  carpet: 0x232c38, // same as the boardroom, so the two read as one suite
  shelf: CYBER.wood,
  label: '#fbfaf7',
  ink: '#2b2a33',
  muted: '#7a7d86',
  highlight: 0xffd27a,
  folders: [0x2f6fb0, 0x3f8a5c, 0x8a5cb8, 0xc0763a, 0xb8484f, 0x3a8a8a, 0x8a7a3a, 0x5a6b8a],
  doc: 0xe2ddd2,
};

export function buildKnowledgeHub(layout, hq) {
  const group = new THREE.Group();
  group.name = 'knowledge-hub';

  const { width, depth } = KNOWLEDGE_HUB_TILES;
  const { min, max, centre } = roomBounds(layout, KNOWLEDGE_HUB_TILES);

  group.add(carpet(width, depth, centre, COLORS.carpet));
  // Front glass only: the left side opens into the boardroom, the right side is the skills room's partition.
  group.add(partition(new THREE.Vector3(min.x, 0, max.z), new THREE.Vector3(max.x, 0, max.z), CYBER.teal));
  group.add(backWallDressing(min.x, max.x, min.z, CYBER.teal, TRIM_Y), floorTrim({ min, max, centre }));

  const shelfZ = min.z + SHELF.depth / 2;
  group.add(shelf(new THREE.Vector3(centre.x, 0, shelfZ)));

  const boxes = hq.items.slice(0, SHELF.levels * SHELF.slotsPerLevel).map((item, i) => {
    const level = SHELF.levels - 1 - Math.floor(i / SHELF.slotsPerLevel); // fill from the top shelf down
    const slot = i % SHELF.slotsPerLevel;
    const slotWidth = SHELF.width / SHELF.slotsPerLevel;
    const color = item.kind === 'doc' ? COLORS.doc : COLORS.folders[i % COLORS.folders.length];
    const box = fileBox(item, color);
    box.mesh.position.set(
      centre.x - SHELF.width / 2 + slotWidth * (slot + 0.5),
      shelfBaseY(level) + BOX.height / 2,
      shelfZ + (SHELF.depth - BOX.depth) / 2
    );
    group.add(box.mesh);
    return box;
  });

  const sign = wallBoard(SIGN.width, SIGN.height, drawSign(hq));
  sign.group.position.set(centre.x, SIGN.centreY, min.z + 0.04);
  sign.surface.userData.item = hq.root;
  group.add(sign.group);

  return { group, boxes, sign: sign.surface };
}

// World-space x-range the shelf and sign cover on the back wall, so the wall can keep windows clear of them.
export function knowledgeHubSpan(layout) {
  const { centre } = roomBounds(layout, KNOWLEDGE_HUB_TILES);
  const half = Math.max(SHELF.width, SIGN.width) / 2;
  return { minX: centre.x - half, maxX: centre.x + half };
}

// Points agents can walk between once they're in the boardroom: through the opening and up to the shelf.
export function knowledgeHubSpots(layout) {
  const { min, centre } = roomBounds(layout, KNOWLEDGE_HUB_TILES);
  return {
    fromBoardroom: new THREE.Vector3(min.x + 0.6, 0, centre.z),
    atShelf: new THREE.Vector3(centre.x, 0, min.z + SHELF.depth + 0.8),
    shelf: new THREE.Vector3(centre.x, 0, min.z),
  };
}

const shelfBaseY = (level) => 0.12 + level * SHELF.levelHeight;

function shelf(position) {
  const group = new THREE.Group();
  group.userData.solid = true;
  group.userData.interact = { kind: 'knowledge-hub', label: 'Browse knowledge hub' };
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.shelf, roughness: 0.6 });
  const height = shelfBaseY(SHELF.levels) + 0.04;
  const add = (w, h, d, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  };

  for (let level = 0; level <= SHELF.levels; level++) {
    add(SHELF.width, 0.05, SHELF.depth, 0, shelfBaseY(level) - 0.025);
  }
  for (const x of [-SHELF.width / 2, SHELF.width / 2]) {
    add(0.06, height, SHELF.depth, x, height / 2);
  }
  // A light line under the front edge of each shelf above the bottom one.
  for (let level = 1; level <= SHELF.levels; level++) {
    group.add(box(glow(CYBER.amber, 0.8), SHELF.width - 0.06, 0.02, 0.03, 0, shelfBaseY(level) - 0.06, SHELF.depth / 2 - 0.03));
  }

  group.position.copy(position);
  return group;
}

// A filing box with the item's name on a paper label on its front face.
function fileBox(item, color) {
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const front = new THREE.MeshStandardMaterial({ map: labelTexture(item, color), roughness: 0.7 });
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z
  const materials = [body, body, body, body, front, body];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(BOX.width, BOX.height, BOX.depth), materials);
  mesh.castShadow = true;
  mesh.userData.item = item;

  return {
    mesh,
    item,
    setHighlight(on) {
      for (const m of [body, front]) {
        m.emissive.setHex(on ? COLORS.highlight : 0x000000);
        m.emissiveIntensity = on ? 0.35 : 0;
      }
    },
  };
}

function labelTexture(item, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = Math.round(320 * (BOX.height / BOX.width));
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = COLORS.label;
  ctx.beginPath();
  ctx.roundRect(24, 34, w - 48, h - 68, 8);
  ctx.fill();

  // Docs are labelled with the first word of their title (their id); the full title shows in the hover tooltip.
  const text = item.kind === 'doc' ? item.title.split(' ')[0] : item.title;
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 40px system-ui, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2, w - 72);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function drawSign(hq) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * (SIGN.height / SIGN.width));
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.label;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 64px system-ui, "Segoe UI", sans-serif';
  ctx.fillText('Knowledge hub', 40, canvas.height / 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.muted;
  ctx.font = '500 34px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(`${hq.root.title} · Google Drive`, canvas.width - 40, canvas.height / 2 - 18);
  ctx.font = '500 26px system-ui, "Segoe UI", sans-serif';
  ctx.fillText(`snapshot ${hq.snapshotAt}`, canvas.width - 40, canvas.height / 2 + 24);

  return canvas;
}
