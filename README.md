# Platinum Router

A data-driven speedrun routing tool designed for long-form runs (e.g. Ghost of Tsushima Platinum).

## Core Idea

Everything is driven by:
- Splits (what you do)
- Phases (what is visible / expected)
- Counters (what you track)

The UI is just a renderer of state.

---

## Structure

- `/data` → Game definitions (splits, phases, counters)
- `/js` → Logic (state, rendering, actions)
- `/overlay.html` → Stream overlay
- `/index.html` → Controller UI
- `/splits.html` → Split editor (future)
- `/phases.html` → Phase editor (future)

---

## Key Concepts

### Splits
Define progression through the run.
- Ordered
- Can auto-increment counters
- Can trigger phase changes

### Phases
Define what is visible + targets.
- Control UI visibility
- Can define pace targets (future)

### State
Stored in localStorage.
- Timer
- Counters
- Splits progress

---

## Design Goals

- No hardcoded game logic
- Fully portable between games
- Fast iteration for routing changes
- Stream-friendly

---

## Known Constraints

- LocalStorage = single device persistence
- No backend (by design)
- Overlay sync via storage events

---

## Future Plans

- Phase-based pacing (replace act timer)
- Separate editor pages
- Multi-game support
- Cloud sync (optional, not priority)
