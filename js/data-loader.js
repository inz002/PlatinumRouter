// js/data-loader.js

const BASE_PATH = "./data";

async function fetchJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: "no-store" });

    if (!response.ok) {
      console.warn(`Failed to load ${path}: ${response.status}`);
      return structuredCloneSafe(fallback);
    }

    return await response.json();
  } catch (error) {
    console.warn(`Failed to fetch ${path}`, error);
    return structuredCloneSafe(fallback);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeMeta(meta = {}) {
  return {
    title: meta.title || "Ghost of Tsushima",
    subtitle: meta.subtitle || "Speedrun Controller"
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

function normalizeDefaultSplits(splits = []) {
  if (!Array.isArray(splits)) return [];

  return splits.map((split, index) => ({
    id: split?.id || `split_${index}`,
    label: split?.label || `Split ${index + 1}`,
    phase: split?.phase || split?.phaseId || split?.act || null,
    note: split?.note || "",
    auto: normalizeAuto(split?.auto || {})
  }));
}

function normalizePhases(phases = {}) {
  const result = {};

  Object.entries(phases || {}).forEach(([phaseId, def]) => {
    result[phaseId] = {
      id: phaseId,
      label: def?.label || phaseId,
      description: def?.description || "",
      note: def?.note || "",
      objectiveNote: def?.objectiveNote || def?.currentNote || def?.note || "",
      visibleCounters: Array.isArray(def?.visibleCounters) ? def.visibleCounters : [],
      objectives: Array.isArray(def?.objectives) ? def.objectives : []
    };
  });

  return result;
}

function normalizeQuotas(quotas = {}) {
  const result = {};

  Object.entries(quotas || {}).forEach(([phaseId, value]) => {
    const normalized = {};

    Object.entries(value || {}).forEach(([key, raw]) => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return;
      normalized[key] = n;
    });

    result[phaseId] = normalized;
  });

  return result;
}

function normalizeGameData(raw = {}) {
  return {
    meta: normalizeMeta(raw.meta),
    counters: normalizeCounters(raw.counters),
    defaultSplits: normalizeDefaultSplits(raw.defaultSplits),
    phases: normalizePhases(raw.phases),
    quotas: normalizeQuotas(raw.quotas)
  };
}

async function resolveGameFolder(gameId) {
  const games = await fetchJson(`${BASE_PATH}/games.json`, {});

  if (typeof games === "object" && games !== null) {
    if (games[gameId]?.folder) return games[gameId].folder;
    if (typeof games[gameId] === "string") return games[gameId];
  }

  return gameId;
}

export async function loadGameData(gameId) {
  const folder = await resolveGameFolder(gameId);
  const root = `${BASE_PATH}/${folder}`;

  const [meta, counters, defaultSplits, phases, quotas] = await Promise.all([
    fetchJson(`${root}/meta.json`, {}),
    fetchJson(`${root}/counters.json`, {}),
    fetchJson(`${root}/default-splits.json`, []),
    fetchJson(`${root}/phases.json`, {}),
    fetchJson(`${root}/quotas.json`, {})
  ]);

  return normalizeGameData({
    meta,
    counters,
    defaultSplits,
    phases,
    quotas
  });
}
