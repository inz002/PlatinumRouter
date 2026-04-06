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
      trophies: { value: 0, manualDelta: 0 },
      inari: { value: 0, manualDelta: 0 },
      hotsprings: { value: 0, manualDelta: 0 },
      bamboo: { value: 0, manualDelta: 0 },
      haiku: { value: 0, manualDelta: 0 },
      records: { value: 0, manualDelta: 0 },
      artifacts: { value: 0, manualDelta: 0 },
      shrines: { value: 0, manualDelta: 0 },
      lighthouses: { value: 0, manualDelta: 0 },
      crickets: { value: 0, manualDelta: 0 },
      hiddenaltars: { value: 0, manualDelta: 0 },
      duels: { value: 0, manualDelta: 0 },
      territories: { value: 0, manualDelta: 0 },
      mythictales: { value: 0, manualDelta: 0 },
      sidetales: { value: 0, manualDelta: 0 },
      monochrome: { value: 0, manualDelta: 0 },
      cooper: { value: 0, manualDelta: 0 }
    },

    totals: {
      trophies: 52,
      inari: 49,
      hotsprings: 18,
      bamboo: 16,
      haiku: 19,
      records: 20,
      artifacts: 20,
      shrines: 16,
      lighthouses: 8,
      crickets: 5,
      hiddenaltars: 10,
      duels: 25,
      territories: 56,
      mythictales: 7,
      sidetales: 61,
      monochrome: 2,
      cooper: 3
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

function normalizeCounterEntry(value) {
  if (value && typeof value === "object") {
    return {
      value: Number(value.value || 0),
      manualDelta: Number(value.manualDelta || 0)
    };
  }

  return {
    value: Number(value || 0),
    manualDelta: 0
  };
}

function migrateCounters(rawCounters = {}) {
  const source = safeObject(rawCounters);

  return {
    trophies: normalizeCounterEntry(source.trophies),
    inari: normalizeCounterEntry(source.inari),
    hotsprings: normalizeCounterEntry(source.hotsprings ?? source.hotSpring),
    bamboo: normalizeCounterEntry(source.bamboo),
    haiku: normalizeCounterEntry(source.haiku),
    records: normalizeCounterEntry(source.records),
    artifacts: normalizeCounterEntry(source.artifacts),
    shrines: normalizeCounterEntry(source.shrines ?? source.shinto),
    lighthouses: normalizeCounterEntry(source.lighthouses ?? source.lighthouse),
    crickets: normalizeCounterEntry(source.crickets),
    hiddenaltars: normalizeCounterEntry(source.hiddenaltars ?? source.hiddenAltars),
    duels: normalizeCounterEntry(source.duels),
    territories: normalizeCounterEntry(source.territories ?? source.mongolTerritories),
    mythictales: normalizeCounterEntry(source.mythictales ?? source.mythic),
    sidetales: normalizeCounterEntry(source.sidetales ?? source.sideTales),
    monochrome: normalizeCounterEntry(source.monochrome),
    cooper: normalizeCounterEntry(source.cooper ?? source.coOp)
  };
}

function migrateTotals(rawTotals = {}) {
  const source = safeObject(rawTotals);

  return {
    trophies: Number(source.trophies || 52),
    inari: Number(source.inari || 49),
    hotsprings: Number(source.hotsprings ?? source.hotSpring ?? 18),
    bamboo: Number(source.bamboo || 16),
    haiku: Number(source.haiku || 19),
    records: Number(source.records || 20),
    artifacts: Number(source.artifacts || 20),
    shrines: Number(source.shrines ?? source.shinto ?? 16),
    lighthouses: Number(source.lighthouses ?? source.lighthouse ?? 8),
    crickets: Number(source.crickets || 5),
    hiddenaltars: Number(source.hiddenaltars ?? source.hiddenAltars ?? 10),
    duels: Number(source.duels || 25),
    territories: Number(source.territories ?? source.mongolTerritories ?? 56),
    mythictales: Number(source.mythictales ?? source.mythic ?? 7),
    sidetales: Number(source.sidetales ?? source.sideTales ?? 61),
    monochrome: Number(source.monochrome || 2),
    cooper: Number(source.cooper ?? source.coOp ?? 3)
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
      elapsed: Math.max(0, Number(raw.timer?.elapsed || 0)),
      running: !!raw.timer?.running
    },

    counters: migrateCounters(raw.counters),

    totals: migrateTotals(raw.totals),

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
