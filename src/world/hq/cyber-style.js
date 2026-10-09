import * as THREE from 'three';

// Shared look for the cyber-intel rooms (the boardroom and AtlasOps): palette, glowing and matte materials, box and
// trim helpers, and a low-fps canvas animator.

export const CYBER = {
  teal: 0x2fd6c8,
  cyan: 0x4fd4e6,
  amber: 0xffb347,
  panel: 0x18212c,
  wood: 0x5a3d2b,
  frame: 0x0d141b,
};

const unit = new THREE.BoxGeometry(1, 1, 1);
const glowMaterials = new Map();

// Shared emissive material per colour and strength.
export function glow(color, intensity = 0.9) {
  const key = `${color}:${intensity}`;
  if (!glowMaterials.has(key)) {
    glowMaterials.set(key, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }));
  }
  return glowMaterials.get(key);
}

export const matte = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });

// The materials every cyber room is dressed with.
export function cyberMaterials() {
  return {
    panel: matte(CYBER.panel),
    wood: matte(CYBER.wood, 0.7),
    frame: new THREE.MeshStandardMaterial({ color: CYBER.frame, roughness: 0.5, metalness: 0.3 }),
    teal: glow(CYBER.teal, 0.8),
    amber: glow(CYBER.amber, 0.9),
  };
}

// Box of the given size centred at (x, y, z), sharing one unit geometry.
export function box(material, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(unit, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  return mesh;
}

// Straight glowing line at height `y` between two floor points that share an x or a z (axis-aligned). `thickness` is
// its height, `depth` its width across the line.
export function trimLine(from, to, y, material, thickness = 0.04, depth = 0.034) {
  const alongX = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z);
  const length = alongX ? Math.abs(to.x - from.x) : Math.abs(to.z - from.z);
  const mesh = alongX ? box(material, length, thickness, depth, 0, y, 0) : box(material, depth, thickness, length, 0, y, 0);
  mesh.position.x = (from.x + to.x) / 2;
  mesh.position.z = (from.z + to.z) / 2;
  return mesh;
}

// Redraws `texture` from `draw(seconds)` at most `fps` times a second, and only while the mesh is being rendered.
export function animate(mesh, texture, fps, draw) {
  let last = -Infinity;
  draw(0);
  mesh.onBeforeRender = () => {
    const now = performance.now();
    if (now - last < 1000 / fps) return;
    last = now;
    draw(now / 1000);
    texture.needsUpdate = true;
  };
}
