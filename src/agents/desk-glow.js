import * as THREE from 'three';
import { DESK } from '../world/hq/team-room.js';

// A desk (or boardroom table seat) with a real agent working at it glows in that agent's team colour, and fades
// out when the agent stops. Pure emissive/additive meshes, no lights; geometry and the halo texture are shared.
const WORKING_STATES = new Set(['working', 'thinking']);
const FADE_S = 0.4;
const PULSE = { amount: 0.1, speed: 2.4 };
const OPACITY = { strip: 0.95, wash: 0.22, halo: 0.5 };

// Whether a member at `place` in `state` makes its seat glow: seated and busy. Waiting/needs-you keeps its raised-hand marker.
export const isGlowing = (state, place) => place === 'seat' && WORKING_STATES.has(state);

// seat -> colour for everyone currently working in their own seat.
export function glowingSeats(members) {
  const out = new Map();
  for (const m of members) if (m.seat && isGlowing(m.data.state, m.place)) out.set(m.seat, m.color);
  return out;
}

// Geometry of the glow for a seat, in a frame at the glow origin rotated by the seat's facing (+z points chair -> desk).
// Desk pods: the origin is the desk centre. Boardroom table: the origin is the table edge in front of the chair.
export function glowPlacement(seat) {
  const dir = new THREE.Vector3(Math.sin(seat.facing), 0, Math.cos(seat.facing));
  if (seat.room === 'boardroom') {
    const end = Math.abs(Math.abs(seat.facing) - Math.PI / 2) < 0.01;
    const edge = end ? 0.55 : 0.45; // chair to table edge (long sides sit 1.25 from the centre line, ends 2.75)
    return {
      origin: seat.position.clone().addScaledVector(dir, edge),
      strip: { z: 0.02, y: 0.81, length: end ? 1.0 : 0.9 },
      wash: { z: 0.3, y: 0.806, width: end ? 0.55 : 0.85, depth: 0.5 },
      halo: { z: 0.1, width: 2.2, depth: 1.8 },
    };
  }
  return {
    origin: seat.position.clone().addScaledVector(dir, DESK.depth / 2 + 0.43), // chair sits depth + 0.45 from the pod's middle line
    strip: { z: -DESK.depth / 2 + 0.02, y: DESK.height + 0.035, length: DESK.width },
    wash: { z: 0, y: DESK.height + 0.032, width: DESK.width - 0.1, depth: DESK.depth - 0.08 },
    halo: { z: -0.2, width: DESK.width + 1.2, depth: DESK.depth + 1.3 },
  };
}

function haloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Builds the glow meshes for every seat in `seats` (the crew's seat table) and returns update(dt, elapsed, active),
// where `active` is the Map from glowingSeats. The meshes carry no collider: they are added to the scene directly.
export function createDeskGlow({ scene, seats }) {
  const stripGeometry = new THREE.BoxGeometry(1, 0.025, 0.045);
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const texture = haloTexture();
  const material = (map) =>
    new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  const glows = seats.map((seat) => {
    const place = glowPlacement(seat);
    const group = new THREE.Group();
    group.position.copy(place.origin);
    group.rotation.y = seat.facing;
    const mats = { strip: material(null), wash: material(null), halo: material(texture) };

    const strip = new THREE.Mesh(stripGeometry, mats.strip);
    strip.position.set(0, place.strip.y, place.strip.z);
    strip.scale.x = place.strip.length;
    const wash = new THREE.Mesh(flat, mats.wash);
    wash.position.set(0, place.wash.y, place.wash.z);
    wash.scale.set(place.wash.width, 1, place.wash.depth);
    const halo = new THREE.Mesh(flat, mats.halo);
    halo.position.set(0, 0.018, place.halo.z);
    halo.scale.set(place.halo.width, 1, place.halo.depth);
    for (const mesh of [strip, wash, halo]) {
      mesh.raycast = () => {}; // never pickable
      mesh.renderOrder = 2;
      group.add(mesh);
    }
    group.visible = false;
    scene.add(group);
    return { seat, group, mats, level: 0 };
  });

  return {
    update(dt, elapsed, active) {
      const pulse = 1 + Math.sin(elapsed * PULSE.speed) * PULSE.amount;
      for (const glow of glows) {
        const color = active.get(glow.seat);
        if (color !== undefined) for (const m of Object.values(glow.mats)) m.color.setHex(color);
        const target = color !== undefined ? 1 : 0;
        if (glow.level === target && !target) continue;
        glow.level = target > glow.level ? Math.min(target, glow.level + dt / FADE_S) : Math.max(target, glow.level - dt / FADE_S);
        glow.group.visible = glow.level > 0;
        const k = glow.level * pulse;
        glow.mats.strip.opacity = Math.min(1, OPACITY.strip * k);
        glow.mats.wash.opacity = OPACITY.wash * k;
        glow.mats.halo.opacity = OPACITY.halo * k;
      }
    },
  };
}
