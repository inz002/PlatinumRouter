// controller.js

import { loadState, saveState } from "./js/storage.js";
import { createDebugger } from "./js/debug.js";
import { createSplitEditor } from "./js/splitEditor.js";
import { createActsEditor } from "./js/actsEditor.js";

const STORAGE_KEY = "platinumrouter_state_v1";

const debug = createDebugger({ name: "controller" });

let gameData = null;

// --------------------
// UTIL
// --------------------

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// --------------------
// GAME DATA LOADING
// --------------------

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function normalizePath(path) {
  if (!path) return "./data/ghost-of-tsushima";
  if (path.startsWith("./")) return path;
  if (path.startsWith("/")) return `.${path}`;
  return `./${path}`;
}

async function loadGameData(gameId = "ghost-of-tsushima") {
  const registry = await fetchJson("./data/games.json");
  const game =
    registry.games.find((g) => g.id === gameId) || registry.games[0];

  const basePath = normalizePath(game.path);

  const [meta, counters, phases] = await Promise.all([
    fetchJson(`${basePath}/meta.json`),
    fetchJson(`${basePath}/counters.json`),
    fetchJson(`${basePath}/phases.json`)
  ]);

  return {
    game,
    meta,
    counters,
    phases,
    quotas: {}
  };
}

// --------------------
// STATE
// --------------------

function getState() {
  return loadState(STORAGE_KEY);
}

function setState(next) {
  saveState(STORAGE_KEY, next);
}

// --------------------
// TIMER
// --------------------

let timerInterval = null;

function startTimer() {
  if (timerInterval) return;

  const state = getState();
  state.running = true;
  state.startedAt = Date.now() - (state.elapsedMs || 0);
  setState(state);

  timerInterval = setInterval(() => {
    const s = getState();
    s.elapsedMs = Date.now() - s.startedAt;
    setState(s);
    render();
  }, 100);
}

function pauseTimer() {
  const state = getState();
  state.running = false;
  setState(state);

  clearInterval(timerInterval);
  timerInterval = null;
}

// --------------------
// SPLITS
// --------------------

function completeSplit() {
  const state = getState();

  if (!state.splits || !state.splits.length) return;

  const index = state.currentSplitIndex || 0;
  const split = state.splits[index];

  if (!split) return;

  // apply auto counters
  if (split.auto) {
    Object.entries(split.auto).forEach(([key, val]) => {
      if (!state.counters[key]) return;
      state.counters[key].value += val;
    });
  }

  state.currentSplitIndex = index + 1;

  setState(state);
  render();
}

function undoSplit() {
  const state = getState();
  const index = state.currentSplitIndex - 1;

  if (index < 0) return;

  const split = state.splits[index];

  if (split?.auto) {
    Object.entries(split.auto).forEach(([key, val]) => {
      if (!state.counters[key]) return;
      state.counters[key].value -= val;
    });
  }

  state.currentSplitIndex = index;

  setState(state);
  render();
}

// --------------------
// RENDER
// --------------------

function render() {
  const state = getState();

  // timer
  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.textContent = formatMs(state.elapsedMs || 0);

  // split label
  const splitLabel = document.getElementById("currentSplitLabel");
  if (splitLabel) {
    const current = state.splits?.[state.currentSplitIndex] || null;
    splitLabel.textContent = current?.label || "No split";
  }

  // history
  const history = document.getElementById("historyCount");
  if (history) {
    history.textContent = `${state.currentSplitIndex || 0} splits logged`;
  }

  // difficulty
  const mode = document.getElementById("modePill");
  if (mode) {
    mode.textContent = state.settings?.difficulty || "Lethal";
  }

  debug.setStatus("splits", state.splits?.length || 0);
  debug.setStatus("currentIndex", state.currentSplitIndex || 0);
}

// --------------------
// EDITORS
// --------------------

function setupSplitEditor() {
  const editor = createSplitEditor({
    overlayEl: document.getElementById("splitEditorOverlay"),
    gridEl: document.getElementById("splitEditorGrid"),
    addBtn: document.getElementById("addSplitEditorBtn"),
    closeBtn: document.getElementById("closeSplitEditorBtn"),
    saveBtn: document.getElementById("saveSplitEditorBtn"),
    getSplits: () => clone(getState().splits || []),
    setSplits: (splits) => {
      const state = getState();
      state.splits = splits;
      setState(state);
      render();
    }
  });

  document
    .getElementById("openSplitEditorBtn")
    ?.addEventListener("click", editor.open);
}

function setupActsEditor() {
  const editor = createActsEditor({
    overlayEl: document.getElementById("actsEditorOverlay"),
    phaseListEl: document.getElementById("actsEditorPhaseList"),
    formEl: document.getElementById("actsEditorForm"),
    addBtn: document.getElementById("addActsEditorBtn"),
    closeBtn: document.getElementById("closeActsEditorBtn"),
    saveBtn: document.getElementById("saveActsEditorBtn"),
    getPhases: () => clone(gameData.phases),
    getQuotas: () => clone(gameData.quotas),
    getCounterDefs: () => gameData.counters,
    setPhases: (phases) => {
      gameData.phases = clone(phases);
    },
    setQuotas: (q) => {
      gameData.quotas = clone(q);
    },
    onAfterSave: () => {
      render();
    }
  });

  document
    .getElementById("openActsEditorBtn")
    ?.addEventListener("click", editor.open);
}

// --------------------
// INIT
// --------------------

async function init() {
  debug.log("Controller init");

  gameData = await loadGameData();

  setupSplitEditor();
  setupActsEditor();

  document
    .getElementById("startPauseBtn")
    ?.addEventListener("click", startTimer);

  document
    .getElementById("undoBtn")
    ?.addEventListener("click", undoSplit);

  document
    .getElementById("advanceCurrentBtn")
    ?.addEventListener("click", completeSplit);

  render();
}

init();
