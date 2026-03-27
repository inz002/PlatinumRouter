import {
  COUNTER_DEFS,
  PHASES,
  DEFAULT_SPLITS,
  clone,
  clamp,
  normalizeSplit,
  normalizeSplits,
  exportJson
} from "./data.js";

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
  onAfterSave
}) {
  const state = {
    draft: normalizeSplits(getSplits()),
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
    state.draft = normalizeSplits(DEFAULT_SPLITS);
    render();
  }

  function save() {
    setSplits(normalizeSplits(state.draft));
    close();
    if (typeof onAfterSave === "function") onAfterSave();
  }

  function getBackupPayload() {
    return {
      splits: state.draft,
      exportedAt: new Date().toISOString(),
      source: "split-editor"
    };
  }

  async function copyBackup() {
    const text = JSON.stringify(getBackupPayload(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert("Split backup copied.");
    } catch (e) {
      console.error(e);
      alert("Clipboard blocked. Use export instead.");
    }
  }

  function downloadBackup() {
    exportJson(getBackupPayload(), "got-split-backup");
  }

  function buildSplitId(label, index) {
    const base =
      String(label || `split-${index + 1}`)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `split-${index + 1}`;

    let id = base;
    let n = 2;
    const existing = new Set(state.draft.map((s) => s.id));

    while (existing.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }

    return id;
  }

  function addSplit() {
    const i = state.draft.length;
    state.draft.push(
      normalizeSplit({
        id: buildSplitId(`New Split ${i + 1}`, i),
        label: `New Split ${i + 1}`
      })
    );
    render();
  }

  function insertSplit(afterIndex) {
    const insertAt = afterIndex + 1;
    const label = `New Split ${insertAt + 1}`;
    state.draft.splice(
      insertAt,
      0,
      normalizeSplit({
        id: buildSplitId(label, insertAt),
        label
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
    const normalized = clamp(Number(value || 0), 0, COUNTER_DEFS[key].max);
    if (!state.draft[index].auto) state.draft[index].auto = {};
    if (normalized === 0) delete state.draft[index].auto[key];
    else state.draft[index].auto[key] = normalized;
  }

  function render() {
    gridEl.innerHTML = "";

    const phaseOptions = (selected = "") =>
      [
        '<option value="">No phase change</option>',
        ...Object.entries(PHASES)
          .filter(([id]) => id !== "legacy_all")
          .map(
            ([id, phase]) =>
              `<option value="${id}" ${selected === id ? "selected" : ""}>${phase.label}</option>`
          )
      ].join("");

    state.draft.forEach((rawSplit, index) => {
      const split = normalizeSplit(rawSplit);
      const wrap = document.createElement("div");

      const card = document.createElement("div");
      card.className = "editorCard";

      const fields = Object.keys(COUNTER_DEFS)
        .map(
          (key) => `
            <div class="field">
              <label>${COUNTER_DEFS[key].icon} ${COUNTER_DEFS[key].label}</label>
              <input
                type="number"
                min="0"
                max="${COUNTER_DEFS[key].max}"
                data-split-index="${index}"
                data-counter-key="${key}"
                value="${split.auto[key] || 0}"
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
            <input type="text" data-label-index="${index}" value="${escapeHtml(split.label)}" />
          </div>
          <div class="field">
            <label>Split id</label>
            <input type="text" value="${escapeHtml(split.id)}" disabled />
          </div>
        </div>

        <div class="field" style="margin-bottom:10px">
          <label>Objective note</label>
          <textarea data-note-index="${index}" style="min-height:64px;resize:vertical">${escapeHtml(split.note || "")}</textarea>
        </div>

        <div class="editorTop">
          <div class="field">
            <label>Phase start marker</label>
            <select data-phase-index="${index}">
              ${phaseOptions(split.phaseId)}
            </select>
          </div>
          <div class="field">
            <label>Apply phase marker here</label>
            <select data-phase-flag-index="${index}">
              <option value="false" ${!split.isPhaseStart ? "selected" : ""}>No</option>
              <option value="true" ${split.isPhaseStart ? "selected" : ""}>Yes</option>
            </select>
          </div>
        </div>

        <div class="editorCounters">${fields}</div>
      `;

      wrap.appendChild(card);

      if (index < state.draft.length - 1) {
        const insert = document.createElement("div");
        insert.className = "editorInsert";
        insert.innerHTML = `<button class="btn editorInsertBtn" data-insert-after="${index}">＋</button>`;
        wrap.appendChild(insert);
      }

      gridEl.appendChild(wrap);
    });

    bindEditorEvents();
  }

  function bindEditorEvents() {
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
      el.addEventListener("click", () => insertSplit(Number(el.dataset.insertAfter)));
    });
  }

  addBtn?.addEventListener("click", addSplit);
  resetBtn?.addEventListener("click", reset);
  closeBtn?.addEventListener("click", close);
  saveBtn?.addEventListener("click", save);
  downloadBtn?.addEventListener("click", downloadBackup);
  copyBtn?.addEventListener("click", copyBackup);

  overlayEl?.addEventListener("click", (e) => {
    if (e.target === overlayEl) close();
  });

  return {
    open,
    close,
    reset,
    save,
    getDraft: () => clone(state.draft)
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
