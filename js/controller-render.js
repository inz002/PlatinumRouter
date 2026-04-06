// js/controller-core.js

import { clamp, normalizeSplits, getActivePhaseId } from "./split-logic.js";

export const DEFAULT_SETTINGS = {
  difficulty: "Lethal",
  act1TargetMinutes: 180,
  remoteCode: ""
};

export const DEFAULT_MISC = {
  dirgeDone: false
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function normalizeCounterState(counterDefs, rawCounters = {}, rawTotals = {}) {
  const counters = {};
  const totals = {};

  Object.entries(counterDefs || {}).forEach(([key, def]) => {
    const rawValue =
      typeof rawCounters[key] === "object"
        ? Number(rawCounters[key]?.value || 0)
        : Number(rawCounters[key] || 0);

    const rawManualDelta =
      typeof rawCounters[key] === "object"
        ? Number(rawCounters[key]?.manualDelta || 0)
        : 0;

    const max = Number(rawTotals[key] || def.max || 0);

    counters[key] = {
      value: Number.isFinite(rawValue) ? clamp(rawValue, 0, max) : 0,
      manualDelta: Number.isFinite(rawManualDelta) ? rawManualDelta : 0
    };

    totals[key] = max;
  });

  return { counters, totals };
}

export function buildInitialState(raw = {}, gameData, gameId) {
  const normalized = normalizeCounterState(
    gameData?.counters || {},
    raw.counters || {},
    raw.totals || {}
  );

  const rawSplitBlock = raw.splits || {};
  const rawSplitItems = Array.isArray(rawSplitBlock.items)
    ? rawSplitBlock.items
    : Array.isArray(raw.splits)
      ? raw.splits
      : [];

  const hasSavedSplits = Array.isArray(rawSplitItems) && rawSplitItems.length > 0;

  const splits = normalizeSplits(
    hasSavedSplits ? rawSplitItems : gameData?.defaultSplits || [],
    gameData?.defaultSplits || []
  );

  const splitCount = splits.length;

  const running = !!raw.timer?.running;
  const elapsed = Math.max(0, Number(raw.timer?.elapsed || 0));
  const startTime = running
    ? Number(raw.timer?.startTime || Date.now() - elapsed)
    : null;

  const currentIndex = clamp(
    Number(rawSplitBlock.currentIndex || 0),
    0,
    Math.max(0, splitCount)
  );

  const state = {
    timer: {
      startTime,
      elapsed,
      running
    },

    counters: normalized.counters,
    totals: normalized.totals,

    splits: {
      currentIndex,
      completed: Array.isArray(rawSplitBlock.completed) ? rawSplitBlock.completed : [],
      items: splits
    },

    phase: raw.phase || "legacy_all",

    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {})
    },

    misc: {
      ...DEFAULT_MISC,
      ...(raw.misc || {})
    },

    ui: {
      settingsOpen: raw?.ui?.settingsOpen ?? false
    },

    gameId
  };

  state.phase = getActivePhase(state, gameData);

  return state;
}

export function getActivePhase(state, gameData) {
  const items = state.splits?.items || [];
  const currentIndex = Number(state.splits?.currentIndex || 0);
  return getActivePhaseId(items, currentIndex, gameData?.phases || {});
}

export function getCurrentStateFactory({ getState, gameData, gameId }) {
  return function getCurrentState() {
    return buildInitialState(getState(), gameData, gameId);
  };
}

export function computePaceText(state) {
  const actTargetMinutes = Number(state.settings?.act1TargetMinutes || 0);
  if (!actTargetMinutes) return "No target";

  const targetMs = actTargetMinutes * 60 * 1000;
  const diff = Number(state.timer?.elapsed || 0) - targetMs;

  if (Math.abs(diff) < 1000) return "On pace";
  if (diff < 0) return `${formatMs(Math.abs(diff))} ahead`;
  return `${formatMs(diff)} behind`;
}

export function buildHistoryEntry(state, splitIndex, split) {
  const completed = state.splits?.completed || [];
  const previous = completed[completed.length - 1];
  const cumulativeMs = Number(state.timer?.elapsed || 0);
  const previousCumulativeMs = Number(previous?.cumulativeMs || 0);

  return {
    splitIndex,
    label: split.label || `Split ${splitIndex + 1}`,
    cumulativeMs,
    segmentMs: Math.max(0, cumulativeMs - previousCumulativeMs),
    autoApplied: clone(split.auto || {}),
    at: new Date().toISOString()
  };
}

export function applyAutoToCounters(state, gameData, autoMap = {}, direction = 1) {
  Object.entries(autoMap || {}).forEach(([key, amount]) => {
    if (!state.counters[key]) return;

    const max = Number(state.totals?.[key] || gameData?.counters?.[key]?.max || 0);
    const current = Number(state.counters[key]?.value || 0);
    const next = clamp(current + Number(amount || 0) * direction, 0, max);

    state.counters[key].value = next;
  });
}
