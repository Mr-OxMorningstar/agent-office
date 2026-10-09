import * as THREE from 'three';

// Signature props for the role workspaces: each says at a glance what the room is for.
// Every prop is built facing +z; the caller turns it towards the room. All are solid (the player can't walk through).

const DARK = 0x23262d;
const FONT = (weight, size) => `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;

export function buildRoleProp(kind, color) {
  const builders = {
    'ui-screen': () => screenOnStand(drawUiMock(color)),
    'server-rack': () => serverRack(color),
    'status-light': () => statusLight(),
    'pipeline-screen': () => screenOnStand(drawPipeline(color)),
    'diff-screen': () => screenOnStand(drawDiff(color)),
    safe: () => safe(color),
    'architecture-board': () => screenOnStand(drawArchitecture(color)),
    bookshelf: () => bookshelf(color),
  };
  const prop = builders[kind]();
  prop.userData.solid = true;
  prop.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return prop;
}

const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};
const glow = (color, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
const matte = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

// Large display on a two-legged stand, showing a canvas.
function screenOnStand(canvas) {
  const group = new THREE.Group();
  const w = 1.3;
  const h = 0.76;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  group.add(box(w + 0.08, h + 0.08, 0.06, matte(DARK), 0, 1.35, 0));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.55 })
  );
  screen.position.set(0, 1.35, 0.035);
  group.add(screen);
  for (const x of [-0.35, 0.35]) group.add(box(0.05, 0.98, 0.05, matte(DARK), x, 0.49, -0.02));
  group.add(box(0.9, 0.04, 0.4, matte(DARK), 0, 0.02, 0));
  return group;
}

function serverRack(color) {
  const group = new THREE.Group();
  group.add(box(0.62, 1.9, 0.55, matte(DARK), 0, 0.95, 0));
  // Drive bays with status LEDs in the role colour, a few amber for activity.
  for (let i = 0; i < 9; i++) {
    const y = 0.25 + i * 0.18;
    group.add(box(0.5, 0.12, 0.02, matte(0x3a3f48), 0, y, 0.285));
    group.add(box(0.04, 0.04, 0.02, glow(i % 3 === 1 ? 0xffb020 : color, 1.4), 0.19, y, 0.3));
    group.add(box(0.04, 0.04, 0.02, glow(color, 1.4), 0.12, y, 0.3));
  }
  return group;
}

// Andon-style stack light: red / amber / green, with green lit (all tests passing).
function statusLight() {
  const group = new THREE.Group();
  group.add(box(0.36, 0.06, 0.36, matte(DARK), 0, 0.03, 0));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 12), matte(0x9aa0a8));
  pole.position.y = 0.66;
  group.add(pole);
  const lamps = [
    [0xe5383b, 0.15],
    [0xffb020, 0.15],
    [0x22b86a, 1.6],
  ];
  lamps.forEach(([color, intensity], i) => {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 20), glow(color, intensity));
    lamp.position.y = 1.86 - i * 0.21;
    group.add(lamp);
  });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 20), matte(DARK));
  cap.position.y = 1.99;
  group.add(cap);
  return group;
}

function safe(color) {
  const group = new THREE.Group();
  group.add(box(0.8, 0.95, 0.7, matte(0x4a4f58), 0, 0.475, 0));
  group.add(box(0.66, 0.8, 0.02, matte(0x3a3f48), 0, 0.5, 0.36));
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 24), glow(color, 0.8));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(-0.08, 0.55, 0.39);
  group.add(dial);
  group.add(box(0.05, 0.22, 0.05, matte(0xc9ccd2), 0.2, 0.55, 0.39));
  // Shield emblem on top.
  const shield = new THREE.Shape();
  shield.moveTo(0, 0.28);
  shield.lineTo(0.2, 0.2);
  shield.lineTo(0.18, -0.05);
  shield.quadraticCurveTo(0.1, -0.2, 0, -0.28);
  shield.quadraticCurveTo(-0.1, -0.2, -0.18, -0.05);
  shield.lineTo(-0.2, 0.2);
  shield.closePath();
  const emblem = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.06, bevelEnabled: false }), glow(color, 0.7));
  emblem.position.set(0, 1.25, -0.03);
  group.add(emblem);
  return group;
}

function bookshelf(color) {
  const group = new THREE.Group();
  const wood = matte(0xf2efe8);
  const w = 1.1;
  group.add(box(0.05, 1.7, 0.36, wood, -w / 2, 0.85, 0), box(0.05, 1.7, 0.36, wood, w / 2, 0.85, 0));
  const palette = [color, 0xf2c21b, 0x2f6feb, 0xe0409b, 0x22b86a, color];
  for (let level = 0; level < 4; level++) {
    const y = 0.05 + level * 0.42;
    group.add(box(w, 0.04, 0.36, wood, 0, y, 0));
    let x = -w / 2 + 0.08;
    for (let i = 0; x < w / 2 - 0.12; i++) {
      const t = 0.07 + ((i * 7 + level * 3) % 4) * 0.02;
      const h = 0.26 + ((i * 5 + level) % 3) * 0.04;
      group.add(box(t, h, 0.26, matte(palette[(i + level) % palette.length]), x + t / 2, y + h / 2 + 0.02, 0));
      x += t + 0.01;
    }
  }
  return group;
}

// --- Screen contents -------------------------------------------------------------------------------------------

function canvas2d(w = 640, h = 374) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')];
}
const css = (color) => `#${new THREE.Color(color).getHexString()}`;

// Frontend: a mock app screen with nav, hero, cards and a colour palette.
function drawUiMock(color) {
  const [canvas, ctx] = canvas2d();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 640, 374);
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, 640, 46);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT(700, 22);
  ctx.fillText('● ● ●   app.tsx', 18, 30);
  ctx.fillStyle = '#f3f0f7';
  ctx.fillRect(24, 66, 360, 150);
  ctx.fillStyle = '#2b2a33';
  ctx.font = FONT(800, 34);
  ctx.fillText('Ship delightful UI', 44, 130);
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.roundRect(44, 160, 140, 38, 19);
  ctx.fill();
  ['#e0409b', '#f2c21b', '#22b86a', '#2f6feb', '#7c4dff'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(440 + (i % 3) * 62, 100 + Math.floor(i / 3) * 70, 26, 0, Math.PI * 2);
    ctx.fill();
  });
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = '#f3f0f7';
    ctx.fillRect(24 + i * 205, 240, 190, 110);
    ctx.fillStyle = css(color);
    ctx.fillRect(24 + i * 205, 240, 190, 8);
  }
  return canvas;
}

// DevOps: build → test → deploy pipeline with the last stage running.
function drawPipeline(color) {
  const [canvas, ctx] = canvas2d();
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, 640, 374);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT(700, 26);
  ctx.fillText('Pipeline  #142  main', 28, 50);
  const stages = [
    ['Build', '#22b86a', '✓'],
    ['Test', '#22b86a', '✓'],
    ['Deploy', css(color), '▶'],
  ];
  stages.forEach(([name, c, mark], i) => {
    const x = 40 + i * 200;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(x, 130, 160, 110, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(800, 44);
    ctx.fillText(mark, x + 18, 190);
    ctx.font = FONT(700, 26);
    ctx.fillText(name, x + 18, 225);
    if (i < stages.length - 1) {
      ctx.fillStyle = '#5a5f6a';
      ctx.fillRect(x + 164, 182, 32, 6);
    }
  });
  ctx.fillStyle = '#8a8f99';
  ctx.font = FONT(500, 20);
  ctx.fillText('dev → staging → prod', 28, 320);
  return canvas;
}

// Code review: a diff with removed and added lines.
function drawDiff(color) {
  const [canvas, ctx] = canvas2d();
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, 640, 374);
  ctx.fillStyle = css(color);
  ctx.fillRect(0, 0, 640, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT(700, 22);
  ctx.fillText('PR #318  ·  2 files changed', 18, 29);
  const lines = [
    [' ', 'function total(items) {'],
    ['-', '  let sum = 0;'],
    ['-', '  for (const i of items) sum += i.price;'],
    ['+', '  return items.reduce('],
    ['+', '    (sum, i) => sum + i.price, 0);'],
    [' ', '}'],
  ];
  ctx.font = '500 22px ui-monospace, Consolas, monospace';
  lines.forEach(([mark, text], i) => {
    const y = 64 + i * 46;
    if (mark !== ' ') {
      ctx.fillStyle = mark === '+' ? 'rgba(34, 184, 106, 0.28)' : 'rgba(229, 56, 59, 0.28)';
      ctx.fillRect(0, y, 640, 42);
    }
    ctx.fillStyle = mark === '+' ? '#6fe0a3' : mark === '-' ? '#ff8a8c' : '#c9ccd2';
    ctx.fillText(`${mark} ${text}`, 18, y + 29);
  });
  return canvas;
}

// Tech lead: an architecture sketch, boxes and arrows.
function drawArchitecture(color) {
  const [canvas, ctx] = canvas2d();
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, 640, 374);
  ctx.fillStyle = '#2b2a33';
  ctx.font = FONT(700, 24);
  ctx.fillText('System architecture', 24, 40);
  const nodes = [
    ['Web', 70, 90],
    ['API', 270, 90],
    ['Worker', 270, 250],
    ['DB', 470, 90],
    ['Queue', 470, 250],
  ];
  const at = Object.fromEntries(nodes.map(([n, x, y]) => [n, [x + 60, y + 32]]));
  ctx.strokeStyle = '#5a5f6a';
  ctx.lineWidth = 4;
  for (const [a, b] of [['Web', 'API'], ['API', 'DB'], ['API', 'Queue'], ['Queue', 'Worker'], ['Worker', 'DB']]) {
    ctx.beginPath();
    ctx.moveTo(...at[a]);
    ctx.lineTo(...at[b]);
    ctx.stroke();
  }
  for (const [name, x, y] of nodes) {
    ctx.fillStyle = name === 'API' ? css(color) : '#ffffff';
    ctx.strokeStyle = css(color);
    ctx.beginPath();
    ctx.roundRect(x, y, 120, 64, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b2a33';
    ctx.font = FONT(700, 22);
    ctx.textAlign = 'center';
    ctx.fillText(name, x + 60, y + 40);
    ctx.textAlign = 'left';
  }
  return canvas;
}
