const STORAGE_KEY = "platinumrouter_state_v1";

function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function normalizeSplit(split) {
  return {
    id: "",
    label: "",
    note: "",
    phaseId: "",
    isPhaseStart: false,
    auto: {},
    ...split
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function getActivePhaseId(splits, currentSplitIndex, phases) {
  let active = "legacy_all";

  for (let i = 0; i <= currentSplitIndex && i < splits.length; i += 1) {
    const split = normalizeSplit(splits[i]);
    if (split.isPhaseStart && split.phaseId && phases[split.phaseId]) {
      active = split.phaseId;
    }
  }

  return active;
}

async function loadGameData(gameId = "ghost-of-tsushima") {
  const registryRes = await fetch("./data/games.json");
  const registry = await registryRes.json();
  const game = (registry.games || []).find((entry) => entry.id === gameId) || registry.games?.[0];

  if (!game) {
    throw new Error("No game config found");
  }

  const basePath = normalizePath(game.path);

  const [meta, counters, phases] = await Promise.all([
    fetchJson(`${basePath}/meta.json`),
    fetchJson(`${basePath}/counters.json`),
    fetchJson(`${basePath}/phases.json`)
  ]);

  return { game, meta, counters, phases };
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function normalizePath(path) {
  if (!path) return "./data/ghost-of-tsushima";
  if (path.startsWith("./")) return path;
  if (path.startsWith("/")) return `.${path}`;
  return `./${path}`;
}

let cachedGameData = null;

async function render() {
  const state = loadState();
  const gameId = state.gameId || "ghost-of-tsushima";

  if (!cachedGameData || cachedGameData.game.id !== gameId) {
    cachedGameData = await loadGameData(gameId);
  }

  const { counters: counterDefs, phases, meta } = cachedGameData;
  const counters = state.counters || {};
  const splits = Array.isArray(state.splits) ? state.splits : [];
  const currentSplitIndex = Number.isFinite(state.currentSplitIndex) ? state.currentSplitIndex : 0;

  const activePhaseId = getActivePhaseId(splits, currentSplitIndex, phases);
  const activePhase = phases[activePhaseId] || phases.legacy_all || { visible: [] };

  document.getElementById("timer").textContent = formatMs(state.elapsedMs || 0);
  document.getElementById("meta").textContent =
    state.settings?.difficulty || meta?.defaultDifficulty || "Lethal";

  const itemsEl = document.getElementById("items");
  itemsEl.innerHTML = "";

  const items = [];

  (activePhase.visible || []).forEach((key) => {
    if (key === "dirge") {
      if (!state.miscChecks?.dirge) {
        items.push({ icon: "🎵", text: "Dirge" });
      }
      return;
    }

    const def = counterDefs[key];
    const counter = counters[key];
    if (!def || !counter) return;

    const value = Number(counter.value || 0);
    if (value >= def.max) return;

    items.push({
      icon: def.icon,
      text: `${value}/${def.max}`
    });
  });

  if (!items.length) {
    itemsEl.innerHTML = '<div class="empty">All visible objectives complete</div>';
    return;
  }

  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<span class="icon">${item.icon}</span><span class="count">${item.text}</span>`;
    itemsEl.appendChild(el);
  });
}

window.addEventListener("storage", () => {
  render().catch(console.error);
});

setInterval(() => {
  render().catch(console.error);
}, 500);

render().catch(console.error);