// js/controller-render.js

import { renderUI } from "./ui-render.js";
import { computePaceText, getActivePhase } from "./controller-core.js";

export function createRenderController({ gameData, debug, getCurrentState }) {
  function buildCounterDefsForUi() {
    const result = {};

    Object.entries(gameData?.counters || {}).forEach(([key, def]) => {
      result[key] = {
        ...def,
        max: Number(gameData?.counters?.[key]?.max || 0)
      };
    });

    return result;
  }

  function buildUiCounters(state) {
    const result = {};

    Object.entries(gameData?.counters || {}).forEach(([key, def]) => {
      result[key] = {
        label: def.label,
        shortLabel: def.shortLabel,
        queueLabel: def.queueLabel,
        icon: def.icon,
        max: Number(state?.totals?.[key] || def.max || 0),
        value: Number(state?.counters?.[key]?.value || 0),
        manualDelta: Number(state?.counters?.[key]?.manualDelta || 0)
      };
    });

    return result;
  }

  function updateExtraUi(state) {
    const routeTitle =
      gameData?.meta?.title
        ? `${gameData.meta.title} Platinum`
        : "Ghost of Tsushima Platinum";

    const routeDifficulty =
      gameData?.meta?.difficulty ||
      state?.settings?.difficulty ||
      "Lethal";

    const runTitle = document.getElementById("runTitle");
    if (runTitle) {
      runTitle.textContent = `${routeTitle} ${routeDifficulty}`;
    }

    const difficultyBadge = document.getElementById("difficultyBadge");
    if (difficultyBadge) {
      difficultyBadge.textContent = routeDifficulty;
      difficultyBadge.classList.toggle("lethal", routeDifficulty === "Lethal");
    }

    const pacePill = document.getElementById("pacePill");
    if (pacePill) {
      pacePill.textContent = computePaceText(state);
    }

    const startPauseBtn = document.getElementById("startPauseBtn");
    if (startPauseBtn) {
      startPauseBtn.textContent = state?.timer?.running ? "⏸ Pause" : "▶ Start";
    }

    const settingsPanel = document.getElementById("settingsPanel");
    const settingsToggle = document.getElementById("settingsToggle");
    const settingsOpen = !!state?.ui?.settingsOpen;

    if (settingsPanel) {
      settingsPanel.classList.toggle("open", settingsOpen);
      settingsPanel.hidden = !settingsOpen;
      settingsPanel.style.display = settingsOpen ? "block" : "none";
    }

    if (settingsToggle) {
      settingsToggle.textContent = settingsOpen ? "⚙ Hide Settings" : "⚙ Show Settings";
      settingsToggle.setAttribute("aria-expanded", String(settingsOpen));
    }

    const dirgeCheckbox = document.getElementById("dirgeCheckbox");
    if (dirgeCheckbox) {
      dirgeCheckbox.checked = !!state?.misc?.dirgeDone;
    }

    const currentSplitLabel = document.getElementById("currentSplitLabel");
    const currentSplit = state?.splits?.items?.[state?.splits?.currentIndex] || null;
    if (currentSplitLabel) {
      currentSplitLabel.textContent = currentSplit?.label || "Run complete";
    }

    const historyCount = document.getElementById("historyCount");
    if (historyCount) {
      historyCount.textContent = `${(state?.splits?.completed || []).length} splits logged`;
    }

    const modePill = document.getElementById("modePill");
    if (modePill) {
      modePill.textContent = routeDifficulty;
    }

    const queuePill = document.getElementById("queuePill");
    if (queuePill) {
      queuePill.textContent = `${(state?.splits?.items || []).length} total splits`;
    }

    const historySaved = document.getElementById("historySaved");
    if (historySaved) {
      historySaved.textContent = `${(state?.splits?.completed || []).length} saved`;
    }

    const advanceCurrentBtn = document.getElementById("advanceCurrentBtn");
    if (advanceCurrentBtn) {
      const hasCurrentSplit = !!currentSplit;
      advanceCurrentBtn.disabled = !hasCurrentSplit;
      advanceCurrentBtn.textContent = hasCurrentSplit
        ? "▶ Complete Current Split"
        : "Run Complete";
    }
  }

  function render() {
    const state = getCurrentState();

    const uiState = {
      elapsedMs: Number(state?.timer?.elapsed || 0),
      counters: buildUiCounters(state),
      splits: state?.splits?.items || [],
      currentSplitIndex: Number(state?.splits?.currentIndex || 0),
      settings: {
        ...(state?.settings || {}),
        __timerRunning: !!state?.timer?.running
      },
      miscChecks: {
        dirge: !!state?.misc?.dirgeDone
      },
      history: state?.splits?.completed || [],
      activePhaseId: state?.phase || getActivePhase(state, gameData)
    };

    renderUI({
      state: uiState,
      counters: buildCounterDefsForUi(),
      phases: gameData?.phases || {},
      meta: gameData?.meta || {},
      quotas: gameData?.quotas || {}
    });

    updateExtraUi(state);

    debug.setStatus("gameId", state?.gameId);
    debug.setStatus("elapsedMs", state?.timer?.elapsed || 0);
    debug.setStatus("running", !!state?.timer?.running);
    debug.setStatus("currentSplitIndex", state?.splits?.currentIndex || 0);
    debug.setStatus("splitCount", (state?.splits?.items || []).length);
    debug.setStatus("activePhase", state?.phase || "legacy_all");
    debug.setStatus("settingsOpen", !!state?.ui?.settingsOpen);
    debug.setStatus("defaultSplitCount", (gameData?.defaultSplits || []).length);
  }

  return {
    render
  };
}
