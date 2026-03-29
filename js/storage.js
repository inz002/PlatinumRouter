export const STORAGE_KEY = "platinumrouter_state_v1";

export function buildDefaultStoredState() {
  return {
    gameId: "ghost-of-tsushima",
    elapsedMs: 0,
    currentSplitIndex: 0,
    history: [],
    counters: {},
    miscChecks: { dirge: false },
    settings: {
      difficulty: "Lethal",
      act1TargetMinutes: 180,
      showSettings: false,
      remoteCode: ""
    },
    splits: []
  };
}

export function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaultStoredState();

    const parsed = JSON.parse(raw);
    return mergeStoredState(buildDefaultStoredState(), parsed);
  } catch (error) {
    console.error("Failed to load stored state", error);
    return buildDefaultStoredState();
  }
}

export function saveStoredState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save stored state", error);
  }
}

export function clearStoredState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear stored state", error);
  }
}

export function mergeStoredState(baseState, incomingState) {
  const incoming = incomingState || {};

  return {
    ...baseState,
    ...incoming,
    miscChecks: {
      ...baseState.miscChecks,
      ...(incoming.miscChecks || {})
    },
    settings: {
      ...baseState.settings,
      ...(incoming.settings || {})
    },
    history: Array.isArray(incoming.history) ? incoming.history : baseState.history,
    splits: Array.isArray(incoming.splits) ? incoming.splits : baseState.splits,
    counters:
      incoming.counters && typeof incoming.counters === "object"
        ? incoming.counters
        : baseState.counters
  };
}
