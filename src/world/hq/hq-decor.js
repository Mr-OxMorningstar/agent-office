import * as THREE from 'three';
import { animate, box, CYBER, glow, matte } from './cyber-style.js';
import { plant } from './room-parts.js';

// Cyber-intel dressing for the boardroom (HQ): dark panelled walls with glowing trim, a holo table top, a wall of
// live-looking monitors, a rug under the table and a reading corner. Everything here is decoration; only the armchair,
// floor lamp and plants carry colliders.

const COLORS = {
  ...CYBER,
  rug: 0x6b2f2a,
  rugBorder: 0xb9822f,
  fabric: 0xc2703d,
  lampWood: 0x4a3222,
};

const TRIM_Y = 3.3; // above the top of the boards mounted on these walls
const MONITOR_WALL = { width: 2.8, bottomY: 1.25, panelHeight: 0.85, gap: 0.1 };
const TABLE = { length: 4.4, width: 1.6, topY: 0.8 };
const LAMP = { x: -15.75, z: -5.0 };

// Builds the decor. `suite` is the boardroom's { min, max, centre }, `table` the table's centre.
export function buildHqDecor(suite, table) {
  const group = new THREE.Group();
  group.name = 'hq-decor';
  group.add(wallPanels(suite), floorTrim(suite), rug(table.x, table.z), holoTable(table), monitorWall(suite));

  const reading = readingCorner();
  group.add(reading.group);

  // Cool light over the table against the warm lamp in the reading corner.
  const tableLight = new THREE.PointLight(COLORS.cyan, 9, 8, 2);
  tableLight.position.set(table.x, 2.7, table.z);
  group.add(tableLight);

  const corner = plant(new THREE.Vector3(suite.min.x + 0.45, 0, suite.max.z - 0.55));
  corner.scale.setScalar(1.2);
  group.add(corner);
  return group;
}

// Dark panelling over the back and west walls with a wood band, a glowing cove line and a top trim.
function wallPanels({ min, max, centre }) {
  const group = new THREE.Group();
  const panel = matte(COLORS.panel);
  const wood = matte(COLORS.wood, 0.7);
  const width = max.x - min.x;
  const depth = max.z - min.z;
  const height = 4;

  // Back wall: spans x, hugs min.z.
  group.add(box(panel, width, height, 0.012, centre.x, height / 2, min.z + 0.006));
  group.add(box(wood, width, 0.6, 0.026, centre.x, 0.5, min.z + 0.013));
  group.add(box(glow(COLORS.teal, 0.8), width, 0.025, 0.034, centre.x, 0.84, min.z + 0.017));
  group.add(box(glow(COLORS.teal, 0.8), width, 0.04, 0.034, centre.x, TRIM_Y, min.z + 0.017));
  group.add(box(glow(COLORS.amber, 0.9), 1.4, 0.04, 0.04, max.x - 1, TRIM_Y - 0.12, min.z + 0.02));

  // West wall: spans z, hugs min.x.
  group.add(box(panel, 0.012, height, depth, min.x + 0.006, height / 2, centre.z));
  group.add(box(wood, 0.026, 0.6, depth, min.x + 0.013, 0.5, centre.z));
  group.add(box(glow(COLORS.teal, 0.8), 0.034, 0.025, depth, min.x + 0.017, 0.84, centre.z));
  group.add(box(glow(COLORS.teal, 0.8), 0.034, 0.04, depth, min.x + 0.017, TRIM_Y, centre.z));
  group.add(box(glow(COLORS.amber, 0.9), 0.04, 0.04, 1.4, min.x + 0.02, TRIM_Y - 0.12, max.z - 1));
  return group;
}

// Thin glowing lines along the back, west and east edges of the floor (the front edge is the door side).
export function floorTrim({ min, max, centre }) {
  const group = new THREE.Group();
  const inset = 0.15;
  const line = 0.06;
  const teal = glow(COLORS.teal, 0.7);
  const x0 = min.x + inset;
  const x1 = max.x - inset;
  const z0 = min.z + inset;
  const z1 = max.z - inset;
  group.add(box(teal, x1 - x0, 0.012, line, centre.x, 0.012, z0));
  group.add(box(teal, line, 0.012, z1 - z0, x0, 0.012, centre.z));
  group.add(box(glow(COLORS.amber, 0.7), line, 0.012, z1 - z0, x1, 0.012, centre.z));
  return group;
}

export function roundedRect(path, w, h, r) {
  path.moveTo(-w / 2 + r, -h / 2);
  path.lineTo(w / 2 - r, -h / 2);
  path.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  path.lineTo(w / 2, h / 2 - r);
  path.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  path.lineTo(-w / 2 + r, h / 2);
  path.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  path.lineTo(-w / 2, -h / 2 + r);
  path.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return path;
}

// Wool rug centred at (x, z): a coloured field with a brass border stripe, by default the burgundy one under the table.
export function rug(x, z, w = 6.4, d = 3.2, fieldColor = COLORS.rug, borderColor = COLORS.rugBorder) {
  const group = new THREE.Group();
  const field = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), w, d, 0.4)), matte(fieldColor, 1));
  const stripe = roundedRect(new THREE.Shape(), w - 0.3, d - 0.3, 0.3);
  stripe.holes.push(roundedRect(new THREE.Path(), w - 0.5, d - 0.5, 0.25));
  const border = new THREE.Mesh(new THREE.ShapeGeometry(stripe), matte(borderColor, 1));
  field.rotation.x = border.rotation.x = -Math.PI / 2;
  field.position.set(x, 0.009, z);
  border.position.set(x, 0.011, z);
  field.receiveShadow = true;
  group.add(field, border);
  return group;
}

// Glowing edge lines and an animated holographic projection on the table top.
function holoTable(table) {
  const group = new THREE.Group();
  const { length, width, topY } = TABLE;
  // Light lines run down the outer faces of the top, leaving its surface edge to the per-seat glow strips.
  const edge = glow(COLORS.cyan, 1);
  const y = topY - 0.065;
  group.add(box(edge, length, 0.02, 0.01, 0, y, -width / 2 - 0.004));
  group.add(box(edge, length, 0.02, 0.01, 0, y, width / 2 + 0.004));
  group.add(box(glow(COLORS.amber, 1), 0.01, 0.02, width, -length / 2 - 0.004, y, 0));
  group.add(box(glow(COLORS.amber, 1), 0.01, 0.02, width, length / 2 + 0.004, y, 0));

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const holo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 1.06),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  holo.rotation.x = -Math.PI / 2;
  holo.position.y = topY + 0.012;
  animate(holo, texture, 8, (t) => drawHolo(canvas.getContext('2d'), canvas.width, canvas.height, t));
  group.add(holo);

  group.position.set(table.x, 0, table.z);
  return group;
}

function drawHolo(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(79, 212, 230, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 32) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += 32) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  const cx = w / 2;
  const cy = h / 2;
  ctx.lineWidth = 3;
  for (const [r, speed, color] of [[62, 0.8, 'rgba(79, 212, 230, 0.8)'], [44, -1.3, 'rgba(255, 179, 71, 0.8)'], [26, 1.9, 'rgba(47, 214, 200, 0.8)']]) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, t * speed, t * speed + Math.PI * 1.3);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(79, 212, 230, 0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, 5 + Math.sin(t * 3) * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Drifting data points to either side of the centre.
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const x = cx + side * (110 + ((i * 53 + t * 20) % 130));
    const y = 20 + ((i * 37) % (h - 40)) + Math.sin(t * 2 + i) * 4;
    ctx.fillStyle = i % 3 ? 'rgba(79, 212, 230, 0.8)' : 'rgba(255, 179, 71, 0.9)';
    ctx.fillRect(x, y, 5, 5);
  }
}

// Four screens on the west wall at the front of the room, facing the docs desks: a world map, radar, network graph
// and data feed. Each redraws a small canvas a few times a second.
function monitorWall({ min, max }) {
  const group = new THREE.Group();
  const { width, bottomY, panelHeight, gap } = MONITOR_WALL;
  const topY = bottomY + panelHeight + gap;
  const panels = [
    { w: 1.7, x: -width / 2, y: topY, draw: drawMap(), fps: 4 },
    { w: 1.0, x: -width / 2 + 1.8, y: topY, draw: drawRadar, fps: 8 },
    { w: 1.2, x: -width / 2, y: bottomY, draw: drawGraph(), fps: 5 },
    { w: 1.5, x: -width / 2 + 1.3, y: bottomY, draw: drawFeed(), fps: 5 },
  ];
  for (const p of panels) {
    const screen = screenPanel(p.w, panelHeight, p.fps, p.draw);
    screen.position.set(p.x + p.w / 2, p.y + panelHeight / 2, 0);
    group.add(screen);
  }
  group.add(box(glow(COLORS.teal, 0.9), width, 0.03, 0.05, 0, bottomY - 0.08, 0.02));

  // The wall section in front of the pod, between the status wall and the corner; the group faces +x like the status wall.
  group.position.set(min.x + 0.04, 0, max.z - 0.15 - width / 2);
  group.rotation.y = Math.PI / 2;
  return group;
}

const bezelMaterial = new THREE.MeshStandardMaterial({ color: CYBER.frame, roughness: 0.5, metalness: 0.3 });

// A w x h screen in a dark bezel, facing +z and centred on the origin. `draw(ctx, width, height, seconds)` repaints its
// canvas (200 px per unit) at most `fps` times a second, and only while the screen is on show.
export function screenPanel(w, h, fps, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * 200);
  canvas.height = Math.round(h * 200);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.z = 0.03;
  animate(screen, texture, fps, (t) => draw(canvas.getContext('2d'), canvas.width, canvas.height, t));
  const group = new THREE.Group();
  group.add(box(bezelMaterial, w + 0.05, h + 0.05, 0.04, 0, 0, 0.01), screen);
  return group;
}

const SCREEN_BG = '#06121a';
const mono = (size) => `${size}px ui-monospace, Consolas, monospace`;

function label(ctx, text, w, color = '#4fd4e6') {
  ctx.font = mono(11);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(text, 8, 6);
  ctx.fillStyle = 'rgba(79, 212, 230, 0.35)';
  ctx.fillRect(8, 21, w - 16, 1);
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Dot-matrix world map with blinking pings; the land mask is computed once.
export function drawMap() {
  const cols = 62;
  const rows = 22;
  const land = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = Math.sin(x * 0.31 + 1) + Math.sin(y * 0.55 + x * 0.11) + Math.sin(x * 0.12 - y * 0.35 + 2) * 1.2 + Math.cos(x * 0.57) * 0.5;
      if (v > 0.85 && y > 1 && y < rows - 1) land.push([x, y]);
    }
  }
  const random = seeded(7);
  const pings = Array.from({ length: 6 }, () => land[Math.floor(random() * land.length)]);
  return (ctx, w, h, t) => {
    ctx.fillStyle = SCREEN_BG;
    ctx.fillRect(0, 0, w, h);
    label(ctx, 'GLOBAL WATCH', w);
    const cell = (w - 16) / cols;
    const top = 30;
    ctx.fillStyle = 'rgba(47, 214, 200, 0.55)';
    for (const [x, y] of land) ctx.fillRect(8 + x * cell, top + y * cell * 1.15, cell * 0.6, cell * 0.6);
    pings.forEach(([x, y], i) => {
      const phase = (t * 0.7 + i * 0.37) % 1;
      const px = 8 + x * cell;
      const py = top + y * cell * 1.15;
      ctx.strokeStyle = `rgba(255, 179, 71, ${1 - phase})`;
      ctx.beginPath();
      ctx.arc(px, py, 2 + phase * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    });
  };
}

export function drawRadar(ctx, w, h, t) {
  ctx.fillStyle = SCREEN_BG;
  ctx.fillRect(0, 0, w, h);
  label(ctx, 'RADAR', w);
  const cx = w / 2;
  const cy = h / 2 + 12;
  const radius = Math.min(w, h - 30) / 2 - 6;
  ctx.strokeStyle = 'rgba(47, 214, 200, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [1, 0.66, 0.33]) {
    ctx.moveTo(cx + radius * k, cy);
    ctx.arc(cx, cy, radius * k, 0, Math.PI * 2);
  }
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  const sweep = (t * 1.6) % (Math.PI * 2);
  for (let i = 0; i < 14; i++) {
    const a = sweep - i * 0.06;
    ctx.strokeStyle = `rgba(79, 212, 230, ${0.55 * (1 - i / 14)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
  }
  for (const [a, r] of [[0.9, 0.5], [2.4, 0.75], [3.8, 0.35], [5.2, 0.6]]) {
    const age = (((sweep - a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    ctx.fillStyle = `rgba(255, 179, 71, ${Math.max(0.15, 1 - age / 4)})`;
    ctx.fillRect(cx + Math.cos(a) * radius * r - 2, cy + Math.sin(a) * radius * r - 2, 4, 4);
  }
}

// Node-and-edge network with pulses travelling along the links.
export function drawGraph() {
  const random = seeded(21);
  const nodes = Array.from({ length: 11 }, () => [0.08 + random() * 0.84, 0.2 + random() * 0.7]);
  const edges = [];
  nodes.forEach((a, i) => {
    nodes.forEach((b, j) => {
      if (j > i && Math.hypot(a[0] - b[0], (a[1] - b[1]) * 0.7) < 0.36) edges.push([i, j]);
    });
  });
  return (ctx, w, h, t) => {
    ctx.fillStyle = SCREEN_BG;
    ctx.fillRect(0, 0, w, h);
    label(ctx, 'NETWORK', w);
    const at = ([x, y]) => [x * w, y * h];
    ctx.strokeStyle = 'rgba(79, 212, 230, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [i, j] of edges) {
      const [ax, ay] = at(nodes[i]);
      const [bx, by] = at(nodes[j]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
    edges.forEach(([i, j], k) => {
      const f = (t * 0.5 + k * 0.23) % 1;
      const [ax, ay] = at(nodes[i]);
      const [bx, by] = at(nodes[j]);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(ax + (bx - ax) * f - 1.5, ay + (by - ay) * f - 1.5, 3, 3);
    });
    nodes.forEach((n, i) => {
      const [x, y] = at(n);
      ctx.fillStyle = i % 4 === 0 ? '#ffb347' : '#2fd6c8';
      ctx.beginPath();
      ctx.arc(x, y, 3 + Math.sin(t * 2 + i) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    });
  };
}

// Scrolling lines of hex-looking data; a few lines are flagged amber.
export function drawFeed() {
  const random = seeded(99);
  const hex = (n) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  const lines = Array.from({ length: 32 }, () => ({ text: `${hex(4)} ${hex(8)} ${hex(6)} ${hex(4)}`, flag: random() < 0.12 }));
  const lineHeight = 14;
  return (ctx, w, h, t) => {
    ctx.fillStyle = SCREEN_BG;
    ctx.fillRect(0, 0, w, h);
    ctx.font = mono(11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const offset = (t * 12) % (lines.length * lineHeight);
    const first = Math.floor(offset / lineHeight);
    for (let i = 0; i < Math.ceil((h - 28) / lineHeight) + 1; i++) {
      const line = lines[(first + i) % lines.length];
      ctx.fillStyle = line.flag ? '#ffb347' : 'rgba(47, 214, 200, 0.75)';
      ctx.fillText(line.text, 8, 28 + i * lineHeight - (offset % lineHeight));
    }
    ctx.fillStyle = SCREEN_BG;
    ctx.fillRect(0, 0, w, 26);
    label(ctx, 'INTERCEPT FEED', w);
  };
}

const upholstery = new Map();
const lampParts = {};

// Armchair in `color` facing +z. `shadows` lets the hq reading corner cast shadows without every copy doing so.
export function armchair(color = COLORS.fabric, shadows = true) {
  if (!upholstery.has(color)) upholstery.set(color, matte(color, 1));
  const fabric = upholstery.get(color);
  const legs = lampWood();
  const chair = new THREE.Group();
  chair.userData.solid = true;
  const part = (material, w, h, d, x, y, z) => {
    const mesh = box(material, w, h, d, x, y, z);
    mesh.castShadow = shadows;
    chair.add(mesh);
  };
  for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) part(legs, 0.06, 0.14, 0.06, x, 0.07, z);
  part(fabric, 0.8, 0.24, 0.8, 0, 0.26, 0);
  part(fabric, 0.62, 0.12, 0.6, 0, 0.44, 0.06);
  part(fabric, 0.8, 0.56, 0.18, 0, 0.62, -0.31);
  part(fabric, 0.14, 0.3, 0.7, -0.33, 0.5, 0.04);
  part(fabric, 0.14, 0.3, 0.7, 0.33, 0.5, 0.04);
  return chair;
}

function lampWood() {
  lampParts.wood ??= matte(COLORS.lampWood, 0.6);
  return lampParts.wood;
}

// Floor lamp with a glowing shade. The shade is emissive only; the lamp casts no light by itself.
export function floorLamp() {
  lampParts.base ??= new THREE.CylinderGeometry(0.14, 0.16, 0.03, 16);
  lampParts.pole ??= new THREE.CylinderGeometry(0.015, 0.015, 1.3, 8);
  lampParts.shade ??= new THREE.CylinderGeometry(0.15, 0.22, 0.3, 16, 1, true);
  lampParts.shadeMaterial ??= new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: COLORS.amber, emissiveIntensity: 0.9, roughness: 0.8, side: THREE.DoubleSide });
  const lamp = new THREE.Group();
  lamp.userData.solid = true;
  const base = new THREE.Mesh(lampParts.base, lampWood());
  base.position.y = 0.015;
  const pole = new THREE.Mesh(lampParts.pole, lampWood());
  pole.position.y = 0.68;
  const shade = new THREE.Mesh(lampParts.shade, lampParts.shadeMaterial);
  shade.position.y = 1.4;
  lamp.add(base, pole, shade);
  return lamp;
}

// Armchair and floor lamp by the door side of the room, with the warm light the lamp throws.
function readingCorner() {
  const group = new THREE.Group();
  const chair = armchair();
  chair.position.set(LAMP.x + 1.05, 0, LAMP.z);
  chair.rotation.y = Math.PI; // faces north, towards the table
  group.add(chair);

  const lamp = floorLamp();
  lamp.position.set(LAMP.x, 0, LAMP.z);
  group.add(lamp);

  const light = new THREE.PointLight(COLORS.amber, 6, 5, 2);
  light.position.set(LAMP.x, 1.35, LAMP.z);
  group.add(light);
  return { group };
}
