// splits-page.js

import { loadGameData } from "./js/data-loader.js";
import { getState, updateState, subscribe } from "./js/storage.js";
import { createSplitEditor } from "./js/split-editor.js";
import { createDebugger } from "./js/debug.js";
import { clamp, normalizeSplits } from "./js/split-logic.js";

const GAME_ID = "ghost-of-tsushima";

const debug = createDebugger({ name: "splits-page" });

let gameData = null;
let splitEditorApi = null;

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

  const splits = normalizeSplits(raw.splits, gameData?.defaultSplits || []);
  const splitCount = splits.length;

  return {
    timer: {
      startTime: raw.timer?.startTime ?? null,
      elapsed: Math.max(0, Number(raw.timer?.elapsed || 0)),
      running: !!raw.timer?.running
    },

    counters: normalized.counters,
    totals: normalized.totals,

    splits: {
      currentIndex: clamp(Number(raw.splits?.currentIndex || 0), 0, splitCount),
      completed: Array.isArray(raw.splits?.completed) ? raw.splits.completed : [],
      items: splits
    },

    phase: raw.phase || "legacy_all",

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
    title.textContent = "Ghost of Tsushima Split Editor";
  }
}

function renderSummary(state) {
  const subtitle = document.querySelector(".subtitle");
  if (!subtitle) return;

  const splitCount = state.splits?.items?.length || 0;
  subtitle.textContent = `${splitCount} splits loaded. Edit names, phases, notes, and auto-progress here.`;
}

function bindStandaloneButtons() {
  const addBtn = document.getElementById("addSplitEditorBtn");
  const resetBtn = document.getElementById("resetSplitEditorBtn");
  const saveBtn = document.getElementById("saveSplitEditorBtn");
  const downloadBtn = document.getElementById("downloadSplitBackupBtn");
  const copyBtn = document.getElementById("copySplitBackupBtn");

  addBtn?.addEventListener("click", () => splitEditorApi?.addEmptyRow?.());
  resetBtn?.addEventListener("click", () => splitEditorApi?.reset?.());
  saveBtn?.addEventListener("click", () => splitEditorApi?.save?.());
  downloadBtn?.addEventListener("click", () => splitEditorApi?.downloadBackup?.());
  copyBtn?.addEventListener("click", () => splitEditorApi?.copyBackup?.());
}

function setupSplitEditor() {
  splitEditorApi = createSplitEditor({
    overlayEl: null,
    gridEl: document.getElementById("splitEditorGrid"),
    addBtn: document.getElementById("addSplitEditorBtn"),
    resetBtn: document.getElementById("resetSplitEditorBtn"),
    closeBtn: null,
    saveBtn: document.getElementById("saveSplitEditorBtn"),
    downloadBtn: document.getElementById("downloadSplitBackupBtn"),
    copyBtn: document.getElementById("copySplitBackupBtn"),

    getSplits: () => clone(getCurrentState().splits?.items || []),

    setSplits: (splits) => {
      updateState((raw) => {
        const state = buildInitialState(raw);

        state.splits.items = normalizeSplits(splits, gameData?.defaultSplits || []);
        state.splits.currentIndex = clamp(
          Number(state.splits.currentIndex || 0),
          0,
          state.splits.items.length
        );

        state.splits.completed = (state.splits.completed || []).filter(
          (entry) => Number(entry.splitIndex) < state.splits.items.length
        );

        return state;
      });
    },

    getPhases: () => clone(gameData?.phases || {}),
    getCounterDefs: () => gameData?.counters || {},

    onAfterSave: () => {
      const state = getCurrentState();
      renderSummary(state);

      debug.log("Split setup saved", {
        splitCount: state.splits?.items?.length || 0
      });
    }
  });

  if (typeof splitEditorApi?.open === "function") {
    splitEditorApi.open();
  }
}

function setupSubscriptions() {
  subscribe((raw) => {
    const state = buildInitialState(raw);
    renderSummary(state);

    debug.setStatus("gameId", state.gameId);
    debug.setStatus("splitCount", state.splits?.items?.length || 0);
    debug.setStatus("currentSplitIndex", state.splits?.currentIndex || 0);
    debug.setStatus("phaseCount", Object.keys(gameData?.phases || {}).length);
  });
}

async function boot() {
  gameData = await loadGameData(GAME_ID);

  updateState((raw) => buildInitialState(raw));

  renderHeader();
  setupSplitEditor();
  bindStandaloneButtons();
  setupSubscriptions();

  debug.setSnapshotBuilder(() => ({
    gameData,
    state: getCurrentState()
  }));

  const state = getCurrentState();
  renderSummary(state);

  debug.log("Split editor page booted", {
    splitCount: state.splits?.items?.length || 0,
    defaultSplitCount: gameData?.defaultSplits?.length || 0,
    counters: Object.keys(gameData?.counters || {}).length
  });
}

boot().catch((error) => {
  debug.error("Split editor page failed", {
    message: error.message,
    stack: error.stack
  });

  console.error(error);
});
