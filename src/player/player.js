import * as THREE from 'three';
import { Agent } from '../agents/agent.js';
import { moveWithCollisions } from '../world/collision.js';

const WALK_SPEED = 3;
const RUN_SPEED = 5.5;
const RADIUS = 0.32;

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};

// The user's own character: walks with WASD/arrows relative to the camera, collides with solid objects,
// and keeps the orbit camera following it. Reuses the Agent body so the player looks like everyone else.
export function createPlayer({ scene, camera, controls, layout, colliders }) {
  const avatar = new Agent({ name: 'You', color: 0xf59e0b });
  avatar.object.name = 'player';
  avatar.position.copy(layout.spots.playerStart);
  avatar.label.object.element.classList.add('is-player');
  avatar.object.add(groundRing());
  scene.add(avatar.object);

  // Start the camera framed on the player, keeping its current viewing angle.
  const offset = camera.position.clone().sub(controls.target).setLength(18);
  controls.target.copy(avatar.position);
  camera.position.copy(avatar.position).add(offset);
  controls.update();

  const pressed = new Set();
  const isTyping = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    pressed.add(e.code);
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => pressed.delete(e.code));
  window.addEventListener('blur', () => pressed.clear());
  const held = (action) => KEYS[action].some((k) => pressed.has(k));
  const stick = { x: 0, y: 0, magnitude: 0, run: false }; // on-screen joystick (touch), same space as the keys

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const before = new THREE.Vector3();

  return {
    avatar,
    // Joystick input from the touch controls: { x, y, magnitude, run } with x right and y forward; null releases it.
    setAnalog(vector) {
      Object.assign(stick, vector ?? { x: 0, y: 0, magnitude: 0, run: false });
    },
    update(dt, elapsed) {
      // Camera-relative directions, flattened onto the floor.
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, THREE.Object3D.DEFAULT_UP);

      move.set(0, 0, 0);
      if (held('forward')) move.add(forward);
      if (held('back')) move.sub(forward);
      if (held('right')) move.add(right);
      if (held('left')) move.sub(right);

      // The joystick only steers when no key is held; how far it is pushed scales the speed.
      let analog = 1;
      let running = held('run');
      if (move.lengthSq() === 0 && stick.magnitude > 0) {
        move.addScaledVector(forward, stick.y).addScaledVector(right, stick.x);
        analog = stick.magnitude;
        running = stick.run;
      }

      const moving = move.lengthSq() > 0;
      avatar.moving = moving;
      if (moving) {
        move.normalize().multiplyScalar((running ? RUN_SPEED : WALK_SPEED) * analog * dt);
        before.copy(avatar.position);
        moveWithCollisions(avatar.position, move.x, move.z, RADIUS, colliders, layout.bounds);
        avatar.faceTowards(avatar.position.clone().add(move));

        // Carry the camera along with the player.
        const delta = avatar.position.clone().sub(before);
        camera.position.add(delta);
        controls.target.add(delta);
      }
      avatar.update(dt, elapsed);
    },
  };
}

function groundRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.5, 40),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  return ring;
}
