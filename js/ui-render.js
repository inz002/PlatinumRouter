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

    const label =
      counterDefs?.[key]?.shortLabel ||
      counterDefs?.[key]?.queueLabel ||
      counterDefs?.[key]?.label ||
      key;

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

function getPhaseInfoFromCurrentSplit(splits, currentSplitIndex, phases, explicitPhaseId) {
  const currentSplit = getCurrentSplit(splits, currentSplitIndex);

  const phaseId =
    explicitPhaseId ||
    currentSplit?.phase ||
    currentSplit?.phaseId ||
    currentSplit?.act ||
    "legacy_all";

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

function renderTimer(state) {
  const timerValue = document.getElementById("timer");
  if (timerValue) {
    timerValue.textContent = formatMs(state?.elapsedMs || 0);
  }
}

function renderCurrentSplit(state, counterDefs) {
  const currentSplit = getCurrentSplit(state.splits, state.currentSplitIndex);

  const currentSplitLabel = document.getElementById("currentSplitLabel");
  const historyCount = document.getElementById("historyCount");
  const modePill = document.getElementById("modePill");

  if (currentSplitLabel) {
    currentSplitLabel.textContent = currentSplit?.label || "Run complete";
  }

  if (historyCount) {
    historyCount.textContent = `${(state.history || []).length} splits logged`;
  }

  if (modePill) {
    modePill.textContent = state.settings?.difficulty || "Lethal";
  }

  const currentObjectiveText = document.getElementById("currentObjectiveText");
  if (currentObjectiveText) {
    if (currentSplit?.note) {
      currentObjectiveText.textContent = currentSplit.note;
    } else {
      currentObjectiveText.textContent = "No note for this split yet.";
    }
  }

  const historyList = document.getElementById("historyList");
  const historySaved = document.getElementById("historySaved");

  if (historySaved) {
    historySaved.textContent = `${(state.history || []).length} saved`;
  }

  if (historyList) {
    const history = Array.isArray(state.history) ? state.history : [];

    if (!history.length) {
      historyList.innerHTML = `<div class="subtitle">No completed splits yet.</div>`;
    } else {
      historyList.innerHTML = history
        .slice()
        .reverse()
        .map((entry) => {
          return `
            <div class="card" style="margin-bottom:8px">
              <div class="row between" style="gap:8px">
                <div class="mid">${escapeHtml(entry.label || "Split")}</div>
                <div class="pill">${formatMs(entry.segmentMs || 0)}</div>
              </div>
              <div class="subtitle" style="margin-top:6px">
                Total: ${formatMs(entry.cumulativeMs || 0)}
              </div>
            </div>
          `;
        })
        .join("");
    }
  }
}

function renderPhasePanel(state, phases, counterDefs, quotas) {
  const { activePhaseId, activePhase } = getPhaseInfoFromCurrentSplit(
    state.splits,
    state.currentSplitIndex,
    phases,
    state.activePhaseId
  );

  const visibleKeys = getVisibleCounterKeysForPhase(activePhaseId, phases, state.counters);
  const phaseProgress = getSubsetProgress(state.counters, visibleKeys);

  const activePhaseName = document.getElementById("activePhaseName");
  const activePhaseNote = document.getElementById("activePhaseNote");
  const visibleObjectives = document.getElementById("visibleObjectives");

  const act1QuotaLabel = document.getElementById("actQuotaLabel");
  const act1SummaryValue = document.getElementById("act1SummaryValue");
  const act1SummaryBar = document.getElementById("act1SummaryBar");
  const act1QuotaTitle = document.getElementById("act1QuotaTitle");
  const act1QuotaText = document.getElementById("act1QuotaText");

  if (activePhaseName) {
    activePhaseName.textContent = activePhase?.label || activePhaseId || "Legacy All";
  }

  if (activePhaseNote) {
    activePhaseNote.textContent =
      activePhase?.description ||
      activePhase?.note ||
      "No phase note.";
  }

  if (visibleObjectives) {
    visibleObjectives.innerHTML = visibleKeys
      .map((key) => {
        const def = counterDefs?.[key] || {};
        const label = def.label || key;
        const icon = def.icon ? `${escapeHtml(def.icon)} ` : "";

        return `<span class="pill">${icon}${escapeHtml(label)}</span>`;
      })
      .join("");
  }

  if (act1QuotaLabel) {
    act1QuotaLabel.textContent = activePhase?.label || activePhaseId || "Current Phase";
  }

  if (act1SummaryValue) {
    act1SummaryValue.textContent = `${phaseProgress}%`;
  }

  if (act1SummaryBar) {
    act1SummaryBar.style.width = `${phaseProgress}%`;
  }

  if (act1QuotaTitle) {
    act1QuotaTitle.textContent = `${activePhase?.label || activePhaseId || "Current Phase"} Quota`;
  }

  if (act1QuotaText) {
    const quotaEntries = Object.entries(quotas?.[activePhaseId] || {});

    if (!quotaEntries.length) {
      act1QuotaText.textContent = "No quota targets for this phase";
    } else {
      act1QuotaText.textContent = quotaEntries
        .map(([key, value]) => {
          const def = counterDefs?.[key] || {};
          const label = def.shortLabel || def.queueLabel || def.label || key;
          const current = Number(state.counters?.[key]?.value || 0);
          return `${label}: ${Math.min(current, Number(value || 0))}/${Number(value || 0)}`;
        })
        .join(" • ");
    }
  }
}

function renderTotalsGrid(state, counterDefs) {
  const progressGrid = document.getElementById("progressGrid");
  if (!progressGrid) return;

  const entries = Object.entries(state.counters || {});

  progressGrid.innerHTML = entries
    .map(([key, counter]) => {
      const def = counterDefs?.[key] || {};
      const label = def.label || key;
      const icon = def.icon || "";
      const value = Number(counter?.value || 0);
      const max = Number(counter?.max || 0);
      const progress = percent(value, max);

      return `
        <div class="card">
          <div class="eyebrow">${escapeHtml(label)}</div>
          <div class="row between" style="margin-top:10px;gap:8px">
            <button class="btn" data-counter-key="${escapeHtml(key)}" data-delta="-1" type="button">−</button>

            <div style="text-align:center;flex:1">
              <div class="mid">${icon ? `${escapeHtml(icon)} ` : ""}${value}/${max}</div>
              <div class="subtitle" style="margin-top:4px">${progress}%</div>
            </div>

            <button class="btn" data-counter-key="${escapeHtml(key)}" data-delta="1" type="button">+</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderOverallBoxes(state, phases) {
  const overallProgress = getOverallProgress(state.counters);

  const { activePhaseId } = getPhaseInfoFromCurrentSplit(
    state.splits,
    state.currentSplitIndex,
    phases,
    state.activePhaseId
  );

  const visibleKeys = getVisibleCounterKeysForPhase(activePhaseId, phases, state.counters);
  const phaseProgress = getSubsetProgress(state.counters, visibleKeys);

  const overallPercent = document.getElementById("overallPercent");
  const overallBar = document.getElementById("overallBar");

  const actPercent = document.getElementById("act1SummaryValue");
  const actBar = document.getElementById("act1SummaryBar");

  if (overallPercent) overallPercent.textContent = `${overallProgress}%`;
  if (overallBar) overallBar.style.width = `${overallProgress}%`;

  if (actPercent) actPercent.textContent = `${phaseProgress}%`;
  if (actBar) actBar.style.width = `${phaseProgress}%`;
}

function renderSplitQueue(state, counterDefs) {
  const splitButtons = document.getElementById("splitButtons");
  const queuePill = document.getElementById("queuePill");

  if (!splitButtons) return;

  if (queuePill) {
    queuePill.textContent = `${state.splits.length} total splits`;
  }

  splitButtons.innerHTML = (state.splits || [])
    .map((split, index) => {
      const status = getSplitStatus(index, state.currentSplitIndex);
      const autoSummary = getSplitAutoSummary(split, counterDefs);

      const disabled = status !== "current" ? "disabled" : "";
      const opacity = status === "done" ? "0.6" : "1";

      return `
        <button
          class="btn full"
          type="button"
          data-split-index="${index}"
          ${disabled}
          style="margin-bottom:8px;opacity:${opacity};text-align:left"
        >
          <div class="row between" style="align-items:flex-start;gap:8px">
            <div>
              <div class="mid">${escapeHtml(split.label || `Split ${index + 1}`)}</div>
              <div class="subtitle" style="margin-top:4px">
                ${escapeHtml(autoSummary || "No tracked objectives")}
              </div>
            </div>
            <div class="subtitle">›</div>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderHiddenInputs(state) {
  const dirgeCheckbox = document.getElementById("dirgeCheckbox");
  if (dirgeCheckbox) {
    dirgeCheckbox.checked = !!state.miscChecks?.dirge;
  }
}

function renderDifficultyPill(state) {
  const difficultyBadge = document.getElementById("difficultyBadge");
  if (!difficultyBadge) return;

  difficultyBadge.textContent = state.settings?.difficulty || "Lethal";
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
    miscChecks: state?.miscChecks || {},
    history: Array.isArray(state?.history) ? state.history : [],
    activePhaseId: state?.activePhaseId || null
  };

  renderTimer(safeState);
  renderDifficultyPill(safeState);
  renderCurrentSplit(safeState, counters || {});
  renderPhasePanel(safeState, phases || {}, counters || {}, quotas || {});
  renderTotalsGrid(safeState, counters || {});
  renderOverallBoxes(safeState, phases || {});
  renderSplitQueue(safeState, counters || {});
  renderHiddenInputs(safeState);
  renderTimerButtonState(!!safeState.settings?.__timerRunning);

  const subtitle = document.querySelector(".top .subtitle");
  if (subtitle) {
    subtitle.textContent =
      meta?.subtitle || "Main controller with phase-based objective visibility.";
  }
}
