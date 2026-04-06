// data-loader.js

/**
 * Central loader for game data (splits, phases, counters, quotas)
 * Ensures everything is ALWAYS valid and never undefined
 */

export async function loadGameData(gameId) {
  try {
    const data = await import(`../data/${gameId}.js`);
    return normalizeGameData(data.default || data);
  } catch (error) {
    console.error("Failed to load game data:", error);

    // fallback to empty safe structure (prevents crashes)
    return normalizeGameData({});
  }
}

/**
 * Normalize entire game data object
 */
function normalizeGameData(raw = {}) {
  return {
    meta: normalizeMeta(raw.meta),
    counters: normalizeCounters(raw.counters),
    defaultSplits: normalizeSplits(raw.defaultSplits),
    phases: normalizePhases(raw.phases),
    quotas: normalizeQuotas(raw.quotas)
  };
}

/**
 * META
 */
function normalizeMeta(meta = {}) {
  return {
    title: meta.title || "Ghost of Tsushima",
    subtitle: meta.subtitle || "Speedrun Controller"
  };
}

/**
 * COUNTERS
 */
function normalizeCounters(counters = {}) {
  const result = {};

  Object.entries(counters).forEach(([key, def]) => {
    result[key] = {
      label: def.label || key,
      shortLabel: def.shortLabel || def.label || key,
      icon: def.icon || "",
      max: Number(def.max || 0)
    };
  });

  return result;
}

/**
 * DEFAULT SPLITS
 */
function normalizeSplits(splits = []) {
  if (!Array.isArray(splits)) return [];

  return splits.map((split, i) => ({
    id: split.id || `split_${i}`,
    label: split.label || `Split ${i + 1}`,

    phase:
      split.phase ||
      split.phaseId ||
      split.act ||
      null,

    note: split.note || "",

    auto: normalizeAuto(split.auto)
  }));
}

/**
 * PHASES
 */
function normalizePhases(phases = {}) {
  const result = {};

  Object.entries(phases).forEach(([key, def]) => {
    result[key] = {
      id: key,
      label: def.label || key,
      description: def.description || "",
      note: def.note || "",

      // visibility
      visibleCounters: Array.isArray(def.visibleCounters)
        ? def.visibleCounters
        : [],

      objectives: Array.isArray(def.objectives)
        ? def.objectives
        : []
    };
  });

  return result;
}

/**
 * QUOTAS
 */
function normalizeQuotas(quotas = {}) {
  const result = {};

  Object.entries(quotas).forEach(([phaseId, q]) => {
    const normalized = {};

    Object.entries(q || {}).forEach(([key, value]) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      if (n <= 0) return;

      normalized[key] = n;
    });

    result[phaseId] = normalized;
  });

  return result;
}

/**
 * AUTO NORMALIZER
 */
function normalizeAuto(auto) {
  if (!auto || typeof auto !== "object") return {};

  const result = {};

  Object.entries(auto).forEach(([key, value]) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (n === 0) return;

    result[key] = n;
  });

  return result;
}
