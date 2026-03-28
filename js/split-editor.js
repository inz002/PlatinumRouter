import { clone, clamp, normalizeSplit, normalizeSplits } from "./split-logic.js";

export function createSplitEditor({
  overlayEl,
  gridEl,
  addBtn,
  resetBtn,
  closeBtn,
  saveBtn,
  downloadBtn,
  copyBtn,
  getSplits,
  setSplits,
  getPhases,
  getCounterDefs,
  onAfterSave
}) {
  const state = {
    draft: normalizeSplits(getSplits())
  };

  function open() {
    state.draft = normalizeSplits(getSplits());
    render();
    overlayEl.classList.add("open");
  }

  function close() {
    overlayEl.classList.remove("open");
  }

  function reset() {
    state.draft = normalizeSplits(getSplits());
    render();
  }

  function save() {
    setSplits(normalizeSplits(state.draft));
    close();
    if (typeof onAfterSave === "function") onAfterSave();
  }

  function exportDraft() {
    downloadJson(
      {
        splits: state.draft,
        exportedAt: new Date().toISOString(),
        source: "split-editor"
      },
      "split-backup"
    );
  }

  async function copyDraft() {
    const text = JSON.stringify(
      {
        splits: state.draft,
        exportedAt: new Date().toISOString(),
        source: "split-editor"
      },
      null,
      2
    );

    try {
      await navigator.clipboard.writeText(text);
      alert("Split backup copied.");
    } catch (error) {
      console.error(error);
      alert("Clipboard blocked. Use export instead.");
    }
  }

  function addSplit() {
    const nextIndex = state.draft.length + 1;
    state.draft.push(
      normalizeSplit({
        id: buildUniqueId(`new-split-${nextIndex}`),
        label: `New Split ${nextIndex}`
      })
    );
    render();
  }

  function insertAfter(index) {
    const nextIndex = index + 2;
    state.draft.splice(
      index + 1,
      0,
      normalizeSplit({
        id: buildUniqueId(`new-split-${nextIndex}`),
        label: `New Split ${nextIndex}`
      })
    );
    render();
  }

  function removeSplit(index) {
    if (state.draft.length <= 1) return;
    state.draft.splice(index, 1);
    render();
  }

  function moveSplit(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= state.draft.length) return;
    [state.draft[index], state.draft[target]] = [state.draft[target], state.draft[index]];
    render();
  }

  function setLabel(index, value) {
    state.draft[index].label = value;
  }

  function setNote(index, value) {
    state.draft[index].note = value;
  }

  function setPhase(index, value) {
    state.draft[index].phaseId = value;
  }

  function setPhaseFlag(index, value) {
    state.draft[index].isPhaseStart = value === "true";
  }

  function setAuto(index, key, value) {
    const defs = getCounterDefs();
    const max = defs[key]?.max ?? 999;
    const normalized = clamp(Number(value || 0), 0, max);
    if (!state.draft[index].auto) state.draft[index].auto = {};
    if (normalized === 0) delete state.draft[index].auto[key];
    else state.draft[index].auto[key] = normalized;
  }

  function render() {
    const defs = getCounterDefs();
    const phases = getPhases();

    gridEl.innerHTML = "";

    state.draft.forEach((split, index) => {
      const safe = normalizeSplit(split);
      const cardWrap = document.createElement("div");

      const card = document.createElement("div");
      card.className = "editorCard";

      const phaseOptions = [
        `<option value="">No phase change</option>`,
        ...Object.entries(phases)
          .filter(([id]) => id !== "legacy_all")
          .map(
            ([id, phase]) =>
              `<option value="${id}" ${safe.phaseId === id ? "selected" : ""}>${escapeHtml(
                phase.label
              )}</option>`
          )
      ].join("");

      const counterFields = Object.entries(defs)
        .map(
          ([key, def]) => `
            <div class="field">
              <label>${def.icon} ${escapeHtml(def.label)}</label>
              <input
                type="number"
                min="0"
                max="${def.max}"
                data-split-index="${index}"
                data-counter-key="${key}"
                value="${safe.auto[key] || 0}"
              />
            </div>
          `
        )
        .join("");

      card.innerHTML = `
        <div class="row between" style="margin-bottom:10px">
          <div class="eyebrow">Split ${index + 1}</div>
          <div class="row">
            <button class="btn small" data-move-up="${index}" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="btn small" data-move-down="${index}" ${index === state.draft.length - 1 ? "disabled" : ""}>↓</button>
            <button class="btn danger small" data-remove="${index}" ${state.draft.length <= 1 ? "disabled" : ""}>Remove</button>
          </div>
        </div>

        <div class="editorTop">
          <div class="field">
            <label>Split label</label>
            <input type="text" data-label-index="${index}" value="${escapeHtml(safe.label)}" />
          </div>
          <div class="field">
            <label>Split id</label>
            <input type="text" value="${escapeHtml(safe.id)}" disabled />
          </div>
        </div>

        <div class="field" style="margin-bottom:10px">
          <label>Objective note</label>
          <textarea data-note-index="${index}" style="min-height:64px;resize:vertical">${escapeHtml(
            safe.note || ""
          )}</textarea>
        </div>

        <div class="editorTop">
          <div class="field">
            <label>Phase start marker</label>
            <select data-phase-index="${index}">
              ${phaseOptions}
            </select>
          </div>
          <div class="field">
            <label>Apply phase marker here</label>
            <select data-phase-flag-index="${index}">
              <option value="false" ${!safe.isPhaseStart ? "selected" : ""}>No</option>
              <option value="true" ${safe.isPhaseStart ? "selected" : ""}>Yes</option>
            </select>
          </div>
        </div>

        <div class="editorCounters">
          ${counterFields}
        </div>
      `;

      cardWrap.appendChild(card);

      if (index < state.draft.length - 1) {
        const insertRow = document.createElement("div");
        insertRow.className = "editorInsert";
        insertRow.innerHTML = `<button class="btn editorInsertBtn" data-insert-after="${index}">＋</button>`;
        cardWrap.appendChild(insertRow);
      }

      gridEl.appendChild(cardWrap);
    });

    bindEvents();
  }

  function bindEvents() {
    gridEl.querySelectorAll("input[data-label-index]").forEach((el) => {
      el.addEventListener("input", (e) => {
        setLabel(Number(e.target.dataset.labelIndex), e.target.value);
      });
    });

    gridEl.querySelectorAll("textarea[data-note-index]").forEach((el) => {
      el.addEventListener("input", (e) => {
        setNote(Number(e.target.dataset.noteIndex), e.target.value);
      });
    });

    gridEl.querySelectorAll("select[data-phase-index]").forEach((el) => {
      el.addEventListener("change", (e) => {
        setPhase(Number(e.target.dataset.phaseIndex), e.target.value);
      });
    });

    gridEl.querySelectorAll("select[data-phase-flag-index]").forEach((el) => {
      el.addEventListener("change", (e) => {
        setPhaseFlag(Number(e.target.dataset.phaseFlagIndex), e.target.value);
      });
    });

    gridEl.querySelectorAll("input[data-counter-key]").forEach((el) => {
      el.addEventListener("input", (e) => {
        setAuto(
          Number(e.target.dataset.splitIndex),
          e.target.dataset.counterKey,
          e.target.value
        );
      });
    });

    gridEl.querySelectorAll("button[data-remove]").forEach((el) => {
      el.addEventListener("click", () => removeSplit(Number(el.dataset.remove)));
    });

    gridEl.querySelectorAll("button[data-move-up]").forEach((el) => {
      el.addEventListener("click", () => moveSplit(Number(el.dataset.moveUp), -1));
    });

    gridEl.querySelectorAll("button[data-move-down]").forEach((el) => {
      el.addEventListener("click", () => moveSplit(Number(el.dataset.moveDown), 1));
    });

    gridEl.querySelectorAll("button[data-insert-after]").forEach((el) => {
      el.addEventListener("click", () => insertAfter(Number(el.dataset.insertAfter)));
    });
  }

  function buildUniqueId(base) {
    let id = base;
    let n = 2;
    const existing = new Set(state.draft.map((s) => s.id));
    while (existing.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    return id;
  }

  addBtn?.addEventListener("click", addSplit);
  resetBtn?.addEventListener("click", reset);
  closeBtn?.addEventListener("click", close);
  saveBtn?.addEventListener("click", save);
  downloadBtn?.addEventListener("click", exportDraft);
  copyBtn?.addEventListener("click", copyDraft);

  overlayEl?.addEventListener("click", (e) => {
    if (e.target === overlayEl) close();
  });

  return {
    open,
    close,
    render,
    getDraft: () => clone(state.draft)
  };
}

function downloadJson(data, prefix) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}