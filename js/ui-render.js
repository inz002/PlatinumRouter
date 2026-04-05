export function renderUI({ state, counters, phases, meta, quotas = {} }) {
  const {
    elapsedMs,
    counters: savedCounters,
    splits,
    currentSplitIndex,
    settings,
    miscChecks
  } = state;

  const safeCounters = normalizeCounters(counters, savedCounters);
  const activePhaseId = getActivePhaseId(splits, currentSplitIndex, phases);
  const activePhase = phases[activePhaseId] || { visible: [] };
  const currentSplit = splits[currentSplitIndex];

  renderTimer(elapsedMs);
  renderDifficulty(settings, meta);
  renderSplit(currentSplit, splits, currentSplitIndex);
  renderPhase(activePhaseId, activePhase);
  renderCurrentObjective(currentSplit);
  renderVisibleObjectives(activePhase, counters);
  renderTrackedTotals(safeCounters, activePhase);
  renderOverall(safeCounters);
  renderActProgress(safeCounters, activePhase, activePhaseId);
  renderQuota(safeCounters, activePhaseId, quotas, counters);
  renderQueue(splits, currentSplitIndex);
  renderHistory(splits, currentSplitIndex);
  renderMisc(miscChecks);
}

function renderTimer(elapsedMs) {
  const timerEl = document.getElementById("timer");
  if (timerEl) timerEl.textContent = formatMs(elapsedMs);
}

function renderDifficulty(settings, meta) {
  const value = settings?.difficulty || meta?.defaultDifficulty || "Lethal";
  const difficultyBadge = document.getElementById("difficultyBadge");
  const modePill = document.getElementById("modePill");
  if (difficultyBadge) difficultyBadge.textContent = value;
  if (modePill) modePill.textContent = value;
}

function renderSplit(currentSplit, splits, currentSplitIndex) {
  const label = document.getElementById("currentSplitLabel");
  const historyCount = document.getElementById("historyCount");
  if (label) label.textContent = currentSplit?.label || "Run complete";
  if (historyCount) historyCount.textContent = `${currentSplitIndex} splits logged`;

  const queuePill = document.getElementById("queuePill");
  if (queuePill) queuePill.textContent = `${splits.length} total splits`;
}

function renderPhase(activePhaseId, activePhase) {
  const nameEl = document.getElementById("activePhaseName");
  const noteEl = document.getElementById("activePhaseNote");
  if (nameEl) nameEl.textContent = activePhase?.label || activePhaseId;
  if (noteEl) noteEl.textContent = activePhase?.note || "No phase note.";
}

function renderCurrentObjective(currentSplit) {
  const el = document.getElementById("currentObjectiveText");
  if (el) el.textContent = currentSplit?.note || "No note for this split yet.";
}

function renderVisibleObjectives(activePhase, counters) {
  const el = document.getElementById("visibleObjectives");
  if (!el) return;

  const keys = Array.isArray(activePhase?.visible) ? activePhase.visible : [];
  el.innerHTML = "";

  keys.forEach((key) => {
    const def = counters[key];
    if (!def) return;

    const chip = document.createElement("div");
    chip.className = "miniChip";
    chip.textContent = `${def.icon || "•"} ${def.label}`;
    el.appendChild(chip);
  });
}

function renderTrackedTotals(safeCounters, activePhase) {
  const el = document.getElementById("progressGrid");
  if (!el) return;

  el.innerHTML = "";

  const visibleSet = new Set(activePhase?.visible || []);
  const orderedKeys = orderCounterKeys(Object.keys(safeCounters), visibleSet);

  orderedKeys.forEach((key) => {
    const counter = safeCounters[key];
    const value = Number(counter.value || 0);
    const max = Number(counter.max || 0);
    const pct = max > 0 ? Math.floor((value / max) * 100) : 0;

    const card = document.createElement("div");
    card.className = "progressCard";

    const minus = document.createElement("button");
    minus.className = "progressCardBtn";
    minus.textContent = "−";
    minus.type = "button";
    minus.dataset.counterKey = key;
    minus.dataset.delta = "-1";

    const plus = document.createElement("button");
    plus.className = "progressCardBtn";
    plus.textContent = "+";
    plus.type = "button";
    plus.dataset.counterKey = key;
    plus.dataset.delta = "1";

    const center = document.createElement("div");
    center.className = "progressCardCenter";
    center.innerHTML = `
      <div class="progressCardTitle">${escapeHtml(counter.label)}</div>
      <div class="progressCardIcon">${escapeHtml(counter.icon || "•")}</div>
      <div class="progressCardValue">${value}/${max}</div>
      <div class="progressCardPct">${pct}%</div>
    `;

    card.appendChild(minus);
    card.appendChild(center);
    card.appendChild(plus);
    el.appendChild(card);
  });
}

function renderOverall(safeCounters) {
  let total = 0;
  let done = 0;

  Object.values(safeCounters).forEach((counter) => {
    const max = Number(counter.max || 0);
    const value = Number(counter.value || 0);
    total += max;
    done += Math.min(value, max);
  });

  const pct = total > 0 ? Math.floor((done / total) * 100) : 0;

  const text = document.getElementById("overallPercent");
  const bar = document.getElementById("overallBar");

  if (text) text.textContent = `${pct}%`;
  if (bar) bar.style.width = `${pct}%`;
}

function renderActProgress(safeCounters, activePhase, activePhaseId) {
  const keys = Array.isArray(activePhase?.visible) ? activePhase.visible : [];

  let total = 0;
  let done = 0;

  keys.forEach((key) => {
    const counter = safeCounters[key];
    if (!counter) return;
    const max = Number(counter.max || 0);
    const value = Number(counter.value || 0);
    total += max;
    done += Math.min(value, max);
  });

  const pct = total > 0 ? Math.floor((done / total) * 100) : 0;

  const text = document.getElementById("act1SummaryValue");
  const bar = document.getElementById("act1SummaryBar");
  const label = document.getElementById("actQuotaLabel");

  if (text) text.textContent = `${pct}%`;
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = (activePhase?.label || activePhaseId || "Act").replace("Any% ", "");
}

function renderQuota(safeCounters, activePhaseId, quotas, counters) {
  const title = document.getElementById("act1QuotaTitle");
  const text = document.getElementById("act1QuotaText");
  if (!text) return;

  const quota = quotas?.[activePhaseId];
  if (title) title.textContent = quota?.label || "Phase Quota";

  const targets = quota?.targets || {};
  const keys = Object.keys(targets);

  if (!keys.length) {
    text.textContent = "No quota targets for this phase";
    return;
  }

  text.innerHTML = "";

  keys.forEach((key) => {
    const def = counters[key];
    if (!def) return;
    const chip = document.createElement("div");
    chip.className = "quotaChip";
    chip.textContent = `${Number(safeCounters[key]?.value || 0)}/${Number(targets[key] || 0)} ${def.icon || ""}`;
    text.appendChild(chip);
  });
}

function renderQueue(splits, currentSplitIndex) {
  const el = document.getElementById("splitButtons");
  if (!el) return;

  el.innerHTML = "";

  splits.forEach((split, index) => {
    const btn = document.createElement("button");
    btn.className = `split ${index === currentSplitIndex ? "active" : ""}`;
    btn.type = "button";
    btn.disabled = index !== currentSplitIndex;

    const autoSummary = summarizeAuto(split.auto || {});
    btn.innerHTML = `
      <div>${index === currentSplitIndex ? "▶" : "•"}</div>
      <div>
        <div>${escapeHtml(split.label || `Split ${index + 1}`)}</div>
        <div class="splitSub">${escapeHtml(autoSummary)}${split.phaseId ? ` | ${escapeHtml(split.phaseIdLabel || split.phaseId)}` : ""}</div>
      </div>
      <div>›</div>
    `;

    el.appendChild(btn);
  });
}

function renderHistory(splits, currentSplitIndex) {
  const saved = document.getElementById("historySaved");
  const list = document.getElementById("historyList");
  if (!list) return;

  const completed = splits.slice(0, currentSplitIndex);
  if (saved) saved.textContent = `${completed.length} saved`;

  if (!completed.length) {
    list.innerHTML = `<div class="subtitle">No splits yet</div>`;
    return;
  }

  list.innerHTML = completed
    .map((split) => `<div class="historyItem">${escapeHtml(split.label || "Split")}</div>`)
    .join("");
}

function renderMisc(miscChecks) {
  const dirge = document.getElementById("dirgeCheckbox");
  if (dirge) dirge.checked = !!miscChecks?.dirge;
}

function normalizeCounters(defs, saved) {
  const result = {};
  Object.entries(defs || {}).forEach(([key, def]) => {
    result[key] = {
      ...def,
      value: Number(saved?.[key]?.value || 0)
    };
  });
  return result;
}

function getActivePhaseId(splits, index, phases) {
  let active = "legacy_all";
  for (let i = 0; i <= index; i++) {
    const split = splits[i];
    if (split?.isPhaseStart && split.phaseId && phases[split.phaseId]) {
      active = split.phaseId;
    }
  }
  return active;
}

function orderCounterKeys(keys, visibleSet) {
  return [...keys].sort((a, b) => {
    const aVisible = visibleSet.has(a) ? 0 : 1;
    const bVisible = visibleSet.has(b) ? 0 : 1;
    if (aVisible !== bVisible) return aVisible - bVisible;
    return a.localeCompare(b);
  });
}

function summarizeAuto(auto) {
  const entries = Object.entries(auto || {});
  if (!entries.length) return "No auto progress";
  return entries
    .map(([key, value]) => `${value} ${key}`)
    .join(" • ");
}

function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
