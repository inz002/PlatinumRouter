// storage.js

const STORAGE_KEY = "tsushima-router-state";

/**
 * Internal state cache (single source of truth in memory)
 */
let state = null;

/**
 * Subscribers (UI + overlay listeners)
 */
const listeners = new Set();

/**
 * Deep clone helper (prevents mutation bugs)
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Load from localStorage (once)
 */
function loadState() {
  if (state) return state;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? JSON.parse(raw) : getDefaultState();
  } catch (e) {
    console.error("Failed to parse state, resetting:", e);
    state = getDefaultState();
  }

  return state;
}

/**
 * Save to localStorage
 */
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Emit updates to all listeners
 */
function emit() {
  const snapshot = clone(state);
  listeners.forEach((fn) => fn(snapshot));
}

/**
 * Public: get current state
 */
export function getState() {
  return clone(loadState());
}

/**
 * Public: subscribe to state changes
 */
export function subscribe(fn) {
  listeners.add(fn);

  // immediate sync
  fn(getState());

  return () => listeners.delete(fn);
}

/**
 * Public: update state safely
 */
export function updateState(updater) {
  const current = loadState();
  const next = updater(clone(current));

  if (!next) {
    console.warn("updateState returned nothing — ignoring");
    return;
  }

  state = next;
  saveState();
  emit();
}

/**
 * Public: hard reset (useful for debug)
 */
export function resetState() {
  state = getDefaultState();
  saveState();
  emit();
}

/**
 * Cross-tab sync (CRITICAL for overlay)
 */
window.addEventListener("storage", (e) => {
  if (e.key !== STORAGE_KEY) return;

  try {
    state = e.newValue ? JSON.parse(e.newValue) : getDefaultState();
    emit();
  } catch (err) {
    console.error("Storage sync failed:", err);
  }
});

/**
 * Default state generator
 * (KEEP THIS SIMPLE — expand only if needed)
 */
function getDefaultState() {
  return {
    timer: {
      startTime: null,
      elapsed: 0,
      running: false,
    },

    counters: {
      inari: 0,
      haiku: 0,
      hotSpring: 0,
      bamboo: 0,
      shinto: 0,
      lighthouse: 0,
      artifacts: 0,
      records: 0,
      crickets: 0,
      hiddenAltars: 0,
      mongolTerritories: 0,
      duels: 0,
      mythic: 0,
      sideTales: 0,
      trophies: 0,
      coOp: 0,
      monochrome: 0,
    },

    totals: {
      inari: 49,
      haiku: 19,
      hotSpring: 18,
      bamboo: 16,
      shinto: 16,
      lighthouse: 8,
      artifacts: 20,
      records: 20,
      crickets: 5,
      hiddenAltars: 10,
      mongolTerritories: 56,
      duels: 25,
      mythic: 7,
      sideTales: 61,
      trophies: 52,
      coOp: 3,
      monochrome: 2,
    },

    splits: {
      currentIndex: 0,
      completed: [],
    },

    phase: "act1",

    misc: {
      dirgeDone: false,
    },

    ui: {
      settingsOpen: false,
    },
  };
}
