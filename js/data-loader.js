// js/data-loader.js

const BASE_PATH = "./data";

async function fetchJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: "no-store" });

    if (!response.ok) {
      console.warn(`Failed to load ${path}: ${response.status}`);
      return clone(fallback);
    }

    return await response.json();
  } catch (error) {
    console.warn(`Failed to fetch ${path}`, error);
    return clone(fallback);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMeta(meta = {}) {
  return {
    title: meta.title || "Ghost of Tsushima",
    subtitle: meta.subtitle || "Speedrun Controller",
    difficulty: meta.difficulty || meta.defaultDifficulty || "Lethal",
    defaultDifficulty: meta.defaultDifficulty || meta.difficulty || "Lethal"
  };
}

function normalizeCounters(counters = {}) {
  const result = {};

  Object.entries(counters || {}).forEach(([key, def]) => {
    result[key] = {
      label: def?.label || key,
      shortLabel: def?.shortLabel || def?.queueLabel || def?.label || key,
      queueLabel: def?.queueLabel || def?.shortLabel || def?.label || key,
      icon: def?.icon || "",
      max: Number(def?.max || 0)
    };
  });

  return result;
}

function normalizeAuto(auto = {}) {
  const result = {};

  Object.entries(auto || {}).forEach(([key, value]) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return;
    result[key] = n;
  });

  return result;
}

function normalizeDefaultSplitsFile(raw) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.splits)
      ? raw.splits
      : [];

  return source.map((split, index) => ({
    id: split?.id || `split_${index}`,
    label: split?.label || `Split ${index + 1}`,
    phase: split?.phase || split?.phaseId || split?.act || null,
    note: split?.note || "",
    auto: normalizeAuto(split?.auto || {})
  }));
}

function normalizePhasesFile(raw) {
  const source =
    raw && typeof raw === "object" && raw.phases && typeof raw.phases === "object"
      ? raw.phases
      : raw && typeof raw === "object"
        ? raw
        : {};

  const result = {};

  Object.entries(source).forEach(([phaseId, def]) => {
    const rawTargetMinutes =
      def?.targetMinutes ??
      def?.paceTargetMinutes ??
      def?.actTargetMinutes ??
      0;

    const targetMinutes = Number(rawTargetMinutes);

    result[phaseId] = {
      id: phaseId,
      label: def?.label || phaseId,
      description: def?.description || "",
      note: def?.note || "",
      objectiveNote: def?.objectiveNote || def?.currentNote || def?.note || "",
      visibleCounters: Array.isArray(def?.visibleCounters)
        ? def.visibleCounters
        : Array.isArray(def?.visible)
          ? def.visible
          : Array.isArray(def?.objectives)
            ? def.objectives
            : [],
      objectives: Array.isArray(def?.objectives)
        ? def.objectives
        : Array.isArray(def?.visible)
          ? def.visible
          : [],
      targetMinutes: Number.isFinite(targetMinutes) && targetMinutes > 0 ? targetMinutes : 0
    };
  });

  return result;
}

function normalizeQuotasFile(raw) {
  const source =
    raw && typeof raw === "object" && raw.quotas && typeof raw.quotas === "object"
      ? raw.quotas
      : raw && typeof raw === "object"
        ? raw
        : {};

  const result = {};

  Object.entries(source).forEach(([phaseId, value]) => {
    const targets =
      value && typeof value === "object" && value.targets && typeof value.targets === "object"
        ? value.targets
        : value && typeof value === "object"
          ? value
          : {};

    const normalized = {};

    Object.entries(targets).forEach(([key, rawValue]) => {
      const n = Number(rawValue);
      if (!Number.isFinite(n) || n <= 0) return;
      normalized[key] = n;
    });

    result[phaseId] = normalized;
  });

  return result;
}

function normalizeResolvedPath(pathValue, gameId) {
  if (typeof pathValue !== "string" || !pathValue.trim()) {
    return `${BASE_PATH}/${gameId}`;
  }

  let path = pathValue.trim();

  if (path.startsWith("./")) {
    path = path.slice(2);
  }

  return `./${path}`;
}

async function resolveGameFolder(gameId) {
  const manifest = await fetchJson(`${BASE_PATH}/games.json`, {
    defaultGameId: "",
    games: []
  });

  const games = Array.isArray(manifest?.games) ? manifest.games : [];

  const match =
    games.find((game) => game?.id === gameId) ||
    games.find((game) => game?.id === manifest?.defaultGameId);

  if (!match) {
    return `${BASE_PATH}/${gameId}`;
  }

  return normalizeResolvedPath(match.path, match.id || gameId);
}

export async function loadGameData(gameId) {
  const root = await resolveGameFolder(gameId);

  const [meta, counters, defaultSplitsRaw, phasesRaw, quotasRaw] = await Promise.all([
    fetchJson(`${root}/meta.json`, {}),
    fetchJson(`${root}/counters.json`, {}),
    fetchJson(`${root}/default-splits.json`, { splits: [] }),
    fetchJson(`${root}/phases.json`, { phases: {} }),
    fetchJson(`${root}/quotas.json`, { quotas: {} })
  ]);

  return {
    meta: normalizeMeta(meta),
    counters: normalizeCounters(counters),
    defaultSplits: normalizeDefaultSplitsFile(defaultSplitsRaw),
    phases: normalizePhasesFile(phasesRaw),
    quotas: normalizeQuotasFile(quotasRaw)
  };
}
