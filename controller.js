// controller.js

import { loadGameData } from "./js/data-loader.js";
import { loadState, saveState } from "./js/storage.js";
import { renderUI } from "./js/ui-render.js";
import { createDebugger } from "./js/debug.js";

const STORAGE_KEY = "platinumrouter_state_v1";

const debug = createDebugger({ name: "controller" });

let cachedGameData = null;

// ----------------------
// INIT
// ----------------------

async function init() {
  debug.log("Controller init");

  await render();

  bindControls();

  // refresh loop (kept from your original)
  setInterval(() => {
    render().catch(handleError);
  }, 500);

  // sync across tabs
  window.addEventListener("storage", () => {
    render().catch(handleError);
  });
}

// ----------------------
// RENDER
// ----------------------

async function render() {
  const state = loadState(STORAGE_KEY);
  const gameId = state.gameId || "ghost-of-tsushima";

  // load game data once
  if (!cachedGameData || cachedGameData.game.id !== gameId) {
    cachedGameData = await loadGameData(gameId);
  }

  const { counters, phases, meta } = cachedGameData;

  // normalize state
  const safeState = {
    elapsedMs: state.elapsedMs || 0,
    counters: state.counters || {},
    splits: Array.isArray(state.splits) ? state.splits : [],
    currentSplitIndex: Number.isFinite(state.currentSplitIndex)
      ? state.currentSplitIndex
      : 0,
    settings: state.settings || {},
    miscChecks: state.miscChecks || {}
  };

  debug.setStatus("gameId", gameId);
  debug.setStatus("elapsedMs", safeState.elapsedMs);
  debug.setStatus("splitIndex", safeState.currentSplitIndex);

  // render via UI layer
  renderUI({
    state: safeState,
    counters,
    phases,
    meta
  });
}

// ----------------------
// CONTROLS
// ----------------------

function bindControls() {
  const startBtn = document.getElementById("startPauseBtn");
  const undoBtn = document.getElementById("undoBtn");
  const advanceBtn = document.getElementById("advanceCurrentBtn");

  startBtn?.addEventListener("click", toggleTimer);
  undoBtn?.addEventListener("click", undoSplit);
  advanceBtn?.addEventListener("click", advanceSplit);
}

// ----------------------
// TIMER
// ----------------------

let timerInterval = null;

function toggleTimer() {
  const state = loadState(STORAGE_KEY);

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    debug.log("Timer paused");
    return;
  }

  timerInterval = setInterval(() => {
    const current = loadState(STORAGE_KEY);
    current.elapsedMs = (current.elapsedMs || 0) + 1000;
    saveState(STORAGE_KEY, current);
  }, 1000);

  debug.log("Timer started");
}

// ----------------------
// SPLIT LOGIC
// ----------------------

function advanceSplit() {
  const state = loadState(STORAGE_KEY);

  if (!Array.isArray(state.splits)) return;

  const index = state.currentSplitIndex || 0;
  const split = state.splits[index];

  if (!split) return;

  // apply auto progress (THIS is why lighthouses just work)
  if (split.auto) {
    state.counters = state.counters || {};

    Object.entries(split.auto).forEach(([key, value]) => {
      const current = state.counters[key]?.value || 0;

      state.counters[key] = {
        ...(state.counters[key] || {}),
        value: current + value
      };
    });
  }

  state.currentSplitIndex = index + 1;

  saveState(STORAGE_KEY, state);

  debug.log("Split advanced", { index });
}

function undoSplit() {
  const state = loadState(STORAGE_KEY);

  if (!Array.isArray(state.splits)) return;

  let index = state.currentSplitIndex || 0;
  if (index <= 0) return;

  index -= 1;
  const split = state.splits[index];

  if (split?.auto) {
    Object.entries(split.auto).forEach(([key, value]) => {
      const current = state.counters?.[key]?.value || 0;

      state.counters[key] = {
        ...(state.counters[key] || {}),
        value: Math.max(0, current - value)
      };
    });
  }

  state.currentSplitIndex = index;

  saveState(STORAGE_KEY, state);

  debug.log("Split undone", { index });
}

// ----------------------
// ERROR HANDLER
// ----------------------

function handleError(error) {
  debug.error("Controller error", {
    message: error.message,
    stack: error.stack
  });

  console.error(error);
}

// ----------------------
// START
// ----------------------

init();
