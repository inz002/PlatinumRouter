function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildDefaultPhase(phaseId) {
  return {
    label: phaseId,
    note: "",
    visible: []
  };
}

function buildDefaultQuota(phaseId) {
  return {
    label: phaseId,
    targets: {}
  };
}

export function createActsEditor({
  overlayEl,
  phaseListEl,
  formEl,
  addBtn,
  closeBtn,
  saveBtn,
  resetBtn,
  exportBtn,
  copyBtn,
  getPhases,
  getQuotas,
  getCounterDefs,
  setPhases,
  setQuotas,
  onAfterSave
}) {
  const state = {
    draftPhases: {},
    draftQuotas: {},
    selectedPhaseId: null
  };

  function open() {
    state.draftPhases = clone(getPhases() || {});
    state.draftQuotas = clone(getQuotas() || {});

    const phaseIds = getSortedPhaseIds();
    state.selectedPhaseId = phaseIds[0] || null;

    render();
    overlayEl.classList.add("open");
  }

  function close() {
    overlayEl.classList.remove("open");
  }

  function reset() {
    state.draftPhases = clone(getPhases() || {});
    state.draftQuotas = clone(getQuotas() || {});
    const phaseIds = getSortedPhaseIds();
    state.selectedPhaseId = phaseIds.includes(state.selectedPhaseId)
      ? state.selectedPhaseId
      : phaseIds[0] || null;
    render();
  }

  function save() {
    setPhases(clone(state.draftPhases));
    setQuotas(clone(state.draftQuotas));
    close();
    if (typeof onAfterSave === "function") onAfterSave();
  }

  function exportDraft() {
    const payload = {
      phases: state.draftPhases,
      quotas: state.draftQuotas,
      exportedAt: new Date().toISOString(),
      source: "acts-editor"
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `acts-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
  }

  async function copyDraft() {
    const payload = {
      phases: state.draftPhases,
      quotas: state.draftQuotas,
      exportedAt: new Date().toISOString(),
      source: "acts-editor"
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert("Act config copied.");
    } catch (error) {
      console.error(error);
      alert("Clipboard blocked. Use export instead.");
    }
  }

  function addPhase() {
    const baseId = `new_phase_${getSortedPhaseIds().length + 1}`;
    let phaseId = baseId;
    let n = 2;

    while (state.draftPhases[phaseId] || state.draftQuotas[phaseId]) {
      phaseId = `${baseId}_${n}`;
      n += 1;
    }

    state.draftPhases[phaseId] = buildDefaultPhase(phaseId);
    state.draftQuotas[phaseId] = buildDefaultQuota(phaseId);
    state.selectedPhaseId = phaseId;
    render();
  }

  function removePhase(phaseId) {
    if (!phaseId) return;

    delete state.draftPhases[phaseId];
    delete state.draftQuotas[phaseId];

    const phaseIds = getSortedPhaseIds();
    state.selectedPhaseId = phaseIds[0] || null;
    render();
  }

  function renamePhaseId(oldId, nextIdRaw) {
    const nextId = String(nextIdRaw || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (!oldId || !nextId || oldId === nextId) return;
    if (state.draftPhases[nextId] || state.draftQuotas[nextId]) return;

    const nextPhases = {};
    const nextQuotas = {};

    Object.keys(state.draftPhases).forEach((key) => {
      nextPhases[key === oldId ? nextId : key] = state.draftPhases[key];
    });

    Object.keys(state.draftQuotas).forEach((key) => {
      nextQuotas[key === oldId ? nextId : key] = state.draftQuotas[key];
    });

    state.draftPhases = nextPhases;
    state.draftQuotas = nextQuotas;
    state.selectedPhaseId = nextId;
    render();
  }

  function setPhaseField(phaseId, field, value) {
    ensurePhase(phaseId);
    state.draftPhases[phaseId][field] = value;
  }

  function toggleVisibleCounter(phaseId, counterKey) {
    ensurePhase(phaseId);
    const current = Array.isArray(state.draftPhases[phaseId].visible)
      ? [...state.draftPhases[phaseId].visible]
      : [];

    const index = current.indexOf(counterKey);
    if (index >= 0) {
      current.splice(index, 1);
    } else {
      current.push(counterKey);
    }

    state.draftPhases[phaseId].visible = current;
  }

  function setQuotaLabel(phaseId, value) {
    ensureQuota(phaseId);
    state.draftQuotas[phaseId].label = value;
  }

  function setQuotaTarget(phaseId, counterKey, value) {
    ensureQuota(phaseId);

    const numeric = Math.max(0, Number(value || 0));
    if (!state.draftQuotas[phaseId].targets) {
      state.draftQuotas[phaseId].targets = {};
    }

    if (!numeric) {
      delete state.draftQuotas[phaseId].targets[counterKey];
    } else {
      state.draftQuotas[phaseId].targets[counterKey] = numeric;
    }
  }

  function ensurePhase(phaseId) {
    if (!state.draftPhases[phaseId]) {
      state.draftPhases[phaseId] = buildDefaultPhase(phaseId);
    }
  }

  function ensureQuota(phaseId) {
    if (!state.draftQuotas[phaseId]) {
      state.draftQuotas[phaseId] = buildDefaultQuota(phaseId);
    }
  }

  function getSortedPhaseIds() {
    return Array.from(
      new Set([
        ...Object.keys(state.draftPhases || {}),
        ...Object.keys(state.draftQuotas || {})
      ])
    ).sort();
  }

  function renderPhaseList() {
    phaseListEl.innerHTML = "";
    const phaseIds = getSortedPhaseIds();

    if (!phaseIds.length) {
      phaseListEl.innerHTML = `<div class="subtitle">No phases yet.</div>`;
      return;
    }

    phaseIds.forEach((phaseId) => {
      const phase = state.draftPhases[phaseId] || buildDefaultPhase(phaseId);
      const quota = state.draftQuotas[phaseId] || buildDefaultQuota(phaseId);
      const visibleCount = Array.isArray(phase.visible) ? phase.visible.length : 0;
      const targetCount = Object.keys(quota.targets || {}).length;
      const active = phaseId === state.selectedPhaseId;

      const button = document.createElement("button");
      button.type = "button";
      button.className = `split ${active ? "active" : ""}`;
      button.innerHTML = `
        <div>🧭</div>
        <div>
          <div>${escapeHtml(phase.label || phaseId)}</div>
          <div class="splitSub">${escapeHtml(phaseId)} · ${visibleCount} visible · ${targetCount} targets</div>
        </div>
        <div>›</div>
      `;

      button.addEventListener("click", () => {
        state.selectedPhaseId = phaseId;
        render();
      });

      phaseListEl.appendChild(button);
    });
  }

  function renderForm() {
    formEl.innerHTML = "";

    const phaseId = state.selectedPhaseId;
    if (!phaseId) {
      formEl.innerHTML = `<div class="subtitle">Select or add a phase.</div>`;
      return;
    }

    ensurePhase(phaseId);
    ensureQuota(phaseId);

    const phase = state.draftPhases[phaseId];
    const quota = state.draftQuotas[phaseId];
    const counterDefs = getCounterDefs() || {};

    const visibleSet = new Set(phase.visible || []);

    const visibleFields = Object.entries(counterDefs)
      .map(
        ([key, def]) => `
          <label class="miniChip" style="justify-content:flex-start">
            <input type="checkbox" data-visible-key="${escapeHtml(key)}" ${
              visibleSet.has(key) ? "checked" : ""
            } />
            <span>${def.icon} ${escapeHtml(def.label)}</span>
          </label>
        `
      )
      .join("");

    const quotaFields = Object.entries(counterDefs)
      .map(
        ([key, def]) => `
          <div class="field">
            <label>${def.icon} ${escapeHtml(def.label)}</label>
            <input
              type="number"
              min="0"
              data-target-key="${escapeHtml(key)}"
              value="${quota.targets?.[key] ?? 0}"
            />
          </div>
        `
      )
      .join("");

    formEl.innerHTML = `
      <div class="editorCard">
        <div class="row between" style="margin-bottom:10px">
          <div class="eyebrow">Phase Configuration</div>
          <button type="button" class="btn danger" id="actsRemovePhaseBtn">Remove Phase</button>
        </div>

        <div class="editorTop">
          <div class="field">
            <label>Phase ID</label>
            <input type="text" id="actsPhaseIdInput" value="${escapeHtml(phaseId)}" />
          </div>
          <div class="field">
            <label>Phase Label</label>
            <input type="text" id="actsPhaseLabelInput" value="${escapeHtml(phase.label || "")}" />
          </div>
        </div>

        <div class="field" style="margin-bottom:10px">
          <label>Phase Note</label>
          <textarea id="actsPhaseNoteInput" style="min-height:90px;resize:vertical">${escapeHtml(
            phase.note || ""
          )}</textarea>
        </div>

        <div class="field" style="margin-bottom:10px">
          <label>Quota Label</label>
          <input type="text" id="actsQuotaLabelInput" value="${escapeHtml(quota.label || phase.label || phaseId)}" />
        </div>

        <div class="field" style="margin-bottom:10px">
          <label>Visible Objectives</label>
          <div class="visibleList">${visibleFields}</div>
        </div>

        <div class="field">
          <label>Quota Targets</label>
          <div class="editorCounters">${quotaFields}</div>
        </div>
      </div>
    `;

    const removeBtn = document.getElementById("actsRemovePhaseBtn");
    const phaseIdInput = document.getElementById("actsPhaseIdInput");
    const phaseLabelInput = document.getElementById("actsPhaseLabelInput");
    const phaseNoteInput = document.getElementById("actsPhaseNoteInput");
    const quotaLabelInput = document.getElementById("actsQuotaLabelInput");

    removeBtn?.addEventListener("click", () => removePhase(phaseId));

    phaseIdInput?.addEventListener("change", (e) => {
      renamePhaseId(phaseId, e.target.value);
    });

    phaseLabelInput?.addEventListener("input", (e) => {
      setPhaseField(phaseId, "label", e.target.value);
      renderPhaseList();
    });

    phaseNoteInput?.addEventListener("input", (e) => {
      setPhaseField(phaseId, "note", e.target.value);
    });

    quotaLabelInput?.addEventListener("input", (e) => {
      setQuotaLabel(phaseId, e.target.value);
      renderPhaseList();
    });

    formEl.querySelectorAll("input[data-visible-key]").forEach((input) => {
      input.addEventListener("change", () => {
        toggleVisibleCounter(phaseId, input.dataset.visibleKey);
      });
    });

    formEl.querySelectorAll("input[data-target-key]").forEach((input) => {
      input.addEventListener("input", () => {
        setQuotaTarget(phaseId, input.dataset.targetKey, input.value);
        renderPhaseList();
      });
    });
  }

  function render() {
    renderPhaseList();
    renderForm();
  }

  addBtn?.addEventListener("click", addPhase);
  closeBtn?.addEventListener("click", close);
  saveBtn?.addEventListener("click", save);
  resetBtn?.addEventListener("click", reset);
  exportBtn?.addEventListener("click", exportDraft);
  copyBtn?.addEventListener("click", copyDraft);

  overlayEl?.addEventListener("click", (e) => {
    if (e.target === overlayEl) close();
  });

  return {
    open,
    close,
    render
  };
}
