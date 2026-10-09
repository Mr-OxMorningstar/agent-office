import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createCamera(domElement, layout) {
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(layout.width * 1.1, layout.width * 0.95, layout.depth * 1.35);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 5;
  controls.maxDistance = 70;
  // Free rotation all the way round; only stop just short of looking up from under the floor.
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  return { camera, controls };
}
