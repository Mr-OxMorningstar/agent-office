# Agent Office

A walkable 3D office built with Three.js that visualises live AI coding agent sessions.

Each agent session appears as a person at a desk in its team's room. Team boards show who is working on what. When an agent requests permission, it raises a hand — you approve or deny from inside the office.

## What it does

- **Live presence** — a server receives events from agent sessions and streams them to the page over server-sent events. People arrive, sit, work and leave as sessions start and stop.
- **Permission UI** — agents that need approval raise a hand; the UI surfaces the request inline so you never leave the office to respond.
- **Navigation** — first-person and overview cameras, collision detection, and touch controls (landscape only on mobile).
- **Pure geometry** — rooms are drawn with plain Three.js geometry and canvas textures. No 3D model files.

## Stack

- Three.js
- Vite
- Vanilla JavaScript
- Server-sent events (live session feed)

## Run locally

```bash
npm install
npm run dev
```

The live feed expects a server broadcasting session events on the same host. Without it the office loads with sample/static data.
