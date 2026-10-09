import * as THREE from 'three';

export const VIEW_MODES = [
  { id: 'overview', label: 'Overview' },
  { id: 'third', label: 'Third person' },
  { id: 'first', label: 'First person' },
];

const LOOK_SENSITIVITY = 0.0025; // radians per pixel of mouse movement
const PITCH_LIMIT = Math.PI * 0.47;
const EYE_HEIGHT = 1.6;
const THIRD_PERSON = { headHeight: 1.45, distance: 4.5, minDistance: 1.8, maxDistance: 9 };
const OVERVIEW_DISTANCE = 18;

// Camera modes for the player: the orbiting overview (OrbitControls), a third-person camera behind the player, and
// first-person from the player's eyes. In the two player views a click captures the mouse (pointer lock) so moving
// it looks around freely; Esc releases it. V cycles modes.
export function createViewModes({ camera, controls, domElement, player, onChange }) {
  let mode = 'overview';
  let yaw = 0;
  let pitch = 0;
  let distance = THIRD_PERSON.distance;

  const avatar = player.avatar;
  const head = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  const isPlayerView = () => mode !== 'overview';
  const isLocked = () => document.pointerLockElement === domElement;

  domElement.addEventListener('click', () => {
    if (isPlayerView() && !isLocked()) domElement.requestPointerLock();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPlayerView() || !isLocked()) return;
    yaw -= e.movementX * LOOK_SENSITIVITY;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * LOOK_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
  });

  domElement.addEventListener(
    'wheel',
    (e) => {
      if (mode !== 'third') return;
      e.preventDefault();
      distance = THREE.MathUtils.clamp(distance + Math.sign(e.deltaY) * 0.5, THIRD_PERSON.minDistance, THIRD_PERSON.maxDistance);
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyV' || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const next = VIEW_MODES[(VIEW_MODES.findIndex((m) => m.id === mode) + 1) % VIEW_MODES.length];
    api.setMode(next.id);
  });

  const api = {
    get mode() {
      return mode;
    },
    isLocked,
    setMode(next) {
      if (next === mode) return;
      if (next === 'overview') {
        if (isLocked()) document.exitPointerLock();
        // Pull back to an overhead view of where the player is, looking the same way the player was.
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() === 0) forward.set(0, 0, -1);
        forward.normalize();
        controls.target.copy(avatar.position);
        camera.position.copy(avatar.position).addScaledVector(forward, -OVERVIEW_DISTANCE * 0.7).setY(OVERVIEW_DISTANCE * 0.7);
        camera.lookAt(controls.target);
      } else if (mode === 'overview') {
        // Start looking the way the overview camera was facing.
        camera.getWorldDirection(forward);
        yaw = Math.atan2(-forward.x, -forward.z);
        pitch = next === 'third' ? -0.3 : 0;
      }
      mode = next;
      controls.enabled = mode === 'overview';
      avatar.object.visible = mode !== 'first';
      // CSS2D labels only check their own visibility, not their parents'.
      avatar.label.object.visible = mode !== 'first';
      onChange?.(mode);
    },
    // Runs after the player has moved this frame.
    update() {
      if (mode === 'overview') {
        controls.update();
        return;
      }
      euler.set(pitch, yaw, 0);
      if (mode === 'first') {
        camera.position.copy(avatar.position).setY(EYE_HEIGHT);
        camera.quaternion.setFromEuler(euler);
      } else {
        forward.set(0, 0, -1).applyEuler(euler);
        head.copy(avatar.position).setY(THIRD_PERSON.headHeight);
        camera.position.copy(head).addScaledVector(forward, -distance);
        camera.position.y = Math.max(camera.position.y, 0.3); // keep the camera above the floor
        camera.lookAt(head);
      }
    },
  };
  return api;
}
