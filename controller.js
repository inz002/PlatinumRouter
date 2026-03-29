import { loadGamesRegistry, loadGameData } from "./js/data-loader.js";
import {
  STORAGE_KEY,
  buildDefaultStoredState,
  loadStoredState,
  saveStoredState,
  mergeStoredState
} from "./js/storage.js";
import { createTimer } from "./js/timer.js";
import {
  clamp,
  normalizeSplits,
  buildCounters,
  applyAutoProgress,
  reverseAutoProgress,
  buildSplitHistoryEntry,
  getActivePhaseId
} from "./js/split-logic.js";
import { createRenderer } from "./js/ui-render.js";
import { createSplitEditor } from "./js/split-editor.js";
import { createDebugger } from "./js/debug.js";

const debug = createDebugger({ name: "controller" });

const state = {
  gameId: "ghost-of-tsushima",
  elapsedMs: 0,
  running: false,
  currentSplitIndex: 0,
  history: [],
  counters: {},
  miscChecks: { dirge: false },
  settings: {
    difficulty: "Lethal",
    act1TargetMinutes: 180,
    showSettings: false,
    remoteCode: ""
  },
  splits: []
};

const gameData = {
  registry: null,
  game: null,
  meta: null,
  counters: {},
  phases: {},
  splits: [],
  quotas: {}
};

const els = {
  runTitle: document.getElementById("runTitle"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  timer: document.getElementById("timer"),
  startPauseBtn: document.getElementById("startPauseBtn"),
  undoBtn: document.getElementById("undoBtn"),
  advanceCurrentBtn: document.getElementById("advanceCurrentBtn"),
  currentSplitLabel: document.getElementById("currentSplitLabel"),
  historyCount: document.getElementById("historyCount"),
  modePill: document.getElementById("modePill"),
  overallPercent: document.getElementById("overallPercent"),
  overallBar: document.getElementById("overallBar"),
  act1SummaryValue: document.getElementById("act1SummaryValue"),
  act1SummaryBar: document.getElementById("act1SummaryBar"),
  pacePill: document.getElementById("pacePill"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsPanel: document.getElementById("settingsPanel"),
  difficultySelect: document.getElementById("difficultySelect"),
  act1TargetMinutes: document.getElementById("act1TargetMinutes"),
  remoteCode: document.getElementById("remoteCode"),
  openSplitEditorBtn: document.getElementById("openSplitEditorBtn"),
  exportTimesBtn: document.getElementById("exportTimesBtn"),
  importTimesInput: document.getElementById("importTimesInput"),
  exportSplitsBtn: document.getElementById("exportSplitsBtn"),
  importSplitsInput: document.getElementById("importSplitsInput"),
  resetBtn: document.getElementById("resetBtn"),
  act1QuotaText: document.getElementById("act1QuotaText"),
  dirgeCheckbox: document.getElementById("dirgeCheckbox"),
  activePhaseName: document.getElementById("activePhaseName"),
  activePhaseNote: document.getElementById("activePhaseNote"),
  visibleObjectives: document.getElementById("visibleObjectives"),
  currentObjectiveText: document.getElementById("currentObjectiveText"),
  progressGrid: document.getElementById("progressGrid"),
  splitButtons: document.getElementById("splitButtons"),
  queuePill: document.getElementById("queuePill"),
  historySaved: document.getElementById("historySaved"),
  historyList: document.getElementById("historyList"),

  splitEditorOverlay: document.getElementById("splitEditorOverlay"),
  splitEditorGrid: document.getElementById("splitEditorGrid"),
  addSplitEditorBtn: document.getElementById("addSplitEditorBtn"),
  downloadSplitBackupBtn: document.getElementById("downloadSplitBackupBtn"),
  copySplitBackupBtn: document.getElementById("copySplitBackupBtn"),
  resetSplitEditorBtn: document.getElementById("resetSplitEditorBtn"),
  closeSplitEditorBtn: document.getElementById("closeSplitEditorBtn"),
  saveSplitEditorBtn: document.getElementById("saveSplitEditorBtn")
};

let timer = null;
let renderer = null;
let splitEditor = null;

debug.log("Controller boot start");
debug.setStatus("storageKey", STORAGE_KEY);

init().catch((error) => {
  console.error(error);
  debug.error("Controller boot failed", {
    message: error.message,
    stack: error.stack
  });
  alert(`Controller boot failed: ${error.message || error}`);
});

async function init() {
  gameData.registry = await loadGamesRegistry();
  debug.log("Games registry loaded", gameData.registry);
  debug.setStatus("defaultGameId", gameData.registry.defaultGameId || "none");

  const stored = mergeStoredState(buildDefaultStoredState(), loadStoredState());
  state.gameId = stored.gameId || gameData.registry.defaultGameId || "ghost-of-tsushima";

  const loaded = await loadGameData(state.gameId);

  gameData.game = loaded.game;
  gameData.meta = loaded.meta;
  gameData.counters = loaded.counters || {};
  gameData.phases = loaded.phases || {};
  gameData.quotas = loaded.quotas || {};
  gameData.splits = normalizeSplits(
    loaded.defaultSplits?.splits || loaded.defaultSplits || []
  );

  debug.log("Game data loaded", {
    game: loaded.game,
    meta: loaded.meta,
    counterCount: Object.keys(loaded.counters || {}).length,
    phaseCount: Object.keys(loaded.phases || {}).length,
    splitCount: (loaded.defaultSplits?.splits || loaded.defaultSplits || []).length,
    quotaCount: Object.keys(loaded.quotas || {}).length
  });

  debug.setStatus("gameId", state.gameId);
  debug.setStatus("countersLoaded", Object.keys(gameData.counters || {}).length);
  debug.setStatus("phasesLoaded", Object.keys(gameData.phases || {}).length);
  debug.setStatus("defaultSplitsLoaded", gameData.splits.length);
  debug.setStatus("quotasLoaded", Object.keys(gameData.quotas || {}).length);

  hydrateStateFromStored(stored);

  debug.log("State hydrated", {
    currentSplitIndex: state.currentSplitIndex,
    historyCount: state.history.length,
    counterKeys: Object.keys(state.counters || {}).length,
    splitCount: state.splits.length
  });

  debug.setStatus("storedSplitCount", state.splits.length);
  debug.setStatus("storedCounterCount", Object.keys(state.counters || {}).length);

  timer = createTimer({
    initialElapsedMs: state.elapsedMs,
    onTick: (elapsedMs) => {
      state.elapsedMs = elapsedMs;
      state.running = true;
      persistAndRender();
    },
    onStateChange: (snapshot) => {
      state.elapsedMs = snapshot.elapsedMs;
      state.running = snapshot.running;
      persistAndRender();
    }
  });

  renderer = createRenderer({
    elements: els,
    getState: () => state,
    getGameData: () => ({
      meta: gameData.meta,
      counters: gameData.counters,
      phases: gameData.phases,
      quotas: gameData.quotas,
      splits: state.splits
    }),
    onManualCounterChange: handleManualCounterChange,
    onAdvanceSplit: advanceSplit
  });

  splitEditor = createSplitEditor({
    overlayEl: els.splitEditorOverlay,
    gridEl: els.splitEditorGrid,
    addBtn: els.addSplitEditorBtn,
    resetBtn: els.resetSplitEditorBtn,
    closeBtn: els.closeSplitEditorBtn,
    saveBtn: els.saveSplitEditorBtn,
    downloadBtn: els.downloadSplitBackupBtn,
    copyBtn: els.copySplitBackupBtn,
    getSplits: () => state.splits,
    setSplits: (nextSplits) => {
      state.splits = normalizeSplits(nextSplits, gameData.splits);
    },
    getPhases: () => gameData.phases,
    getCounterDefs: () => gameData.counters,
    onAfterSave: () => {
      state.currentSplitIndex = clamp(
        state.currentSplitIndex,
        0,
        Math.max(0, state.splits.length - 1)
      );
      persistAndRender();
    }
  });

  bindEvents();

  debug.setSnapshotBuilder(() => ({
    state,
    gameData: {
      game: gameData.game,
      meta: gameData.meta,
      countersLoaded: Object.keys(gameData.counters || {}).length,
      phasesLoaded: Object.keys(gameData.phases || {}).length,
      quotasLoaded: Object.keys(gameData.quotas || {}).length,
      splitsLoaded: gameData.splits.length
    },
    saved: JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
  }));

  persistAndRender();
}

function hydrateStateFromStored(stored) {
  state.elapsedMs = stored.elapsedMs || 0;
  state.running = false;
  state.currentSplitIndex = stored.currentSplitIndex || 0;
  state.history = Array.isArray(stored.history) ? stored.history : [];
  state.miscChecks = { dirge: false, ...(stored.miscChecks || {}) };
  state.settings = {
    difficulty: gameData.meta?.defaultDifficulty || "Lethal",
    act1TargetMinutes: 180,
    showSettings: false,
    remoteCode: "",
    ...(stored.settings || {})
  };

  if (stored.counters && Object.keys(stored.counters).length) {
    state.counters = normalizeCounters(stored.counters, gameData.counters);
  } else {
    state.counters = buildCounters(gameData.counters);
  }

  if (Array.isArray(stored.splits) && stored.splits.length) {
    state.splits = normalizeSplits(stored.splits, gameData.splits);
  } else {
    state.splits = normalizeSplits(gameData.splits, gameData.splits);
  }

  state.currentSplitIndex = clamp(
    state.currentSplitIndex,
    0,
    Math.max(0, state.splits.length - 1)
  );
}

function normalizeCounters(storedCounters, defs) {
  const base = buildCounters(defs);
  Object.keys(base).forEach((key) => {
    if (!storedCounters[key]) return;
    base[key].value = clamp(Number(storedCounters[key].value || 0), 0, base[key].max);
    base[key].manualDelta = Number(storedCounters[key].manualDelta || 0);
  });
  return base;
}

function bindEvents() {
  els.startPauseBtn.addEventListener("click", () => {
    if (state.running) timer.pause();
    else timer.start();
  });

  els.undoBtn.addEventListener("click", undoLastSplit);
  els.advanceCurrentBtn.addEventListener("click", () => advanceSplit(state.currentSplitIndex));

  els.settingsToggle.addEventListener("click", () => {
    state.settings.showSettings = !state.settings.showSettings;
    persistAndRender();
  });

  els.difficultySelect.addEventListener("change", (e) => {
    state.settings.difficulty = e.target.value;
    persistAndRender();
  });

  els.act1TargetMinutes.addEventListener("input", (e) => {
    state.settings.act1TargetMinutes = Number(e.target.value || 0);
    persistAndRender();
  });

  els.remoteCode.addEventListener("input", (e) => {
    state.settings.remoteCode = e.target.value;
    persistAndRender();
  });

  els.dirgeCheckbox.addEventListener("change", (e) => {
    state.miscChecks.dirge = e.target.checked;
    persistAndRender();
  });

  els.openSplitEditorBtn.addEventListener("click", () => splitEditor.open());

  els.exportTimesBtn.addEventListener("click", exportTimesJson);
  els.importTimesInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importTimesJson(file);
    e.target.value = "";
  });

  els.exportSplitsBtn.addEventListener("click", exportSplitsJson);
  els.importSplitsInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importSplitsJson(file);
    e.target.value = "";
  });

  els.resetBtn.addEventListener("click", resetRun);
}

function handleManualCounterChange(key, diff) {
  const counter = state.counters[key];
  if (!counter) return;

  counter.value = clamp(counter.value + diff, 0, counter.max);
  counter.manualDelta += diff;
  persistAndRender();
}

function advanceSplit(index) {
  if (index !== state.currentSplitIndex) return;

  const split = state.splits[index];
  const previousCumulativeMs = state.history.length
    ? state.history[state.history.length - 1].cumulativeMs
    : 0;

  state.counters = applyAutoProgress(state.counters, split.auto || {});
  state.history.push(
    buildSplitHistoryEntry({
      splitIndex: index,
      split,
      elapsedMs: state.elapsedMs,
      previousCumulativeMs
    })
  );

  state.currentSplitIndex = clamp(
    state.currentSplitIndex + 1,
    0,
    Math.max(0, state.splits.length - 1)
  );

  persistAndRender();
}

function undoLastSplit() {
  if (!state.history.length) return;

  const removed = state.history.pop();
  state.counters = reverseAutoProgress(state.counters, removed.autoApplied || {});
  state.currentSplitIndex = removed.splitIndex;
  persistAndRender();
}

function resetRun() {
  timer.reset(0);
  state.currentSplitIndex = 0;
  state.history = [];
  state.counters = buildCounters(gameData.counters);
  state.miscChecks = { dirge: false };
  state.settings.difficulty = gameData.meta?.defaultDifficulty || "Lethal";
  persistAndRender();
}

function exportTimesJson() {
  downloadJson(
    {
      gameId: state.gameId,
      elapsedMs: state.elapsedMs,
      currentSplitIndex: state.currentSplitIndex,
      history: state.history,
      counters: state.counters,
      miscChecks: state.miscChecks,
      settings: state.settings,
      splits: state.splits
    },
    `${state.gameId}-times`
  );
}

function importTimesJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      timer.pause();
      timer.setElapsed(parsed.elapsedMs || 0);

      state.currentSplitIndex = parsed.currentSplitIndex || 0;
      state.history = Array.isArray(parsed.history) ? parsed.history : [];
      state.miscChecks = { dirge: false, ...(parsed.miscChecks || {}) };
      state.settings = {
        ...state.settings,
        ...(parsed.settings || {})
      };
      state.counters = normalizeCounters(parsed.counters || {}, gameData.counters);

      if (Array.isArray(parsed.splits) && parsed.splits.length) {
        state.splits = normalizeSplits(parsed.splits, gameData.splits);
      }

      state.currentSplitIndex = clamp(
        state.currentSplitIndex,
        0,
        Math.max(0, state.splits.length - 1)
      );

      persistAndRender();
    } catch (error) {
      console.error(error);
      alert("Could not import times JSON");
    }
  };
  reader.readAsText(file);
}

function exportSplitsJson() {
  downloadJson(
    {
      splits: state.splits,
      exportedAt: new Date().toISOString(),
      source: "controller-export"
    },
    `${state.gameId}-splits`
  );
}

function importSplitsJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = Array.isArray(parsed) ? parsed : parsed.splits;
      if (!Array.isArray(imported) || !imported.length) {
        throw new Error("Invalid splits payload");
      }
      state.splits = normalizeSplits(imported, gameData.splits);
      state.currentSplitIndex = clamp(
        state.currentSplitIndex,
        0,
        Math.max(0, state.splits.length - 1)
      );
      persistAndRender();
    } catch (error) {
      console.error(error);
      alert("Could not import splits JSON");
    }
  };
  reader.readAsText(file);
}

function persistAndRender() {
  const activePhaseId = getActivePhaseId(state.splits, state.currentSplitIndex, gameData.phases);

  debug.setStatus("elapsedMs", state.elapsedMs);
  debug.setStatus("currentSplitIndex", state.currentSplitIndex);
  debug.setStatus("historyCount", state.history.length);
  debug.setStatus("counterCount", Object.keys(state.counters || {}).length);
  debug.setStatus("splitCount", state.splits.length);
  debug.setStatus("activePhaseId", activePhaseId);
  debug.setStatus(
    "activeQuotaTargets",
    Object.keys(gameData.quotas?.[activePhaseId]?.targets || {}).length
  );

  debug.log("Persisting state", {
    elapsedMs: state.elapsedMs,
    currentSplitIndex: state.currentSplitIndex,
    historyCount: state.history.length,
    counterCount: Object.keys(state.counters || {}).length,
    splitCount: state.splits.length,
    activePhaseId
  });

  saveStoredState({
    gameId: state.gameId,
    elapsedMs: state.elapsedMs,
    currentSplitIndex: state.currentSplitIndex,
    history: state.history,
    counters: state.counters,
    miscChecks: state.miscChecks,
    settings: state.settings,
    splits: state.splits
  });

  renderer.render();
}

function downloadJson(data, prefix) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}
