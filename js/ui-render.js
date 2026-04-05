// ui-render.js

export function renderUI({ state, counters, phases, meta }) {
  const {
    elapsedMs,
    counters: savedCounters,
    splits,
    currentSplitIndex,
    settings,
    miscChecks
  } = state;

  const safeCounters = normalizeCounters(counters, savedCounters);

  // ----------------------
  // TIMER
  // ----------------------

  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.textContent = formatMs(elapsedMs);

  // ----------------------
  // CURRENT SPLIT
  // ----------------------

  const currentSplit = splits[currentSplitIndex];
  const splitLabel = document.getElementById("currentSplitLabel");

  if (splitLabel) {
    splitLabel.textContent = currentSplit?.label || "No split";
  }

  // ----------------------
  // ACTIVE PHASE
  // ----------------------

  const activePhaseId = getActivePhaseId(splits, currentSplitIndex, phases);
  const activePhase = phases[activePhaseId] || { visible: [] };

  const phaseNameEl = document.getElementById("activePhaseName");
  const phaseNoteEl = document.getElementById("activePhaseNote");

  if (phaseNameEl) phaseNameEl.textContent = activePhase.label || activePhaseId;
  if (phaseNoteEl) phaseNoteEl.textContent = activePhase.note || "";

  // ----------------------
  // PROGRESS GRID (ALL COUNTERS)
  // ----------------------

  const grid = document.getElementById("progressGrid");
  if (grid) {
    grid.innerHTML = "";

    Object.entries(safeCounters).forEach(([key, def]) => {
      const value = def.value || 0;

      const el = document.createElement("div");
      el.className = "progressItem";

      el.innerHTML = `
        <span>${def.icon || "•"} ${def.label}</span>
        <strong>${value}/${def.max}</strong>
      `;

      grid.appendChild(el);
    });
  }

  // ----------------------
  // OVERALL % PROGRESS
  // ----------------------

  let total = 0;
  let completed = 0;

  Object.values(safeCounters).forEach((c) => {
    total += c.max;
    completed += Math.min(c.value, c.max);
  });

  const percent = total ? Math.floor((completed / total) * 100) : 0;

  const percentEl = document.getElementById("overallPercent");
  const barEl = document.getElementById("overallBar");

  if (percentEl) percentEl.textContent = `${percent}%`;
  if (barEl) barEl.style.width = `${percent}%`;

  // ----------------------
  // ACT % (VISIBLE ONLY)
  // ----------------------

  let actTotal = 0;
  let actDone = 0;

  (activePhase.visible || []).forEach((key) => {
    const c = safeCounters[key];
    if (!c) return;

    actTotal += c.max;
    actDone += Math.min(c.value, c.max);
  });

  const actPercent = actTotal ? Math.floor((actDone / actTotal) * 100) : 0;

  const actText = document.getElementById("act1SummaryValue");
  const actBar = document.getElementById("act1SummaryBar");

  if (actText) actText.textContent = `${actPercent}%`;
  if (actBar) actBar.style.width = `${actPercent}%`;

  // ----------------------
  // QUEUE COUNT
  // ----------------------

  const queuePill = document.getElementById("queuePill");
  if (queuePill) queuePill.textContent = `${splits.length} splits`;

  // ----------------------
  // HISTORY COUNT
  // ----------------------

  const historyCount = document.getElementById("historyCount");
  if (historyCount) historyCount.textContent = `${currentSplitIndex} splits`;

  // ----------------------
  // MODE / DIFFICULTY
  // ----------------------

  const modePill = document.getElementById("modePill");
  if (modePill) modePill.textContent = settings?.difficulty || "Lethal";
}

// ----------------------
// HELPERS
// ----------------------

function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function normalizeCounters(defs, saved) {
  const result = {};

  Object.entries(defs || {}).forEach(([key, def]) => {
    result[key] = {
      ...def,
      value: saved?.[key]?.value || 0
    };
  });

  return result;
}

function getActivePhaseId(splits, index, phases) {
  let active = "legacy_all";

  for (let i = 0; i <= index; i++) {
    const s = splits[i];
    if (s?.isPhaseStart && s.phaseId && phases[s.phaseId]) {
      active = s.phaseId;
    }
  }

  return active;
}
