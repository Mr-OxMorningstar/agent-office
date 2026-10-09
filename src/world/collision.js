import * as THREE from 'three';

// Flat (x/z) collision against everything in the scene marked `userData.solid`, using each object's world AABB.
export function collectColliders(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const rects = [];
  root.traverse((object) => {
    if (!object.userData.solid) return;
    box.setFromObject(object);
    rects.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  });
  return rects;
}

// Moves `position` by (dx, dz) for a circle of `radius`, one axis at a time so it slides along walls.
export function moveWithCollisions(position, dx, dz, radius, rects, bounds) {
  const blocked = (x, z) =>
    x - radius < bounds.minX ||
    x + radius > bounds.maxX ||
    z - radius < bounds.minZ ||
    z + radius > bounds.maxZ ||
    rects.some((r) => x + radius > r.minX && x - radius < r.maxX && z + radius > r.minZ && z - radius < r.maxZ);

  if (!blocked(position.x + dx, position.z)) position.x += dx;
  if (!blocked(position.x, position.z + dz)) position.z += dz;
}

// Distance in x/z from a point to the nearest edge of a rect (0 when inside).
export function distanceToRect(x, z, r) {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}
