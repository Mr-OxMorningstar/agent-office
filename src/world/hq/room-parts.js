import * as THREE from 'three';

// Building blocks shared by the rooms inside the office (boardroom, skills room, ...).

const PARTITION_HEIGHT = 3;

const COLORS = {
  glass: 0xcfe6f2,
  frame: 0x3f3a35,
};

// World-space bounds of a room given its tile rectangle ({ x, z, width, depth }).
export function roomBounds(layout, tiles) {
  const { x, z, width, depth } = tiles;
  const min = layout.tileToWorld(x, z).addScalar(-0.5).setY(0);
  const max = layout.tileToWorld(x + width - 1, z + depth - 1).addScalar(0.5).setY(0);
  const centre = new THREE.Vector3((min.x + max.x) / 2, 0, (min.z + max.z) / 2);
  return { min, max, centre };
}

export function frameMaterial() {
  return new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.5, metalness: 0.3 });
}

export function carpet(width, depth, centre, color) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 1 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(centre.x, 0.005, centre.z);
  mesh.receiveShadow = true;
  return mesh;
}

// Straight glass partition between two floor points, framed by posts and top/bottom rails.
// `accent` (a colour) turns the top rail into a glowing strip in that colour, for role workspaces.
export function partition(from, to, accent) {
  const group = new THREE.Group();
  const length = from.distanceTo(to);
  const frameMat = frameMaterial();

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(length, PARTITION_HEIGHT, 0.04),
    new THREE.MeshStandardMaterial({ color: COLORS.glass, transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false })
  );
  glass.position.y = PARTITION_HEIGHT / 2;
  group.add(glass);

  const rail = (y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.1), frameMat);
    m.position.y = y;
    m.castShadow = true;
    group.add(m);
  };
  rail(0.04);
  rail(PARTITION_HEIGHT);
  if (accent !== undefined) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.1, 0.12),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6, roughness: 0.4 })
    );
    strip.position.y = PARTITION_HEIGHT + 0.06;
    group.add(strip);
  }

  const postCount = Math.max(2, Math.round(length / 2) + 1);
  for (let i = 0; i < postCount; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, PARTITION_HEIGHT, 0.1), frameMat);
    post.position.set(-length / 2 + (length * i) / (postCount - 1), PARTITION_HEIGHT / 2, 0);
    post.castShadow = true;
    group.add(post);
  }

  group.position.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
  group.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
  group.userData.solid = true;
  return group;
}

// Partition from `from` to `to` with a door gap of `doorWidth` centred on `doorCentre` (a point on that line).
export function partitionWithDoor(from, to, doorCentre, doorWidth, accent) {
  const group = new THREE.Group();
  const dir = to.clone().sub(from).normalize();
  group.add(partition(from, doorCentre.clone().addScaledVector(dir, -doorWidth / 2), accent));
  group.add(partition(doorCentre.clone().addScaledVector(dir, doorWidth / 2), to, accent));
  return group;
}

const BORDER = { inset: 0.15, width: 0.07 }; // inset so neighbouring zones keep a strip of floor between

// Slim glowing outline marking an open-plan zone on the floor. `color` is one colour, or four (north, south, west,
// east sides) for a multi-colour outline.
export function zoneBorder(min, max, color) {
  const group = new THREE.Group();
  const colors = Array.isArray(color) ? color : [color, color, color, color];
  const material = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.5 });
  const x0 = min.x + BORDER.inset;
  const x1 = max.x - BORDER.inset;
  const z0 = min.z + BORDER.inset;
  const z1 = max.z - BORDER.inset;
  const strip = (w, d, x, z, c) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), material(c));
    m.position.set(x, 0.012, z);
    group.add(m);
  };
  strip(x1 - x0, BORDER.width, (x0 + x1) / 2, z0, colors[0]);
  strip(x1 - x0, BORDER.width, (x0 + x1) / 2, z1, colors[1]);
  strip(BORDER.width, z1 - z0, x0, (z0 + z1) / 2, colors[2]);
  strip(BORDER.width, z1 - z0, x1, (z0 + z1) / 2, colors[3]);
  return group;
}

// Potted plant: a terracotta pot with a few stacked leafy blobs.
export function plant(position) {
  const group = new THREE.Group();
  group.userData.solid = true;
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.17, 0.4, 16),
    new THREE.MeshStandardMaterial({ color: 0xc0704a, roughness: 0.8 })
  );
  pot.position.y = 0.2;
  pot.castShadow = true;
  group.add(pot);

  const leaves = new THREE.MeshStandardMaterial({ color: 0x4f9a5a, roughness: 0.8, flatShading: true });
  for (const [x, y, z, r] of [[0, 0.62, 0, 0.3], [0.1, 0.85, 0.05, 0.22], [-0.08, 0.95, -0.06, 0.18]]) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
    blob.position.set(x, y, z);
    blob.castShadow = true;
    group.add(blob);
  }

  group.position.copy(position);
  return group;
}

// Two legs with feet for a free-standing board `width` wide whose bottom edge sits at `height`.
export function standLegs(width, height) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6 });
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, height + 0.1, 0.05), mat);
    leg.position.set(x, (height + 0.1) / 2, -0.04);
    leg.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), mat);
    foot.position.set(x, 0.02, -0.04);
    group.add(leg, foot);
  }
  return group;
}

// Flat wall-mounted board: a canvas-textured surface in a dark frame. Returns the group and the surface mesh.
export function wallBoard(width, height, canvas) {
  const group = new THREE.Group();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 })
  );
  surface.position.z = 0.03;
  group.add(surface);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.05), frameMaterial());
  frame.castShadow = true;
  group.add(frame);

  return { group, surface, texture };
}

export const FONT = (weight, size) => `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;

// `text` shortened with an ellipsis until it fits `max` pixels at the context's current font.
export function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
