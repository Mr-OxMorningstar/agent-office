import { isTouchDevice } from './touch-device.js';

const ICON = `<svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="20" y="6" width="24" height="42" rx="4" class="gate-phone"/>
  <path d="M30 42h4"/>
  <path d="M10 52c6 8 18 10 28 5M38 57l-1-7m1 7l7-3" class="gate-arrow"/>
</svg>`;

// On phones and tablets the office needs the wide view: in portrait a full-screen overlay asks for landscape and
// covers everything. onChange(blocked) fires whenever it shows or hides. Does nothing on desktop.
export function createOrientationGate({ onChange } = {}) {
  const touch = isTouchDevice();
  const portrait = window.matchMedia('(orientation: portrait)');
  const overlay = document.createElement('div');
  overlay.className = 'orientation-gate';
  overlay.hidden = true;
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-label', 'Rotate your device');
  overlay.innerHTML = `${ICON}<p>Rotate your device to landscape to explore the office</p>`;
  document.body.append(overlay);

  let blocked = false;
  const refresh = () => {
    const next = touch && portrait.matches;
    if (next === blocked) return;
    blocked = next;
    overlay.hidden = !blocked;
    onChange?.(blocked);
  };
  portrait.addEventListener('change', refresh);
  window.addEventListener('orientationchange', refresh);
  window.addEventListener('resize', refresh);
  refresh();

  return {
    get blocked() {
      return blocked;
    },
    // Best effort: browsers only allow the lock in fullscreen and after a gesture, so the overlay stays the real gate.
    async lockLandscape() {
      try {
        await screen.orientation?.lock?.('landscape');
      } catch {
        /* not supported or not allowed here */
      }
    },
  };
}
