const STORAGE_KEY = "got_platinum_overlay_html_v6";

const COUNTER_DEFS = {
  trophies: { label: "Trophies", icon: "🏆", max: 52, act1: 0 },
  inari: { label: "Inari Shrines", icon: "🦊", max: 49, act1: 22 },
  hotsprings: { label: "Hot Springs", icon: "🍑", max: 18, act1: 9 },
  bamboo: { label: "Bamboo", icon: "🎍", max: 16, act1: 6 },
  haiku: { label: "Haiku", icon: "🎼", max: 19, act1: 8 },
  records: { label: "Records", icon: "📜", max: 20, act1: 0 },
  artifacts: { label: "Artifacts", icon: "🛡️", max: 20, act1: 0 },
  shrines: { label: "Shinto Shrines", icon: "⛩️", max: 16, act1: 7 },
  crickets: { label: "Crickets", icon: "🦗", max: 5, act1: 0 },
  hiddenaltars: { label: "Hidden Altars", icon: "🙏", max: 10, act1: 0 },
  duels: { label: "Duels", icon: "⚔️", max: 25, act1: 0 },
  territories: { label: "Mongol Territories", icon: "🏕️", max: 56, act1: 0 },
  mythictales: { label: "Mythic Tales", icon: "📘", max: 7, act1: 0 },
  sidetales: { label: "Side Tales", icon: "📝", max: 61, act1: 0 },
  monochrome: { label: "Monochrome", icon: "🎨", max: 2, act1: 0 },
  cooper: { label: "Cooper", icon: "🦝", max: 3, act1: 0 }
};

const PHASES = {
  legacy_all: {
    label: "Legacy All",
    note: "Fallback for older split files with no phase markers.",
    visible: ["trophies", "inari", "hotsprings", "bamboo", "haiku", "shrines", "records", "artifacts", "crickets", "hiddenaltars", "monochrome", "dirge", "cooper", "sidetales", "duels", "territories", "mythictales"]
  },
  any_act1: {
    label: "Any% Act 1",
    note: "Focus on Act 1 collectibles, records, artifacts, crickets, altars, and monochrome.",
    visible: ["trophies", "inari", "hotsprings", "bamboo", "haiku", "shrines", "records", "artifacts", "crickets", "hiddenaltars", "monochrome"]
  },
  any_act2: {
    label: "Any% Act 2",
    note: "Act 2 keeps the collectible focus and adds Dirge.",
    visible: ["trophies", "inari", "hotsprings", "bamboo", "haiku", "shrines", "records", "artifacts", "crickets", "hiddenaltars", "monochrome", "dirge"]
  }
};

const DEFAULT_SPLITS = [
  { id: "prologue", label: "Prologue", note: "", phaseId: "any_act1", isPhaseStart: true, auto: { trophies: 1, haiku: 1 } },
  { id: "yuna", label: "Yuna", note: "", phaseId: "", isPhaseStart: false, auto: { inari: 1, records: 1, artifacts: 1 } },
  { id: "ishikawa", label: "Ishikawa", note: "", phaseId: "", isPhaseStart: false, auto: { inari: 3, hotsprings: 2, bamboo: 1, shrines: 1, records: 1, artifacts: 1 } },
  { id: "masako", label: "Masako", note: "", phaseId: "", isPhaseStart: false, auto: { hotsprings: 1, shrines: 1 } },
  { id: "taka", label: "Taka", note: "", phaseId: "", isPhaseStart: false, auto: { inari: 1, hotsprings: 2, bamboo: 1 } },
  { id: "ronin", label: "Ronin", note: "", phaseId: "", isPhaseStart: false, auto: { inari: 1, haiku: 1, records: 1 } },
  { id: "ronin2", label: "Ronin 2", note: "", phaseId: "", isPhaseStart: false, auto: { inari: 1 } },
  { id: "komatsu", label: "Komatsu", note: "", phaseId: "", isPhaseStart: false, auto: { inari: 1, bamboo: 1, haiku: 1 } },
  { id: "hook", label: "Hook", note: "", phaseId: "", isPhaseStart: false, auto: {} },
  { id: "act1finale", label: "Act 1 Finale", note: "", phaseId: "any_act2", isPhaseStart: true, auto: { trophies: 1 } },
  { id: "act2", label: "Act 2", note: "", phaseId: "", isPhaseStart: false, auto: {} }
];

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const formatMs = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const normalizeSplit = (s) => ({ id: "", label: "", note: "", phaseId: "", isPhaseStart: false, auto: {}, ...s });
const normalizeSplits = (splits) => (Array.isArray(splits) && splits.length ? splits : DEFAULT_SPLITS).map(normalizeSplit);
const buildDefaultCounters = () => {
  const out = {};
  Object.entries(COUNTER_DEFS).forEach(([k, v]) => {
    out[k] = { ...v, value: 0, manualDelta: 0 };
  });
  return out;
};

let SPLITS = normalizeSplits(DEFAULT_SPLITS);

const state = {
  elapsedMs: 0,
  running: false,
  counters: buildDefaultCounters(),
  history: [],
  currentSplitIndex: 0,
  settings: { difficulty: "Lethal", act1TargetMinutes: 180, showSettings: false },
  miscChecks: { dirge: false },
  startTs: null,
  offsetMs: 0,
  intervalId: null
};

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
  dirgeCheckbox: document.getElementById("dirgeCheckbox")
};

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    elapsedMs: state.elapsedMs,
    counters: state.counters,
    history: state.history,
    currentSplitIndex: state.currentSplitIndex,
    settings: state.settings,
    splits: SPLITS,
    miscChecks: state.miscChecks
  }));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.elapsedMs = parsed.elapsedMs || 0;
    state.offsetMs = state.elapsedMs;
    state.counters = parsed.counters || buildDefaultCounters();
    state.history = parsed.history || [];
    state.currentSplitIndex = parsed.currentSplitIndex || 0;
    state.settings = { difficulty: "Lethal", act1TargetMinutes: 180, showSettings: false, ...(parsed.settings || {}) };
    state.miscChecks = { dirge: false, ...(parsed.miscChecks || {}) };
    SPLITS = normalizeSplits(parsed.splits);
  } catch (e) {
    console.error(e);
  }
}

function normalizeSplitIndex() {
  state.currentSplitIndex = clamp(state.currentSplitIndex, 0, Math.max(0, SPLITS.length - 1));
}

function getActivePhaseId() {
  let active = "legacy_all";
  for (let i = 0; i <= state.currentSplitIndex && i < SPLITS.length; i += 1) {
    const split = SPLITS[i];
    if (split.isPhaseStart && split.phaseId && PHASES[split.phaseId]) active = split.phaseId;
  }
  return active;
}

function computeOverallPercent() {
  const total = Object.keys(COUNTER_DEFS).reduce((sum, key) => sum + state.counters[key].value, 0) + (state.miscChecks.dirge ? 1 : 0);
  const max = Object.keys(COUNTER_DEFS).reduce((sum, key) => sum + COUNTER_DEFS[key].max, 0) + 1;
  return Math.round((total / max) * 100);
}

function computeAct1Percent() {
  const keys = Object.keys(COUNTER_DEFS).filter((key) => COUNTER_DEFS[key].act1 > 0);
  const done = keys.reduce((sum, key) => sum + Math.min(state.counters[key].value, COUNTER_DEFS[key].act1), 0);
  const max = keys.reduce((sum, key) => sum + COUNTER_DEFS[key].act1, 0);
  return Math.round((done / max) * 100);
}

function renderVisibleObjectives() {
  const phase = PHASES[getActivePhaseId()] || PHASES.legacy_all;
  els.activePhaseName.textContent = phase.label;
  els.activePhaseNote.textContent = phase.note;
  els.visibleObjectives.innerHTML = "";
  phase.visible.forEach((key) => {
    const chip = document.createElement("div");
    chip.className = "miniChip";
    chip.textContent = key === "dirge" ? "🎵 Dirge" : `${COUNTER_DEFS[key].icon} ${COUNTER_DEFS[key].label}`;
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
      <div class="counterSide"><button data-key="${key}" data-diff="-1">−</button></div>
      <div class="counterCenter">
        <div class="counterLabel">${counter.label}</div>
        <div class="counterIcon">${counter.icon}</div>
        <div class="counterAmt">${counter.value}/${counter.max}</div>
        <div class="counterPct">${percent}%</div>
      </div>
      <div class="counterSide"><button data-key="${key}" data-diff="1">+</button></div>
    `;
    els.progressGrid.appendChild(card);
  });
  els.progressGrid.querySelectorAll("button[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const diff = Number(btn.dataset.diff);
      state.counters[key].value = clamp(state.counters[key].value + diff, 0, state.counters[key].max);
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
    const marker = split.isPhaseStart && split.phaseId && PHASES[split.phaseId] ? ` | ▶ ${PHASES[split.phaseId].label}` : "";
    const autoSummary = Object.entries(split.auto || {}).map(([k, v]) => `${COUNTER_DEFS[k]?.icon || "?"}${v}`).join(" · ") || "No auto progress";
    btn.innerHTML = `<div>${done ? "✅" : active ? "▶️" : "•"}</div><div><div>${split.label}</div><div class="splitSub">${autoSummary}${marker}</div></div><div>›</div>`;
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
  state.history.forEach((r) => {
    const row = document.createElement("div");
    row.className = "historyRow";
    row.innerHTML = `<div>${r.label}</div><div class="mono green">${formatMs(r.cumulativeMs)}</div><div class="mono">${formatMs(r.segmentMs)}</div>`;
    els.historyList.appendChild(row);
  });
}

function render() {
  normalizeSplitIndex();
  const current = SPLITS[state.currentSplitIndex] || SPLITS[SPLITS.length - 1];
  const overall = computeOverallPercent();
  const act1 = computeAct1Percent();
  const quota = ["inari", "hotsprings", "bamboo", "haiku", "shrines"].map((key) => `${Math.min(state.counters[key].value, COUNTER_DEFS[key].act1)}/${COUNTER_DEFS[key].act1} ${COUNTER_DEFS[key].icon}`).join(" · ");
  const diff = state.elapsedMs - state.settings.act1TargetMinutes * 60 * 1000;
  const pace = state.elapsedMs === 0 ? "On fresh air" : Math.abs(diff) < 60000 ? "On pace" : diff < 0 ? `${formatMs(Math.abs(diff))} ahead` : `${formatMs(diff)} behind`;

  els.difficultyBadge.textContent = state.settings.difficulty;
  els.difficultyBadge.className = `badge ${state.settings.difficulty === "Lethal" ? "lethal" : "easy"}`;
  els.timer.textContent = formatMs(state.elapsedMs);
  els.startPauseBtn.textContent = state.running ? "⏸ Pause" : "▶ Start";
  els.undoBtn.disabled = !state.history.length;
  els.currentSplitLabel.textContent = current.label;
  els.historyCount.textContent = `${state.history.length} splits logged`;
  els.overallPercent.textContent = `${overall}%`;
  els.overallBar.style.width = `${overall}%`;
  els.act1SummaryValue.textContent = `${act1}%`;
  els.act1SummaryBar.style.width = `${act1}%`;
  els.settingsToggle.textContent = state.settings.showSettings ? "⚙ Hide Settings" : "⚙ Show Settings";
  els.settingsPanel.classList.toggle("open", state.settings.showSettings);
  els.difficultySelect.value = state.settings.difficulty;
  els.act1TargetMinutes.value = state.settings.act1TargetMinutes;
  els.runTitle.textContent = `Ghost of Tsushima Platinum ${state.settings.difficulty}`;
  els.pacePill.textContent = pace;
  els.modePill.textContent = state.settings.difficulty;
  els.act1QuotaText.textContent = quota;
  els.dirgeCheckbox.checked = !!state.miscChecks.dirge;
  els.currentObjectiveText.textContent = current.note?.trim() || "No note for this split yet.";

  renderVisibleObjectives();
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
  Object.entries(split.auto || {}).forEach(([key, value]) => {
    state.counters[key].value = clamp(state.counters[key].value + value, 0, state.counters[key].max);
  });
  state.history.push({
    splitIndex: index,
    label: split.label,
    cumulativeMs: state.elapsedMs,
    segmentMs
  });
  state.currentSplitIndex = clamp(state.currentSplitIndex + 1, 0, SPLITS.length - 1);
  render();
  save();
}

function undoSplit() {
  if (!state.history.length) return;
  const removed = state.history.pop();
  const split = SPLITS[removed.splitIndex];
  Object.entries(split.auto || {}).forEach(([key, value]) => {
    state.counters[key].value = clamp(state.counters[key].value - value, 0, state.counters[key].max);
  });
  state.currentSplitIndex = removed.splitIndex;
  render();
  save();
}

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
els.dirgeCheckbox.addEventListener("change", (e) => {
  state.miscChecks.dirge = e.target.checked;
  render();
  save();
});
els.resetBtn.addEventListener("click", () => {
  if (state.intervalId) clearInterval(state.intervalId);
  state.elapsedMs = 0;
  state.running = false;
  state.offsetMs = 0;
  state.startTs = null;
  state.intervalId = null;
  state.counters = buildDefaultCounters();
  state.history = [];
  state.currentSplitIndex = 0;
  state.settings = { ...state.settings, difficulty: "Lethal", act1TargetMinutes: 180, showSettings: false };
  state.miscChecks = { dirge: false };
  SPLITS = normalizeSplits(DEFAULT_SPLITS);
  render();
  save();
});

load();
render();
  </script>
</body>
</html>
