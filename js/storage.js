// storage.js

const STORAGE_KEY = "tsushima-router-state";

let state = null;
const listeners = new Set();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getDefaultState() {
  return {
    timer: {
      startTime: null,
      elapsed: 0,
      running: false
    },

    counters: {
      inari: { value: 0, manualDelta: 0 },
      haiku: { value: 0, manualDelta: 0 },
      hotSpring: { value: 0, manualDelta: 0 },
      bamboo: { value: 0, manualDelta: 0 },
      shinto: { value: 0, manualDelta: 0 },
      lighthouse: { value: 0, manualDelta: 0 },
      artifacts: { value: 0, manualDelta: 0 },
      records: { value: 0, manualDelta: 0 },
      crickets: { value: 0, manualDelta: 0 },
      hiddenAltars: { value: 0, manualDelta: 0 },
      mongolTerritories: { value: 0, manualDelta: 0 },
      duels: { value: 0, manualDelta: 0 },
      mythic: { value: 0, manualDelta: 0 },
      sideTales: { value: 0, manualDelta: 0 },
      trophies: { value: 0, manualDelta: 0 },
      coOp: { value: 0, manualDelta: 0 },
      monochrome: { value: 0, manualDelta: 0 }
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
      monochrome: 2
    },

    splits: {
      currentIndex: 0,
      completed: [],
      items: []
    },

    phase: "legacy_all",

    phases: {},

    quotas: {},

    settings: {
      difficulty: "Lethal",
      act1TargetMinutes: 180,
      remoteCode: ""
    },

    misc: {
      dirgeDone: false
    },

    ui: {
      settingsOpen: false
    },

    gameId: "ghost-of-tsushima"
  };
}

function sanitizeLoadedState(raw) {
  const fallback = getDefaultState();

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  return {
    timer: {
      startTime: raw.timer?.startTime ?? fallback.timer.startTime,
      elapsed: Number(raw.timer?.elapsed || 0),
      running: !!raw.timer?.running
    },

    counters: typeof raw.counters === "object" && raw.counters !== null
      ? raw.counters
      : fallback.counters,

    totals: typeof raw.totals === "object" && raw.totals !== null
      ? raw.totals
      : fallback.totals,

    splits: {
      currentIndex: Number(raw.splits?.currentIndex || 0),
      completed: Array.isArray(raw.splits?.completed) ? raw.splits.completed : [],
      items: Array.isArray(raw.splits?.items) ? raw.splits.items : []
    },

    phase: raw.phase || fallback.phase,

    phases: safeObject(raw.phases),

    quotas: safeObject(raw.quotas),

    settings: {
      ...fallback.settings,
      ...(raw.settings || {})
    },

    misc: {
      ...fallback.misc,
      ...(raw.misc || {})
    },

    ui: {
      ...fallback.ui,
      ...(raw.ui || {})
    },

    gameId: raw.gameId || fallback.gameId
  };
}

function loadState() {
  if (state) return state;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? sanitizeLoadedState(JSON.parse(raw)) : getDefaultState();
  } catch (error) {
    console.error("Failed to parse state, resetting:", error);
    state = getDefaultState();
  }

  return state;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function emit() {
  const snapshot = clone(state);
  listeners.forEach((fn) => fn(snapshot));
}

export function getState() {
  return clone(loadState());
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(getState());
  return () => listeners.delete(fn);
}

export function updateState(updater) {
  const current = loadState();
  const next = updater(clone(current));

  if (!next || typeof next !== "object") {
    console.warn("updateState returned invalid state — ignoring");
    return;
  }

  state = sanitizeLoadedState(next);
  saveState();
  emit();
}

export function resetState() {
  state = getDefaultState();
  saveState();
  emit();
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;

  try {
    state = event.newValue
      ? sanitizeLoadedState(JSON.parse(event.newValue))
      : getDefaultState();

    emit();
  } catch (error) {
    console.error("Storage sync failed:", error);
  }
});
