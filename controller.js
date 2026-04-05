// controller.js

import { loadGameData } from "./js/data-loader.js";
import { getState, subscribe, updateState, resetState } from "./js/storage.js";
import { renderUI } from "./js/ui-render.js";
import { createDebugger } from "./js/debug.js";
import { createSplitEditor } from "./js/split-editor.js";
import { createActsEditor } from "./js/acts-editor.js";
import {
  clamp,
  normalizeSplit,
  normalizeSplits,
  getActivePhaseId
} from "./js/split-logic.js";

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
  dirgeDone: false
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
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

  const running = !!raw.timer?.running;
  const elapsed = Math.max(0, Number(raw.timer?.elapsed || 0));
  const startTime = running
    ? Number(raw.timer?.startTime || Date.now() - elapsed)
    : null;

  return {
    timer: {
      startTime,
      elapsed,
      running
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
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {})
    },

    misc: {
      ...DEFAULT_MISC,
      ...(raw.misc || {})
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

function setWholeState(nextState) {
  updateState(() => buildInitialState(nextState));
}

function computePaceText(state) {
  const actTargetMinutes = Number(state.settings?.act1TargetMinutes || 0);
  if (!actTargetMinutes) return "No target";

  const targetMs = actTargetMinutes * 60 * 1000;
  const diff = Number(state.timer?.elapsed || 0) - targetMs;

  if (Math.abs(diff) < 1000) return "On pace";
  if (diff < 0) return `${formatMs(Math.abs(diff))} ahead`;
  return `${formatMs(diff)} behind`;
}

function getActivePhase(state) {
  const items = state.splits?.items || [];
  const currentIndex = Number(state.splits?.currentIndex || 0);
  return getActivePhaseId(items, currentIndex, gameData?.phases || {});
}

function syncPhaseToState() {
  updateState((raw) => {
    const state = buildInitialState(raw);
    state.phase = getActivePhase(state);
    return state;
  });
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

  const difficultySelect = document.getElementById("difficultySelect");
  if (difficultySelect && difficultySelect.value !== (state.settings?.difficulty || "Lethal")) {
    difficultySelect.value = state.settings?.difficulty || "Lethal";
  }

  const act1TargetMinutes = document.getElementById("act1TargetMinutes");
  if (act1TargetMinutes) {
    act1TargetMinutes.value = Number(state.settings?.act1TargetMinutes || 180);
  }

  const remoteCode = document.getElementById("remoteCode");
  if (remoteCode && remoteCode.value !== (state.settings?.remoteCode || "")) {
    remoteCode.value = state.settings?.remoteCode || "";
  }

  const startPauseBtn = document.getElementById("startPauseBtn");
  if (startPauseBtn) {
    startPauseBtn.textContent = state.timer?.running ? "⏸ Pause" : "▶ Start";
  }

  const settingsPanel = document.getElementById("settingsPanel");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsOpen = !!state.ui?.settingsOpen;

  if (settingsPanel) {
    settingsPanel.classList.toggle("open", settingsOpen);
  }

  if (settingsToggle) {
    settingsToggle.textContent = settingsOpen ? "⚙ Hide Settings" : "⚙ Show Settings";
  }

  const dirgeCheckbox = document.getElementById("dirgeCheckbox");
  if (dirgeCheckbox) {
    dirgeCheckbox.checked = !!state.misc?.dirgeDone;
  }
}

function render() {
  if (!gameData) return;

  const state = getCurrentState();
  const uiState = {
    elapsedMs: Number(state.timer?.elapsed || 0),
    counters: buildUiCounters(state),
    splits: state.splits?.items || [],
    currentSplitIndex: Number(state.splits?.currentIndex || 0),
    settings: state.settings,
    miscChecks: {
      dirge: !!state.misc?.dirgeDone
    }
  };

  renderUI({
    state: uiState,
    counters: buildCounterDefsForUi(),
    phases: gameData.phases || {},
    meta: gameData.meta || {},
    quotas: gameData.quotas || {}
  });

  updateExtraUi(state);

  debug.setStatus("gameId", state.gameId);
  debug.setStatus("elapsedMs", state.timer?.elapsed || 0);
  debug.setStatus("running", !!state.timer?.running);
  debug.setStatus("currentSplitIndex", state.splits?.currentIndex || 0);
  debug.setStatus("splitCount", (state.splits?.items || []).length);
  debug.setStatus("activePhase", getActivePhase(state));
  debug.setStatus("settingsOpen", !!state.ui?.settingsOpen);
}

function buildCounterDefsForUi() {
  const result = {};

  Object.entries(gameData?.counters || {}).forEach(([key, def]) => {
    result[key] = {
      ...def,
      max: Number(gameData?.counters?.[key]?.max || 0)
    };
  });

  return result;
}

function buildUiCounters(state) {
  const result = {};

  Object.entries(gameData?.counters || {}).forEach(([key, def]) => {
    result[key] = {
      label: def.label,
      icon: def.icon,
      max: Number(state.totals?.[key] || def.max || 0),
      value: Number(state.counters?.[key]?.value || 0),
      manualDelta: Number(state.counters?.[key]?.manualDelta || 0)
    };
  });

  return result;
}

function ensureTimerLoop() {
  const state = getCurrentState();

  if (!state.timer?.running) {
    stopTimerLoop();
    return;
  }

  if (timerInterval) return;

  timerInterval = window.setInterval(() => {
    updateState((raw) => {
      const next = buildInitialState(raw);
      if (!next.timer.running) return next;

      next.timer.elapsed = Math.max(0, Date.now() - next.timer.startTime);
      return next;
    });
  }, 250);
}

function stopTimerLoop() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer() {
  updateState((raw) => {
    const state = buildInitialState(raw);
    if (state.timer.running) return state;

    state.timer.running = true;
    state.timer.startTime = Date.now() - state.timer.elapsed;
    return state;
  });

  ensureTimerLoop();
}

function pauseTimer() {
  updateState((raw) => {
    const state = buildInitialState(raw);
    if (!state.timer.running) return state;

    state.timer.elapsed = Math.max(0, Date.now() - state.timer.startTime);
    state.timer.running = false;
    state.timer.startTime = null;
    return state;
  });

  stopTimerLoop();
}

function toggleTimer() {
  const state = getCurrentState();
  if (state.timer?.running) pauseTimer();
  else startTimer();
}

function applyAutoToCounters(state, autoMap = {}, direction = 1) {
  Object.entries(autoMap || {}).forEach(([key, amount]) => {
    if (!state.counters[key]) return;

    const max = Number(state.totals?.[key] || gameData?.counters?.[key]?.max || 0);
    const current = Number(state.counters[key]?.value || 0);
    const next = clamp(current + Number(amount || 0) * direction, 0, max);

    state.counters[key].value = next;
  });
}

function buildHistoryEntry(state, splitIndex, split) {
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

function completeSplit() {
  updateState((raw) => {
    const state = buildInitialState(raw);
    const splitIndex = Number(state.splits?.currentIndex || 0);
    const split = state.splits?.items?.[splitIndex];

    if (!split) return state;

    applyAutoToCounters(state, split.auto || {}, 1);

    const entry = buildHistoryEntry(state, splitIndex, split);
    state.splits.completed = [...(state.splits.completed || []), entry];
    state.splits.currentIndex = clamp(splitIndex + 1, 0, state.splits.items.length);
    state.phase = getActivePhase(state);

    return state;
  });
}

function undoSplit() {
  updateState((raw) => {
    const state = buildInitialState(raw);
    const nextIndex = Number(state.splits?.currentIndex || 0) - 1;

    if (nextIndex < 0) return state;

    const split = state.splits?.items?.[nextIndex];
    if (split) {
      applyAutoToCounters(state, split.auto || {}, -1);
    }

    state.splits.currentIndex = nextIndex;
    state.splits.completed = (state.splits.completed || []).slice(0, -1);
    state.phase = getActivePhase(state);

    return state;
  });
}

function adjustCounter(counterKey, delta) {
  updateState((raw) => {
    const state = buildInitialState(raw);
    const counter = state.counters?.[counterKey];
    const max = Number(state.totals?.[counterKey] || gameData?.counters?.[counterKey]?.max || 0);

    if (!counter) return state;

    const current = Number(counter.value || 0);
    const next = clamp(current + Number(delta || 0), 0, max);

    counter.value = next;
    counter.manualDelta = Number(counter.manualDelta || 0) + Number(delta || 0);

    return state;
  });
}

function toggleSettings() {
  updateState((raw) => {
    const state = buildInitialState(raw);
    state.ui.settingsOpen = !state.ui.settingsOpen;
    return state;
  });
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 250);
}

async function readFileAsJson(file) {
  return JSON.parse(await file.text());
}

function exportTimes() {
  const state = getCurrentState();

  downloadJson("times.json", {
    timer: state.timer,
    counters: state.counters,
    totals: state.totals,
    splits: state.splits,
    settings: state.settings,
    misc: state.misc,
    ui: state.ui,
    exportedAt: new Date().toISOString()
  });
}

async function importTimes(file) {
  try {
    const parsed = await readFileAsJson(file);

    updateState((raw) => {
      const current = buildInitialState(raw);
      const next = buildInitialState({
        ...current,
        ...parsed,
        settings: {
          ...current.settings,
          ...(parsed.settings || {})
        },
        misc: {
          ...current.misc,
          ...(parsed.misc || {})
        },
        ui: {
          ...current.ui,
          ...(parsed.ui || {})
        }
      });

      if (next.timer.running) {
        next.timer.startTime = Date.now() - next.timer.elapsed;
      }

      next.phase = getActivePhase(next);
      return next;
    });
  } catch (error) {
    debug.error("Failed to import times", { message: error.message });
    alert("Could not import times JSON");
  }
}

function exportSplits() {
  const state = getCurrentState();

  downloadJson("splits.json", {
    splits: state.splits?.items || [],
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

    updateState((raw) => {
      const state = buildInitialState(raw);
      state.splits.items = normalizeSplits(nextSplits, gameData?.defaultSplits || []);
      state.splits.currentIndex = clamp(
        Number(state.splits.currentIndex || 0),
        0,
        state.splits.items.length
      );

      state.splits.completed = (state.splits.completed || []).filter(
        (entry) => Number(entry.splitIndex) < state.splits.items.length
      );

      state.phase = getActivePhase(state);
      return state;
    });
  } catch (error) {
    debug.error("Failed to import splits", { message: error.message });
    alert("Could not import splits JSON");
  }
}

function resetRun() {
  if (!window.confirm("Reset timer, counters, and split progress?")) return;

  const current = getCurrentState();
  stopTimerLoop();

  resetState();

  updateState((raw) => {
    const state = buildInitialState(raw);
    state.settings = clone(current.settings || DEFAULT_SETTINGS);
    state.ui.settingsOpen = !!current.ui?.settingsOpen;
    state.splits.items = normalizeSplits(undefined, gameData?.defaultSplits || []);
    state.phase = getActivePhase(state);
    return state;
  });
}

function bindStaticEvents() {
  document.getElementById("startPauseBtn")?.addEventListener("click", toggleTimer);
  document.getElementById("undoBtn")?.addEventListener("click", undoSplit);
  document.getElementById("advanceCurrentBtn")?.addEventListener("click", completeSplit);
  document.getElementById("settingsToggle")?.addEventListener("click", toggleSettings);

  document.getElementById("difficultySelect")?.addEventListener("change", (event) => {
    updateState((raw) => {
      const state = buildInitialState(raw);
      state.settings.difficulty = event.target.value || "Lethal";
      return state;
    });
  });

  document.getElementById("act1TargetMinutes")?.addEventListener("change", (event) => {
    updateState((raw) => {
      const state = buildInitialState(raw);
      state.settings.act1TargetMinutes = Math.max(0, Number(event.target.value || 0));
      return state;
    });
  });

  document.getElementById("remoteCode")?.addEventListener("input", (event) => {
    updateState((raw) => {
      const state = buildInitialState(raw);
      state.settings.remoteCode = event.target.value || "";
      return state;
    });
  });

  document.getElementById("dirgeCheckbox")?.addEventListener("change", (event) => {
    updateState((raw) => {
      const state = buildInitialState(raw);
      state.misc.dirgeDone = !!event.target.checked;
      return state;
    });
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
        state.phase = getActivePhase(state);
        return state;
      });
    },
    getPhases: () => clone(gameData?.phases || {}),
    getCounterDefs: () => gameData?.counters || {},
    onAfterSave: () => {
      debug.log("Split editor saved");
    }
  });

  document.getElementById("openSplitEditorBtn")?.addEventListener("click", () => {
    splitEditorApi?.open();
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
    getPhases: () => clone(gameData?.phases || {}),
    getQuotas: () => clone(gameData?.quotas || {}),
    getCounterDefs: () => gameData?.counters || {},
    setPhases: (phases) => {
      gameData.phases = clone(phases || {});
      syncPhaseToState();
    },
    setQuotas: (quotas) => {
      gameData.quotas = clone(quotas || {});
    },
    onAfterSave: () => {
      debug.log("Acts editor saved");
      render();
    }
  });

  document.getElementById("openActsEditorBtn")?.addEventListener("click", () => {
    actsEditorApi?.open();
  });
}

function setupSubscriptions() {
  subscribe((raw) => {
    const state = buildInitialState(raw);

    if (state.timer?.running) ensureTimerLoop();
    else stopTimerLoop();

    render();
  });
}

async function boot() {
  gameData = await loadGameData(GAME_ID);

  const initial = buildInitialState(getState());

  setWholeState(initial);
  syncPhaseToState();

  bindStaticEvents();
  setupSplitEditor();
  setupActsEditor();
  setupSubscriptions();

  debug.setSnapshotBuilder(() => ({
    gameData,
    state: getCurrentState()
  }));

  const state = getCurrentState();
  if (state.timer?.running) {
    ensureTimerLoop();
  }

  render();

  debug.log("Controller booted", {
    counters: Object.keys(gameData?.counters || {}).length,
    phases: Object.keys(gameData?.phases || {}).length,
    splits: (state.splits?.items || []).length
  });
}

boot().catch((error) => {
  debug.error("Controller boot failed", {
    message: error.message,
    stack: error.stack
  });

  console.error(error);
});
