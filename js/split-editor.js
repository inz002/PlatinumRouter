// js/splits-page.js

import { loadGameData } from "./data-loader.js";
import { getState, updateState, subscribe } from "./storage.js";
import { createSplitEditor } from "./split-editor.js";
import { createDebugger } from "./debug.js";
import { clamp, normalizeSplits } from "./split-logic.js";

const GAME_ID = "ghost-of-tsushima";

const debug = createDebugger({ name: "splits-page" });
// js/split-editor.js

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeAuto(auto) {
  const result = {};
  Object.entries(safeObject(auto)).forEach(([key, value]) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return;
    result[key] = n;
  });
  return result;
}

function normalizeSplit(split = {}, index = 0) {
  return {
    id: split.id || `split_${index}`,
    label: split.label || `Split ${index + 1}`,
    phase: split.phase || split.phaseId || split.act || "",
    note: split.note || "",
    auto: normalizeAuto(split.auto || {})
  };
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildAutoFields(counterDefs, auto = {}) {
  const defs = safeObject(counterDefs);

  return Object.entries(defs)
    .map(([key, def]) => {
      const label = def?.label || key;
      const value = Number(auto?.[key] || 0);

      return `
        <label class="field">
          <span>${escapeHtml(label)}</span>
          <input
            type="number"
            step="1"
            data-auto-key="${escapeHtml(key)}"
            value="${value}"
          />
        </label>
      `;
    })
    .join("");
}

function buildPhaseOptions(phases, selected) {
  const phaseEntries = Object.entries(safeObject(phases));

  return `
    <option value="">No phase</option>
    ${phaseEntries.map(([key, def]) => {
      const label = def?.label || key;
      const isSelected = String(selected || "") === String(key) ? "selected" : "";
      return `<option value="${escapeHtml(key)}" ${isSelected}>${escapeHtml(label)}</option>`;
    }).join("")}
  `;
}

function buildRowHtml(split, index, phases, counterDefs) {
  const normalized = normalizeSplit(split, index);

  return `
    <div class="editorCard" data-split-row="${index}">
      <div class="row between" style="margin-bottom:12px;gap:8px;align-items:flex-start">
        <div>
          <div class="eyebrow">Split ${index + 1}</div>
          <div class="mid">${escapeHtml(normalized.label || `Split ${index + 1}`)}</div>
        </div>

        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" data-row-action="move-up">↑</button>
          <button type="button" class="btn" data-row-action="move-down">↓</button>
          <button type="button" class="btn danger" data-row-action="delete">Delete</button>
        </div>
      </div>

      <div class="fields">
        <label class="field">
          <span>Label</span>
          <input type="text" data-field="label" value="${escapeHtml(normalized.label)}" />
        </label>

        <label class="field">
          <span>Phase</span>
          <select data-field="phase">
            ${buildPhaseOptions(phases, normalized.phase)}
          </select>
        </label>
      </div>

      <div class="fields">
        <label class="field" style="grid-column:1 / -1">
          <span>Note</span>
          <textarea data-field="note" rows="3">${escapeHtml(normalized.note)}</textarea>
        </label>
      </div>

      <div style="margin-top:14px">
        <div class="eyebrow" style="margin-bottom:10px">Auto Progress</div>
        <div class="fields">
          ${buildAutoFields(counterDefs, normalized.auto)}
        </div>
      </div>
    </div>
  `;
}

export function createSplitEditor({
  overlayEl = null,
  gridEl,
  addBtn = null,
  resetBtn = null,
  closeBtn = null,
  saveBtn = null,
  downloadBtn = null,
  copyBtn = null,
  getSplits,
  setSplits,
  getPhases,
  getCounterDefs,
  onAfterSave = null
}) {
  if (!gridEl) {
    throw new Error("createSplitEditor: gridEl is required");
  }

  let workingSplits = [];
  let initialSplits = [];

  function readSourceSplits() {
    const splits = safeArray(getSplits?.());
    return splits.map((split, index) => normalizeSplit(split, index));
  }

  function getPhasesSafe() {
    return safeObject(getPhases?.());
  }

  function getCounterDefsSafe() {
    return safeObject(getCounterDefs?.());
  }

  function refreshHeaderTitles() {
    gridEl.querySelectorAll("[data-split-row]").forEach((row, index) => {
      const eyebrow = row.querySelector(".eyebrow");
      const mid = row.querySelector(".mid");
      const labelInput = row.querySelector('[data-field="label"]');

      if (eyebrow) eyebrow.textContent = `Split ${index + 1}`;
      if (mid) mid.textContent = labelInput?.value?.trim() || `Split ${index + 1}`;
      row.dataset.splitRow = String(index);
    });
  }

  function render() {
    const phases = getPhasesSafe();
    const counterDefs = getCounterDefsSafe();

    if (!workingSplits.length) {
      gridEl.innerHTML = `
        <div class="editorCard">
          <div class="mid">No splits yet.</div>
          <div class="subtitle" style="margin-top:8px">Add a split to begin.</div>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = workingSplits
      .map((split, index) => buildRowHtml(split, index, phases, counterDefs))
      .join("");

    refreshHeaderTitles();
  }

  function syncFromSource() {
    initialSplits = readSourceSplits();
    workingSplits = clone(initialSplits);
    render();
  }

  function collectFromDom() {
    const rows = Array.from(gridEl.querySelectorAll("[data-split-row]"));

    workingSplits = rows.map((row, index) => {
      const label = row.querySelector('[data-field="label"]')?.value?.trim() || `Split ${index + 1}`;
      const phase = row.querySelector('[data-field="phase"]')?.value?.trim() || "";
      const note = row.querySelector('[data-field="note"]')?.value || "";

      const auto = {};
      row.querySelectorAll("[data-auto-key]").forEach((input) => {
        const key = input.dataset.autoKey;
        const n = Number(input.value || 0);
        if (!key || !Number.isFinite(n) || n === 0) return;
        auto[key] = n;
      });

      return normalizeSplit({
        id: workingSplits[index]?.id || `split_${index}`,
        label,
        phase,
        note,
        auto
      }, index);
    });

    return clone(workingSplits);
  }

  function addEmptyRow() {
    collectFromDom();

    workingSplits.push(normalizeSplit({
      id: `split_${Date.now()}`,
      label: `Split ${workingSplits.length + 1}`,
      phase: "",
      note: "",
      auto: {}
    }, workingSplits.length));

    render();
  }

  function reset() {
    workingSplits = clone(initialSplits);
    render();
  }

  function save() {
    const nextSplits = collectFromDom();
    setSplits?.(nextSplits);
    initialSplits = clone(nextSplits);
    render();
    onAfterSave?.();
  }

  function downloadBackup() {
    const payload = {
      splits: collectFromDom(),
      exportedAt: new Date().toISOString()
    };

    downloadJson("splits-backup.json", payload);
  }

  async function copyBackup() {
    const text = JSON.stringify({
      splits: collectFromDom(),
      exportedAt: new Date().toISOString()
    }, null, 2);

    const ok = await copyText(text);
    if (!ok) {
      console.warn("Could not copy split backup");
    }
  }

  function open() {
    syncFromSource();
    if (overlayEl) {
      overlayEl.classList.add("open");
      overlayEl.style.display = "block";
    }
  }

  function close() {
    if (overlayEl) {
      overlayEl.classList.remove("open");
      overlayEl.style.display = "none";
    }
  }

  function moveRow(index, direction) {
    collectFromDom();

    const target = index + direction;
    if (target < 0 || target >= workingSplits.length) return;

    const next = [...workingSplits];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;

    workingSplits = next.map((split, i) => normalizeSplit(split, i));
    render();
  }

  function deleteRow(index) {
    collectFromDom();

    workingSplits = workingSplits
      .filter((_, i) => i !== index)
      .map((split, i) => normalizeSplit(split, i));

    render();
  }

  addBtn?.addEventListener("click", addEmptyRow);
  resetBtn?.addEventListener("click", reset);
  saveBtn?.addEventListener("click", save);
  downloadBtn?.addEventListener("click", downloadBackup);
  copyBtn?.addEventListener("click", copyBackup);
  closeBtn?.addEventListener("click", close);

  overlayEl?.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      close();
    }
  });

  gridEl.addEventListener("input", (event) => {
    if (event.target.matches('[data-field="label"]')) {
      const row = event.target.closest("[data-split-row]");
      if (!row) return;

      const title = row.querySelector(".mid");
      if (title) {
        const index = Number(row.dataset.splitRow || 0);
        title.textContent = event.target.value.trim() || `Split ${index + 1}`;
      }
    }
  });

  gridEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-row-action]");
    if (!button) return;

    const row = button.closest("[data-split-row]");
    if (!row) return;

    const index = Number(row.dataset.splitRow || 0);
    const action = button.dataset.rowAction;

    if (action === "move-up") moveRow(index, -1);
    if (action === "move-down") moveRow(index, 1);
    if (action === "delete") deleteRow(index);
  });

  syncFromSource();

  return {
    open,
    close,
    save,
    reset,
    addEmptyRow,
    downloadBackup,
    copyBackup
  };
}
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

  const rawSplitBlock = raw?.splits;
  const rawSplitItems =
    Array.isArray(rawSplitBlock?.items)
      ? rawSplitBlock.items
      : Array.isArray(rawSplitBlock)
        ? rawSplitBlock
        : [];

  const splits = normalizeSplits(rawSplitItems, gameData?.defaultSplits || []);
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

    phases: raw?.phases && typeof raw.phases === "object" ? raw.phases : {},
    quotas: raw?.quotas && typeof raw.quotas === "object" ? raw.quotas : {},

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

    gameId: raw.gameId || GAME_ID
  };
}

function getCurrentState() {
  return buildInitialState(getState());
}

function getEffectivePhases(rawState = null) {
  const source = rawState || getState();
  const stored = source?.phases && typeof source.phases === "object" ? source.phases : {};
  return Object.keys(stored).length ? stored : (gameData?.phases || {});
}

function syncGameDataFromState(rawState = null) {
  const source = rawState || getState();
  gameData.phases = clone(getEffectivePhases(source));
}

function renderHeader() {
  const title = document.querySelector(".title");
  if (title) {
    title.textContent = "Ghost of Tsushima Split Editor";
  }
}

function renderSummary(state) {
  const subtitles = document.querySelectorAll(".subtitle");
  const splitCount = state.splits?.items?.length || 0;

  if (subtitles[0]) {
    subtitles[0].textContent = `${splitCount} splits loaded. Edit names, phases, notes, and auto-progress here.`;
  }
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
    syncGameDataFromState(raw);

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

  syncGameDataFromState(getState());

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
