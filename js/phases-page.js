// js/phases-page.js

import { loadGameData } from "./data-loader.js";
import { getState, updateState, subscribe } from "./storage.js";
import { createActsEditor } from "./acts-editor.js";
import { createDebugger } from "./debug.js";
import { clamp, normalizeSplits, getActivePhaseId } from "./split-logic.js";

const GAME_ID = "ghost-of-tsushima";

const debug = createDebugger({ name: "phases-page" });

let gameData = null;
let actsEditorApi = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeCounterState(counterDefs, rawCounters = {}, rawTotals = {}) {
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

function buildInitialState(raw = {}) {
  const normalized = normalizeCounterState(
    gameData?.counters || {},
    raw.counters || {},
    raw.totals || {}
  );

  const rawSplitBlock = raw?.splits;
  const rawSplitItems =
    Array.isArray(rawSplitBlock?.items)
      ? rawSplitBlock.items
      : Array.isArray(rawSplitBlock)
        ? rawSplitBlock
        : [];

  const splitItems = normalizeSplits(rawSplitItems, gameData?.defaultSplits || []);
  const currentIndex = clamp(Number(raw?.splits?.currentIndex || 0), 0, splitItems.length);

  const phaseSource =
    Object.keys(safeObject(raw?.phases)).length > 0
      ? raw.phases
      : gameData?.phases || {};

  const phase =
    raw.phase ||
    getActivePhaseId(splitItems, currentIndex, phaseSource) ||
    "legacy_all";

  return {
    timer: {
      startTime: raw.timer?.startTime ?? null,
      elapsed: Math.max(0, Number(raw.timer?.elapsed || 0)),
      running: !!raw.timer?.running
    },

    counters: normalized.counters,
    totals: normalized.totals,

    splits: {
      currentIndex,
      completed: Array.isArray(raw?.splits?.completed) ? raw.splits.completed : [],
      items: splitItems
    },

    phase,

    phases: safeObject(raw?.phases),
    quotas: safeObject(raw?.quotas),

    settings: {
      difficulty: raw.settings?.difficulty || "Lethal",
      act1TargetMinutes: Number(raw.settings?.act1TargetMinutes || 180),
      remoteCode: raw.settings?.remoteCode || ""
    },

    misc: {
      dirgeDone: !!raw.misc?.dirgeDone
    },

    ui: {
      settingsOpen: !!raw.ui?.settingsOpen
    },

    gameId: raw.gameId || GAME_ID
  };
}

function getCurrentState() {
  return buildInitialState(getState());
}

function getEffectivePhases(rawState = null) {
  const source = rawState || getState();
  const stored = safeObject(source?.phases);
  return Object.keys(stored).length ? stored : safeObject(gameData?.phases);
}

function getEffectiveQuotas(rawState = null) {
  const source = rawState || getState();
  const stored = safeObject(source?.quotas);
  return Object.keys(stored).length ? stored : safeObject(gameData?.quotas);
}

function syncGameDataFromState(rawState = null) {
  const source = rawState || getState();
  gameData.phases = clone(getEffectivePhases(source));
  gameData.quotas = clone(getEffectiveQuotas(source));
}

function renderHeader() {
  const title = document.querySelector(".title");
  if (title) {
    title.textContent = "Ghost of Tsushima Phase Editor";
  }
}

function renderSummary(state) {
  const subtitles = document.querySelectorAll(".subtitle");
  const phaseCount = Object.keys(gameData?.phases || {}).length;
  const activePhase = state.phase || "legacy_all";

  if (subtitles[0]) {
    subtitles[0].textContent = `${phaseCount} phases loaded. Edit labels, notes, visible objectives, quota targets, and pacing here.`;
  }

  const notesCard = document.querySelector(".panel .card .subtitle");
  if (notesCard) {
    notesCard.textContent =
      `Current active phase: ${activePhase}. Visible objectives, quotas, and target minutes should match your split flow, including lighthouse support.`;
  }
}

function syncPhaseToCurrentSplits(nextState) {
  const phaseSource =
    Object.keys(safeObject(nextState?.phases)).length > 0
      ? nextState.phases
      : gameData?.phases || {};

  nextState.phase =
    getActivePhaseId(
      nextState.splits?.items || [],
      Number(nextState.splits?.currentIndex || 0),
      phaseSource
    ) || "legacy_all";

  return nextState;
}

function bindStandaloneButtons() {
  const addBtn = document.getElementById("addActsEditorBtn");
  const resetBtn = document.getElementById("resetActsEditorBtn");
  const saveBtn = document.getElementById("saveActsEditorBtn");
  const exportBtn = document.getElementById("exportActsEditorBtn");
  const copyBtn = document.getElementById("copyActsEditorBtn");

  addBtn?.addEventListener("click", () => actsEditorApi?.addPhase?.());
  resetBtn?.addEventListener("click", () => actsEditorApi?.reset?.());
  saveBtn?.addEventListener("click", () => actsEditorApi?.save?.());
  exportBtn?.addEventListener("click", () => actsEditorApi?.exportJson?.());
  copyBtn?.addEventListener("click", () => actsEditorApi?.copyJson?.());
}

function setupActsEditor() {
  actsEditorApi = createActsEditor({
    overlayEl: null,
    phaseListEl: document.getElementById("actsEditorPhaseList"),
    formEl: document.getElementById("actsEditorForm"),
    addBtn: document.getElementById("addActsEditorBtn"),
    closeBtn: null,
    saveBtn: document.getElementById("saveActsEditorBtn"),
    resetBtn: document.getElementById("resetActsEditorBtn"),
    exportBtn: document.getElementById("exportActsEditorBtn"),
    importInput: document.getElementById("importActsEditorInput"),
    copyBtn: document.getElementById("copyActsEditorBtn"),

    getPhases: () => clone(gameData?.phases || {}),
    getQuotas: () => clone(gameData?.quotas || {}),
    getCounterDefs: () => gameData?.counters || {},

    setPhases: (phases) => {
      const nextPhases = clone(phases || {});
      gameData.phases = nextPhases;

      updateState((raw) => {
        const state = buildInitialState(raw);
        state.phases = nextPhases;
        return syncPhaseToCurrentSplits(state);
      });
    },

    setQuotas: (quotas) => {
      const nextQuotas = clone(quotas || {});
      gameData.quotas = nextQuotas;

      updateState((raw) => {
        const state = buildInitialState(raw);
        state.quotas = nextQuotas;
        return state;
      });
    },

    onAfterSave: () => {
      const rawState = getState();
      syncGameDataFromState(rawState);

      const state = getCurrentState();
      renderSummary(state);

      debug.log("Phase setup saved", {
        phaseCount: Object.keys(gameData?.phases || {}).length,
        quotaCount: Object.keys(gameData?.quotas || {}).length
      });
    }
  });

  if (typeof actsEditorApi?.open === "function") {
    actsEditorApi.open();
  }
}

function setupSubscriptions() {
  subscribe((raw) => {
    syncGameDataFromState(raw);

    const state = buildInitialState(raw);
    renderSummary(state);

    debug.setStatus("gameId", state.gameId);
    debug.setStatus("phaseCount", Object.keys(gameData?.phases || {}).length);
    debug.setStatus("quotaCount", Object.keys(gameData?.quotas || {}).length);
    debug.setStatus("activePhase", state.phase || "legacy_all");
    debug.setStatus("splitCount", state.splits?.items?.length || 0);
  });
}

async function boot() {
  gameData = await loadGameData(GAME_ID);

  const rawState = getState();

  if (Object.keys(safeObject(rawState?.phases)).length > 0) {
    gameData.phases = clone(rawState.phases);
  }

  if (Object.keys(safeObject(rawState?.quotas)).length > 0) {
    gameData.quotas = clone(rawState.quotas);
  }

  updateState((raw) => {
    const state = buildInitialState(raw);

    if (!Object.keys(safeObject(state.phases)).length && Object.keys(safeObject(gameData?.phases)).length) {
      state.phases = clone(gameData.phases);
    }

    if (!Object.keys(safeObject(state.quotas)).length && Object.keys(safeObject(gameData?.quotas)).length) {
      state.quotas = clone(gameData.quotas);
    }

    return syncPhaseToCurrentSplits(state);
  });

  renderHeader();
  setupActsEditor();
  bindStandaloneButtons();
  setupSubscriptions();

  debug.setSnapshotBuilder(() => ({
    gameData,
    state: getCurrentState()
  }));

  const state = getCurrentState();
  renderSummary(state);

  debug.log("Phase editor page booted", {
    phaseCount: Object.keys(gameData?.phases || {}).length,
    quotaCount: Object.keys(gameData?.quotas || {}).length,
    splitCount: state.splits?.items?.length || 0,
    counters: Object.keys(gameData?.counters || {}).length
  });
}

boot().catch((error) => {
  debug.error("Phase editor page failed", {
    message: error.message,
    stack: error.stack
  });

  console.error(error);
});
