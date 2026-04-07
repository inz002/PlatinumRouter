// js/controller-actions.js

import { updateState, resetState } from "./storage.js";
import { createSplitEditor } from "./split-editor.js";
import { createActsEditor } from "./acts-editor.js";
import {
  buildInitialState,
  clone,
  DEFAULT_SETTINGS,
  applyAutoToCounters,
  buildHistoryEntry,
  getActivePhase
} from "./controller-core.js";
import { clamp, normalizeSplits } from "./split-logic.js";

export function createActionController({ gameData, debug, getCurrentState }) {
  let timerInterval = null;
  let splitEditorApi = null;
  let actsEditorApi = null;

  function setWholeState(nextState) {
    updateState(() => buildInitialState(nextState, gameData, getCurrentState().gameId));
  }

  function syncPhaseToState() {
    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
      state.phase = getActivePhase(state, gameData);
      return state;
    });
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
        const next = buildInitialState(raw, gameData, getCurrentState().gameId);
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
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
      if (state.timer.running) return state;

      state.timer.running = true;
      state.timer.startTime = Date.now() - state.timer.elapsed;
      return state;
    });

    ensureTimerLoop();
  }

  function pauseTimer() {
    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
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

  function completeSplit() {
    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
      const splitIndex = Number(state.splits?.currentIndex || 0);
      const split = state.splits?.items?.[splitIndex];

      if (!split) return state;

      applyAutoToCounters(state, gameData, split.auto || {}, 1);

      const entry = buildHistoryEntry(state, splitIndex, split);
      state.splits.completed = [...(state.splits.completed || []), entry];
      state.splits.currentIndex = clamp(splitIndex + 1, 0, state.splits.items.length);
      state.phase = getActivePhase(state, gameData);

      return state;
    });
  }

  function undoSplit() {
    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
      const nextIndex = Number(state.splits?.currentIndex || 0) - 1;

      if (nextIndex < 0) return state;

      const split = state.splits?.items?.[nextIndex];
      if (split) {
        applyAutoToCounters(state, gameData, split.auto || {}, -1);
      }

      state.splits.currentIndex = nextIndex;
      state.splits.completed = (state.splits.completed || []).slice(0, -1);
      state.phase = getActivePhase(state, gameData);

      return state;
    });
  }

  function adjustCounter(counterKey, delta) {
    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
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
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
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
        const current = buildInitialState(raw, gameData, getCurrentState().gameId);
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
        }, gameData, getCurrentState().gameId);

        if (next.timer.running) {
          next.timer.startTime = Date.now() - next.timer.elapsed;
        }

        next.phase = getActivePhase(next, gameData);
        return next;
      });
    } catch (error) {
      debug.error("Failed to import times", { message: error.message });
      alert("Could not import times JSON");
    }
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
        const state = buildInitialState(raw, gameData, getCurrentState().gameId);
        state.splits.items = normalizeSplits(nextSplits, gameData?.defaultSplits || []);
        state.splits.currentIndex = clamp(
          Number(state.splits.currentIndex || 0),
          0,
          state.splits.items.length
        );

        state.splits.completed = (state.splits.completed || []).filter(
          (entry) => Number(entry.splitIndex) < state.splits.items.length
        );

        state.phase = getActivePhase(state, gameData);
        return state;
      });
    } catch (error) {
      debug.error("Failed to import splits", { message: error.message });
      alert("Could not import splits JSON");
    }
  }

  function parseTimeStringToMs(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);

    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return null;
    }

    return ((hours * 60 * 60) + (minutes * 60) + seconds) * 1000;
  }

  function setTimerElapsed(nextElapsedMs) {
    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
      const elapsed = Math.max(0, Number(nextElapsedMs || 0));

      state.timer.elapsed = elapsed;

      if (state.timer.running) {
        state.timer.startTime = Date.now() - elapsed;
      } else {
        state.timer.startTime = null;
      }

      return state;
    });
  }

  function applyPracticeStartTime() {
    const input = document.getElementById("practiceStartTimeInput");
    const parsedMs = parseTimeStringToMs(input?.value);

    if (parsedMs == null) {
      alert("Use HH:MM:SS format, for example 07:00:00");
      return;
    }

    setTimerElapsed(parsedMs);
  }

  function resetPracticeStartTime() {
    const input = document.getElementById("practiceStartTimeInput");
    if (input) {
      input.value = "00:00:00";
    }

    setTimerElapsed(0);
  }

  function resetRun() {
    if (!window.confirm("Reset timer, counters, and split progress?")) return;

    const current = getCurrentState();
    stopTimerLoop();

    resetState();

    updateState((raw) => {
      const state = buildInitialState(raw, gameData, getCurrentState().gameId);
      state.settings = clone(current.settings || DEFAULT_SETTINGS);
      state.ui.settingsOpen = !!current.ui?.settingsOpen;
      state.splits.items = normalizeSplits(undefined, gameData?.defaultSplits || []);
      state.splits.currentIndex = 0;
      state.splits.completed = [];
      state.phase = getActivePhase(state, gameData);
      return state;
    });

    const input = document.getElementById("practiceStartTimeInput");
    if (input) {
      input.value = "00:00:00";
    }
  }

  function bindStaticEvents() {
    document.getElementById("startPauseBtn")?.addEventListener("click", toggleTimer);
    document.getElementById("undoBtn")?.addEventListener("click", undoSplit);
    document.getElementById("advanceCurrentBtn")?.addEventListener("click", completeSplit);
    document.getElementById("settingsToggle")?.addEventListener("click", toggleSettings);

    document.getElementById("dirgeCheckbox")?.addEventListener("change", (event) => {
      updateState((raw) => {
        const state = buildInitialState(raw, gameData, getCurrentState().gameId);
        state.misc.dirgeDone = !!event.target.checked;
        return state;
      });
    });

    document.getElementById("exportTimesBtn")?.addEventListener("click", exportTimes);
    document.getElementById("resetBtn")?.addEventListener("click", resetRun);

    document.getElementById("setStartTimeBtn")?.addEventListener("click", applyPracticeStartTime);
    document.getElementById("resetStartTimeBtn")?.addEventListener("click", resetPracticeStartTime);

    document.getElementById("practiceStartTimeInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyPracticeStartTime();
      }
    });

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
    const overlayEl = document.getElementById("splitEditorOverlay");
    const gridEl = document.getElementById("splitEditorGrid");

    if (!overlayEl || !gridEl) return;

    splitEditorApi = createSplitEditor({
      overlayEl,
      gridEl,
      addBtn: document.getElementById("addSplitEditorBtn"),
      resetBtn: document.getElementById("resetSplitEditorBtn"),
      closeBtn: document.getElementById("closeSplitEditorBtn"),
      saveBtn: document.getElementById("saveSplitEditorBtn"),
      downloadBtn: document.getElementById("downloadSplitBackupBtn"),
      copyBtn: document.getElementById("copySplitBackupBtn"),
      getSplits: () => clone(getCurrentState().splits?.items || []),
      setSplits: (splits) => {
        updateState((raw) => {
          const state = buildInitialState(raw, gameData, getCurrentState().gameId);
          state.splits.items = normalizeSplits(splits, gameData?.defaultSplits || []);
          state.splits.currentIndex = clamp(
            Number(state.splits.currentIndex || 0),
            0,
            state.splits.items.length
          );
          state.phase = getActivePhase(state, gameData);
          return state;
        });
      },
      getPhases: () => clone(gameData?.phases || {}),
      getCounterDefs: () => gameData?.counters || {},
      onAfterSave: () => {
        debug.log("Split editor saved");
      }
    });
  }

  function setupActsEditor() {
    const overlayEl = document.getElementById("actsEditorOverlay");
    const phaseListEl = document.getElementById("actsEditorPhaseList");
    const formEl = document.getElementById("actsEditorForm");

    if (!overlayEl || !phaseListEl || !formEl) return;

    actsEditorApi = createActsEditor({
      overlayEl,
      phaseListEl,
      formEl,
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
      }
    });
  }

  return {
    setWholeState,
    syncPhaseToState,
    ensureTimerLoop,
    stopTimerLoop,
    bindStaticEvents,
    setupSplitEditor,
    setupActsEditor
  };
}
