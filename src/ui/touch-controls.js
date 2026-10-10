import { VIEW_MODES } from '../player/view-modes.js';
import { clampToRadius, pinchDelta, stickVector } from './touch-math.js';
import { isTouchDevice } from './touch-device.js';

const STICK_RADIUS = 48; // px the knob can travel from the centre of its base

// On-screen controls for phones and tablets: a joystick on the left that drives the same player movement as WASD,
// drag-to-look on the canvas in the player views (the overview keeps OrbitControls' own touch drag and pinch), and
// buttons for interact, view and fullscreen. Does nothing on desktop. Call update() every frame.
export function createTouchControls({ canvas, player, view, gate, interact }) {
  if (!isTouchDevice()) return { active: false, update() {} };

  document.body.classList.add('is-touch');
  // Keep the page itself from scrolling, bouncing or pinch-zooming; panel bodies still scroll.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!e.target.closest?.('.panel')) e.preventDefault();
    },
    { passive: false }
  );

  const shield = div('tc-shield');
  const stick = div('tc-stick');
  const base = div('tc-stick-base');
  const knob = div('tc-stick-knob');
  base.append(knob);
  stick.append(base);
  const interactButton = button('tc-btn tc-interact', 'E', 'Interact');
  const viewButton = button('tc-btn tc-view', '', 'Change view');
  const fullButton = button('tc-btn tc-full', '⛶', 'Fullscreen');
  document.body.append(shield, stick, interactButton, viewButton, fullButton);

  // Joystick -> player.setAnalog (same movement and collision code as the keyboard).
  let stickId = null;
  const moveStick = (e) => {
    const rect = base.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const clamped = clampToRadius(dx, dy, STICK_RADIUS);
    knob.style.transform = `translate(${clamped.x}px, ${clamped.y}px)`;
    player.setAnalog(stickVector(dx, dy, STICK_RADIUS));
  };
  const releaseStick = () => {
    stickId = null;
    knob.style.transform = '';
    player.setAnalog(null);
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickId !== null || paused) return;
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) moveStick(e);
  });
  for (const type of ['pointerup', 'pointercancel']) {
    stick.addEventListener(type, (e) => {
      if (e.pointerId === stickId) releaseStick();
    });
  }

  // Look: one finger drags the view, two fingers pinch the third-person distance.
  const fingers = new Map();
  const pinchDistance = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => {
    const finger = fingers.get(e.pointerId);
    if (!finger) return;
    const dx = e.clientX - finger.x;
    const dy = e.clientY - finger.y;
    const before = fingers.size === 2 ? pinchDistance() : 0;
    finger.x = e.clientX;
    finger.y = e.clientY;
    if (paused || view.mode === 'overview') return;
    if (fingers.size === 1) view.look(dx, dy);
    else if (fingers.size === 2) view.zoom(-pinchDelta(before, pinchDistance()));
  });
  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (e) => fingers.delete(e.pointerId));
  }

  interactButton.addEventListener('click', () => {
    if (interactButton.classList.contains('is-ready')) interact();
  });
  viewButton.addEventListener('click', () => {
    view.setMode(VIEW_MODES[(VIEW_MODES.findIndex((m) => m.id === view.mode) + 1) % VIEW_MODES.length].id);
  });
  const canFullscreen = Boolean(document.fullscreenEnabled);
  fullButton.hidden = !canFullscreen;
  fullButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen();
        await gate.lockLandscape();
      }
    } catch {
      /* the browser refused fullscreen */
    }
  });

  // Paused while the rotate overlay or a panel is up: controls hide and the shield keeps touches off the scene.
  let paused = false;
  let shownMode = null;
  return {
    active: true,
    update(reachLabel) {
      const next = gate.blocked || Boolean(document.querySelector('.panel:not([hidden])'));
      if (next !== paused) {
        paused = next;
        document.body.classList.toggle('tc-paused', paused);
        if (paused) {
          releaseStick();
          fingers.clear();
        }
      }
      interactButton.classList.toggle('is-ready', Boolean(reachLabel));
      interactButton.title = reachLabel ?? '';
      if (view.mode !== shownMode) {
        shownMode = view.mode;
        viewButton.textContent = VIEW_MODES.find((m) => m.id === shownMode).label;
      }
    },
  };
}

function div(className) {
  const node = document.createElement('div');
  node.className = className;
  return node;
}

function button(className, text, label) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.setAttribute('aria-label', label);
  return node;
}
