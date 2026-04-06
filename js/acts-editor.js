// js/acts-editor.js

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePhase(phaseId, phase = {}, counterDefs = {}) {
  const visibleCounters = Array.isArray(phase.visibleCounters)
    ? phase.visibleCounters
    : Array.isArray(phase.visible)
      ? phase.visible
      : Array.isArray(phase.objectives)
        ? phase.objectives
        : [];

  const filteredVisible = visibleCounters.filter((key) => counterDefs[key]);

  const targetMinutes = Number(phase.targetMinutes);

  return {
    id: phaseId || "",
    label: phase.label || phaseId || "",
    description: phase.description || "",
    note: phase.note || "",
    objectiveNote: phase.objectiveNote || phase.currentNote || "",
    visibleCounters: filteredVisible,
    targetMinutes: Number.isFinite(targetMinutes) && targetMinutes > 0 ? targetMinutes : 0
  };
}

function normalizeQuotas(quotas = {}, counterDefs = {}) {
  const result = {};
  Object.entries(safeObject(quotas)).forEach(([key, value]) => {
    const n = Number(value);
    if (!counterDefs[key]) return;
    if (!Number.isFinite(n) || n <= 0) return;
    result[key] = n;
  });
  return result;
}

function getPhaseIds(phases) {
  return Object.keys(safeObject(phases));
}

function buildFormHtml(phaseId, phase, quotas, counterDefs) {
  if (!phaseId) return `<div class="editorCard">No phase selected</div>`;

  return `
    <div class="editorCard">
      <div class="fields">
        <label class="field">
          <span>Phase ID</span>
          <input id="phaseIdInput" value="${escapeHtml(phaseId)}" />
        </label>

        <label class="field">
          <span>Label</span>
          <input id="phaseLabelInput" value="${escapeHtml(phase.label || "")}" />
        </label>

        <label class="field">
          <span>Target Minutes (PACE)</span>
          <input type="number" id="phaseTargetMinutesInput" value="${phase.targetMinutes || 0}" />
        </label>
      </div>
    </div>
  `;
}

export function createActsEditor(config) {
  const {
    formEl,
    getPhases,
    getQuotas,
    getCounterDefs,
    setPhases,
    setQuotas
  } = config;

  let workingPhases = {};
  let workingQuotas = {};
  let selectedPhaseId = "";

  function sync() {
    const counterDefs = getCounterDefs();
    const source = getPhases();

    workingPhases = {};
    Object.entries(source).forEach(([id, p]) => {
      workingPhases[id] = normalizePhase(id, p, counterDefs);
    });

    selectedPhaseId = Object.keys(workingPhases)[0];
    render();
  }

  function render() {
    const phase = workingPhases[selectedPhaseId];
    formEl.innerHTML = buildFormHtml(selectedPhaseId, phase, {}, getCounterDefs());
  }

  function collect() {
    const phase = workingPhases[selectedPhaseId];
    if (!phase) return;

    const targetMinutes = Number(
      formEl.querySelector("#phaseTargetMinutesInput")?.value
    );

    phase.targetMinutes =
      Number.isFinite(targetMinutes) && targetMinutes > 0
        ? targetMinutes
        : 0;
  }

  function save() {
    collect();

    const next = {};
    Object.entries(workingPhases).forEach(([id, p]) => {
      next[id] = {
        ...p,
        targetMinutes: p.targetMinutes
      };
    });

    setPhases(next);
  }

  sync();

  return { save };
}
