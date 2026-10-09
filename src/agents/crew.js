import * as THREE from 'three';
import { ROLE_ROOMS, TEAMS } from '../world/hq/team-room.js';
import { Agent, AGENT_STATES } from './agent.js';
import { createDeskGlow, glowingSeats } from './desk-glow.js';
import { pickIdleSpot } from './idle-spots.js';
import { createNavGrid } from './navigation.js';

const SESSION_COLOR = 0x3b82c4;
const OTHER_ROLE_COLORS = [0x7a8aa0, 0xb07a4f, 0x5f9ea0, 0x9a7ab0]; // roles without a workspace, picked by name
const LOG_LENGTH = 20;
const IDLE_TO_BREAK_MS = 60_000; // a seated agent idle this long wanders off to an idle spot
const BREAK_MS = 10 * 60_000; // finished subagents hang out this long before leaving
const IDLE_STATES = new Set(['done', 'idle']);

// Subagent role -> its workspace. Roles without one (general-purpose, Explore, ...) take whichever desk is free.
const HOME_ROOM = Object.fromEntries(TEAMS.map((r) => [r.role, r]));
// Desk rooms that stand in another room's area: Docs & PM works in the boardroom, so it idles there.
const IDLE_AREA = { docs: 'boardroom' };

// The agents on the floor, driven by the live feed. Main Claude Code sessions sit at the boardroom table;
// subagents go to their role's workspace (Docs & PM: the desks at the front of the boardroom) and appear at the
// boardroom, beside the session that launched them, as if handed the work there. Each walks in from the entrance along a path round anything solid
// (`colliders`), sits at a free chair and shows its state.
// Downtime: a seated agent that stays idle walks to a random spot in the skills library, the boardroom (HQ) or its
// desk's room, falling back to the game room (and back to its desk when work arrives); a finished subagent takes
// a break in the game room before leaving. Sessions that end walk straight out.
// `onChange` fires when someone sits down, moves between desk and an idle or game room spot, or has left.
export function createCrew({ scene, layout, colliders, onChange }) {
  const spots = layout.spots;
  const nav = createNavGrid(layout.bounds, colliders);
  const seats = [
    ...spots.boardroom.seats.map((s, index) => ({ ...s, room: 'boardroom', index, occupant: null })),
    ...spots.boardroom.docsSeats.map((s, index) => ({ ...s, room: 'docs', index, occupant: null })),
    ...ROLE_ROOMS.flatMap((r) => spots.roles[r.id].seats.map((s, index) => ({ ...s, room: r.id, index, occupant: null }))),
  ];
  const claimable = (list) => list.map((s) => ({ ...s, occupant: null }));
  const lounge = spots.gameRoom.spots.map((s, index) => ({ ...s, index, occupant: null }));
  // Standing spots for idle agents, by area: the skills library, HQ (the boardroom) and each role workspace.
  const idleAreas = {
    skills: claimable(spots.skillsRoom.idle),
    boardroom: claimable(spots.boardroom.idle),
    ...Object.fromEntries(ROLE_ROOMS.map((r) => [r.id, claimable(spots.roles[r.id].idle)])),
  };
  // id -> { agent, data, color, seat, breakSpot, place, idleSince, log }; place is
  // 'arriving' | 'seat' | 'to-break' | 'break' | 'to-seat'
  const members = new Map();
  const loungers = new Map(); // finished subagents on a break: id -> { agent, spot, leaveAt }
  const leaving = new Set(); // agents walking out
  const deskGlow = createDeskGlow({ scene, seats }); // desks glow in the team colour while their agent works

  const allocate = (id, data) => {
    const preferred = data.kind === 'session' ? 'boardroom' : HOME_ROOM[data.role]?.id;
    const free = (room, skipBoardroom) => seats.find((s) => !s.occupant && (!room || s.room === room) && !(skipBoardroom && s.room === 'boardroom'));
    const seat = (preferred && free(preferred)) || free(null, true) || free();
    if (seat) seat.occupant = id;
    return seat ?? null;
  };
  const takeLoungeSpot = (id) => {
    const spot = lounge.find((s) => !s.occupant);
    if (spot) spot.occupant = id;
    return spot ?? null;
  };
  // A random free spot in the skills library, HQ or the room of the desk the agent got; the game room if all are full.
  const takeIdleSpot = (member) => {
    const home = member.seat && (IDLE_AREA[member.seat.room] ?? member.seat.room);
    const own = home && home !== 'boardroom' ? [home] : [];
    const spot = pickIdleSpot(idleAreas, ['skills', 'boardroom', ...own]);
    if (!spot) return takeLoungeSpot(member.data.id);
    spot.occupant = member.data.id;
    return spot;
  };
  const release = (spot) => {
    if (spot) spot.occupant = null;
  };

  // Where a new subagent appears: just behind its parent session's chair, else at the boardroom door. Null for
  // everyone else (and for subagents whose session isn't known), who come in through the entrance.
  const handoffPoint = (data) => {
    if (data.kind !== 'subagent') return null;
    const parent = members.get(data.parentId ?? String(data.id).split(':')[0]);
    const seat = parent?.seat?.room === 'boardroom' ? parent.seat : null;
    if (!seat) return spots.boardroom.doorInside.clone();
    return seat.position.clone().addScaledVector(new THREE.Vector3(Math.sin(seat.facing), 0, Math.cos(seat.facing)), -0.9);
  };

  // In through the entrance, then a planned path to the chair (or to the lobby rug when every chair is taken).
  const routeIn = (seat) => [spots.entranceInside, ...nav.findPath(spots.entranceInside, seat ? seat.position : lobbySpot())];
  const settleAt = (agent, spot) => (spot.pose === 'stand' ? agent.setHeading(spot.facing) : agent.sit(spot.facing));
  // Path to a game room or idle spot: via its approach point when it has one (seats inside furniture).
  const pathToSpot = (from, spot) => (spot.approach ? [...nav.findPath(from, spot.approach), spot.position] : nav.findPath(from, spot.position));

  const colorFor = (data) => {
    if (data.kind === 'session') return SESSION_COLOR;
    const home = HOME_ROOM[data.role];
    if (home) return home.color;
    const hash = [...(data.role ?? '')].reduce((h, c) => h + c.charCodeAt(0), 0);
    return OTHER_ROLE_COLORS[hash % OTHER_ROLE_COLORS.length];
  };

  const record = (member, data) => {
    member.log.push({ at: data.at ?? Date.now(), state: data.state, text: data.text });
    if (member.log.length > LOG_LENGTH) member.log.shift();
  };

  // Path away from a game room or idle spot: step back out to its approach point first (seats sit inside furniture).
  const pathFrom = (agent, spot, to) => {
    const start = spot?.approach ?? agent.position;
    return [...(spot?.approach ? [spot.approach] : []), ...nav.findPath(start, to)];
  };

  const walkOut = (agent, fromSpot) => {
    agent.setState('leaving');
    leaving.add(agent);
    agent.walkTo([...pathFrom(agent, fromSpot, spots.entranceInside), spots.entranceOutside]).then(() => {
      leaving.delete(agent);
      scene.remove(agent.object);
      agent.label.object.element.remove(); // CSS2D elements aren't removed with their parent object
      onChange?.();
    });
  };

  // Desk -> idle spot, keeping the desk reserved for when work comes back.
  const goOnBreak = (member) => {
    const spot = takeIdleSpot(member);
    if (!spot) {
      member.idleSince = Date.now(); // everywhere full: stay at the desk and check again later
      return;
    }
    member.breakSpot = spot;
    member.place = 'to-break';
    member.agent.setState('break', member.data.text);
    member.agent.walkTo(pathToSpot(member.agent.position, spot)).then(() => {
      member.place = 'break';
      settleAt(member.agent, spot);
      onChange?.();
    });
    onChange?.();
  };

  // Idle spot -> desk, as soon as the agent has something to do.
  const backToDesk = (member) => {
    const spot = member.breakSpot;
    release(spot);
    member.breakSpot = null;
    member.place = 'to-seat';
    member.agent.setState(member.data.state, member.data.text);
    const target = member.seat ? member.seat.position : lobbySpot();
    member.agent.walkTo(pathFrom(member.agent, spot, target)).then(() => {
      member.place = 'seat';
      if (member.seat) member.agent.sit(member.seat.facing);
      member.agent.setState(member.data.state, member.data.text);
      onChange?.();
    });
  };

  const api = {
    upsert(data) {
      let member = members.get(data.id);
      if (!member) {
        const color = colorFor(data);
        const agent = new Agent({ name: data.name, color });
        const origin = handoffPoint(data);
        agent.position.copy(origin ?? spots.entranceOutside);
        scene.add(agent.object);
        member = { agent, data, color, seat: allocate(data.id, data), breakSpot: null, place: 'arriving', idleSince: null, log: [] };
        members.set(data.id, member);
        agent.setState('arriving', data.text);
        const seat = member.seat;
        agent.walkTo(origin ? nav.findPath(origin, seat ? seat.position : lobbySpot()) : routeIn(seat)).then(() => {
          member.place = 'seat';
          if (seat) agent.sit(seat.facing);
          agent.setState(member.data.state, member.data.text);
          onChange?.();
        });
      }
      member.data = data;
      record(member, data);
      const idle = IDLE_STATES.has(data.state);
      member.idleSince = idle ? member.idleSince ?? Date.now() : null;

      if (member.place === 'seat') member.agent.setState(data.state, data.text);
      else if (member.place === 'break' || member.place === 'to-break') {
        if (idle) member.agent.setStatus(data.text);
        else backToDesk(member);
      } else if (member.place === 'to-seat') member.agent.setState(data.state, data.text);
    },

    remove(id) {
      const member = members.get(id);
      if (!member) return;
      members.delete(id);
      release(member.seat);
      release(member.breakSpot);
      const { agent } = member;
      // A finished subagent unwinds in the game room before going home, if there's a free spot.
      const spot = member.data.kind === 'subagent' ? takeLoungeSpot(id) : null;
      if (!spot) {
        walkOut(agent, member.place === 'break' ? member.breakSpot : null);
        return;
      }
      loungers.set(id, { agent, spot, leaveAt: Date.now() + BREAK_MS });
      agent.setState('break', 'Finished — on a break');
      agent.walkTo(pathToSpot(agent.position, spot)).then(() => {
        settleAt(agent, spot);
        onChange?.();
      });
    },

    // Drops agents the feed no longer knows about (e.g. sessions that ended while the page was disconnected).
    sync(liveIds) {
      for (const id of [...members.keys()]) if (!liveIds.has(id)) api.remove(id);
    },

    get count() {
      return members.size;
    },

    // Everyone currently away from their desk or on a break: idle agents plus finished subagents.
    get onBreak() {
      let n = loungers.size;
      for (const m of members.values()) if (m.place === 'break' || m.place === 'to-break') n += 1;
      return n;
    },

    // One card per agent: who, what they were asked to do, their state and latest status line, and where they are
    // (`room` is the desk's room once seated, 'away' on an idle spot or break, null while walking).
    cards() {
      return [...members.values()].map(({ data, color, seat, place }) => ({
        name: data.name,
        task: data.task,
        text: data.text,
        state: data.state,
        role: data.role ?? null,
        color,
        room: place === 'seat' && seat ? seat.room : place === 'break' ? 'away' : null,
        seat: place === 'seat' && seat ? seat.index : null,
      }));
    },

    // Agents holding a permission question the user can answer from the office.
    askingPermission() {
      return [...members.values()].filter((m) => m.data.permission);
    },

    nearest(position, reach) {
      let best = null;
      let bestDistance = reach;
      for (const member of members.values()) {
        const d = member.agent.position.distanceTo(position);
        if (d < bestDistance) {
          best = member;
          bestDistance = d;
        }
      }
      return best;
    },

    describe(member) {
      const { data, log } = member;
      const look = AGENT_STATES[data.state];
      return {
        heading: data.name,
        badge: look ? `${look.icon} ${look.label}` : data.state,
        note: data.kind === 'session' ? `Claude Code session in ${data.project ?? 'an unknown folder'}` : `${data.role} subagent`,
        rowsHeading: 'Recent activity',
        rows: [...log].reverse().map((entry) => ({
          title: entry.text || AGENT_STATES[entry.state]?.label || entry.state,
          subtitle: `${AGENT_STATES[entry.state]?.label ?? entry.state} · ${new Date(entry.at).toLocaleTimeString()}`,
        })),
      };
    },

    update(dt, elapsed) {
      const now = Date.now();
      for (const member of members.values()) {
        member.agent.update(dt, elapsed);
        if (member.place === 'seat' && member.idleSince && now - member.idleSince > IDLE_TO_BREAK_MS) goOnBreak(member);
      }
      for (const [id, lounger] of loungers) {
        lounger.agent.update(dt, elapsed);
        if (now > lounger.leaveAt) {
          loungers.delete(id);
          release(lounger.spot);
          walkOut(lounger.agent, lounger.spot);
        }
      }
      for (const agent of leaving) agent.update(dt, elapsed);
      deskGlow.update(dt, elapsed, glowingSeats(members.values()));
    },
  };
  return api;

  // A spot on the welcome rug for when every chair is taken.
  function lobbySpot() {
    const angle = Math.random() * Math.PI * 2;
    return spots.welcomeRug.clone().add(new THREE.Vector3(Math.cos(angle) * 1.6, 0, Math.sin(angle) * 1.6));
  }
}
