// phases-page.js

import { loadGameData } from "./js/data-loader.js";
import { getState, updateState, subscribe } from "./js/storage.js";
import { createActsEditor } from "./js/acts-editor.js";
import { createDebugger } from "./js/debug.js";
import { clamp, normalizeSplits, getActivePhaseId } from "./js/split-logic.js";

const GAME_ID = "ghost-of-tsushima";

const debug = createDebugger({ name: "phases-page" });

let gameData = null;
let actsEditorApi = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

  const splitItems = normalizeSplits(raw.splits, gameData?.defaultSplits || []);
  const currentIndex = clamp(Number(raw.splits?.currentIndex || 0), 0, splitItems.length);

  const phase =
    raw.phase ||
    getActivePhaseId(splitItems, currentIndex, gameData?.phases || {}) ||
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
      completed: Array.isArray(raw.splits?.completed) ? raw.splits.completed : [],
      items: splitItems
    },

    phase,

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

    gameId: GAME_ID
  };
}

function getCurrentState() {
  return buildInitialState(getState());
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
    subtitles[0].textContent = `${phaseCount} phases loaded. Edit labels, notes, visible objectives, and quota targets here.`;
  }

  const notesCard = document.querySelector(".panel .card .subtitle");
  if (notesCard) {
    notesCard.textContent =
      `Current active phase: ${activePhase}. Visible objectives and quotas should match your split flow, including lighthouse support.`;
  }
}

function syncPhaseToCurrentSplits(nextState) {
  nextState.phase =
    getActivePhaseId(
      nextState.splits?.items || [],
      Number(nextState.splits?.currentIndex || 0),
      gameData?.phases || {}
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
      gameData.phases = clone(phases || {});

      updateState((raw) => {
        const state = buildInitialState(raw);
        return syncPhaseToCurrentSplits(state);
      });
    },

    setQuotas: (quotas) => {
      gameData.quotas = clone(quotas || {});
    },

    onAfterSave: () => {
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

  updateState((raw) => {
    const state = buildInitialState(raw);
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
