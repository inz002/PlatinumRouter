import {
  computeOverallPercent,
  computeAct1Percent,
  getAct1QuotaText,
  getActivePhaseId,
  clamp
} from "./split-logic.js";

export function createRenderer({
  elements,
  getState,
  getGameData,
  onManualCounterChange,
  onAdvanceSplit
}) {
  function render() {
    const state = getState();
    const gameData = getGameData();

    if (!state || !gameData) return;

    const {
      meta,
      counters: counterDefs,
      phases,
      splits
    } = gameData;

    const currentSplit =
      splits[state.currentSplitIndex] ||
      splits[splits.length - 1] || {
        label: "No split",
        note: ""
      };

    const overallPercent = computeOverallPercent(
      counterDefs,
      state.counters,
      state.miscChecks
    );

    const act1Percent = computeAct1Percent(counterDefs, state.counters);
    const act1QuotaText = getAct1QuotaText(counterDefs, state.counters);

    const activePhaseId = getActivePhaseId(
      splits,
      state.currentSplitIndex,
      phases
    );

    const activePhase = phases[activePhaseId] || phases.legacy_all || {
      label: "Legacy All",
      note: "",
      visible: []
    };

    const plannedMs = (state.settings.act1TargetMinutes || 180) * 60 * 1000;
    const diff = state.elapsedMs - plannedMs;

    const pace =
      state.elapsedMs === 0
        ? "On fresh air"
        : Math.abs(diff) < 60000
        ? "On pace"
        : diff < 0
        ? `${formatMs(Math.abs(diff))} ahead`
        : `${formatMs(diff)} behind`;

    elements.runTitle.textContent =
      meta?.overlayTitle || meta?.title || "PlatinumRouter";
    elements.difficultyBadge.textContent = state.settings.difficulty;
    elements.difficultyBadge.className = `badge ${
      state.settings.difficulty === "Lethal" ? "lethal" : "easy"
    }`;

    elements.timer.textContent = formatMs(state.elapsedMs);
    elements.startPauseBtn.textContent = state.running ? "⏸ Pause" : "▶ Start";
    elements.undoBtn.disabled = !state.history.length;
    elements.advanceCurrentBtn.disabled = !splits.length;

    elements.currentSplitLabel.textContent = currentSplit.label;
    elements.currentObjectiveText.textContent =
      currentSplit.note?.trim() || "No note for this split yet.";

    elements.historyCount.textContent = `${state.history.length} split${
      state.history.length === 1 ? "" : "s"
    } logged`;
    elements.historySaved.textContent = `${state.history.length} saved`;

    elements.overallPercent.textContent = `${overallPercent}%`;
    elements.overallBar.style.width = `${overallPercent}%`;

    elements.act1SummaryValue.textContent = `${act1Percent}%`;
    elements.act1SummaryBar.style.width = `${act1Percent}%`;

    elements.pacePill.textContent = pace;
    elements.modePill.textContent = state.settings.difficulty;
    elements.act1QuotaText.textContent = act1QuotaText;

    elements.settingsToggle.textContent = state.settings.showSettings
      ? "⚙ Hide Settings"
      : "⚙ Show Settings";

    elements.settingsPanel.classList.toggle(
      "open",
      !!state.settings.showSettings
    );

    elements.difficultySelect.value = state.settings.difficulty;
    elements.act1TargetMinutes.value = state.settings.act1TargetMinutes;
    elements.remoteCode.value = state.settings.remoteCode || "";
    elements.dirgeCheckbox.checked = !!state.miscChecks.dirge;

    renderVisibleObjectives(activePhase, counterDefs, elements.visibleObjectives);
    renderCounters(counterDefs, state.counters, elements.progressGrid, onManualCounterChange);
    renderSplits(
      splits,
      state.currentSplitIndex,
      state.history,
      phases,
      counterDefs,
      elements.splitButtons,
      elements.queuePill,
      onAdvanceSplit
    );
    renderHistory(state.history, elements.historyList);
  }

  return { render };
}

function renderVisibleObjectives(activePhase, counterDefs, container) {
  container.innerHTML = "";

  elementsFromPhase(activePhase, counterDefs).forEach((label) => {
    const chip = document.createElement("div");
    chip.className = "miniChip";
    chip.textContent = label;
    container.appendChild(chip);
  });
}

function elementsFromPhase(activePhase, counterDefs) {
  return (activePhase.visible || [])
    .map((key) => {
      if (key === "dirge") return "🎵 Dirge";
      if (!counterDefs[key]) return null;
      return `${counterDefs[key].icon} ${counterDefs[key].label}`;
    })
    .filter(Boolean);
}

function renderCounters(counterDefs, counters, container, onManualCounterChange) {
  container.innerHTML = "";

  Object.entries(counters || {}).forEach(([key, counter]) => {
    const percent = Math.round((counter.value / counter.max) * 100);
    const card = document.createElement("div");
    card.className = "counter";

    card.innerHTML = `
      <div class="counterSide">
        <button data-key="${key}" data-diff="-1" aria-label="Decrease ${counter.label}">−</button>
      </div>
      <div class="counterCenter">
        <div class="counterLabel">${counter.label}</div>
        <div class="counterIcon">${counter.icon}</div>
        <div class="counterAmt">${counter.value}/${counter.max}</div>
        <div class="counterPct">${percent}%</div>
        ${
          counter.manualDelta
            ? `<span class="manual">${counter.manualDelta > 0 ? "+" : ""}${counter.manualDelta} manual</span>`
            : ""
        }
      </div>
      <div class="counterSide">
        <button data-key="${key}" data-diff="1" aria-label="Increase ${counter.label}">+</button>
      </div>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll("button[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;
      const diff = Number(button.dataset.diff);
      onManualCounterChange(key, diff);
    });
  });
}

function renderSplits(
  splits,
  currentSplitIndex,
  history,
  phases,
  counterDefs,
  container,
  queuePill,
  onAdvanceSplit
) {
  container.innerHTML = "";
  queuePill.textContent = `${splits.length} total splits`;

  splits.forEach((split, index) => {
    const done = index < currentSplitIndex;
    const active = index === currentSplitIndex;

    const autoSummary =
      Object.entries(split.auto || {})
        .map(([k, v]) => `${counterDefs[k]?.icon || "?"}${v}`)
        .join(" · ") || "No auto progress";

    const marker =
      split.isPhaseStart && split.phaseId && phases[split.phaseId]
        ? ` | ▶ ${phases[split.phaseId].label}`
        : "";

    const button = document.createElement("button");
    button.className = `split ${done ? "done" : ""} ${active ? "active" : ""}`;
    button.disabled = !active;

    button.innerHTML = `
      <div>${done ? "✅" : active ? "▶️" : "•"}</div>
      <div>
        <div>${split.label}</div>
        <div class="splitSub">${autoSummary}${marker}</div>
      </div>
      <div>›</div>
    `;

    button.addEventListener("click", () => onAdvanceSplit(index));
    container.appendChild(button);
  });
}

function renderHistory(history, container) {
  container.innerHTML = "";

  if (!history.length) {
    const row = document.createElement("div");
    row.className = "historyRow";
    row.innerHTML = "<div>No splits yet</div><div></div><div></div>";
    container.appendChild(row);
    return;
  }

  history.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "historyRow";
    row.innerHTML = `
      <div>${entry.label}</div>
      <div class="mono green">${formatMs(entry.cumulativeMs)}</div>
      <div class="mono">${formatMs(entry.segmentMs)}</div>
    `;
    container.appendChild(row);
  });
}

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}