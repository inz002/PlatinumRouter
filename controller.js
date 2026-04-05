import { loadGameData } from "./js/data-loader.js";
import { loadState, saveState } from "./js/storage.js";
import { renderUI } from "./js/ui-render.js";
import { createDebugger } from "./js/debug.js";
import { createSplitEditor } from "./js/split-editor.js";
import { createActsEditor } from "./js/acts-editor.js";

const STORAGE_KEY = "platinumrouter_state_v1";
const GAME_ID = "ghost-of-tsushima";

const debug = createDebugger({ name: "controller" });

let gameData = null;
let timerInterval = null;
let splitEditorApi = null;
let actsEditorApi = null;

const DEFAULT_SETTINGS = {
  difficulty: "Lethal",
  act1TargetMinutes: 180,
  remoteCode: ""
};

const DEFAULT_MISC = {
  dirge: false
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function normalizeSplit(split = {}) {
  return {
    id: "",
    label: "",
    note: "",
    phaseId: "",
    phaseIdLabel: "",
    isPhaseStart: false,
    auto: {},
    ...split
  };
}

function normalizeSplits(splits) {
  return Array.isArray(splits) ? splits.map(normalizeSplit) : [];
}

function normalizeCounterState(counterDefs, savedCounters = {}) {
  const result = {};

  Object.entries(counterDefs || {}).forEach(([key, def]) => {
    const saved = savedCounters[key] || {};
    result[key] = {
      label: def.label,
      icon: def.icon,
      max: Number(def.max || 0),
      value: Number.isFinite(Number(saved.value)) ? Number(saved.value) : 0,
      manualDelta: Number.isFinite(Number(saved.manualDelta)) ? Number(saved.manualDelta) : 0
    };
  });

  return result;
}

function buildInitialState(raw = {}) {
  const splits = normalizeSplits(raw.splits?.length ? raw.splits : gameData.defaultSplits || []);
  const counters = normalizeCounterState(gameData.counters, raw.counters || {});

  const timerRunning = !!raw.running;
  const elapsedMs = Math.max(0, Number(raw.elapsedMs || 0));
  const startedAt = timerRunning
    ? Number(raw.startedAt || Date.now() - elapsedMs)
    : null;

  return {
    gameId: raw.gameId || GAME_ID,
    elapsedMs,
    running: timerRunning,
    startedAt,
    currentSplitIndex: clamp(Number(raw.currentSplitIndex || 0), 0, splits.length),
    counters,
    splits,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {})
    },
    miscChecks: {
      ...DEFAULT_MISC,
      ...(raw.miscChecks || {})
    }
  };
}

function getState() {
  return buildInitialState(loadState(STORAGE_KEY));
}

function setState(nextState) {
  saveState(STORAGE_KEY, nextState);
}

function getCurrentState() {
  return getState();
}

function persistAndRender(nextState) {
  setState(nextState);
  render();
}

function getActivePhaseId(state) {
  let active = "legacy_all";

  for (let i = 0; i <= state.currentSplitIndex && i < state.splits.length; i += 1) {
    const split = normalizeSplit(state.splits[i]);
    if (split.isPhaseStart && split.phaseId && gameData.phases?.[split.phaseId]) {
      active = split.phaseId;
    }
  }

  return active;
}

function getQuotaTargets(state) {
  const phaseId = getActivePhaseId(state);
  return gameData.quotas?.[phaseId]?.targets || {};
}

function computePaceText(state) {
  const actTargets = getQuotaTargets(state);
  const actTargetMinutes = Number(state.settings?.act1TargetMinutes || 0);

  if (!actTargetMinutes) {
    return "No target";
  }

  const targetMs = actTargetMinutes * 60 * 1000;
  const diff = state.elapsedMs - targetMs;

  if (Math.abs(diff) < 1000) return "On pace";
  if (diff < 0) return `${formatMs(Math.abs(diff))} ahead`;
  return `${formatMs(diff)} behind`;
}

function updateExtraUi(state) {
  const runTitle = document.getElementById("runTitle");
  if (runTitle) {
    runTitle.textContent = `Ghost of Tsushima Platinum ${state.settings?.difficulty || "Lethal"}`;
  }

  const pacePill = document.getElementById("pacePill");
  if (pacePill) {
    pacePill.textContent = computePaceText(state);
  }

  const settingsPanel = document.getElementById("settingsPanel");
  if (settingsPanel && !settingsPanel.dataset.bound) {
    settingsPanel.classList.remove("open");
  }

  const difficultySelect = document.getElementById("difficultySelect");
  if (difficultySelect) {
    difficultySelect.value = state.settings?.difficulty || "Lethal";
  }

  const act1TargetMinutes = document.getElementById("act1TargetMinutes");
  if (act1TargetMinutes) {
    act1TargetMinutes.value = Number(state.settings?.act1TargetMinutes || 180);
  }

  const remoteCode = document.getElementById("remoteCode");
  if (remoteCode) {
    remoteCode.value = state.settings?.remoteCode || "";
  }
}

function render() {
  const state = getCurrentState();

  renderUI({
    state,
    counters: gameData.counters,
    phases: gameData.phases,
    meta: gameData.meta,
    quotas: gameData.quotas
  });

  updateExtraUi(state);

  debug.setStatus("gameId", state.gameId);
  debug.setStatus("elapsedMs", state.elapsedMs);
  debug.setStatus("running", state.running);
  debug.setStatus("currentSplitIndex", state.currentSplitIndex);
  debug.setStatus("splitCount", state.splits.length);
  debug.setStatus("activePhase", getActivePhaseId(state));
}

function startTimer() {
  const state = getCurrentState();
  if (state.running) return;

  state.running = true;
  state.startedAt = Date.now() - state.elapsedMs;
  setState(state);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const live = getCurrentState();
    if (!live.running) return;

    live.elapsedMs = Date.now() - live.startedAt;
    setState(live);

    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.textContent = formatMs(live.elapsedMs);
    }
  }, 100);

  render();
}

function pauseTimer() {
  const state = getCurrentState();
  if (!state.running) return;

  state.elapsedMs = Date.now() - state.startedAt;
  state.running = false;
  state.startedAt = null;
  setState(state);

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  render();
}

function toggleTimer() {
  const state = getCurrentState();
  if (state.running) pauseTimer();
  else startTimer();
}

function applyAuto(state, auto, multiplier = 1) {
  Object.entries(auto || {}).forEach(([key, amount]) => {
    if (!state.counters[key]) return;

    const max = Number(gameData.counters?.[key]?.max || 0);
    const current = Number(state.counters[key].value || 0);
    const next = clamp(current + Number(amount || 0) * multiplier, 0, max);

    state.counters[key].value = next;
  });
}

function completeSplit() {
  const state = getCurrentState();
  const split = state.splits[state.currentSplitIndex];

  if (!split) return;

  applyAuto(state, split.auto, 1);
  state.currentSplitIndex = clamp(state.currentSplitIndex + 1, 0, state.splits.length);

  persistAndRender(state);
}

function undoSplit() {
  const state = getCurrentState();
  const prevIndex = state.currentSplitIndex - 1;

  if (prevIndex < 0) return;

  const split = state.splits[prevIndex];
  if (split) {
    applyAuto(state, split.auto, -1);
  }

  state.currentSplitIndex = prevIndex;
  persistAndRender(state);
}

function adjustCounter(counterKey, delta) {
  const state = getCurrentState();
  const counterDef = gameData.counters?.[counterKey];
  const counterState = state.counters?.[counterKey];

  if (!counterDef || !counterState) return;

  const max = Number(counterDef.max || 0);
  const current = Number(counterState.value || 0);
  const next = clamp(current + Number(delta || 0), 0, max);

  counterState.value = next;
  counterState.manualDelta = Number(counterState.manualDelta || 0) + Number(delta || 0);

  persistAndRender(state);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 250);
}

async function readFileAsJson(file) {
  const text = await file.text();
  return JSON.parse(text);
}

function exportTimes() {
  const state = getCurrentState();

  downloadJson("times.json", {
    elapsedMs: state.elapsedMs,
    currentSplitIndex: state.currentSplitIndex,
    counters: state.counters,
    miscChecks: state.miscChecks,
    settings: state.settings,
    exportedAt: new Date().toISOString()
  });
}

async function importTimes(file) {
  try {
    const parsed = await readFileAsJson(file);
    const state = getCurrentState();

    state.elapsedMs = Math.max(0, Number(parsed.elapsedMs || 0));
    state.currentSplitIndex = clamp(
      Number(parsed.currentSplitIndex || 0),
      0,
      state.splits.length
    );
    state.counters = normalizeCounterState(gameData.counters, parsed.counters || {});
    state.miscChecks = {
      ...state.miscChecks,
      ...(parsed.miscChecks || {})
    };
    state.settings = {
      ...state.settings,
      ...(parsed.settings || {})
    };

    if (state.running) {
      state.startedAt = Date.now() - state.elapsedMs;
    }

    persistAndRender(state);
  } catch (error) {
    debug.error("Failed to import times", { message: error.message });
    alert("Could not import times JSON");
  }
}

function exportSplits() {
  const state = getCurrentState();

  downloadJson("splits.json", {
    splits: state.splits,
    exportedAt: new Date().toISOString()
  });
}

async function importSplits(file) {
  try {
    const parsed = await readFileAsJson(file);
    const nextSplits = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.splits)
        ? parsed.splits
        : null;

    if (!nextSplits) {
      throw new Error("Missing splits array");
    }

    const state = getCurrentState();
    state.splits = normalizeSplits(nextSplits);
    state.currentSplitIndex = clamp(state.currentSplitIndex, 0, state.splits.length);

    persistAndRender(state);
  } catch (error) {
    debug.error("Failed to import splits", { message: error.message });
    alert("Could not import splits JSON");
  }
}

function resetRun() {
  if (!window.confirm("Reset timer, counters, and split progress?")) return;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const current = getCurrentState();
  const resetState = buildInitialState({
    gameId: GAME_ID,
    settings: current.settings
  });

  persistAndRender(resetState);
}

function bindStaticEvents() {
  document.getElementById("startPauseBtn")?.addEventListener("click", toggleTimer);
  document.getElementById("undoBtn")?.addEventListener("click", undoSplit);
  document.getElementById("advanceCurrentBtn")?.addEventListener("click", completeSplit);

  document.getElementById("settingsToggle")?.addEventListener("click", () => {
    document.getElementById("settingsPanel")?.classList.toggle("open");
  });

  document.getElementById("difficultySelect")?.addEventListener("change", (event) => {
    const state = getCurrentState();
    state.settings.difficulty = event.target.value;
    persistAndRender(state);
  });

  document.getElementById("act1TargetMinutes")?.addEventListener("change", (event) => {
    const state = getCurrentState();
    state.settings.act1TargetMinutes = Math.max(0, Number(event.target.value || 0));
    persistAndRender(state);
  });

  document.getElementById("remoteCode")?.addEventListener("input", (event) => {
    const state = getCurrentState();
    state.settings.remoteCode = event.target.value || "";
    setState(state);
  });

  document.getElementById("dirgeCheckbox")?.addEventListener("change", (event) => {
    const state = getCurrentState();
    state.miscChecks.dirge = !!event.target.checked;
    persistAndRender(state);
  });

  document.getElementById("exportTimesBtn")?.addEventListener("click", exportTimes);
  document.getElementById("exportSplitsBtn")?.addEventListener("click", exportSplits);
  document.getElementById("resetBtn")?.addEventListener("click", resetRun);

  document.getElementById("importTimesInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importTimes(file);
    event.target.value = "";
  });

  document.getElementById("importSplitsInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importSplits(file);
    event.target.value = "";
  });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-counter-key]");
    if (!btn) return;

    const key = btn.dataset.counterKey;
    const delta = Number(btn.dataset.delta || 0);

    if (!key || !delta) return;
    adjustCounter(key, delta);
  });
}

function setupSplitEditor() {
  splitEditorApi = createSplitEditor({
    overlayEl: document.getElementById("splitEditorOverlay"),
    gridEl: document.getElementById("splitEditorGrid"),
    addBtn: document.getElementById("addSplitEditorBtn"),
    resetBtn: document.getElementById("resetSplitEditorBtn"),
    closeBtn: document.getElementById("closeSplitEditorBtn"),
    saveBtn: document.getElementById("saveSplitEditorBtn"),
    downloadBtn: document.getElementById("downloadSplitBackupBtn"),
    copyBtn: document.getElementById("copySplitBackupBtn"),
    getSplits: () => clone(getCurrentState().splits || []),
    setSplits: (splits) => {
      const state = getCurrentState();
      state.splits = normalizeSplits(splits);
      state.currentSplitIndex = clamp(state.currentSplitIndex, 0, state.splits.length);
      setState(state);
    },
    getPhases: () => clone(gameData.phases || {}),
    getCounterDefs: () => gameData.counters || {},
    onAfterSave: () => {
      render();
      debug.log("Split editor saved");
    }
  });

  document.getElementById("openSplitEditorBtn")?.addEventListener("click", () => {
    splitEditorApi.open();
  });
}

function setupActsEditor() {
  actsEditorApi = createActsEditor({
    overlayEl: document.getElementById("actsEditorOverlay"),
    phaseListEl: document.getElementById("actsEditorPhaseList"),
    formEl: document.getElementById("actsEditorForm"),
    addBtn: document.getElementById("addActsEditorBtn"),
    closeBtn: document.getElementById("closeActsEditorBtn"),
    saveBtn: document.getElementById("saveActsEditorBtn"),
    resetBtn: document.getElementById("resetActsEditorBtn"),
    exportBtn: document.getElementById("exportActsEditorBtn"),
    importInput: document.getElementById("importActsEditorInput"),
    copyBtn: document.getElementById("copyActsEditorBtn"),
    getPhases: () => clone(gameData.phases || {}),
    getQuotas: () => clone(gameData.quotas || {}),
    getCounterDefs: () => gameData.counters || {},
    setPhases: (phases) => {
      gameData.phases = clone(phases);
    },
    setQuotas: (quotas) => {
      gameData.quotas = clone(quotas);
    },
    onAfterSave: () => {
      render();
      debug.log("Acts editor saved");
    }
  });

  document.getElementById("openActsEditorBtn")?.addEventListener("click", () => {
    actsEditorApi.open();
  });
}

async function boot() {
  gameData = await loadGameData(GAME_ID);

  const initialState = buildInitialState(getState());
  setState(initialState);

  bindStaticEvents();
  setupSplitEditor();
  setupActsEditor();

  debug.setSnapshotBuilder(() => ({
    gameData,
    state: getCurrentState()
  }));

  render();

  if (initialState.running) {
    startTimer();
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      render();
    }
  });

  debug.log("Controller booted", {
    counters: Object.keys(gameData.counters || {}).length,
    phases: Object.keys(gameData.phases || {}).length,
    splits: (initialState.splits || []).length
  });
}

boot().catch((error) => {
  debug.error("Controller boot failed", {
    message: error.message,
    stack: error.stack
  });
  console.error(error);
});
