import * as THREE from 'three';
import { distanceToRect } from './collision.js';

const REACH = 1.6; // how close (to the object's footprint) the player must be to interact
const MARKER_COLOR = 0xffc94d;

// Finds everything marked `userData.interact` and floats a spinning gem marker above each one.
// update() returns the interactable in reach of the player, if any, and makes its marker glow.
export function createInteractables(root, scene) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const items = [];

  root.traverse((object) => {
    if (!object.userData.interact) return;
    box.setFromObject(object);
    // `marker: false` keeps things like desk computers usable without a gem over every one of them.
    const marker = object.userData.interact.marker === false ? null : gemMarker();
    if (marker) {
      marker.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.45, (box.min.z + box.max.z) / 2);
      scene.add(marker);
    }
    items.push({
      ...object.userData.interact,
      object,
      marker,
      baseY: marker?.position.y ?? 0,
      rect: { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z },
    });
  });

  return {
    items,
    update(playerPosition, elapsed) {
      let nearest = null;
      let nearestDistance = REACH;
      for (const item of items) {
        const d = distanceToRect(playerPosition.x, playerPosition.z, item.rect);
        if (d < nearestDistance) {
          nearest = item;
          nearestDistance = d;
        }
      }
      for (const item of items) {
        if (!item.marker) continue;
        const active = item === nearest;
        item.marker.rotation.y = elapsed * (active ? 3 : 1.2);
        item.marker.position.y = item.baseY + Math.sin(elapsed * 2 + item.baseY) * 0.08;
        item.marker.material.emissiveIntensity = active ? 1.4 : 0.5;
        item.marker.scale.setScalar(active ? 1.25 : 1);
      }
      return nearest;
    },
  };
}

function gemMarker() {
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.16, 0),
    new THREE.MeshStandardMaterial({ color: MARKER_COLOR, emissive: MARKER_COLOR, emissiveIntensity: 0.5, roughness: 0.3, flatShading: true })
  );
  mesh.scale.y = 1.4;
  return mesh;
}
