import {
  STORAGE_KEY,
  COUNTER_DEFS,
  PHASES,
  buildDefaultCounters,
  normalizeSplits,
  computeOverallPercent,
  computeAct1Percent,
  getAct1QuotaText,
  getActivePhaseId,
  applyAutoProgress,
  clamp,
  formatMs,
  exportJson
} from "./data.js";
import { createSplitEditor } from "./split-editor.js";

const state = {
  elapsedMs: 0,
  running: false,
  counters: buildDefaultCounters(),
  history: [],
  currentSplitIndex: 0,
  settings: {
    difficulty: "Lethal",
    act1TargetMinutes: 180,
    showSettings: false
  },
  remoteCode: "",
  offsetMs: 0,
  startTs: null,
  intervalId: null,
  miscChecks: { dirge: false }
};

let SPLITS = [];

const els = {
  difficultyBadge: document.getElementById("difficultyBadge"),
  timer: document.getElementById("timer"),
  startPauseBtn: document.getElementById("startPauseBtn"),
  undoBtn: document.getElementById("undoBtn"),
  advanceCurrentBtn: document.getElementById("advanceCurrentBtn"),
  overallPercent: document.getElementById("overallPercent"),
  overallBar: document.getElementById("overallBar"),
  act1SummaryValue: document.getElementById("act1SummaryValue"),
  act1SummaryBar: document.getElementById("act1SummaryBar"),
  currentSplitLabel: document.getElementById("currentSplitLabel"),
  historyCount: document.getElementById("historyCount"),
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
  runTitle: document.getElementById("runTitle"),
  pacePill: document.getElementById("pacePill"),
  modePill: document.getElementById("modePill"),
  act1QuotaText: document.getElementById("act1QuotaText"),
  progressGrid: document.getElementById("progressGrid"),
  splitButtons: document.getElementById("splitButtons"),
  queuePill: document.getElementById("queuePill"),
  historySaved: document.getElementById("historySaved"),
  historyList: document.getElementById("historyList"),
  currentObjectiveText: document.getElementById("currentObjectiveText"),
  activePhaseName: document.getElementById("activePhaseName"),
  activePhaseNote: document.getElementById("activePhaseNote"),
  visibleObjectives: document.getElementById("visibleObjectives"),
  splitEditorOverlay: document.getElementById("splitEditorOverlay"),
  splitEditorGrid: document.getElementById("splitEditorGrid"),
  addSplitEditorBtn: document.getElementById("addSplitEditorBtn"),
  downloadSplitBackupBtn: document.getElementById("downloadSplitBackupBtn"),
  copySplitBackupBtn: document.getElementById("copySplitBackupBtn"),
  resetSplitEditorBtn: document.getElementById("resetSplitEditorBtn"),
  closeSplitEditorBtn: document.getElementById("closeSplitEditorBtn"),
  saveSplitEditorBtn: document.getElementById("saveSplitEditorBtn"),
  dirgeCheckbox: document.getElementById("dirgeCheckbox")
};

let splitEditor = null;

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      elapsedMs: state.elapsedMs,
      counters: state.counters,
      history: state.history,
      currentSplitIndex: state.currentSplitIndex,
      settings: state.settings,
      remoteCode: state.remoteCode,
      splits: SPLITS,
      miscChecks: state.miscChecks
    })
  );
}

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.elapsedMs = parsed.elapsedMs || 0;
    state.offsetMs = state.elapsedMs;
    state.counters = parsed.counters || buildDefaultCounters();
    state.history = parsed.history || [];
    state.currentSplitIndex = parsed.currentSplitIndex || 0;
    state.settings = {
      difficulty: "Lethal",
      act1TargetMinutes: 180,
      showSettings: false,
      ...(parsed.settings || {})
    };
    state.remoteCode = parsed.remoteCode || "";
    state.miscChecks = { dirge: false, ...(parsed.miscChecks || {}) };
    if (parsed.splits?.length) {
      SPLITS = normalizeSplits(parsed.splits, SPLITS);
    }
  } catch (e) {
    console.error("Failed to load local state", e);
  }
}

function normalizeSplitIndex() {
  state.currentSplitIndex = clamp(state.currentSplitIndex, 0, Math.max(0, SPLITS.length - 1));
}

function renderVisibleObjectives(phaseId) {
  const phase = PHASES[phaseId] || PHASES.legacy_all;
  els.activePhaseName.textContent = phase.label;
  els.activePhaseNote.textContent = phase.note || "No phase note.";
  els.visibleObjectives.innerHTML = "";

  phase.visible.forEach((key) => {
    const chip = document.createElement("div");
    chip.className = "miniChip";
    if (key === "dirge") chip.textContent = "🎵 Dirge";
    else if (COUNTER_DEFS[key]) chip.textContent = `${COUNTER_DEFS[key].icon} ${COUNTER_DEFS[key].label}`;
    else return;
    els.visibleObjectives.appendChild(chip);
  });
}

function renderCounters() {
  els.progressGrid.innerHTML = "";
  Object.entries(state.counters).forEach(([key, counter]) => {
    const percent = Math.round((counter.value / counter.max) * 100);
    const card = document.createElement("div");
    card.className = "counter";
    card.innerHTML = `
      <div class="counterSide"><button data-key="${key}" data-diff="-1" aria-label="Decrease ${counter.label}">−</button></div>
      <div class="counterCenter">
        <div class="counterLabel">${counter.label}</div>
        <div class="counterIcon">${counter.icon}</div>
        <div class="counterAmt">${counter.value}/${counter.max}</div>
        <div class="counterPct">${percent}%</div>
        ${counter.manualDelta !== 0 ? `<span class="manual">${counter.manualDelta > 0 ? "+" : ""}${counter.manualDelta} manual</span>` : ""}
      </div>
      <div class="counterSide"><button data-key="${key}" data-diff="1" aria-label="Increase ${counter.label}">+</button></div>
    `;
    els.progressGrid.appendChild(card);
  });

  els.progressGrid.querySelectorAll("button[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const diff = Number(btn.dataset.diff);
      state.counters[key].value = clamp(state.counters[key].value + diff, 0, state.counters[key].max);
      state.counters[key].manualDelta += diff;
      render();
      save();
    });
  });
}

function renderSplits() {
  els.splitButtons.innerHTML = "";
  els.queuePill.textContent = `${SPLITS.length} total splits`;

  SPLITS.forEach((split, i) => {
    const done = i < state.currentSplitIndex;
    const active = i === state.currentSplitIndex;
    const btn = document.createElement("button");
    btn.className = `split ${done ? "done" : ""} ${active ? "active" : ""}`;
    btn.disabled = !active;

    const marker =
      split.isPhaseStart && split.phaseId && PHASES[split.phaseId]
        ? ` | ▶ ${PHASES[split.phaseId].label}`
        : "";

    const autoSummary =
      Object.entries(split.auto || {})
        .map(([k, v]) => `${COUNTER_DEFS[k]?.icon || "?"}${v}`)
        .join(" · ") || "No auto progress";

    btn.innerHTML = `
      <div>${done ? "✅" : active ? "▶️" : "•"}</div>
      <div>
        <div>${split.label}</div>
        <div class="splitSub">${autoSummary}${marker}</div>
      </div>
      <div>›</div>
    `;

    btn.addEventListener("click", () => goSplit(i));
    els.splitButtons.appendChild(btn);
  });
}

function renderHistory() {
  els.historySaved.textContent = `${state.history.length} saved`;
  els.historyList.innerHTML = "";

  if (!state.history.length) {
    const row = document.createElement("div");
    row.className = "historyRow";
    row.innerHTML = "<div>No splits yet</div><div></div><div></div>";
    els.historyList.appendChild(row);
    return;
  }

  state.history.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "historyRow";
    row.innerHTML = `
      <div>${entry.label}</div>
      <div class="mono green">${formatMs(entry.cumulativeMs)}</div>
      <div class="mono">${formatMs(entry.segmentMs)}</div>
    `;
    els.historyList.appendChild(row);
  });
}

function render() {
  normalizeSplitIndex();

  const current =
    SPLITS[state.currentSplitIndex] || SPLITS[SPLITS.length - 1] || { label: "No splits", note: "" };

  const overall = computeOverallPercent(state.counters, state.miscChecks);
  const act1 = computeAct1Percent(state.counters);
  const quota = getAct1QuotaText(state.counters);
  const diff = state.elapsedMs - state.settings.act1TargetMinutes * 60 * 1000;
  const pace =
    state.elapsedMs === 0
      ? "On fresh air"
      : Math.abs(diff) < 60000
      ? "On pace"
      : diff < 0
      ? `${formatMs(Math.abs(diff))} ahead`
      : `${formatMs(diff)} behind`;

  const phaseId = getActivePhaseId(SPLITS, state.currentSplitIndex);

  els.difficultyBadge.textContent = state.settings.difficulty;
  els.difficultyBadge.className = `badge ${state.settings.difficulty === "Lethal" ? "lethal" : "easy"}`;
  els.dirgeCheckbox.checked = !!state.miscChecks.dirge;
  els.currentObjectiveText.textContent = current.note?.trim() || "No note for this split yet.";
  els.timer.textContent = formatMs(state.elapsedMs);
  els.startPauseBtn.textContent = state.running ? "⏸ Pause" : "▶ Start";
  els.undoBtn.disabled = !state.history.length;
  els.advanceCurrentBtn.disabled = !SPLITS.length;
  els.currentSplitLabel.textContent = current.label;
  els.historyCount.textContent = `${state.history.length} split${state.history.length === 1 ? "" : "s"} logged`;
  els.overallPercent.textContent = `${overall}%`;
  els.overallBar.style.width = `${overall}%`;
  els.act1SummaryValue.textContent = `${act1}%`;
  els.act1SummaryBar.style.width = `${act1}%`;
  els.settingsToggle.textContent = state.settings.showSettings ? "⚙ Hide Settings" : "⚙ Show Settings";
  els.settingsPanel.classList.toggle("open", state.settings.showSettings);
  els.difficultySelect.value = state.settings.difficulty;
  els.act1TargetMinutes.value = state.settings.act1TargetMinutes;
  els.remoteCode.value = state.remoteCode;
  els.runTitle.textContent = `Ghost of Tsushima Platinum ${state.settings.difficulty}`;
  els.pacePill.textContent = pace;
  els.modePill.textContent = state.settings.difficulty;
  els.act1QuotaText.textContent = quota;

  renderVisibleObjectives(phaseId);
  renderCounters();
  renderSplits();
  renderHistory();
}

function toggleTimer() {
  if (state.running) {
    state.offsetMs = state.elapsedMs;
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.running = false;
  } else {
    state.startTs = Date.now() - state.offsetMs;
    state.intervalId = setInterval(() => {
      state.elapsedMs = Date.now() - state.startTs;
      render();
      save();
    }, 250);
    state.running = true;
  }
  render();
  save();
}

function goSplit(index) {
  if (index !== state.currentSplitIndex) return;
  const split = SPLITS[index];
  const last = state.history.length ? state.history[state.history.length - 1].cumulativeMs : 0;
  const segmentMs = Math.max(0, state.elapsedMs - last);

  state.counters = applyAutoProgress(state.counters, split.auto, 1);
  state.history.push({
    splitIndex: index,
    label: split.label,
    cumulativeMs: state.elapsedMs,
    segmentMs,
    autoApplied: split.auto,
    at: new Date().toISOString()
  });

  state.currentSplitIndex = clamp(state.currentSplitIndex + 1, 0, SPLITS.length - 1);
  render();
  save();
}

function undoSplit() {
  if (!state.history.length) return;
  const removed = state.history.pop();
  state.counters = applyAutoProgress(state.counters, removed.autoApplied, -1);
  state.currentSplitIndex = removed.splitIndex;
  render();
  save();
}

function resetRun() {
  if (state.intervalId) clearInterval(state.intervalId);
  state.elapsedMs = 0;
  state.running = false;
  state.offsetMs = 0;
  state.startTs = null;
  state.intervalId = null;
  state.counters = buildDefaultCounters();
  state.history = [];
  state.currentSplitIndex = 0;
  render();
  save();
}

function importTimesJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (state.intervalId) clearInterval(state.intervalId);
      state.elapsedMs = parsed.elapsedMs || 0;
      state.offsetMs = state.elapsedMs;
      state.running = false;
      state.startTs = null;
      state.intervalId = null;
      state.counters = parsed.counters || buildDefaultCounters();
      state.history = parsed.history || [];
      state.currentSplitIndex = parsed.currentSplitIndex || 0;
      state.miscChecks = { dirge: false, ...(parsed.miscChecks || {}) };
      normalizeSplitIndex();
      render();
      save();
    } catch {
      alert("Could not import times JSON");
    }
  };
  reader.readAsText(file);
}

function importSplitsJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = Array.isArray(parsed) ? parsed : parsed.splits;
      if (!Array.isArray(imported) || !imported.length) throw new Error("Invalid splits payload");
      SPLITS = normalizeSplits(imported, SPLITS);
      normalizeSplitIndex();
      render();
      save();
    } catch {
      alert("Could not import splits JSON");
    }
  };
  reader.readAsText(file);
}

function wireEditor() {
  splitEditor = createSplitEditor({
    overlayEl: els.splitEditorOverlay,
    gridEl: els.splitEditorGrid,
    addBtn: els.addSplitEditorBtn,
    resetBtn: els.resetSplitEditorBtn,
    closeBtn: els.closeSplitEditorBtn,
    saveBtn: els.saveSplitEditorBtn,
    downloadBtn: els.downloadSplitBackupBtn,
    copyBtn: els.copySplitBackupBtn,
    getSplits: () => SPLITS,
    setSplits: (nextSplits) => {
      SPLITS = normalizeSplits(nextSplits, SPLITS);
    },
    onAfterSave: () => {
      normalizeSplitIndex();
      render();
      save();
    }
  });
}

async function init() {
  const [phasesRes, splitsRes] = await Promise.all([
    fetch("./data/ghost-of-tsushima/phases.json"),
    fetch("./data/ghost-of-tsushima/default-splits.json")
  ]);

  const phasesJson = await phasesRes.json();
  const splitsJson = await splitsRes.json();

  const importedPhases = phasesJson?.phases || {};
  Object.assign(PHASES, importedPhases);

  SPLITS = normalizeSplits(
    Array.isArray(splitsJson) ? splitsJson : (splitsJson.splits || []),
    SPLITS
  );

  loadLocalState();
  wireEditor();

  els.startPauseBtn.addEventListener("click", toggleTimer);
  els.undoBtn.addEventListener("click", undoSplit);
  els.advanceCurrentBtn.addEventListener("click", () => goSplit(state.currentSplitIndex));
  els.settingsToggle.addEventListener("click", () => {
    state.settings.showSettings = !state.settings.showSettings;
    render();
    save();
  });
  els.difficultySelect.addEventListener("change", (e) => {
    state.settings.difficulty = e.target.value;
    render();
    save();
  });
  els.act1TargetMinutes.addEventListener("input", (e) => {
    state.settings.act1TargetMinutes = Number(e.target.value || 0);
    render();
    save();
  });
  els.remoteCode.addEventListener("input", (e) => {
    state.remoteCode = e.target.value;
    save();
  });
  els.dirgeCheckbox.addEventListener("change", (e) => {
    state.miscChecks.dirge = e.target.checked;
    render();
    save();
  });
  els.openSplitEditorBtn.addEventListener("click", () => splitEditor.open());
  els.exportTimesBtn.addEventListener("click", () =>
    exportJson(
      {
        elapsedMs: state.elapsedMs,
        currentSplitIndex: state.currentSplitIndex,
        history: state.history,
        counters: state.counters,
        miscChecks: state.miscChecks,
        splitNames: SPLITS.map((s) => s.label)
      },
      "got-times"
    )
  );
  els.importTimesInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importTimesJson(file);
    e.target.value = "";
  });
  els.exportSplitsBtn.addEventListener("click", () =>
    exportJson(
      {
        splits: SPLITS,
        exportedAt: new Date().toISOString(),
        source: "manual-split-export"
      },
      "got-splits"
    )
  );
  els.importSplitsInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importSplitsJson(file);
    e.target.value = "";
  });
  els.resetBtn.addEventListener("click", resetRun);

  render();
}

init().catch((err) => {
  console.error("Init failed", err);
  alert("Failed to load controller JSON files.");
});
