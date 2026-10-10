export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_MS = 250;
const RUN_DEFLECTION = 0.9; // pushing the stick this far out breaks into a run

// A press that barely moved and was quick is a tap (a click); anything else is a look drag.
export function isTap(movedPx, elapsedMs) {
  return movedPx <= TAP_MAX_MOVE_PX && elapsedMs <= TAP_MAX_MS;
}

// Thumb offset from the stick centre -> movement vector. x is right, y is forward (screen up), both in [-1, 1]
// with the length (magnitude) equal to how far the stick is pushed. Inside the dead zone nothing moves.
export function stickVector(dx, dy, radius, deadZone = 0.15) {
  const length = Math.hypot(dx, dy);
  const deflection = Math.min(length / radius, 1);
  if (deflection < deadZone || length === 0) return { x: 0, y: 0, magnitude: 0, run: false };
  // Rescale so the speed ramps up from zero at the edge of the dead zone.
  const magnitude = (deflection - deadZone) / (1 - deadZone);
  return { x: (dx / length) * magnitude, y: (-dy / length) * magnitude, magnitude, run: deflection >= RUN_DEFLECTION };
}

// Keeps the stick knob inside its base.
export function clampToRadius(dx, dy, radius) {
  const length = Math.hypot(dx, dy);
  return length <= radius ? { x: dx, y: dy } : { x: (dx / length) * radius, y: (dy / length) * radius };
}

// Pinch: how far the two fingers' distance changed (positive = spread apart).
export function pinchDelta(previousDistance, distance) {
  return distance - previousDistance;
}
