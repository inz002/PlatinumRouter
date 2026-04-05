import { loadGameData } from "./js/data-loader.js";
import { loadState, saveState, clearState } from "./js/storage.js";
import { renderUI } from "./js/ui-render.js";
import { createDebugger } from "./js/debug.js";
import { createActsEditor } from "./js/acts-editor.js";

const STORAGE_KEY = "platinumrouter_state_v1";

const debug = createDebugger({ name: "controller" });

let gameData = null;
let timerInterval = null;

const DEFAULT_SETTINGS = {
  difficulty: "Lethal",
  act1TargetMinutes: 180,
  remoteCode: ""
};

const DEFAULT_STATE = {
  gameId: "ghost-of-tsushima",
  elapsedMs: 0,
  timerRunning: false,
  timerStartedAt: null,
  currentSplitIndex: 0,
  counters: {},
  splits: [],
  settings: { ...DEFAULT_SETTINGS },
  miscChecks: {
    dirge: false
  },
  logs: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSplit(split) {
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

function normalizeCounterState(counterDefs, savedCounters = {}) {
  const result = {};

  Object.entries(counterDefs || {}).forEach(([key, def]) => {
    const saved = savedCounters[key] || {};
    result[key] = {
      value: Number.isFinite(Number(saved.value)) ? Number(saved.value) : 0,
      manualDelta: Number.isFinite(Number(saved.manualDelta)) ? Number(saved.manualDelta) : 0,
      label: def.label,
      icon: def.icon,
      max: def.max
    };
  });

  return result;
}

function normalizeState(raw, loadedGameData) {
  const next = {
    ...DEFAULT_STATE,
    ...raw,
    settings: {
      ...DEFAULT_SETTINGS,
      ...(raw.settings || {})
    },
    miscChecks: {
      ...DEFAULT_STATE.miscChecks,
      ...(raw.miscChecks || {})
    }
  };

  next.splits = Array.isArray(raw?.splits) && raw.splits.length
    ? raw.splits.map(normalizeSplit)
    : clone(loadedGameData.defaultSplits || []).map(normalizeSplit);

  next.counters = normalizeCounterState(
    loadedGameData.counters || {},
    raw?.counters || {}
  );

  next.currentSplitIndex = Math.max(
    0,
    Math.min(Number(next.currentSplitIndex || 0), next.splits.length)
  );

  next.elapsedMs = Math.max(0, Number(next.elapsedMs || 0));
  next.timerRunning = !!next.timerRunning;
  next.timerStartedAt = next.timerRunning
    ? Number(next.timerStartedAt || Date.now() - next.elapsedMs)
    : null;

  return next;
}

function getState() {
  return loadState(STORAGE_KEY);
}

function setState(nextState) {
  saveState(STORAGE_KEY, nextState);
}

function getActivePhaseId(state) {
  const phases = gameData?.phases || {};
  let active = "legacy_all";

  for (let i = 0; i <= state.currentSplitIndex && i < state.splits.length; i += 1) {
    const split = normalizeSplit(state.splits[i]);
    if (split.isPhaseStart && split.phaseId && phases[split.phaseId]) {
      active = split.phaseId;
    }
  }

  return active;
}

function getCurrentQuotaTargets(state) {
  const phaseId = getActivePhaseId(state);
  return gameData?.quotas?.[phaseId]?.targets || {};
}

function hydrateState() {
  const raw = getState();
  return normalizeState(raw, gameData);
}

function saveHydratedState(state) {
  setState(state);
}

function render() {
  const state = hydrateState();

  renderUI({
    state,
    counters: gameData.counters,
    phases: gameData.phases,
    meta: gameData.meta,
    quotas: gameData.quotas
  });

  renderSettings(state);
  renderSplitEditor(state);

  debug.setStatus("gameId", state.gameId);
  debug.setStatus("elapsedMs", state.elapsedMs);
  debug.setStatus("timerRunning", state.timerRunning);
  debug.setStatus("currentSplitIndex", state.currentSplitIndex);
  debug.setStatus("splitCount", state.splits.length);
  debug.setStatus("activePhase", getActivePhaseId(state));
}

function renderSettings(state) {
  const difficultySelect = document.getElementById("difficultySelect");
  const act1TargetMinutes = document.getElementById("act1TargetMinutes");
  const remoteCode = document.getElementById("remoteCode");
  const dirgeCheckbox = document.getElementById("dirgeCheckbox");
  const settingsPanel = document.getElementById("settingsPanel");
  const startPauseBtn = document.getElementById("startPauseBtn");

  if (difficultySelect) difficultySelect.value = state.settings.difficulty || "Lethal";
  if (act1TargetMinutes) act1TargetMinutes.value = Number(state.settings.act1TargetMinutes || 180);
  if (remoteCode) remoteCode.value = state.settings.remoteCode || "";
  if (dirgeCheckbox) dirgeCheckbox.checked = !!state.miscChecks?.dirge;
  if (settingsPanel && !settingsPanel.dataset.bound) {
    settingsPanel.classList.remove("open");
  }
  if (startPauseBtn) {
    startPauseBtn.textContent = state.timerRunning ? "⏸ Pause" : "▶ Start";
  }
}

function startTimer() {
  stopTimer();

  timerInterval = window.setInterval(() => {
    const state = hydrateState();
    if (!state.timerRunning || !state.timerStartedAt) return;

    state.elapsedMs = Math.max(0, Date.now() - state.timerStartedAt);
    saveHydratedState(state);

    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.textContent = formatMs(state.elapsedMs);
    }
  }, 250);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function toggleTimer() {
  const state = hydrateState();

  if (state.timerRunning) {
    state.elapsedMs = Math.max(0, Date.now() - state.timerStartedAt);
    state.timerRunning = false;
    state.timerStartedAt = null;
    debug.log("Timer paused");
  } else {
    state.timerRunning = true;
    state.timerStartedAt = Date.now() - state.elapsedMs;
    debug.log("Timer started");
  }

  saveHydratedState(state);
  render();

  if (state.timerRunning) {
    startTimer();
  } else {
    stopTimer();
  }
}

function applyAutoToCounters(state, auto, direction = 1) {
  Object.entries(auto || {}).forEach(([key, amount]) => {
    if (!state.counters[key]) return;

    const numericAmount = Number(amount || 0) * direction;
    const max = Number(gameData.counters?.[key]?.max || 0);
    const current = Number(state.counters[key].value || 0);
    const next = clamp(current + numericAmount, 0, max);

    state.counters[key].value = next;
  });
}

function advanceCurrentSplit() {
  const state = hydrateState();
  const split = state.splits[state.currentSplitIndex];

  if (!split) {
    debug.warn("No current split to advance");
    return;
  }

  applyAutoToCounters(state, split.auto, 1);
  state.currentSplitIndex += 1;

  saveHydratedState(state);
  debug.log("Advanced split", { split: split.label, index: state.currentSplitIndex });
  render();
}

function undoSplit() {
  const state = hydrateState();

  if (state.currentSplitIndex <= 0) {
    debug.warn("Undo ignored; no completed splits");
    return;
  }

  const split = state.splits[state.currentSplitIndex - 1];
  if (split) {
    applyAutoToCounters(state, split.auto, -1);
  }

  state.currentSplitIndex = Math.max(0, state.currentSplitIndex - 1);
  saveHydratedState(state);

  debug.log("Undid split", { split: split?.label || null, index: state.currentSplitIndex });
  render();
}

function adjustCounter(counterKey, delta) {
  const state = hydrateState();
  const counterDef = gameData.counters?.[counterKey];
  const counterState = state.counters?.[counterKey];

  if (!counterDef || !counterState) return;

  const max = Number(counterDef.max || 0);
  const current = Number(counterState.value || 0);
  const next = clamp(current + Number(delta || 0), 0, max);

  counterState.value = next;
  counterState.manualDelta = Number(counterState.manualDelta || 0) + Number(delta || 0);

  saveHydratedState(state);
  render();
}

function exportJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function exportTimes() {
  const state = hydrateState();

  exportJson("times.json", {
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
    const state = hydrateState();

    state.elapsedMs = Math.max(0, Number(parsed.elapsedMs || 0));
    state.currentSplitIndex = Math.max(
      0,
      Math.min(Number(parsed.currentSplitIndex || 0), state.splits.length)
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

    if (state.timerRunning) {
      state.timerStartedAt = Date.now() - state.elapsedMs;
    }

    saveHydratedState(state);
    render();
    debug.log("Imported times");
  } catch (error) {
    debug.error("Failed to import times", { message: error.message });
    alert("Could not import times JSON");
  }
}

function exportSplits() {
  const state = hydrateState();
  exportJson("splits.json", {
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

    const state = hydrateState();
    state.splits = nextSplits.map(normalizeSplit);
    state.currentSplitIndex = Math.min(state.currentSplitIndex, state.splits.length);

    saveHydratedState(state);
    render();
    debug.log("Imported splits", { count: state.splits.length });
  } catch (error) {
    debug.error("Failed to import splits", { message: error.message });
    alert("Could not import splits JSON");
  }
}

function resetRun() {
  if (!window.confirm("Reset timer, counters, and split progress?")) return;

  stopTimer();

  const state = normalizeState(
    {
      ...DEFAULT_STATE,
      gameId: gameData.game.id,
      settings: hydrateState().settings
    },
    gameData
  );

  saveHydratedState(state);
  render();
  debug.log("Run reset");
}

function toggleSettings() {
  const panel = document.getElementById("settingsPanel");
  if (!panel) return;
  panel.classList.toggle("open");
}

function bindStaticEvents() {
  document.getElementById("startPauseBtn")?.addEventListener("click", toggleTimer);
  document.getElementById("undoBtn")?.addEventListener("click", undoSplit);
  document.getElementById("advanceCurrentBtn")?.addEventListener("click", advanceCurrentSplit);
  document.getElementById("settingsToggle")?.addEventListener("click", toggleSettings);

  document.getElementById("difficultySelect")?.addEventListener("change", (event) => {
    const state = hydrateState();
    state.settings.difficulty = event.target.value;
    saveHydratedState(state);
    render();
  });

  document.getElementById("act1TargetMinutes")?.addEventListener("change", (event) => {
    const state = hydrateState();
    state.settings.act1TargetMinutes = Math.max(0, Number(event.target.value || 0));
    saveHydratedState(state);
    render();
  });

  document.getElementById("remoteCode")?.addEventListener("input", (event) => {
    const state = hydrateState();
    state.settings.remoteCode = event.target.value || "";
    saveHydratedState(state);
  });

  document.getElementById("dirgeCheckbox")?.addEventListener("change", (event) => {
    const state = hydrateState();
    state.miscChecks.dirge = !!event.target.checked;
    saveHydratedState(state);
    render();
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

function renderSplitEditor(state) {
  const container = document.getElementById("splitEditorGrid");
  if (!container) return;

  if (container.dataset.ready === "true") return;

  container.innerHTML = `
    <div class="editorCard" style="width:min(1000px,100%);">
      <div class="eyebrow" style="margin-bottom:10px">Raw Split JSON</div>
      <textarea id="splitEditorTextarea" style="min-height:420px;resize:vertical;"></textarea>
    </div>
  `;

  const textarea = document.getElementById("splitEditorTextarea");
  const overlay = document.getElementById("splitEditorOverlay");

  function refreshTextarea() {
    const latest = hydrateState();
    textarea.value = JSON.stringify(latest.splits, null, 2);
  }

  document.getElementById("openSplitEditorBtn")?.addEventListener("click", () => {
    refreshTextarea();
    overlay?.classList.add("open");
  });

  document.getElementById("closeSplitEditorBtn")?.addEventListener("click", () => {
    overlay?.classList.remove("open");
  });

  document.getElementById("resetSplitEditorBtn")?.addEventListener("click", refreshTextarea);

  document.getElementById("downloadSplitBackupBtn")?.addEventListener("click", () => {
    const latest = hydrateState();
    exportJson("split-backup.json", { splits: latest.splits });
  });

  document.getElementById("copySplitBackupBtn")?.addEventListener("click", async () => {
    const latest = hydrateState();
    try {
      await navigator.clipboard.writeText(JSON.stringify(latest.splits, null, 2));
      debug.log("Split backup copied");
    } catch (error) {
      debug.warn("Clipboard blocked while copying split backup", { message: error.message });
    }
  });

  document.getElementById("addSplitEditorBtn")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(textarea.value || "[]");
      parsed.push({
        id: `split_${parsed.length + 1}`,
        label: `New Split ${parsed.length + 1}`,
        note: "",
        phaseId: "",
        isPhaseStart: false,
        auto: {}
      });
      textarea.value = JSON.stringify(parsed, null, 2);
    } catch {
      alert("Split JSON is invalid");
    }
  });

  document.getElementById("saveSplitEditorBtn")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(textarea.value || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Split JSON must be an array");
      }

      const latest = hydrateState();
      latest.splits = parsed.map(normalizeSplit);
      latest.currentSplitIndex = Math.min(latest.currentSplitIndex, latest.splits.length);

      saveHydratedState(latest);
      overlay?.classList.remove("open");
      render();
      debug.log("Saved split editor changes", { count: latest.splits.length });
    } catch (error) {
      debug.error("Failed to save split editor", { message: error.message });
      alert("Split JSON is invalid");
    }
  });

  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.classList.remove("open");
    }
  });

  container.dataset.ready = "true";
}

function setupActsEditor() {
  createActsEditor({
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
    getQuotas: () => ({ ...clone(gameData.quotas || {}) }),
    getCounterDefs: () => gameData.counters || {},
    setPhases: (nextPhases) => {
      gameData.phases = nextPhases;
    },
    setQuotas: (nextQuotas) => {
      gameData.quotas = nextQuotas?.quotas ? nextQuotas.quotas : nextQuotas;
    },
    onAfterSave: () => {
      render();
      debug.log("Saved acts editor changes");
    }
  });

  document.getElementById("openActsEditorBtn")?.addEventListener("click", () => {
    document.getElementById("actsEditorOverlay")?.classList.add("open");
  });
}

async function boot() {
  gameData = await loadGameData("ghost-of-tsushima");

  const initial = normalizeState(getState(), gameData);
  saveHydratedState(initial);

  debug.setSnapshotBuilder(() => ({
    gameData,
    state: hydrateState()
  }));

  bindStaticEvents();
  setupActsEditor();
  render();

  if (initial.timerRunning) {
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
    splits: (initial.splits || []).length
  });
}

boot().catch((error) => {
  debug.error("Controller boot failed", {
    message: error.message,
    stack: error.stack
  });
  console.error(error);
});

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
