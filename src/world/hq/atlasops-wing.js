import * as THREE from 'three';
import { animate, box, CYBER, cyberMaterials, glow, matte, trimLine } from './cyber-style.js';
import { carpet, partition, partitionWithDoor, plant, roomBounds } from './room-parts.js';

// AtlasOps wing: the east end of the office, a dark-panelled ops centre for AtlasOps (AWS cost audit + security
// dashboard), styled like the boardroom. The main hall runs the full depth of the east end; an annex fills the free
// floor beside the Tech Lead room. Two doors open onto the lobby lanes and one into the annex. Inside: huge wall
// screens (spend, findings, scan status, the automation backlog, the capture desk) and a holographic
// "war table" (a spend tower and finding beacons per account).
// Frontend only for now: `data` is shaped like the AtlasOps Supabase tables (see src/data/atlasops-sample.json)
// and boards marked `sample` carry a SAMPLE label; the backlog is a snapshot of the HQ automation backlog.
export const ATLASOPS_TILES = { x: 32, z: 0, width: 8, depth: 22 };
export const ATLASOPS_ANNEX_TILES = { x: 26, z: 0, width: 6, depth: 6 };

const ACCENT = CYBER.cyan;
const DOOR_WIDTH = 1.6;
const LANES_Z = [-4, 4]; // world z of the lobby lanes the doors open onto
const WALL_HEIGHT = 4;
const SCREEN_Y = 2.2; // centre height of the wall screens
const TEXTURE_SCALE = 1.5; // canvas pixels per logical pixel; the draw code works in a 1280-wide space
// Screen sizes keep the aspect ratio their content is laid out for. `wall` is where each one hangs.
const SCREENS = {
  spend: { width: 7.2, height: 2.7, wall: 'back', along: 'main' },
  findings: { width: 4.4, height: 2.75, wall: 'back', along: 'annex' },
  backlog: { width: 6.4, height: 2.8, wall: 'east', z: -5.5 },
  scans: { width: 4.4, height: 2.75, wall: 'east', z: 0.5 },
  capture: { width: 3.0, height: 2.15, wall: 'east', z: 6.2 },
};
const TICKER = { width: 2.4, height: 1.3, z: 9.4 };
const TABLE = { z: -6.5, radius: 1.15 };

const COLORS = {
  carpet: 0x232c38,
  board: '#0f1724',
  panel: '#16233a',
  ink: '#e8f1fb',
  muted: '#8aa0b8',
  accent: '#1aa3d9',
  severity: { critical: '#ff4d6d', high: '#ff8a3d', medium: '#ffd24f', low: '#7dd3fc' },
  priority: { CRITICAL: '#ff4d6d', HIGH: '#ff8a3d', MED: '#ffd24f', LOW: '#7dd3fc' },
  status: { ok: '#2bd67b', stale: '#ffd24f', failed: '#ff4d6d' },
  accounts: [0x31c4f3, 0xa78bfa, 0x2bd67b, 0xffd24f],
};
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const PRIORITIES = ['CRITICAL', 'HIGH', 'MED', 'LOW'];
const FONT = (weight, size) => `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;

export function buildAtlasOpsWing(layout, { data, backlog }) {
  const group = new THREE.Group();
  group.name = 'atlasops-wing';
  const { min, max, centre } = roomBounds(layout, ATLASOPS_TILES);
  const annex = roomBounds(layout, ATLASOPS_ANNEX_TILES);
  const at = (x, z) => new THREE.Vector3(x, 0, z);

  group.add(carpet(ATLASOPS_TILES.width, ATLASOPS_TILES.depth, centre, COLORS.carpet));
  group.add(carpet(ATLASOPS_ANNEX_TILES.width, ATLASOPS_ANNEX_TILES.depth, annex.centre, COLORS.carpet));
  group.add(wallDressing(annex.min.x, max.x, min.z, max.x, min.z, max.z));
  group.add(floorTrim(annex, { min, max }));

  // The main hall's west glass has a door onto each lobby lane and is open to the annex above the first lane; the
  // annex has glass to the west and south (with a door). Glass along the office's open front edge.
  const doorEdges = LANES_Z.flatMap((z) => [z - DOOR_WIDTH / 2, z + DOOR_WIDTH / 2]);
  const westStops = [...doorEdges.slice(1), max.z];
  for (let i = 0; i < westStops.length; i += 2) group.add(partition(at(min.x, westStops[i]), at(min.x, westStops[i + 1]), ACCENT));
  group.add(partition(at(min.x, max.z), at(max.x, max.z), ACCENT));
  group.add(partition(at(annex.min.x, annex.min.z), at(annex.min.x, annex.max.z), ACCENT));
  group.add(partitionWithDoor(at(annex.min.x, annex.max.z), at(annex.max.x, annex.max.z), at(annex.centre.x, annex.max.z), DOOR_WIDTH, ACCENT));

  const hang = (name, interact, draw) => {
    const size = SCREENS[name];
    const screen = wallScreen(name, size, interact, draw);
    if (size.wall === 'back') {
      const x = size.along === 'main' ? centre.x : annex.centre.x;
      screen.position.set(x, SCREEN_Y, min.z + 0.04);
    } else {
      screen.position.set(max.x - 0.04, SCREEN_Y, size.z);
      screen.rotation.y = -Math.PI / 2;
    }
    group.add(screen);
  };
  hang('spend', { kind: 'atlas', label: 'Check AtlasOps spend', data: { panel: 'spend' } }, (c) => drawSpend(c, data));
  hang('backlog', { kind: 'atlas', label: 'Check the automation backlog', data: { panel: 'backlog' } }, (c) => drawBacklog(c, backlog));
  hang('findings', { kind: 'atlas', label: 'Check AtlasOps findings', data: { panel: 'findings' } }, (c) => drawFindings(c, data));
  hang('scans', { kind: 'atlas', label: 'Check scan status', data: { panel: 'scans' } }, (c) => drawScans(c, data));
  hang('capture', { kind: 'atlas', label: 'Check the Rule 4 capture desk', data: { panel: 'capture' } }, (c) => drawCapture(c, backlog));

  const ticker = liveTicker();
  ticker.position.set(max.x - 0.04, 1.9, TICKER.z);
  ticker.rotation.y = -Math.PI / 2;
  group.add(ticker);

  const table = warTable(data);
  table.group.position.set(centre.x, 0, TABLE.z);
  group.add(table.group, tableRug(at(centre.x, TABLE.z)));

  group.add(plant(at(annex.min.x + 0.5, annex.min.z + 0.55)), plant(at(max.x - 0.5, max.z - 0.6)), plant(at(min.x + 0.55, max.z - 0.6)));

  // Cool light over the hall and a warm one towards the front, like the boardroom's table and lamp.
  const cool = new THREE.PointLight(CYBER.cyan, 8, 11, 2);
  cool.position.set(min.x + 1, 2.8, -6);
  const warm = new THREE.PointLight(CYBER.amber, 5, 9, 2);
  warm.position.set(centre.x, 2.6, 4);
  group.add(cool, warm);

  return { group, update: table.update };
}

// World-space x-range of the AtlasOps wall on the office's back wall, so the wall can keep windows clear of it.
export function atlasOpsWallSpan(layout) {
  const annex = roomBounds(layout, ATLASOPS_ANNEX_TILES);
  const { max } = roomBounds(layout, ATLASOPS_TILES);
  return { minX: annex.min.x, maxX: max.x };
}

// --- Walls and floor -----------------------------------------------------------------------------------------------

// Dark panelling with a wood band, a glowing cove line and a top trim over the back wall (x0..x1, hugging backZ) and a
// solid east wall (hugging eastX, z0..z1), as in the boardroom.
function wallDressing(x0, x1, backZ, eastX, z0, z1) {
  const group = new THREE.Group();
  const m = cyberMaterials();
  const width = x1 - x0;
  const depth = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const cove = glow(CYBER.teal, 0.8);

  group.add(box(m.panel, width, WALL_HEIGHT, 0.012, cx, WALL_HEIGHT / 2, backZ + 0.006));
  group.add(box(m.wood, width, 0.6, 0.026, cx, 0.5, backZ + 0.013));
  group.add(trimLine({ x: x0, z: backZ + 0.017 }, { x: x1, z: backZ + 0.017 }, 0.84, cove, 0.025));
  group.add(trimLine({ x: x0, z: backZ + 0.017 }, { x: x1, z: backZ + 0.017 }, WALL_HEIGHT - 0.15, m.teal));
  group.add(box(m.amber, 1.4, 0.04, 0.04, x1 - 1, WALL_HEIGHT - 0.27, backZ + 0.02));

  // East wall: a solid slab just outside the walkable bounds, clad on the inside.
  group.add(box(m.panel, 0.2, WALL_HEIGHT, depth, eastX + 0.1, WALL_HEIGHT / 2, cz));
  group.add(box(m.wood, 0.026, 0.6, depth, eastX - 0.013, 0.5, cz));
  group.add(trimLine({ x: eastX - 0.017, z: z0 }, { x: eastX - 0.017, z: z1 }, 0.84, cove, 0.025));
  group.add(trimLine({ x: eastX - 0.017, z: z0 }, { x: eastX - 0.017, z: z1 }, WALL_HEIGHT - 0.15, m.teal));
  group.add(box(m.amber, 0.04, 0.04, 1.4, eastX - 0.02, WALL_HEIGHT - 0.27, z1 - 1));
  return group;
}

// Thin glowing lines along the back, west and east edges of the floor, around the hall and the annex.
function floorTrim(annex, hall) {
  const group = new THREE.Group();
  const inset = 0.15;
  const line = (from, to, material) => group.add(trimLine(from, to, 0.012, material, 0.012, 0.06));
  const teal = glow(CYBER.teal, 0.7);
  const amber = glow(CYBER.amber, 0.7);
  const z0 = hall.min.z + inset;
  const z1 = hall.max.z - inset;
  const x0 = annex.min.x + inset;
  const x1 = hall.max.x - inset;
  line({ x: x0, z: z0 }, { x: x1, z: z0 }, teal);
  line({ x: x0, z: z0 }, { x: x0, z: annex.max.z - inset }, teal);
  line({ x: hall.min.x + inset, z: annex.max.z + inset }, { x: hall.min.x + inset, z: z1 }, teal);
  line({ x: x1, z: z0 }, { x: x1, z: z1 }, amber);
  return group;
}

// Dark rug with an amber ring under the war table.
function tableRug(position) {
  const group = new THREE.Group();
  const field = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), matte(0x10303a, 1));
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.3, 64), glow(CYBER.amber, 0.6));
  field.rotation.x = ring.rotation.x = -Math.PI / 2;
  field.position.y = 0.009;
  ring.position.y = 0.011;
  field.receiveShadow = true;
  group.add(field, ring);
  group.position.copy(position);
  return group;
}

// --- Screens -------------------------------------------------------------------------------------------------------

// Soft edge glow behind a screen: a stretched radial falloff, shared by every screen.
let haloTexture = null;
function halo() {
  if (!haloTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 14, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(canvas);
  }
  return haloTexture;
}

// Canvas of a screen: 1280 logical pixels wide, `TEXTURE_SCALE` times that in real pixels. The returned shim gives the
// draw functions the logical size and a context already scaled to it.
function screenCanvas(size) {
  const canvas = document.createElement('canvas');
  const width = 1280;
  const height = Math.round(width * (size.height / size.width));
  canvas.width = Math.round(width * TEXTURE_SCALE);
  canvas.height = Math.round(height * TEXTURE_SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  return { canvas, shim: { width, height, getContext: () => ctx } };
}

// Wall-hung screen with a thin dark bezel, a glowing lower edge and a soft halo, facing +z from its group's origin on
// the wall. The canvas is drawn once by `draw`; the group carries `interact`.
function wallScreen(name, size, interact, draw) {
  const { canvas, shim } = screenCanvas(size);
  draw(shim);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const group = new THREE.Group();
  group.name = `atlas-${name}`;
  group.userData.interact = interact;
  const glowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(size.width + 1, size.height + 1),
    new THREE.MeshBasicMaterial({ map: halo(), color: CYBER.teal, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glowPlane.position.z = 0.004;
  const bezel = box(cyberMaterials().frame, size.width + 0.07, size.height + 0.07, 0.04, 0, 0, 0.02);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(size.width, size.height), new THREE.MeshBasicMaterial({ map: texture }));
  surface.position.z = 0.045;
  const edge = box(glow(CYBER.teal, 0.9), size.width + 0.07, 0.03, 0.05, 0, -size.height / 2 - 0.065, 0.025);
  group.add(glowPlane, bezel, surface, edge);
  return group;
}

// Small decorative screen of scrolling scan lines, redrawn a few times a second while on screen.
function liveTicker() {
  const group = new THREE.Group();
  group.name = 'atlas-ticker';
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(TICKER.width * 200);
  canvas.height = Math.round(TICKER.height * 200);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(TICKER.width, TICKER.height), new THREE.MeshBasicMaterial({ map: texture }));
  surface.position.z = 0.045;
  group.add(box(cyberMaterials().frame, TICKER.width + 0.07, TICKER.height + 0.07, 0.04, 0, 0, 0.02), surface);
  group.add(box(glow(CYBER.amber, 0.9), TICKER.width + 0.07, 0.03, 0.05, 0, -TICKER.height / 2 - 0.065, 0.025));

  const lines = Array.from({ length: 24 }, (_, i) => ({
    text: `${((i + 1) * 2654435761 >>> 0).toString(16).padStart(8, '0')}  scan ${(i * 7919) % 997}  ${i % 4 === 3 ? 'warn' : 'ok'}`,
    flag: i % 4 === 3,
  }));
  const lineHeight = 18;
  animate(surface, texture, 5, (t) => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#06121a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '13px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const offset = (t * 14) % (lines.length * lineHeight);
    const first = Math.floor(offset / lineHeight);
    for (let i = 0; i < Math.ceil((canvas.height - 30) / lineHeight) + 1; i++) {
      const line = lines[(first + i) % lines.length];
      ctx.fillStyle = line.flag ? '#ffb347' : 'rgba(47, 214, 200, 0.75)';
      ctx.fillText(line.text, 10, 32 + i * lineHeight - (offset % lineHeight));
    }
    ctx.fillStyle = '#06121a';
    ctx.fillRect(0, 0, canvas.width, 28);
    ctx.fillStyle = '#4fd4e6';
    ctx.fillText('LIVE SCAN FEED', 10, 8);
  });
  return group;
}

function header(ctx, w, title, subtitle, sample) {
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, w, ctx.canvas.height);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, w, 8);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = FONT(800, 44);
  ctx.fillText(title, 36, 56);
  ctx.fillStyle = COLORS.muted;
  ctx.font = FONT(500, 24);
  ctx.fillText(subtitle, 36, 98);
  if (sample) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd24f';
    ctx.font = FONT(800, 26);
    ctx.fillText('SAMPLE DATA — not connected', w - 36, 56);
    ctx.textAlign = 'left';
  }
}

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const accountTotal = (data, id) => (data.cost_by_service[id] ?? []).reduce((s, x) => s + x.amount, 0);

function drawSpend(canvas, data) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  header(ctx, w, '🛰️ AtlasOps · Spend', `Actual spend, ${data.cost_by_service.period} (Cost Explorer)`, data.sample);
  const accounts = data.cloud_connections;
  const max = Math.max(...accounts.map((a) => accountTotal(data, a.id)), 1);
  const services = [...new Set(accounts.flatMap((a) => (data.cost_by_service[a.id] ?? []).map((s) => s.service)))];
  const serviceColor = (s) => ['#31c4f3', '#a78bfa', '#2bd67b', '#ffd24f', '#ff8a3d', '#f472b6', '#94a3b8'][services.indexOf(s) % 7];

  accounts.forEach((account, i) => {
    const y = 170 + i * 150;
    const total = accountTotal(data, account.id);
    ctx.fillStyle = COLORS.ink;
    ctx.font = FONT(800, 38);
    ctx.fillText(account.name, 36, y);
    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(500, 22);
    ctx.fillText(account.account_id, 36, y + 34);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.ink;
    ctx.font = FONT(800, 40);
    ctx.fillText(money(total), w - 36, y);
    ctx.textAlign = 'left';
    // Stacked bar by service, scaled to the biggest account.
    let x = 300;
    const barW = (w - 336 - 300) * (total / max);
    for (const s of data.cost_by_service[account.id] ?? []) {
      const sw = barW * (s.amount / total);
      ctx.fillStyle = serviceColor(s.service);
      ctx.fillRect(x, y + 10, Math.max(sw - 3, 1), 44);
      x += sw;
    }
  });

  // Legend.
  let lx = 36;
  const ly = canvas.height - 40;
  ctx.font = FONT(600, 22);
  for (const s of services) {
    ctx.fillStyle = serviceColor(s);
    ctx.fillRect(lx, ly - 10, 20, 20);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(s, lx + 28, ly);
    lx += 40 + ctx.measureText(s).width + 24;
  }
}

function drawFindings(canvas, data) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const findings = data.aws_findings;
  const waste = findings.filter((f) => f.category === 'cost').reduce((s, f) => s + f.monthly_cost, 0);
  header(ctx, w, 'Findings', `${findings.length} open · ${money(waste)}/mo flagged as waste`, data.sample);

  SEVERITIES.forEach((sev, i) => {
    const x = 36 + i * 300;
    const n = findings.filter((f) => f.severity === sev).length;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, 140, 280, 120);
    ctx.fillStyle = COLORS.severity[sev];
    ctx.fillRect(x, 140, 10, 120);
    ctx.font = FONT(800, 56);
    ctx.fillText(String(n), x + 34, 194);
    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(700, 22);
    ctx.fillText(sev.toUpperCase(), x + 34, 238);
  });

  const order = (f) => SEVERITIES.indexOf(f.severity);
  [...findings].sort((a, b) => order(a) - order(b)).slice(0, 5).forEach((f, i) => {
    const y = 316 + i * 62;
    ctx.fillStyle = COLORS.severity[f.severity];
    ctx.beginPath();
    ctx.arc(52, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.ink;
    ctx.font = FONT(600, 28);
    ctx.fillText(fit(ctx, f.title, 760), 80, y);
    ctx.fillStyle = COLORS.muted;
    ctx.font = FONT(500, 22);
    ctx.textAlign = 'right';
    ctx.fillText(`${connectionName(data, f.connection)} · ${f.region}`, w - 36, y);
    ctx.textAlign = 'left';
  });
}

function drawScans(canvas, data) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const scans = data.aws_scan_results;
  header(ctx, w, 'Scan status', 'Last scan per account and region', data.sample);
  const accounts = data.cloud_connections;
  const regions = [...new Set(scans.map((s) => s.region))];
  const colW = (w - 300) / regions.length;

  ctx.fillStyle = COLORS.muted;
  ctx.font = FONT(700, 22);
  regions.forEach((r, i) => {
    ctx.textAlign = 'center';
    ctx.fillText(r, 300 + colW * (i + 0.5), 150);
  });
  ctx.textAlign = 'left';
  accounts.forEach((account, row) => {
    const y = 230 + row * 150;
    ctx.fillStyle = COLORS.ink;
    ctx.font = FONT(800, 34);
    ctx.fillText(account.name, 36, y);
    regions.forEach((region, i) => {
      const scan = scans.find((s) => s.connection === account.id && s.region === region);
      const x = 300 + colW * i + 12;
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x, y - 52, colW - 24, 110);
      if (!scan) return;
      ctx.fillStyle = COLORS.status[scan.status] ?? COLORS.muted;
      ctx.fillRect(x, y - 52, colW - 24, 8);
      ctx.font = FONT(800, 26);
      ctx.fillText(scan.status.toUpperCase(), x + 16, y - 10);
      ctx.fillStyle = COLORS.muted;
      ctx.font = FONT(500, 20);
      ctx.fillText(scan.scanned_at ? `${scan.resources} res · ${scan.findings} findings` : 'never completed', x + 16, y + 30);
    });
  });
}

function drawBacklog(canvas, backlog) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  header(ctx, w, 'Automation backlog', `Every manual DevOps task becomes an AUTO item · ${backlog.items.length} items · next ${backlog.nextId}`, false);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.muted;
  ctx.font = FONT(600, 22);
  ctx.fillText('Backlog snapshot', w - 36, 56);
  ctx.textAlign = 'left';

  const colW = (w - 72) / PRIORITIES.length;
  PRIORITIES.forEach((p, col) => {
    const x = 36 + col * colW;
    const items = backlog.items.filter((i) => i.priority === p);
    ctx.fillStyle = COLORS.priority[p];
    ctx.font = FONT(800, 26);
    ctx.fillText(`${p} · ${items.length}`, x + 8, 146);
    const cardH = 58;
    items.slice(0, 8).forEach((item, row) => {
      const y = 172 + row * (cardH + 8);
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x + 6, y, colW - 20, cardH);
      ctx.fillStyle = COLORS.priority[p];
      ctx.fillRect(x + 6, y, 6, cardH);
      ctx.fillStyle = COLORS.ink;
      ctx.font = FONT(800, 20);
      ctx.fillText(item.id, x + 22, y + 20);
      ctx.fillStyle = COLORS.muted;
      ctx.font = FONT(500, 19);
      ctx.fillText(fit(ctx, item.title, colW - 48), x + 22, y + 43);
    });
    if (items.length > 8) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = FONT(600, 20);
      ctx.fillText(`+${items.length - 8} more`, x + 22, 172 + 8 * (cardH + 8) + 16);
    }
  });
}

function drawCapture(canvas, backlog) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  header(ctx, w, 'Rule 4 capture desk', `Next ID ${backlog.nextId}`, false);
  ctx.fillStyle = COLORS.ink;
  ctx.font = FONT(600, 34);
  ctx.fillText('Will watch sessions for:', 36, 200);
  ctx.fillStyle = COLORS.accent;
  ctx.font = FONT(700, 38);
  ctx.fillText('aws · az · terraform/tofu · kubectl', 36, 268);
  ctx.fillStyle = '#ffd24f';
  ctx.font = FONT(700, 30);
  ctx.fillText('Not connected yet', 36, 360);
  ctx.fillStyle = COLORS.muted;
  ctx.font = FONT(500, 26);
  ctx.fillText('Manual infra commands will appear here as AUTO cards to capture.', 36, 420);
}

// --- War table -------------------------------------------------------------------------------------------------------

// Round table with a glowing ring; per account a spend tower (height ~ month-to-date spend) and a beacon per open
// finding, coloured by severity, orbiting its top.
function warTable(data) {
  const group = new THREE.Group();
  group.name = 'atlas-war-table';
  group.userData.solid = true;
  group.userData.interact = { kind: 'atlas', label: 'Check the war table', data: { panel: 'table' } };

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(TABLE.radius, TABLE.radius * 0.9, 0.85, 40),
    new THREE.MeshStandardMaterial({ color: 0x0f1724, roughness: 0.4, metalness: 0.4 })
  );
  base.position.y = 0.425;
  base.castShadow = true;
  group.add(base);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(TABLE.radius - 0.05, 0.03, 8, 64),
    new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.4 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.87;
  group.add(ring);

  const accounts = data.cloud_connections;
  const max = Math.max(...accounts.map((a) => accountTotal(data, a.id)), 1);
  const beacons = [];
  accounts.forEach((account, i) => {
    const angle = (i / accounts.length) * Math.PI * 2;
    const x = Math.cos(angle) * 0.5;
    const z = Math.sin(angle) * 0.5;
    const height = 0.2 + 1.2 * (accountTotal(data, account.id) / max);
    const color = COLORS.accounts[i % COLORS.accounts.length];
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, height, 20),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 })
    );
    tower.position.set(x, 0.87 + height / 2, z);
    group.add(tower);
    data.aws_findings
      .filter((f) => f.connection === account.id)
      .forEach((f, k, list) => {
        const sev = new THREE.Color(COLORS.severity[f.severity]);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: sev }));
        group.add(beacon);
        beacons.push({ mesh: beacon, cx: x, cz: z, y: 0.87 + height + 0.12, phase: (k / list.length) * Math.PI * 2 });
      });
  });

  return {
    group,
    update(elapsed) {
      ring.rotation.z = elapsed * 0.4;
      for (const b of beacons) {
        const a = b.phase + elapsed * 1.2;
        b.mesh.position.set(b.cx + Math.cos(a) * 0.26, b.y + Math.sin(elapsed * 3 + b.phase) * 0.04, b.cz + Math.sin(a) * 0.26);
      }
    },
  };
}

const connectionName = (data, id) => data.cloud_connections.find((c) => c.id === id)?.name ?? id;

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
