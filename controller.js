const STORAGE_KEY = "platinumrouter_state_v1";
const SPLITS_STORAGE_KEY = "platinumrouter_splits_v1";
const PHASES_STORAGE_KEY = "platinumrouter_phases_v1";
const QUOTAS_STORAGE_KEY = "platinumrouter_quotas_v1";
const COUNTERS_STORAGE_KEY = "platinumrouter_counters_v1";

const COUNTERS_URL = "./data/ghost-of-tsushima/counters.json";
const PHASES_URL = "./data/ghost-of-tsushima/phases.json";
const QUOTAS_URL = "./data/ghost-of-tsushima/quotas.json";
const SPLITS_URL = "./data/ghost-of-tsushima/default-splits.json";

const FALLBACK_SPLITS = [
  { id: "start", label: "Start Run", note: "Boot sequence.", phaseId: "any_act1", isPhaseStart: true, auto: {} },
  { id: "act1-route", label: "Act 1 Route", note: "Act 1 progression and early cleanup.", auto: {} },
  { id: "act2-start", label: "Act 2 Start", note: "Transition into Act 2.", phaseId: "any_act2", isPhaseStart: true, auto: {} },
  { id: "act2-route", label: "Act 2 Route", note: "Continue route.", auto: {} },
  { id: "act3-start", label: "Act 3 Start", note: "Transition into Act 3.", phaseId: "any_act3", isPhaseStart: true, auto: {} },
  { id: "ngp-start", label: "NG+ Start", note: "Cleanup route.", phaseId: "ngp_act1", isPhaseStart: true, auto: {} }
];

const DEFAULT_STATE = {
  difficulty: "Lethal",
  actTargetMinutes: 480,
  remoteCode: "",
  elapsedMs: 0,
  timerRunning: false,
  timerStartedAt: null,
  currentSplitIndex: 0,
  splitHistory: [],
  counts: {},
  dirgeChecked: false,
  logs: [],
  debugVisible: false
};

let state = { ...DEFAULT_STATE };
let counters = {};
let phases = {};
let quotas = { quotas: {} };
let splits = [...FALLBACK_SPLITS];

function $(id) {
  return document.getElementById(id);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function loadLocalJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function fetchJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addLog(message) {
  const stamp = new Date().toLocaleTimeString();
  state.logs.unshift(`[${stamp}] ${message}`);
  state.logs = state.logs.slice(0, 80);
  saveState();
}

function setStatus(message) {
  $("statusText").textContent = message;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncOverlayState();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    state = { ...DEFAULT_STATE };
  }
}

function buildInitialCounts() {
  const next = {};
  for (const [key] of Object.entries(counters)) {
    next[key] = Number(state.counts?.[key] || 0);
  }
  state.counts = next;
}

function getCurrentSplit() {
  return splits[state.currentSplitIndex] || null;
}

function getCompletedSplitCount() {
  return state.currentSplitIndex;
}

function getActivePhaseId() {
  let active = "legacy_all";

  for (let i = 0; i <= state.currentSplitIndex && i < splits.length; i += 1) {
    const split = splits[i];
    if (split?.isPhaseStart && split.phaseId && phases[split.phaseId]) {
      active = split.phaseId;
    }
  }

  return active;
}

function getActivePhase() {
  const id = getActivePhaseId();
  return { id, ...(phases[id] || { label: id, visible: [] }) };
}

function getVisibleCounterKeys() {
  const phase = getActivePhase();
  const visible = Array.isArray(phase.visible) ? phase.visible : [];
  return visible.filter((key) => counters[key]);
}

function getCurrentQuotaTargets() {
  const phaseId = getActivePhaseId();
  return quotas?.quotas?.[phaseId]?.targets || {};
}

function computeOverallProgressPct() {
  const trophiesMax = Number(counters?.trophies?.max || 0);
  const trophiesCurrent = Number(state.counts?.trophies || 0);

  if (trophiesMax > 0) {
    return clamp((trophiesCurrent / trophiesMax) * 100, 0, 100);
  }

  let total = 0;
  let max = 0;
  for (const [key, meta] of Object.entries(counters)) {
    const localMax = Number(meta?.max || 0);
    if (localMax <= 0) continue;
    total += Number(state.counts[key] || 0);
    max += localMax;
  }

  if (!max) return 0;
  return clamp((total / max) * 100, 0, 100);
}

function computeQuotaProgressPct() {
  const targets = getCurrentQuotaTargets();
  const keys = Object.keys(targets);

  if (!keys.length) return 0;

  let current = 0;
  let max = 0;

  for (const key of keys) {
    const target = Number(targets[key] || 0);
    if (target <= 0) continue;
    current += clamp(Number(state.counts[key] || 0), 0, target);
    max += target;
  }

  if (!max) return 0;
  return clamp((current / max) * 100, 0, 100);
}

function computePaceText() {
  const targetMinutes = Number(state.actTargetMinutes || 0);
  if (targetMinutes <= 0) return "No act target set";

  const targetMs = targetMinutes * 60 * 1000;
  const diff = targetMs - Number(state.elapsedMs || 0);

  if (diff >= 0) {
    return `${formatMs(diff)} ahead`;
  }
  return `${formatMs(Math.abs(diff))} behind`;
}

function applyAutoCounts(auto, multiplier = 1) {
  if (!auto || typeof auto !== "object") return;

  for (const [key, amount] of Object.entries(auto)) {
    if (!(key in state.counts)) {
      state.counts[key] = 0;
    }

    const max = Number(counters?.[key]?.max ?? Infinity);
    const next = Number(state.counts[key] || 0) + Number(amount || 0) * multiplier;
    state.counts[key] = clamp(next, 0, Number.isFinite(max) ? max : Infinity);
  }
}

function completeCurrentSplit() {
  const split = getCurrentSplit();
  if (!split) {
    setStatus("Run complete. No more splits.");
    return;
  }

  applyAutoCounts(split.auto, 1);

  state.splitHistory.push({
    id: split.id,
    label: split.label,
    note: split.note || "",
    auto: deepClone(split.auto || {}),
    elapsedMs: state.elapsedMs
  });

  state.currentSplitIndex += 1;
  addLog(`Completed split: ${split.label}`);
  setStatus(`Completed split: ${split.label}`);
  saveState();
  render();
}

function undoSplit() {
  if (!state.splitHistory.length || state.currentSplitIndex <= 0) {
    setStatus("Nothing to undo.");
    return;
  }

  const last = state.splitHistory.pop();
  applyAutoCounts(last.auto, -1);
  state.currentSplitIndex = Math.max(0, state.currentSplitIndex - 1);

  addLog(`Undid split: ${last.label}`);
  setStatus(`Undid split: ${last.label}`);
  saveState();
  render();
}

function updateTimer() {
  if (state.timerRunning && state.timerStartedAt) {
    state.elapsedMs = Date.now() - state.timerStartedAt;
    syncOverlayState();
    renderTimerOnly();
  }
  requestAnimationFrame(updateTimer);
}

function startPauseTimer() {
  if (state.timerRunning) {
    state.timerRunning = false;
    state.elapsedMs = Date.now() - state.timerStartedAt;
    state.timerStartedAt = null;
    addLog("Timer paused.");
    setStatus("Timer paused.");
  } else {
    state.timerRunning = true;
    state.timerStartedAt = Date.now() - Number(state.elapsedMs || 0);
    addLog("Timer started.");
    setStatus("Timer started.");
  }
  saveState();
  render();
}

function renderTimerOnly() {
  $("timerDisplay").textContent = formatMs(state.elapsedMs);
}

function renderTop() {
  const currentSplit = getCurrentSplit();
  const activePhase = getActivePhase();
  const overallPct = Math.round(computeOverallProgressPct());
  const quotaPct = Math.round(computeQuotaProgressPct());

  $("timerDisplay").textContent = formatMs(state.elapsedMs);
  $("currentSplitLabel").textContent = currentSplit ? currentSplit.label : "Run complete";
  $("splitCountLabel").textContent = `${getCompletedSplitCount()} splits logged`;
  $("runDifficultyInline").textContent = state.difficulty;
  $("difficultyBadge").textContent = state.difficulty;
  $("activePhaseBadge").textContent = activePhase.label || activePhase.id;
  $("overallPct").textContent = `${overallPct}%`;
  $("quotaPct").textContent = `${quotaPct}%`;
  $("overallPctBar").style.width = `${overallPct}%`;
  $("quotaPctBar").style.width = `${quotaPct}%`;
  $("paceText").textContent = computePaceText();
  $("startPauseBtn").textContent = state.timerRunning ? "⏸ Pause" : "▶ Start";
}

function renderSettings() {
  $("difficultySelect").value = state.difficulty;
  $("actTargetMinutesInput").value = state.actTargetMinutes;
  $("remoteCodeInput").value = state.remoteCode;
  $("dirgeCheckbox").checked = !!state.dirgeChecked;
}

function renderLogs() {
  $("logsText").textContent = state.logs.length ? state.logs.join("\n") : "No logs yet.";
}

function renderPhaseInfo() {
  const activePhase = getActivePhase();
  const note = activePhase.note || "No phase note.";
  $("activePhaseLabel").textContent = activePhase.label || activePhase.id;
  $("phaseNoteText").textContent = note;

  const currentSplit = getCurrentSplit();
  $("currentObjectiveNote").textContent = currentSplit?.note || "No note for this split yet.";
}

function renderQuotaBox() {
  const targets = getCurrentQuotaTargets();
  const keys = Object.keys(targets);

  if (!keys.length) {
    $("phaseQuotaBox").textContent = "No quota targets for this phase";
    return;
  }

  const lines = keys.map((key) => {
    const label = counters[key]?.label || key;
    const current = Number(state.counts[key] || 0);
    const target = Number(targets[key] || 0);
    return `${label}: ${current}/${target}`;
  });

  $("phaseQuotaBox").textContent = lines.join("\n");
}

function createCounterCard(key) {
  const meta = counters[key];
  const card = document.createElement("div");
  card.className = "counter-card";

  const top = document.createElement("div");
  top.className = "counter-top";

  const label = document.createElement("div");
  label.className = "counter-label";

  const icon = document.createElement("span");
  icon.textContent = meta.icon || "";

  const name = document.createElement("span");
  name.className = "counter-name";
  name.textContent = meta.label || key;

  const value = document.createElement("span");
  value.className = "counter-value";
  value.textContent = `${Number(state.counts[key] || 0)}/${Number(meta.max || 0)}`;

  label.appendChild(icon);
  label.appendChild(name);
  top.appendChild(label);
  top.appendChild(value);

  const controls = document.createElement("div");
  controls.className = "counter-controls";

  const minus = document.createElement("button");
  minus.className = "btn";
  minus.type = "button";
  minus.textContent = "−";
  minus.addEventListener("click", () => {
    state.counts[key] = clamp(Number(state.counts[key] || 0) - 1, 0, Number(meta.max || 0));
    saveState();
    render();
  });

  const plus = document.createElement("button");
  plus.className = "btn";
  plus.type = "button";
  plus.textContent = "+";
  plus.addEventListener("click", () => {
    state.counts[key] = clamp(Number(state.counts[key] || 0) + 1, 0, Number(meta.max || 0));
    saveState();
    render();
  });

  controls.appendChild(minus);
  controls.appendChild(plus);

  card.appendChild(top);
  card.appendChild(controls);
  return card;
}

function renderTrackedTotals() {
  const grid = $("trackedTotalsGrid");
  grid.innerHTML = "";

  const keys = getVisibleCounterKeys();
  if (!keys.length) {
    grid.textContent = "No visible objectives.";
    return;
  }

  for (const key of keys) {
    grid.appendChild(createCounterCard(key));
  }
}

function renderSplitQueue() {
  const queue = $("splitQueue");
  queue.innerHTML = "";
  $("splitQueueCount").textContent = `${splits.length} total splits`;

  if (!splits.length) {
    queue.textContent = "No splits loaded.";
    return;
  }

  splits.forEach((split, index) => {
    const card = document.createElement("div");
    card.className = "split-card";
    if (index === state.currentSplitIndex) card.classList.add("current");
    if (index < state.currentSplitIndex) card.classList.add("done");

    const title = document.createElement("div");
    title.className = "split-title";
    title.textContent = split.label || split.id || `Split ${index + 1}`;

    const meta = document.createElement("div");
    meta.className = "split-meta";
    meta.textContent = [
      split.phaseId ? `Phase: ${split.phaseId}` : null,
      split.note || null
    ].filter(Boolean).join(" • ") || "No extra info.";

    card.appendChild(title);
    card.appendChild(meta);
    queue.appendChild(card);
  });
}

function renderSplitHistory() {
  const box = $("splitHistory");
  box.innerHTML = "";
  $("historyCount").textContent = `${state.splitHistory.length} saved`;

  if (!state.splitHistory.length) {
    box.textContent = "No split history yet.";
    return;
  }

  [...state.splitHistory].reverse().forEach((entry) => {
    const card = document.createElement("div");
    card.className = "split-card";

    const title = document.createElement("div");
    title.className = "split-title";
    title.textContent = entry.label;

    const meta = document.createElement("div");
    meta.className = "split-meta";
    meta.textContent = `${formatMs(entry.elapsedMs)}${entry.note ? ` • ${entry.note}` : ""}`;

    card.appendChild(title);
    card.appendChild(meta);
    box.appendChild(card);
  });
}

function syncOverlayState() {
  const activePhase = getActivePhase();
  const overlayState = {
    difficulty: state.difficulty,
    elapsedMs: state.elapsedMs,
    counts: state.counts,
    counters,
    phases,
    quotas,
    activePhaseId: activePhase.id,
    visibleCounters: getVisibleCounterKeys(),
    dirgeChecked: state.dirgeChecked,
    currentSplitIndex: state.currentSplitIndex
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, ...overlayState }));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function readUploadedJson(file) {
  const text = await file.text();
  return JSON.parse(text);
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function renderEditors() {
  $("splitEditorTextarea").value = JSON.stringify(splits, null, 2);
  $("actsEditorPhasesTextarea").value = JSON.stringify(phases, null, 2);
  $("actsEditorQuotasTextarea").value = JSON.stringify(quotas, null, 2);
}

function attachEvents() {
  $("startPauseBtn").addEventListener("click", startPauseTimer);
  $("undoBtn").addEventListener("click", undoSplit);
  $("completeSplitBtn").addEventListener("click", completeCurrentSplit);

  $("toggleSettingsBtn").addEventListener("click", () => {
    $("settingsPanel").classList.toggle("hidden");
  });

  $("difficultySelect").addEventListener("change", (e) => {
    state.difficulty = e.target.value;
    saveState();
    render();
  });

  $("actTargetMinutesInput").addEventListener("change", (e) => {
    state.actTargetMinutes = Number(e.target.value || 0);
    saveState();
    render();
  });

  $("remoteCodeInput").addEventListener("input", (e) => {
    state.remoteCode = e.target.value;
    saveState();
  });

  $("dirgeCheckbox").addEventListener("change", (e) => {
    state.dirgeChecked = !!e.target.checked;
    saveState();
    render();
  });

  $("clearLogsBtn").addEventListener("click", () => {
    state.logs = [];
    saveState();
    render();
  });

  $("copySnapshotBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify({ state, counters, phases, quotas, splits }, null, 2));
    setStatus("Snapshot copied.");
  });

  $("toggleDebugBtn").addEventListener("click", () => {
    state.debugVisible = !state.debugVisible;
    addLog(`Debug ${state.debugVisible ? "enabled" : "disabled"}.`);
    saveState();
    render();
  });

  $("resetRunBtn").addEventListener("click", () => {
    if (!confirm("Reset timer, history, and counters?")) return;
    const difficulty = state.difficulty;
    const actTargetMinutes = state.actTargetMinutes;
    const remoteCode = state.remoteCode;
    state = { ...DEFAULT_STATE, difficulty, actTargetMinutes, remoteCode };
    buildInitialCounts();
    addLog("Run reset.");
    saveState();
    render();
  });

  $("downloadTimesBtn").addEventListener("click", () => {
    downloadJson("times.json", {
      elapsedMs: state.elapsedMs,
      splitHistory: state.splitHistory,
      counts: state.counts,
      dirgeChecked: state.dirgeChecked
    });
  });

  $("uploadTimesBtn").addEventListener("click", () => $("timesUploadInput").click());
  $("downloadSplitsBtn").addEventListener("click", () => downloadJson("splits.json", splits));
  $("uploadSplitsBtn").addEventListener("click", () => $("splitsUploadInput").click());

  $("timesUploadInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readUploadedJson(file);
      state.elapsedMs = Number(data.elapsedMs || 0);
      state.splitHistory = Array.isArray(data.splitHistory) ? data.splitHistory : [];
      state.counts = typeof data.counts === "object" ? data.counts : state.counts;
      state.dirgeChecked = !!data.dirgeChecked;
      state.currentSplitIndex = state.splitHistory.length;
      saveState();
      render();
      setStatus("Times imported.");
    } catch {
      setStatus("Failed to import times.");
    }
    e.target.value = "";
  });

  $("splitsUploadInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readUploadedJson(file);
      if (!Array.isArray(data)) throw new Error();
      splits = data;
      saveLocalJson(SPLITS_STORAGE_KEY, splits);
      renderEditors();
      saveState();
      render();
      setStatus("Splits imported.");
    } catch {
      setStatus("Failed to import splits.");
    }
    e.target.value = "";
  });

  $("openSplitEditorBtn").addEventListener("click", () => {
    renderEditors();
    openModal("splitEditorModal");
  });

  $("closeSplitEditorBtn").addEventListener("click", () => closeModal("splitEditorModal"));
  $("downloadSplitBackupBtn").addEventListener("click", () => downloadJson("split-backup.json", splits));

  $("copySplitBackupBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(splits, null, 2));
    setStatus("Split backup copied.");
  });

  $("resetSplitEditorBtn").addEventListener("click", () => {
    $("splitEditorTextarea").value = JSON.stringify(loadLocalJson(SPLITS_STORAGE_KEY, splits), null, 2);
  });

  $("addSplitBtn").addEventListener("click", () => {
    const current = safeParse($("splitEditorTextarea").value, []);
    current.push({
      id: `split_${current.length + 1}`,
      label: `New Split ${current.length + 1}`,
      note: "",
      phaseId: "",
      isPhaseStart: false,
      auto: {}
    });
    $("splitEditorTextarea").value = JSON.stringify(current, null, 2);
  });

  $("saveSplitSetupBtn").addEventListener("click", () => {
    try {
      const parsed = JSON.parse($("splitEditorTextarea").value);
      if (!Array.isArray(parsed)) throw new Error();
      splits = parsed;
      saveLocalJson(SPLITS_STORAGE_KEY, splits);
      closeModal("splitEditorModal");
      setStatus("Split setup saved.");
      saveState();
      render();
    } catch {
      setStatus("Split setup JSON is invalid.");
    }
  });

  $("openActsEditorBtn").addEventListener("click", () => {
    renderEditors();
    openModal("actsEditorModal");
  });

  $("closeActsEditorBtn").addEventListener("click", () => closeModal("actsEditorModal"));

  $("addPhaseBtn").addEventListener("click", () => {
    const current = safeParse($("actsEditorPhasesTextarea").value, {});
    current[`new_phase_${Object.keys(current).length + 1}`] = {
      label: "New Phase",
      note: "",
      visible: ["trophies"]
    };
    $("actsEditorPhasesTextarea").value = JSON.stringify(current, null, 2);
  });

  $("copyActsBtn").addEventListener("click", async () => {
    const combined = {
      phases: safeParse($("actsEditorPhasesTextarea").value, phases),
      quotas: safeParse($("actsEditorQuotasTextarea").value, quotas)
    };
    await navigator.clipboard.writeText(JSON.stringify(combined, null, 2));
    setStatus("Acts setup copied.");
  });

  $("exportActsBtn").addEventListener("click", () => {
    downloadJson("acts.json", {
      phases: safeParse($("actsEditorPhasesTextarea").value, phases),
      quotas: safeParse($("actsEditorQuotasTextarea").value, quotas)
    });
  });

  $("importActsBtn").addEventListener("click", () => $("actsUploadInput").click());

  $("actsUploadInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readUploadedJson(file);
      if (!data?.phases || !data?.quotas) throw new Error();
      $("actsEditorPhasesTextarea").value = JSON.stringify(data.phases, null, 2);
      $("actsEditorQuotasTextarea").value = JSON.stringify(data.quotas, null, 2);
      setStatus("Acts file loaded into editor.");
    } catch {
      setStatus("Failed to import acts file.");
    }
    e.target.value = "";
  });

  $("resetActsBtn").addEventListener("click", () => {
    $("actsEditorPhasesTextarea").value = JSON.stringify(phases, null, 2);
    $("actsEditorQuotasTextarea").value = JSON.stringify(quotas, null, 2);
  });

  $("saveActsSetupBtn").addEventListener("click", () => {
    try {
      const nextPhases = JSON.parse($("actsEditorPhasesTextarea").value);
      const nextQuotas = JSON.parse($("actsEditorQuotasTextarea").value);
      phases = nextPhases;
      quotas = nextQuotas;
      saveLocalJson(PHASES_STORAGE_KEY, phases);
      saveLocalJson(QUOTAS_STORAGE_KEY, quotas);
      closeModal("actsEditorModal");
      setStatus("Acts setup saved.");
      saveState();
      render();
    } catch {
      setStatus("Acts setup JSON is invalid.");
    }
  });
}

function render() {
  renderTop();
  renderSettings();
  renderLogs();
  renderPhaseInfo();
  renderQuotaBox();
  renderTrackedTotals();
  renderSplitQueue();
  renderSplitHistory();
}

async function boot() {
  loadState();

  counters = loadLocalJson(COUNTERS_STORAGE_KEY, null) || await fetchJson(COUNTERS_URL, {});
  phases = loadLocalJson(PHASES_STORAGE_KEY, null) || await fetchJson(PHASES_URL, {});
  quotas = loadLocalJson(QUOTAS_STORAGE_KEY, null) || await fetchJson(QUOTAS_URL, { quotas: {} });
  splits = loadLocalJson(SPLITS_STORAGE_KEY, null) || await fetchJson(SPLITS_URL, FALLBACK_SPLITS);

  saveLocalJson(COUNTERS_STORAGE_KEY, counters);
  saveLocalJson(PHASES_STORAGE_KEY, phases);
  saveLocalJson(QUOTAS_STORAGE_KEY, quotas);
  saveLocalJson(SPLITS_STORAGE_KEY, splits);

  buildInitialCounts();
  attachEvents();
  renderEditors();
  saveState();
  render();
  setStatus("Controller ready.");
  updateTimer();
}

boot();
