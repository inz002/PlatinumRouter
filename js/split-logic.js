export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeSplit(split) {
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

export function normalizeSplits(splits, fallback = []) {
  const source = Array.isArray(splits) && splits.length ? splits : fallback;
  return source.map(normalizeSplit);
}

export function buildCounters(counterDefs) {
  const out = {};
  Object.entries(counterDefs || {}).forEach(([key, def]) => {
    out[key] = {
      ...def,
      value: 0,
      manualDelta: 0
    };
  });
  return out;
}

export function applyAutoProgress(counters, deltaMap = {}) {
  const next = clone(counters);

  Object.entries(deltaMap).forEach(([key, value]) => {
    if (!next[key]) return;
    next[key].value = clamp(next[key].value + value, 0, next[key].max);
  });

  return next;
}

export function reverseAutoProgress(counters, deltaMap = {}) {
  const next = clone(counters);

  Object.entries(deltaMap).forEach(([key, value]) => {
    if (!next[key]) return;
    next[key].value = clamp(next[key].value - value, 0, next[key].max);
  });

  return next;
}

export function getActivePhaseId(splits, currentSplitIndex, phases) {
  let active = "legacy_all";

  for (let i = 0; i <= currentSplitIndex && i < splits.length; i += 1) {
    const split = normalizeSplit(splits[i]);
    if (split.isPhaseStart && split.phaseId && phases?.[split.phaseId]) {
      active = split.phaseId;
    }
  }

  return active;
}

export function buildSplitHistoryEntry({
  splitIndex,
  split,
  elapsedMs,
  previousCumulativeMs
}) {
  return {
    splitIndex,
    label: split.label,
    cumulativeMs: elapsedMs,
    segmentMs: Math.max(0, elapsedMs - previousCumulativeMs),
    autoApplied: split.auto || {},
    at: new Date().toISOString()
  };
}

export function computeOverallPercent(counterDefs, counters, miscChecks = { dirge: false }) {
  const keys = Object.keys(counterDefs || {});
  const total =
    keys.reduce((sum, key) => sum + (counters[key]?.value || 0), 0) +
    (miscChecks.dirge ? 1 : 0);

  const max =
    keys.reduce((sum, key) => sum + (counterDefs[key]?.max || 0), 0) + 1;

  return max ? Math.round((total / max) * 100) : 0;
}

export function computeAct1Percent(counterDefs, counters) {
  const keys = Object.keys(counterDefs || {}).filter(
    (key) => (counterDefs[key]?.act1 || 0) > 0
  );

  const done = keys.reduce(
    (sum, key) =>
      sum + Math.min(counters[key]?.value || 0, counterDefs[key]?.act1 || 0),
    0
  );

  const total = keys.reduce((sum, key) => sum + (counterDefs[key]?.act1 || 0), 0);

  return total ? Math.round((done / total) * 100) : 0;
}

export function getAct1QuotaText(counterDefs, counters) {
  const keys = Object.keys(counterDefs || {}).filter(
    (key) => (counterDefs[key]?.act1 || 0) > 0
  );

  return keys
    .map((key) => {
      const def = counterDefs[key];
      const value = Math.min(counters[key]?.value || 0, def.act1 || 0);
      return `${value}/${def.act1} ${def.icon}`;
    })
    .join(" · ");
}