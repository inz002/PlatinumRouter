export async function loadGamesRegistry() {
  const response = await fetch("./data/games.json");
  if (!response.ok) {
    throw new Error("Failed to load games registry");
  }
  return response.json();
}

export async function loadGameData(gameId) {
  const registry = await loadGamesRegistry();
  const game = (registry.games || []).find((entry) => entry.id === gameId);

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  const basePath = normalizePath(game.path);

  const [meta, counters, phases, defaultSplits, quotas] = await Promise.all([
    fetchJson(`${basePath}/meta.json`, `meta.json for ${gameId}`),
    fetchJson(`${basePath}/counters.json`, `counters.json for ${gameId}`),
    fetchJson(`${basePath}/phases.json`, `phases.json for ${gameId}`),
    fetchJson(`${basePath}/default-splits.json`, `default-splits.json for ${gameId}`),
    fetchOptionalJson(`${basePath}/quotas.json`, { quotas: {} })
  ]);

  return {
    registry,
    game,
    meta,
    counters,
    phases,
    defaultSplits,
    quotas: quotas?.quotas || {}
  };
}

async function fetchJson(path, label) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${label}`);
  }
  return response.json();
}

async function fetchOptionalJson(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

function normalizePath(path) {
  if (!path) return "./data/ghost-of-tsushima";
  if (path.startsWith("./")) return path;
  if (path.startsWith("/")) return `.${path}`;
  return `./${path}`;
}
