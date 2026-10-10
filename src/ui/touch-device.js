// Phones and tablets: a coarse primary pointer, or touch events with no fine pointer (mouse/trackpad) around.
// A laptop with a touchscreen still reports a fine pointer, so it keeps the desktop controls.
export function isTouchDevice() {
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  return 'ontouchstart' in window && navigator.maxTouchPoints > 0 && !window.matchMedia('(any-pointer: fine)').matches;
}
