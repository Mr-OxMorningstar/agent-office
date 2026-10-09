import * as THREE from 'three';

export function addLighting(scene, layout) {
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb8a990, 1.4));

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(layout.width * 0.6, 22, layout.depth * 0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  const half = Math.max(layout.width, layout.depth) * 0.75;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 80 });
  scene.add(sun);
}
