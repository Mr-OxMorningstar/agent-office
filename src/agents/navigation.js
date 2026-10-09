import * as THREE from 'three';

const CELL = 0.25; // grid resolution in world units
// Clearance kept from anything solid, measured to cell centres. A point anywhere in a free cell can be up to half a
// cell diagonal (~0.18) nearer, so this leaves at least ~0.27 of real clearance: more than an agent's body radius.
const RADIUS = 0.45;

// Walkable grid over the office floor, built from the same solid rects the player collides with. findPath()
// runs A* between two floor points and straightens the result, so agents walk round walls, glass and furniture.
export function createNavGrid(bounds, rects) {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / CELL);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / CELL);
  const blocked = new Uint8Array(cols * rows);

  const centreOf = (c, r) => [bounds.minX + (c + 0.5) * CELL, bounds.minZ + (r + 0.5) * CELL];
  const solidAt = (x, z) =>
    x < bounds.minX + RADIUS ||
    x > bounds.maxX - RADIUS ||
    z < bounds.minZ + RADIUS ||
    z > bounds.maxZ - RADIUS ||
    rects.some((q) => x > q.minX - RADIUS && x < q.maxX + RADIUS && z > q.minZ - RADIUS && z < q.maxZ + RADIUS);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) blocked[r * cols + c] = solidAt(...centreOf(c, r)) ? 1 : 0;
  }

  const cellOf = (p) => [
    THREE.MathUtils.clamp(Math.floor((p.x - bounds.minX) / CELL), 0, cols - 1),
    THREE.MathUtils.clamp(Math.floor((p.z - bounds.minZ) / CELL), 0, rows - 1),
  ];
  const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r * cols + c];

  // Nearest walkable cell, searching outward ring by ring (targets like chairs sit right next to desks).
  const nearestFree = ([c0, r0]) => {
    for (let d = 0; d < 12; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) === d && free(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr];
        }
      }
    }
    return null;
  };

  // Straight line between two points stays on walkable cells.
  const clear = (a, b) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
    for (let i = 0; i <= steps; i++) {
      const [c, r] = cellOf({ x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps });
      if (!free(c, r)) return false;
    }
    return true;
  };

  return {
    // World points from `from` to `to` (excluding `from`), or a straight hop if no path exists.
    findPath(from, to) {
      const start = nearestFree(cellOf(from));
      const goal = nearestFree(cellOf(to));
      if (!start || !goal) return [to.clone()];

      const key = (c, r) => r * cols + c;
      const goalKey = key(...goal);
      // Float64 on purpose: Float32 rounding made `cost < g[next]` true forever for the same cell.
      const g = new Float64Array(cols * rows).fill(Infinity);
      const came = new Int32Array(cols * rows).fill(-1);
      const done = new Uint8Array(cols * rows);
      const open = new MinHeap();
      g[key(...start)] = 0;
      open.push(key(...start), 0);

      while (open.size) {
        const current = open.pop();
        if (done[current]) continue; // stale queue entry, already settled at a lower cost
        done[current] = 1;
        if (current === goalKey) break;
        const c = current % cols;
        const r = (current - c) / cols;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dc && !dr) continue;
            const nc = c + dc;
            const nr = r + dr;
            // No squeezing diagonally between two blocked cells.
            if (!free(nc, nr) || (dc && dr && (!free(c + dc, r) || !free(c, r + dr)))) continue;
            const next = key(nc, nr);
            const cost = g[current] + (dc && dr ? Math.SQRT2 : 1);
            if (cost < g[next]) {
              g[next] = cost;
              came[next] = current;
              open.push(next, cost + Math.hypot(goal[0] - nc, goal[1] - nr));
            }
          }
        }
      }
      if (came[goalKey] === -1 && goalKey !== key(...start)) return [to.clone()];

      const cells = [];
      for (let k = goalKey; k !== -1; k = came[k]) cells.push(k);
      cells.reverse();
      const points = cells.map((k) => {
        const [x, z] = centreOf(k % cols, Math.floor(k / cols));
        return new THREE.Vector3(x, 0, z);
      });
      points.push(to.clone());

      // String-pull: keep only the corners needed to stay on walkable cells.
      const path = [];
      let anchor = from;
      for (let i = 1; i < points.length; i++) {
        if (!clear(anchor, points[i])) {
          path.push(points[i - 1]);
          anchor = points[i - 1];
        }
      }
      path.push(points[points.length - 1]);
      return path;
    },
  };
}

class MinHeap {
  constructor() {
    this.items = [];
    this.priorities = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, priority) {
    this.items.push(item);
    this.priorities.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop();
    const lastPriority = this.priorities.pop();
    if (this.items.length) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.priorities[l] < this.priorities[m]) m = l;
        if (r < this.items.length && this.priorities[r] < this.priorities[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  swap(a, b) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
  }
}
