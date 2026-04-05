// controller.js (FIXED + LIGHTHOUSES + PROGRESS + OLD UI RESTORED)

import { loadState, saveState } from "./js/storage.js";
import { createDebugger } from "./js/debug.js";
import { createSplitEditor } from "./js/split-editor.js";
import { createActsEditor } from "./js/acts-editor.js";

const STORAGE_KEY = "platinumrouter_state_v1";
const debug = createDebugger({ name: "controller" });

let gameData = null;
let timerInterval = null;

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
// DATA LOADING
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

  return { game, meta, counters, phases, quotas: {} };
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
  const index = state.currentSplitIndex || 0;
  const split = state.splits?.[index];

  if (!split) return;

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
// PROGRESS GRID (🔥 MAIN FIX)
// --------------------

function renderProgressGrid(counterDefs, counters) {
  const grid = document.getElementById("progressGrid");
  if (!grid) return;

  grid.innerHTML = "";

  Object.entries(counterDefs).forEach(([key, def]) => {
    const counter = counters[key];
    if (!counter) return;

    const value = Number(counter.value || 0);
    const max = def.max || 1;
    const pct = Math.floor((value / max) * 100);

    const el = document.createElement("div");
    el.className = "progressCard";

    el.innerHTML = `
      <button class="progressCardBtn" data-key="${key}" data-delta="-1">−</button>

      <div class="progressCardCenter">
        <div class="progressCardTitle">${def.label}</div>
        <div class="progressCardIcon">${def.icon}</div>
        <div class="progressCardValue">${value}/${max}</div>
        <div class="progressCardPct">${pct}%</div>
      </div>

      <button class="progressCardBtn" data-key="${key}" data-delta="1">+</button>
    `;

    grid.appendChild(el);
  });
}

// --------------------
// % CALCULATION
// --------------------

function calculateOverallProgress(counterDefs, counters) {
  let total = 0;
  let done = 0;

  Object.entries(counterDefs).forEach(([key, def]) => {
    total += def.max || 0;
    done += counters[key]?.value || 0;
  });

  return total ? Math.floor((done / total) * 100) : 0;
}

// --------------------
// RENDER
// --------------------

function render() {
  const state = getState();
  const counters = state.counters || {};

  // TIMER
  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.textContent = formatMs(state.elapsedMs || 0);

  // SPLIT
  const splitLabel = document.getElementById("currentSplitLabel");
  if (splitLabel) {
    const current = state.splits?.[state.currentSplitIndex] || null;
    splitLabel.textContent = current?.label || "No split";
  }

  // HISTORY
  const history = document.getElementById("historyCount");
  if (history) {
    history.textContent = `${state.currentSplitIndex || 0} splits logged`;
  }

  // MODE
  const mode = document.getElementById("modePill");
  if (mode) {
    mode.textContent = state.settings?.difficulty || "Lethal";
  }

  // 🔥 PROGRESS GRID
  renderProgressGrid(gameData.counters, counters);

  // 🔥 OVERALL %
  const pct = calculateOverallProgress(gameData.counters, counters);

  const overallEl = document.getElementById("overallPercent");
  const barEl = document.getElementById("overallBar");

  if (overallEl) overallEl.textContent = `${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;

  debug.setStatus("progress", pct);
}

// --------------------
// CLICK HANDLER (+ / -)
// --------------------

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".progressCardBtn");
  if (!btn) return;

  const key = btn.dataset.key;
  const delta = Number(btn.dataset.delta);

  const state = getState();

  if (!state.counters[key]) {
    state.counters[key] = { value: 0 };
  }

  state.counters[key].value = Math.max(
    0,
    state.counters[key].value + delta
  );

  setState(state);
  render();
});

// --------------------
// INIT
// --------------------

async function init() {
  debug.log("Controller init");

  gameData = await loadGameData();

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
