import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const WALK_SPEED = 1.6; // world units per second
const TURN_SPEED = 8; // how quickly the agent swings to face where it's going
const SEAT_DROP = 0.12; // how far the body lowers when sitting, so the hips land on the chair seat

// What each state looks like: an icon for the label chip, and whether the agent raises a hand / shows the "!" marker.
export const AGENT_STATES = {
  arriving: { icon: '🚶', label: 'Arriving' },
  idle: { icon: '💤', label: 'Idle' },
  thinking: { icon: '💭', label: 'Thinking' },
  working: { icon: '🔧', label: 'Working' },
  waiting: { icon: '✋', label: 'Needs you', alert: true },
  done: { icon: '✅', label: 'Done' },
  error: { icon: '⚠️', label: 'Error', alert: true },
  leaving: { icon: '👋', label: 'Leaving' },
  break: { icon: '🎮', label: 'On a break' },
};

// A character on the office floor. Movement is driven by walkTo(); what it's doing is shown via setState()
// (state chip + status text) or setStatus() (status text only).
export class Agent {
  constructor({ name, color }) {
    this.name = name;
    this.object = new THREE.Group();
    this.object.name = `agent-${name}`;

    this.rig = buildBody(color);
    this.body = this.rig.group;
    this.object.add(this.body);

    this.alert = alertMarker();
    this.alert.visible = false;
    this.object.add(this.alert);

    this.label = buildLabel(name);
    this.label.object.position.set(0, 2.05, 0);
    this.object.add(this.label.object);

    this.path = [];
    this.onArrive = null;
    this.moving = false; // set by an external controller (e.g. the player) that moves the agent directly
    this.seated = false;
    this.state = null;
    this.targetHeading = 0;
  }

  get position() {
    return this.object.position;
  }

  // Walks through each point in order (world coords, y ignored). Resolves on arrival at the last one.
  walkTo(points) {
    this.seated = false;
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    return new Promise((resolve) => {
      this.onArrive = resolve;
    });
  }

  faceTowards(point) {
    this.targetHeading = Math.atan2(point.x - this.position.x, point.z - this.position.z);
  }

  setHeading(radians) {
    this.targetHeading = radians;
  }

  sit(heading) {
    this.seated = true;
    this.setHeading(heading);
  }

  setStatus(text) {
    this.label.status.textContent = text ?? '';
    this.label.status.hidden = !text;
  }

  setState(state, text) {
    this.state = state;
    const look = AGENT_STATES[state];
    this.label.chip.textContent = look ? `${look.icon} ${look.label}` : '';
    this.label.chip.hidden = !look;
    this.label.chip.dataset.state = state ?? '';
    this.alert.visible = Boolean(look?.alert);
    this.alert.material.color.setHex(state === 'error' ? 0xe5484d : 0xffc94d);
    this.setStatus(text);
  }

  get isWalking() {
    return this.path.length > 0 || this.moving;
  }

  update(dt, elapsed) {
    if (this.path.length > 0) {
      const next = this.path[0];
      const toNext = next.clone().sub(this.position);
      const distance = toNext.length();
      const step = WALK_SPEED * dt;

      if (distance <= step) {
        this.position.copy(next);
        this.path.shift();
        if (this.path.length === 0 && this.onArrive) {
          const resolve = this.onArrive;
          this.onArrive = null;
          resolve();
        }
      } else {
        this.position.addScaledVector(toNext.divideScalar(distance), step);
        this.faceTowards(next);
      }
    }

    // Shortest-way turn towards the target heading.
    const diff = Math.atan2(Math.sin(this.targetHeading - this.object.rotation.y), Math.cos(this.targetHeading - this.object.rotation.y));
    this.object.rotation.y += diff * Math.min(1, TURN_SPEED * dt);

    this.pose(elapsed);
  }

  pose(elapsed) {
    const { legs, arms } = this.rig;
    const walking = this.isWalking;

    // Legs: swing while walking, fold forward onto the chair when seated.
    const stride = walking ? Math.sin(elapsed * 10) * 0.5 : 0;
    legs[0].rotation.x = this.seated ? -Math.PI / 2 : stride;
    legs[1].rotation.x = this.seated ? -Math.PI / 2 : -stride;

    // Arms: swing while walking, type while working, wave the right hand while waiting for the user.
    let left = walking ? -stride : 0;
    let right = walking ? stride : 0;
    if (!walking && this.state === 'working') {
      left = -0.9 + Math.sin(elapsed * 18) * 0.12;
      right = -0.9 + Math.sin(elapsed * 18 + Math.PI) * 0.12;
    }
    arms[0].rotation.x = left;
    arms[1].rotation.x = right;
    arms[1].rotation.z = 0;
    if (this.state === 'waiting' || this.state === 'error') {
      arms[1].rotation.x = -Math.PI * 0.95;
      arms[1].rotation.z = Math.sin(elapsed * 6) * 0.25;
    }

    // Body: bob while walking, sink onto the seat when sitting, breathe otherwise. Thinking adds a slow head tilt.
    this.body.position.y = walking ? Math.abs(Math.sin(elapsed * 10)) * 0.06 : this.seated ? -SEAT_DROP : 0;
    this.body.scale.y = walking ? 1 : 1 + Math.sin(elapsed * 2) * 0.015;
    this.rig.head.rotation.z = this.state === 'thinking' ? Math.sin(elapsed * 1.5) * 0.12 : 0;

    if (this.alert.visible) {
      this.alert.position.y = 2.0 + (this.seated ? -SEAT_DROP : 0) + Math.abs(Math.sin(elapsed * 4)) * 0.12;
      this.alert.rotation.y = elapsed * 2;
    }
  }
}

// Body parts hang off pivots at the hips and shoulders so they can swing, fold and wave.
function buildBody(color) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f1f24, roughness: 0.5 });

  const mesh = (geometry, material, x, y, z, parent = group) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const pivot = (x, y, z) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    group.add(p);
    return p;
  };

  const legs = [-0.11, 0.11].map((x) => {
    const hip = pivot(x, 0.6, 0);
    mesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), trousers, 0, -0.28, 0, hip);
    return hip;
  });
  mesh(new THREE.CapsuleGeometry(0.26, 0.42, 6, 12), shirt, 0, 0.98, 0);
  const arms = [-0.33, 0.33].map((x) => {
    const shoulder = pivot(x, 1.17, 0);
    mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), shirt, 0, -0.22, 0, shoulder);
    return shoulder;
  });

  const head = pivot(0, 1.6, 0);
  mesh(new THREE.SphereGeometry(0.24, 20, 16), skin, 0, 0, 0, head);
  // Eyes on +z so the agent visibly faces where it walks.
  for (const x of [-0.08, 0.08]) {
    mesh(new THREE.SphereGeometry(0.03, 8, 8), dark, x, 0.03, 0.22, head);
  }

  return { group, legs, arms, head };
}

// Floating "!" above the head for states that need the user's attention.
function alertMarker() {
  const material = new THREE.MeshBasicMaterial({ color: 0xffc94d });
  const marker = new THREE.Group();
  marker.material = material;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), material);
  bar.position.y = 0.12;
  const dot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), material);
  dot.position.y = -0.1;
  marker.add(bar, dot);
  return marker;
}

function buildLabel(name) {
  const el = document.createElement('div');
  el.className = 'agent-label';

  const status = document.createElement('div');
  status.className = 'agent-status';
  status.hidden = true;

  const chip = document.createElement('div');
  chip.className = 'agent-chip';
  chip.hidden = true;

  const tag = document.createElement('div');
  tag.className = 'agent-name';
  tag.textContent = name;

  el.append(status, chip, tag);
  const object = new CSS2DObject(el);
  object.center.set(0.5, 1); // anchor the label's bottom edge above the head
  return { object, status, chip };
}
