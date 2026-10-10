import * as THREE from 'three';
import { isTap } from '../ui/touch-math.js';

const CLICK_TOLERANCE_PX = 5; // pointer movement beyond this between down/up counts as an orbit drag, not a click

// Hover and click on registered meshes. Handlers get the hit's UV so flat surfaces (boards, screens) can
// work out what part was pointed at. onHover returns true when the spot is clickable, to show a pointer cursor.
// `getPointer(event)` can override where the ray comes from (normalised device coords), e.g. the screen centre
// while the mouse is captured for first-person look, or return null to ignore the event.
export function createInteraction(camera, domElement, { getPointer } = {}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const targets = new Map(); // mesh -> { onHover, onClick }
  let hovered = null;
  let downAt = null;
  const touches = new Set(); // fingers currently down; a second finger turns the gesture into a look/pinch, not a tap

  const hitAt = (event) => {
    const override = getPointer ? getPointer(event) : undefined;
    if (override === null) return null;
    if (override) {
      pointer.copy(override);
    } else {
      const rect = domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    }
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects([...targets.keys()], false)[0] ?? null;
  };

  domElement.addEventListener('pointermove', (event) => {
    const hit = hitAt(event);
    const mesh = hit?.object ?? null;
    if (hovered && hovered !== mesh) targets.get(hovered).onHover?.(null);
    hovered = mesh;
    const clickable = mesh ? targets.get(mesh).onHover?.(hit.uv) ?? true : false;
    domElement.style.cursor = clickable ? 'pointer' : '';
  });

  domElement.addEventListener('pointerleave', () => {
    if (hovered) targets.get(hovered).onHover?.(null);
    hovered = null;
    domElement.style.cursor = '';
  });

  domElement.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      touches.add(event.pointerId);
      if (touches.size > 1) {
        downAt = null;
        return;
      }
    }
    downAt = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId };
  });

  domElement.addEventListener('pointercancel', (event) => {
    touches.delete(event.pointerId);
    downAt = null;
  });

  domElement.addEventListener('pointerup', (event) => {
    touches.delete(event.pointerId);
    if (!downAt || event.button !== 0 || downAt.id !== event.pointerId) return;
    // Under pointer lock clientX/Y don't change, so any press counts as a click.
    const moved = document.pointerLockElement ? 0 : Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    const { time } = downAt;
    downAt = null;
    // A finger tap must be short and nearly still, so look-drags never click what they end on.
    if (event.pointerType === 'touch' ? !isTap(moved, event.timeStamp - time) : moved > CLICK_TOLERANCE_PX) return;
    const hit = hitAt(event);
    if (hit) targets.get(hit.object).onClick?.(hit.uv);
  });

  return {
    register(mesh, handlers) {
      targets.set(mesh, handlers);
    },
  };
}
