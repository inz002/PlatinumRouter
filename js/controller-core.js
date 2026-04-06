// controller.js

import { loadGameData } from "./js/data-loader.js";
import { getState, subscribe } from "./js/storage.js";
import { createDebugger } from "./js/debug.js";
import {
  buildInitialState,
  getCurrentStateFactory
} from "./js/controller-core.js";
import {
  createRenderController
} from "./js/controller-render.js";
import {
  createActionController
} from "./js/controller-actions.js";

const GAME_ID = "ghost-of-tsushima";

const debug = createDebugger({ name: "controller" });

let gameData = null;
let getCurrentState = null;
let renderController = null;
let actionController = null;

async function boot() {
  gameData = await loadGameData(GAME_ID);

  getCurrentState = getCurrentStateFactory({
    getState,
    gameData,
    gameId: GAME_ID
  });

  const initial = buildInitialState(getState(), gameData, GAME_ID);

  renderController = createRenderController({
    gameData,
    debug,
    getCurrentState
  });

  actionController = createActionController({
    gameData,
    debug,
    getCurrentState
  });

  actionController.setWholeState(initial);
  actionController.syncPhaseToState();

  actionController.bindStaticEvents();
  actionController.setupSplitEditor();
  actionController.setupActsEditor();

  subscribe((raw) => {
    const state = buildInitialState(raw, gameData, GAME_ID);

    if (state.timer?.running) actionController.ensureTimerLoop();
    else actionController.stopTimerLoop();

    renderController.render();
  });

  debug.setSnapshotBuilder(() => ({
    gameData,
    state: getCurrentState()
  }));

  if (getCurrentState().timer?.running) {
    actionController.ensureTimerLoop();
  }

  renderController.render();

  debug.log("Controller booted", {
    counters: Object.keys(gameData?.counters || {}).length,
    phases: Object.keys(gameData?.phases || {}).length,
    splits: (getCurrentState().splits?.items || []).length
  });
}

boot().catch((error) => {
  debug.error("Controller boot failed", {
    message: error.message,
    stack: error.stack
  });

  console.error(error);
});
