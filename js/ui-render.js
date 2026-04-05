// ui-render.js

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMs(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function percent(value, max) {
  if (!max || max <= 0) return 0;
  return clamp(Math.floor((Number(value || 0) / Number(max)) * 100), 0, 100);
}

function getSplitAutoSummary(split, counterDefs) {
  const auto = split?.auto || {};
  const parts = [];

  Object.entries(auto).forEach(([key, amount]) => {
    const n = Number(amount || 0);
    if (!n) return;

    const label = counterDefs?.[key]?.shortLabel
      || counterDefs?.[key]?.queueLabel
      || counterDefs?.[key]?.label
      || key;

    parts.push(`${n} ${label.toLowerCase()}`);
  });

  return parts.join(" • ");
}

function getCurrentSplit(splits, currentSplitIndex) {
  if (!Array.isArray(splits)) return null;
  if (currentSplitIndex < 0 || currentSplitIndex >= splits.length) return null;
  return splits[currentSplitIndex];
}

function getSplitStatus(index, currentSplitIndex) {
  if (index < currentSplitIndex) return "done";
  if (index === currentSplitIndex) return "current";
  return "upcoming";
}

function getVisibleCounterKeysForPhase(activePhaseId, phases, counters) {
  const phase = phases?.[activePhaseId];

  if (!phase) {
    return Object.keys(counters || {});
  }

  if (Array.isArray(phase.visibleCounters) && phase.visibleCounters.length > 0) {
    return phase.visibleCounters;
  }

  if (Array.isArray(phase.objectives) && phase.objectives.length > 0) {
    return phase.objectives;
  }

  return Object.keys(counters || {});
}

function getPhaseInfoFromCurrentSplit(splits, currentSplitIndex, phases) {
  const currentSplit = getCurrentSplit(splits, currentSplitIndex);

  const phaseId = currentSplit?.phase
    || currentSplit?.phaseId
    || currentSplit?.act
    || "legacy_all";

  const phase = phases?.[phaseId] || null;

  return {
    activePhaseId: phaseId,
    activePhase: phase
  };
}

function getOverallProgress(counters) {
  const entries = Object.values(counters || {});
  if (!entries.length) return 0;

  const current = entries.reduce((sum, item) => sum + Number(item?.value || 0), 0);
  const total = entries.reduce((sum, item) => sum + Number(item?.max || 0), 0);

  return percent(current, total);
}

function getSubsetProgress(counters, keys) {
  const selected = (keys || [])
    .map((key) => counters?.[key])
    .filter(Boolean);

  if (!selected.length) return 0;

  const current = selected.reduce((sum, item) => sum + Number(item?.value || 0), 0);
  const total = selected.reduce((sum, item) => sum + Number(item?.max || 0), 0);

  return percent(current, total);
}

function getProgressBarHtml(progress) {
  return `
    <div class="mini-progress">
      <div class="mini-progress-fill" style="width:${progress}%"></div>
    </div>
  `;
}

function renderTimer(state) {
  const timerValue = document.getElementById("timerValue");
  if (timerValue) {
    timerValue.textContent = formatMs(state?.elapsedMs || 0);
  }

  const timerCard = document.getElementById("timerCard");
  if (timerCard) {
    timerCard.classList.toggle("running", !!state?.settings?.__timerRunning);
  }
}

function renderCurrentSplit(state, counterDefs) {
  const currentSplit = getCurrentSplit(state.splits, state.currentSplitIndex);

  const currentSplitTitle = document.getElementById("currentSplitTitle");
  const currentSplitMeta = document.getElementById("currentSplitMeta");
  const currentSplitTags = document.getElementById("currentSplitTags");

  if (!currentSplit) {
    if (currentSplitTitle) currentSplitTitle.textContent = "Run complete";
    if (currentSplitMeta) currentSplitMeta.textContent = `${state.splits.length} splits logged`;
    if (currentSplitTags) {
      currentSplitTags.innerHTML = `
        <span class="split-tag">Complete</span>
        <span class="split-tag">${escapeHtml(state.settings?.difficulty || "Lethal")}</span>
      `;
    }
    return;
  }

  if (currentSplitTitle) {
    currentSplitTitle.textContent = currentSplit.label || "Current Split";
  }

  if (currentSplitMeta) {
    const autoSummary = getSplitAutoSummary(currentSplit, counterDefs);
    currentSplitMeta.textContent = autoSummary || "No auto progress on this split";
  }

  if (currentSplitTags) {
    const tags = [];

    if (currentSplit.phase || currentSplit.phaseId) {
      tags.push(`<span class="split-tag">${escapeHtml(currentSplit.phase || currentSplit.phaseId)}</span>`);
    }

    tags.push(`<span class="split-tag">${escapeHtml(state.settings?.difficulty || "Lethal")}</span>`);

    currentSplitTags.innerHTML = tags.join("");
  }
}

function renderPhasePanel(state, phases, counterDefs, quotas) {
  const { activePhaseId, activePhase } = getPhaseInfoFromCurrentSplit(
    state.splits,
    state.currentSplitIndex,
    phases
  );

  const visibleKeys = getVisibleCounterKeysForPhase(activePhaseId, phases, state.counters);
  const phaseProgress = getSubsetProgress(state.counters, visibleKeys);

  const phaseHeaderLabel = document.getElementById("phaseHeaderLabel");
  const phaseHeaderProgress = document.getElementById("phaseHeaderProgress");
  const activeObjectiveTitle = document.getElementById("activeObjectiveTitle");
  const activeObjectiveDescription = document.getElementById("activeObjectiveDescription");
  const activeObjectivePills = document.getElementById("activeObjectivePills");
  const currentObjectiveNote = document.getElementById("currentObjectiveNote");

  if (phaseHeaderLabel) {
    phaseHeaderLabel.textContent = activePhase?.label || activePhaseId || "Current Phase";
  }

  if (phaseHeaderProgress) {
    const quotaEntries = Object.entries(quotas?.[activePhaseId] || {});
    const quotaTarget = quotaEntries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
    const quotaDone = quotaEntries.reduce((sum, [key, value]) => {
      const current = Number(state.counters?.[key]?.value || 0);
      return sum + Math.min(current, Number(value || 0));
    }, 0);

    if (quotaTarget > 0) {
      phaseHeaderProgress.textContent = `${quotaDone}/${quotaTarget}`;
    } else {
      phaseHeaderProgress.textContent = `${phaseProgress}%`;
    }
  }

  if (activeObjectiveTitle) {
    activeObjectiveTitle.textContent = activePhase?.label || activePhaseId || "Current Objective Set";
  }

  if (activeObjectiveDescription) {
    activeObjectiveDescription.textContent =
      activePhase?.description
      || activePhase?.note
      || "No description for this phase yet.";
  }

  if (currentObjectiveNote) {
    currentObjectiveNote.textContent =
      activePhase?.objectiveNote
      || activePhase?.currentNote
      || activePhase?.note
      || "No note for this split yet.";
  }

  if (activeObjectivePills) {
    activeObjectivePills.innerHTML = visibleKeys.map((key) => {
      const def = counterDefs?.[key] || {};
      const label = def.label || key;
      const icon = def.icon ? `<span class="objective-pill-icon">${escapeHtml(def.icon)}</span>` : "";
      return `
        <span class="objective-pill">
          ${icon}
          <span>${escapeHtml(label)}</span>
        </span>
      `;
    }).join("");
  }
}

function renderMiscChecklist(state) {
  const miscChecklistContent = document.getElementById("miscChecklistContent");
  if (!miscChecklistContent) return;

  const dirgeDone = !!state.miscChecks?.dirge;

  miscChecklistContent.innerHTML = `
    <label class="misc-check-row">
      <input type="checkbox" id="dirgeCheckboxProxy" ${dirgeDone ? "checked" : ""} disabled />
      <div class="misc-check-copy">
        <div class="misc-check-title">🎵 Dirge of the Fallen</div>
        <div class="misc-check-note">Monochrome and Cooper are tracked as counters. Dirge is a one-time checkbox.</div>
      </div>
    </label>
  `;
}

function renderTotalsGrid(state, counterDefs) {
  const totalsGrid = document.getElementById("trackedTotalsGrid");
  if (!totalsGrid) return;

  const entries = Object.entries(state.counters || {});

  totalsGrid.innerHTML = entries.map(([key, counter]) => {
    const def = counterDefs?.[key] || {};
    const label = def.label || key;
    const icon = def.icon || "";
    const value = Number(counter?.value || 0);
    const max = Number(counter?.max || 0);
    const progress = percent(value, max);

    return `
      <div class="counter-card" data-counter-card="${escapeHtml(key)}">
        <div class="counter-card-header">
          <div class="counter-card-label">${escapeHtml(label)}</div>
        </div>

        <div class="counter-card-controls">
          <button class="counter-btn" data-counter-key="${escapeHtml(key)}" data-delta="-1" type="button">−</button>

          <div class="counter-card-main">
            <div class="counter-card-icon">${escapeHtml(icon)}</div>
            <div class="counter-card-value">${value}/${max}</div>
            <div class="counter-card-percent">${progress}%</div>
          </div>

          <button class="counter-btn" data-counter-key="${escapeHtml(key)}" data-delta="1" type="button">+</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderOverallBoxes(state, phases) {
  const overallProgress = getOverallProgress(state.counters);

  const { activePhaseId } = getPhaseInfoFromCurrentSplit(
    state.splits,
    state.currentSplitIndex,
    phases
  );

  const visibleKeys = getVisibleCounterKeysForPhase(activePhaseId, phases, state.counters);
  const phaseProgress = getSubsetProgress(state.counters, visibleKeys);

  const overallPercent = document.getElementById("overallPercent");
  const overallBar = document.getElementById("overallBar");

  const actPercent = document.getElementById("actPercent");
  const actBar = document.getElementById("actBar");

  if (overallPercent) overallPercent.textContent = `${overallProgress}%`;
  if (overallBar) overallBar.innerHTML = getProgressBarHtml(overallProgress);

  if (actPercent) actPercent.textContent = `${phaseProgress}%`;
  if (actBar) actBar.innerHTML = getProgressBarHtml(phaseProgress);
}

function renderSplitQueue(state, counterDefs) {
  const splitQueue = document.getElementById("splitQueue");
  const splitQueueCount = document.getElementById("splitQueueCount");

  if (!splitQueue) return;

  if (splitQueueCount) {
    splitQueueCount.textContent = `${state.splits.length} total splits`;
  }

  splitQueue.innerHTML = (state.splits || []).map((split, index) => {
    const status = getSplitStatus(index, state.currentSplitIndex);
    const autoSummary = getSplitAutoSummary(split, counterDefs);

    return `
      <button
        class="split-queue-item ${status}"
        type="button"
        data-split-index="${index}"
        ${status !== "current" ? "disabled" : ""}
      >
        <div class="split-queue-dot"></div>

        <div class="split-queue-copy">
          <div class="split-queue-title">${escapeHtml(split.label || `Split ${index + 1}`)}</div>
          <div class="split-queue-meta">${escapeHtml(autoSummary || "No tracked objectives")}</div>
        </div>

        <div class="split-queue-arrow">›</div>
      </button>
    `;
  }).join("");
}

function renderHiddenInputs(state) {
  const hiddenDirge = document.getElementById("dirgeCheckbox");
  if (hiddenDirge) {
    hiddenDirge.checked = !!state.miscChecks?.dirge;
  }
}

function renderDifficultyPill(state) {
  const difficultyPill = document.getElementById("difficultyPill");
  if (!difficultyPill) return;

  difficultyPill.textContent = state.settings?.difficulty || "Lethal";
}

function renderTimerButtonState(isRunning) {
  const startPauseBtn = document.getElementById("startPauseBtn");
  if (!startPauseBtn) return;

  startPauseBtn.textContent = isRunning ? "⏸ Pause" : "▶ Start";
}

export function renderUI({ state, counters, phases, meta, quotas }) {
  const safeState = {
    elapsedMs: Number(state?.elapsedMs || 0),
    counters: state?.counters || {},
    splits: Array.isArray(state?.splits) ? state.splits : [],
    currentSplitIndex: Number(state?.currentSplitIndex || 0),
    settings: state?.settings || {},
    miscChecks: state?.miscChecks || {}
  };

  renderTimer(safeState);
  renderDifficultyPill(safeState);
  renderCurrentSplit(safeState, counters);
  renderPhasePanel(safeState, phases || {}, counters || {}, quotas || {});
  renderMiscChecklist(safeState);
  renderTotalsGrid(safeState, counters || {});
  renderOverallBoxes(safeState, phases || {});
  renderSplitQueue(safeState, counters || {});
  renderHiddenInputs(safeState);
  renderTimerButtonState(!!safeState.settings?.__timerRunning);

  const subtitle = document.getElementById("runSubtitle");
  if (subtitle) {
    subtitle.textContent = meta?.subtitle || "Main controller with phase-based objective visibility.";
  }
}
