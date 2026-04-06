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

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 250);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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

  const rawTargetMinutes =
    phase?.targetMinutes ??
    phase?.paceTargetMinutes ??
    phase?.actTargetMinutes ??
    0;

  const targetMinutes = Number(rawTargetMinutes);

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

function buildPhaseListHtml(phases, selectedPhaseId) {
  const phaseIds = getPhaseIds(phases);

  if (!phaseIds.length) {
    return `
      <div class="card">
        <div class="mid">No phases yet.</div>
        <div class="subtitle" style="margin-top:8px">Add a phase to begin.</div>
      </div>
    `;
  }

  return phaseIds.map((phaseId) => {
    const phase = phases[phaseId] || {};
    const active = phaseId === selectedPhaseId ? "primary" : "";
    return `
      <button
        type="button"
        class="btn full ${active}"
        data-phase-id="${escapeHtml(phaseId)}"
        style="margin-bottom:8px;text-align:left"
      >
        <div class="mid">${escapeHtml(phase.label || phaseId)}</div>
        <div class="subtitle" style="margin-top:4px">${escapeHtml(phaseId)}</div>
      </button>
    `;
  }).join("");
}

function buildCounterCheckboxes(counterDefs, selectedKeys = []) {
  const selectedSet = new Set(safeArray(selectedKeys));

  return Object.entries(safeObject(counterDefs)).map(([key, def]) => {
    const checked = selectedSet.has(key) ? "checked" : "";
    const label = def?.label || key;
    const icon = def?.icon ? `${escapeHtml(def.icon)} ` : "";

    return `
      <label class="row" style="justify-content:flex-start;gap:8px;cursor:pointer;margin-bottom:8px">
        <input type="checkbox" data-visible-key="${escapeHtml(key)}" ${checked} />
        <span>${icon}${escapeHtml(label)}</span>
      </label>
    `;
  }).join("");
}

function buildQuotaInputs(counterDefs, quotas = {}) {
  return Object.entries(safeObject(counterDefs)).map(([key, def]) => {
    const label = def?.label || key;
    const value = Number(quotas?.[key] || 0);

    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input type="number" step="1" min="0" data-quota-key="${escapeHtml(key)}" value="${value}" />
      </label>
    `;
  }).join("");
}

function buildFormHtml(phaseId, phase, quotas, counterDefs) {
  if (!phaseId) {
    return `
      <div class="editorCard">
        <div class="mid">No phase selected.</div>
        <div class="subtitle" style="margin-top:8px">Add or select a phase to edit it.</div>
      </div>
    `;
  }

  return `
    <div class="editorCard">
      <div class="row between" style="margin-bottom:12px;gap:8px;align-items:flex-start">
        <div>
          <div class="eyebrow">Phase</div>
          <div class="mid">${escapeHtml(phase.label || phaseId)}</div>
        </div>

        <button type="button" class="btn danger" id="deletePhaseBtn">Delete Phase</button>
      </div>

      <div class="fields">
        <label class="field">
          <span>Phase ID</span>
          <input type="text" id="phaseIdInput" value="${escapeHtml(phaseId)}" />
        </label>

        <label class="field">
          <span>Label</span>
          <input type="text" id="phaseLabelInput" value="${escapeHtml(phase.label || "")}" />
        </label>
      </div>

      <div class="fields">
        <label class="field">
          <span>Target Minutes</span>
          <input
            type="number"
            step="1"
            min="0"
            id="phaseTargetMinutesInput"
            value="${Number(phase.targetMinutes || 0)}"
          />
        </label>
      </div>

      <div class="fields">
        <label class="field" style="grid-column:1 / -1">
          <span>Description</span>
          <textarea id="phaseDescriptionInput" rows="3">${escapeHtml(phase.description || "")}</textarea>
        </label>
      </div>

      <div class="fields">
        <label class="field" style="grid-column:1 / -1">
          <span>Phase Note</span>
          <textarea id="phaseNoteInput" rows="3">${escapeHtml(phase.note || "")}</textarea>
        </label>
      </div>

      <div class="fields">
        <label class="field" style="grid-column:1 / -1">
          <span>Current Objective Note</span>
          <textarea id="phaseObjectiveNoteInput" rows="3">${escapeHtml(phase.objectiveNote || "")}</textarea>
        </label>
      </div>

      <div style="margin-top:18px">
        <div class="eyebrow" style="margin-bottom:10px">Visible Objectives</div>
        <div class="card">
          ${buildCounterCheckboxes(counterDefs, phase.visibleCounters || [])}
        </div>
      </div>

      <div style="margin-top:18px">
        <div class="eyebrow" style="margin-bottom:10px">Quota Targets</div>
        <div class="fields">
          ${buildQuotaInputs(counterDefs, quotas || {})}
        </div>
      </div>
    </div>
  `;
}

export function createActsEditor({
  overlayEl = null,
  phaseListEl,
  formEl,
  addBtn = null,
  closeBtn = null,
  saveBtn = null,
  resetBtn = null,
  exportBtn = null,
  importInput = null,
  copyBtn = null,
  getPhases,
  getQuotas,
  getCounterDefs,
  setPhases,
  setQuotas,
  onAfterSave = null
}) {
  if (!phaseListEl || !formEl) {
    throw new Error("createActsEditor: phaseListEl and formEl are required");
  }

  let workingPhases = {};
  let workingQuotas = {};
  let initialPhases = {};
  let initialQuotas = {};
  let selectedPhaseId = "";

  function getCounterDefsSafe() {
    return safeObject(getCounterDefs?.());
  }

  function readSource() {
    const counterDefs = getCounterDefsSafe();
    const sourcePhases = safeObject(getPhases?.());
    const sourceQuotas = safeObject(getQuotas?.());

    const phases = {};
    Object.entries(sourcePhases).forEach(([phaseId, phase]) => {
      phases[phaseId] = normalizePhase(phaseId, phase, counterDefs);
    });

    const quotas = {};
    Object.entries(sourceQuotas).forEach(([phaseId, value]) => {
      quotas[phaseId] = normalizeQuotas(value, counterDefs);
    });

    return { phases, quotas };
  }

  function ensureSelectedPhase() {
    const phaseIds = getPhaseIds(workingPhases);

    if (!phaseIds.length) {
      selectedPhaseId = "";
      return;
    }

    if (!selectedPhaseId || !workingPhases[selectedPhaseId]) {
      selectedPhaseId = phaseIds[0];
    }
  }

  function render() {
    ensureSelectedPhase();

    phaseListEl.innerHTML = buildPhaseListHtml(workingPhases, selectedPhaseId);

    const phase = selectedPhaseId ? workingPhases[selectedPhaseId] : null;
    const quotas = selectedPhaseId ? workingQuotas[selectedPhaseId] || {} : {};
    const counterDefs = getCounterDefsSafe();

    formEl.innerHTML = buildFormHtml(selectedPhaseId, phase || {}, quotas, counterDefs);
  }

  function syncFromSource() {
    const { phases, quotas } = readSource();

    initialPhases = clone(phases);
    initialQuotas = clone(quotas);
    workingPhases = clone(phases);
    workingQuotas = clone(quotas);

    ensureSelectedPhase();
    render();
  }

  function collectCurrentFormIntoState() {
    if (!selectedPhaseId || !workingPhases[selectedPhaseId]) return;

    const counterDefs = getCounterDefsSafe();

    const phaseIdInput = formEl.querySelector("#phaseIdInput");
    const phaseLabelInput = formEl.querySelector("#phaseLabelInput");
    const phaseTargetMinutesInput = formEl.querySelector("#phaseTargetMinutesInput");
    const phaseDescriptionInput = formEl.querySelector("#phaseDescriptionInput");
    const phaseNoteInput = formEl.querySelector("#phaseNoteInput");
    const phaseObjectiveNoteInput = formEl.querySelector("#phaseObjectiveNoteInput");

    const nextPhaseId = phaseIdInput?.value?.trim() || selectedPhaseId;
    const nextLabel = phaseLabelInput?.value?.trim() || nextPhaseId;
    const nextDescription = phaseDescriptionInput?.value || "";
    const nextNote = phaseNoteInput?.value || "";
    const nextObjectiveNote = phaseObjectiveNoteInput?.value || "";

    const rawTargetMinutes = Number(phaseTargetMinutesInput?.value || 0);
    const nextTargetMinutes =
      Number.isFinite(rawTargetMinutes) && rawTargetMinutes > 0
        ? rawTargetMinutes
        : 0;

    const visibleCounters = [];
    formEl.querySelectorAll("[data-visible-key]").forEach((checkbox) => {
      if (!checkbox.checked) return;
      const key = checkbox.dataset.visibleKey;
      if (!key || !counterDefs[key]) return;
      visibleCounters.push(key);
    });

    const nextQuotas = {};
    formEl.querySelectorAll("[data-quota-key]").forEach((input) => {
      const key = input.dataset.quotaKey;
      const n = Number(input.value || 0);
      if (!key || !counterDefs[key]) return;
      if (!Number.isFinite(n) || n <= 0) return;
      nextQuotas[key] = n;
    });

    const nextPhase = normalizePhase(nextPhaseId, {
      label: nextLabel,
      description: nextDescription,
      note: nextNote,
      objectiveNote: nextObjectiveNote,
      visibleCounters,
      targetMinutes: nextTargetMinutes
    }, counterDefs);

    if (nextPhaseId !== selectedPhaseId) {
      delete workingPhases[selectedPhaseId];
      delete workingQuotas[selectedPhaseId];
      selectedPhaseId = nextPhaseId;
    }

    workingPhases[selectedPhaseId] = nextPhase;
    workingQuotas[selectedPhaseId] = nextQuotas;
  }

  function addPhase() {
    collectCurrentFormIntoState();

    const baseId = "new_phase";
    let nextId = baseId;
    let counter = 1;

    while (workingPhases[nextId]) {
      nextId = `${baseId}_${counter}`;
      counter += 1;
    }

    workingPhases[nextId] = normalizePhase(nextId, {
      label: `New Phase ${counter}`,
      description: "",
      note: "",
      objectiveNote: "",
      visibleCounters: [],
      targetMinutes: 0
    }, getCounterDefsSafe());

    workingQuotas[nextId] = {};
    selectedPhaseId = nextId;
    render();
  }

  function deleteSelectedPhase() {
    if (!selectedPhaseId || !workingPhases[selectedPhaseId]) return;

    delete workingPhases[selectedPhaseId];
    delete workingQuotas[selectedPhaseId];

    const remaining = getPhaseIds(workingPhases);
    selectedPhaseId = remaining[0] || "";
    render();
  }

  function reset() {
    workingPhases = clone(initialPhases);
    workingQuotas = clone(initialQuotas);
    ensureSelectedPhase();
    render();
  }

  function buildExportPayload() {
    collectCurrentFormIntoState();

    const phases = {};
    Object.entries(workingPhases).forEach(([phaseId, phase]) => {
      phases[phaseId] = {
        label: phase.label,
        description: phase.description,
        note: phase.note,
        objectiveNote: phase.objectiveNote,
        visible: safeArray(phase.visibleCounters),
        targetMinutes: Number(phase.targetMinutes || 0)
      };
    });

    const quotas = {};
    Object.entries(workingQuotas).forEach(([phaseId, targets]) => {
      quotas[phaseId] = {
        label: workingPhases[phaseId]?.label || phaseId,
        targets: clone(targets || {})
      };
    });

    return {
      phases,
      quotas,
      exportedAt: new Date().toISOString()
    };
  }

  function save() {
    collectCurrentFormIntoState();

    const nextPhases = {};
    Object.entries(workingPhases).forEach(([phaseId, phase]) => {
      nextPhases[phaseId] = {
        label: phase.label,
        description: phase.description,
        note: phase.note,
        objectiveNote: phase.objectiveNote,
        visibleCounters: safeArray(phase.visibleCounters),
        objectives: safeArray(phase.visibleCounters),
        targetMinutes: Number(phase.targetMinutes || 0)
      };
    });

    const nextQuotas = {};
    Object.entries(workingQuotas).forEach(([phaseId, targets]) => {
      nextQuotas[phaseId] = clone(targets || {});
    });

    setPhases?.(nextPhases);
    setQuotas?.(nextQuotas);

    initialPhases = clone(workingPhases);
    initialQuotas = clone(workingQuotas);

    render();
    onAfterSave?.();
  }

  function exportJson() {
    downloadJson("phases-backup.json", buildExportPayload());
  }

  async function copyJson() {
    const ok = await copyText(JSON.stringify(buildExportPayload(), null, 2));
    if (!ok) {
      console.warn("Could not copy phase backup");
    }
  }

  async function importJson(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const counterDefs = getCounterDefsSafe();

      const parsedPhases =
        parsed && typeof parsed === "object" && parsed.phases && typeof parsed.phases === "object"
          ? parsed.phases
          : {};

      const parsedQuotas =
        parsed && typeof parsed === "object" && parsed.quotas && typeof parsed.quotas === "object"
          ? parsed.quotas
          : {};

      const nextPhases = {};
      Object.entries(parsedPhases).forEach(([phaseId, phase]) => {
        nextPhases[phaseId] = normalizePhase(phaseId, phase, counterDefs);
      });

      const nextQuotas = {};
      Object.entries(parsedQuotas).forEach(([phaseId, value]) => {
        const targets =
          value && typeof value === "object" && value.targets && typeof value.targets === "object"
            ? value.targets
            : value;
        nextQuotas[phaseId] = normalizeQuotas(targets, counterDefs);
      });

      workingPhases = nextPhases;
      workingQuotas = nextQuotas;
      ensureSelectedPhase();
      render();
    } catch (error) {
      console.error("Failed to import phases JSON", error);
      alert("Could not import phases JSON");
    }
  }

  function open() {
    syncFromSource();
    if (overlayEl) {
      overlayEl.classList.add("open");
      overlayEl.style.display = "block";
    }
  }

  function close() {
    if (overlayEl) {
      overlayEl.classList.remove("open");
      overlayEl.style.display = "none";
    }
  }

  addBtn?.addEventListener("click", addPhase);
  closeBtn?.addEventListener("click", close);
  saveBtn?.addEventListener("click", save);
  resetBtn?.addEventListener("click", reset);
  exportBtn?.addEventListener("click", exportJson);
  copyBtn?.addEventListener("click", copyJson);

  importInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      await importJson(file);
    }
    event.target.value = "";
  });

  overlayEl?.addEventListener("click", (event) => {
    if (event.target === overlayEl) {
      close();
    }
  });

  phaseListEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-phase-id]");
    if (!button) return;

    collectCurrentFormIntoState();
    selectedPhaseId = button.dataset.phaseId || "";
    render();
  });

  formEl.addEventListener("input", (event) => {
    if (event.target.id === "phaseLabelInput") {
      const current = formEl.querySelector(".mid");
      if (current) {
        current.textContent = event.target.value.trim() || selectedPhaseId || "Phase";
      }
    }
  });

  formEl.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest("#deletePhaseBtn");
    if (!deleteBtn) return;
    deleteSelectedPhase();
  });

  syncFromSource();

  return {
    open,
    close,
    save,
    reset,
    addPhase,
    exportJson,
    copyJson
  };
}
