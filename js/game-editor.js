// js/game-editor.js

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

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCounterKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
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
  } catch (error) {
    console.warn("Copy failed", error);
    return false;
  }
}

function normalizeCounterRow(row = {}, index = 0) {
  const key = normalizeCounterKey(row.key || `counter${index + 1}`);
  const max = Number(row.max || 0);
  const act1 = Number(row.act1 || 0);

  return {
    key,
    label: String(row.label || key || `Counter ${index + 1}`).trim(),
    icon: String(row.icon || ""),
    max: Number.isFinite(max) && max >= 0 ? max : 0,
    act1: Number.isFinite(act1) && act1 >= 0 ? act1 : 0
  };
}

function buildCounterRowHtml(row, index) {
  const item = normalizeCounterRow(row, index);

  return `
    <div class="editorCard" data-counter-row="${index}">
      <div class="row between" style="margin-bottom:12px;gap:8px;align-items:flex-start">
        <div>
          <div class="eyebrow">Counter ${index + 1}</div>
          <div class="mid">${escapeHtml(item.label || item.key || `Counter ${index + 1}`)}</div>
        </div>

        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn" data-row-action="move-up">↑</button>
          <button type="button" class="btn" data-row-action="move-down">↓</button>
          <button type="button" class="btn danger" data-row-action="delete">Delete</button>
        </div>
      </div>

      <div class="fields">
        <label class="field">
          <span>Key</span>
          <input type="text" data-field="key" value="${escapeHtml(item.key)}" placeholder="trophies" />
        </label>

        <label class="field">
          <span>Label</span>
          <input type="text" data-field="label" value="${escapeHtml(item.label)}" placeholder="Trophies" />
        </label>
      </div>

      <div class="fields">
        <label class="field">
          <span>Icon</span>
          <input type="text" data-field="icon" value="${escapeHtml(item.icon)}" placeholder="🏆" />
        </label>

        <label class="field">
          <span>Max</span>
          <input type="number" min="0" step="1" data-field="max" value="${item.max}" />
        </label>

        <label class="field">
          <span>Act 1</span>
          <input type="number" min="0" step="1" data-field="act1" value="${item.act1}" />
        </label>
      </div>
    </div>
  `;
}

let workingCounters = [];
let initialCounters = [];
let currentPackage = null;

function getFormValues() {
  const rawGameId = document.getElementById("gameIdInput")?.value || "";
  const gameId = normalizeId(rawGameId);
  const title = String(document.getElementById("gameTitleInput")?.value || "").trim();
  const subtitle = String(document.getElementById("gameSubtitleInput")?.value || "").trim();
  const difficulty = String(document.getElementById("gameDifficultyInput")?.value || "").trim();
  const defaultPhaseId = normalizeId(document.getElementById("defaultPhaseIdInput")?.value || "legacy_all");
  const defaultPhaseLabel = String(document.getElementById("defaultPhaseLabelInput")?.value || "").trim() || "Legacy All";

  return {
    gameId,
    title,
    subtitle,
    difficulty,
    defaultPhaseId,
    defaultPhaseLabel
  };
}

function refreshCounterHeaderTitles() {
  const gridEl = document.getElementById("counterBuilderGrid");
  if (!gridEl) return;

  gridEl.querySelectorAll("[data-counter-row]").forEach((row, index) => {
    row.dataset.counterRow = String(index);

    const labelInput = row.querySelector('[data-field="label"]');
    const keyInput = row.querySelector('[data-field="key"]');
    const eyebrow = row.querySelector(".eyebrow");
    const title = row.querySelector(".mid");

    if (eyebrow) eyebrow.textContent = `Counter ${index + 1}`;
    if (title) {
      title.textContent =
        labelInput?.value?.trim() ||
        keyInput?.value?.trim() ||
        `Counter ${index + 1}`;
    }
  });
}

function collectCountersFromDom() {
  const gridEl = document.getElementById("counterBuilderGrid");
  if (!gridEl) return [];

  const rows = Array.from(gridEl.querySelectorAll("[data-counter-row]"));

  workingCounters = rows.map((row, index) => {
    return normalizeCounterRow({
      key: row.querySelector('[data-field="key"]')?.value || "",
      label: row.querySelector('[data-field="label"]')?.value || "",
      icon: row.querySelector('[data-field="icon"]')?.value || "",
      max: row.querySelector('[data-field="max"]')?.value || 0,
      act1: row.querySelector('[data-field="act1"]')?.value || 0
    }, index);
  });

  return clone(workingCounters);
}

function buildCountersJson(rows) {
  const result = {};

  rows.forEach((row, index) => {
    const item = normalizeCounterRow(row, index);
    if (!item.key) return;

    result[item.key] = {
      label: item.label || item.key,
      icon: item.icon || "",
      max: item.max,
      act1: item.act1
    };
  });

  return result;
}

function buildGamesJsonEntry(gameId, title) {
  return {
    id: gameId,
    title,
    path: `./data/${gameId}`
  };
}

function buildMetaJson(title, subtitle, difficulty) {
  return {
    title: title || "Untitled Game",
    subtitle: subtitle || "Speedrun Controller",
    difficulty: difficulty || "Default",
    defaultDifficulty: difficulty || "Default"
  };
}

function buildPhasesJson(defaultPhaseId, defaultPhaseLabel, counterKeys) {
  return {
    [defaultPhaseId]: {
      label: defaultPhaseLabel,
      note: "Fallback phase generated by game editor.",
      targetMinutes: 0,
      visible: counterKeys
    }
  };
}

function buildQuotasJson(defaultPhaseId) {
  return {
    [defaultPhaseId]: {}
  };
}

function buildDefaultSplitsJson(defaultPhaseId) {
  return {
    splits: [
      {
        id: "start",
        label: "Start",
        phase: defaultPhaseId,
        note: "Generated starting split.",
        auto: {}
      }
    ]
  };
}

function buildPackage({ gameId, title, subtitle, difficulty, defaultPhaseId, defaultPhaseLabel }, rows) {
  const countersJson = buildCountersJson(rows);
  const counterKeys = Object.keys(countersJson);

  return {
    gamesJson: {
      defaultGameId: gameId,
      games: [
        buildGamesJsonEntry(gameId, title)
      ]
    },

    gameEntry: buildGamesJsonEntry(gameId, title),

    metaJson: buildMetaJson(title, subtitle, difficulty),

    countersJson,

    phasesJson: buildPhasesJson(defaultPhaseId, defaultPhaseLabel, counterKeys),

    quotasJson: buildQuotasJson(defaultPhaseId),

    defaultSplitsJson: buildDefaultSplitsJson(defaultPhaseId)
  };
}

function renderCounterBuilder() {
  const gridEl = document.getElementById("counterBuilderGrid");
  if (!gridEl) return;

  if (!workingCounters.length) {
    gridEl.innerHTML = `
      <div class="editorCard">
        <div class="mid">No counters yet.</div>
        <div class="subtitle" style="margin-top:8px">Add a counter to begin.</div>
      </div>
    `;
    renderLiveCountersPreview();
    return;
  }

  gridEl.innerHTML = workingCounters
    .map((row, index) => buildCounterRowHtml(row, index))
    .join("");

  refreshCounterHeaderTitles();
  renderLiveCountersPreview();
}

function renderLiveCountersPreview() {
  const rows = document.querySelectorAll("[data-counter-row]").length
    ? collectCountersFromDom()
    : workingCounters;

  setText("countersJsonOutput", prettyJson(buildCountersJson(rows)));
}

function renderPackage(pkg) {
  setText("gamesJsonOutput", prettyJson(pkg.gamesJson));
  setText("metaJsonOutput", prettyJson(pkg.metaJson));
  setText("countersJsonOutput", prettyJson(pkg.countersJson));
  setText("phasesJsonOutput", prettyJson(pkg.phasesJson));
  setText("quotasJsonOutput", prettyJson(pkg.quotasJson));
  setText("splitsJsonOutput", prettyJson(pkg.defaultSplitsJson));
}

function buildPackageText(pkg, gameId) {
  return [
    `// games.json entry`,
    prettyJson(pkg.gameEntry),
    ``,
    `// data/${gameId}/meta.json`,
    prettyJson(pkg.metaJson),
    ``,
    `// data/${gameId}/counters.json`,
    prettyJson(pkg.countersJson),
    ``,
    `// data/${gameId}/phases.json`,
    prettyJson(pkg.phasesJson),
    ``,
    `// data/${gameId}/quotas.json`,
    prettyJson(pkg.quotasJson),
    ``,
    `// data/${gameId}/default-splits.json`,
    prettyJson(pkg.defaultSplitsJson)
  ].join("\n");
}

function buildZiplessBundle(pkg, gameId) {
  return {
    "games-entry.json": pkg.gameEntry,
    [`data/${gameId}/meta.json`]: pkg.metaJson,
    [`data/${gameId}/counters.json`]: pkg.countersJson,
    [`data/${gameId}/phases.json`]: pkg.phasesJson,
    [`data/${gameId}/quotas.json`]: pkg.quotasJson,
    [`data/${gameId}/default-splits.json`]: pkg.defaultSplitsJson
  };
}

function validateInput(values, rows) {
  if (!values.gameId) {
    throw new Error("Game ID is required.");
  }

  if (!values.title) {
    throw new Error("Game title is required.");
  }

  if (!values.defaultPhaseId) {
    throw new Error("Default phase ID is required.");
  }

  if (!safeArray(rows).length) {
    throw new Error("Add at least one counter.");
  }

  const keys = rows.map((row) => normalizeCounterRow(row).key).filter(Boolean);
  const unique = new Set(keys);

  if (keys.length !== unique.size) {
    throw new Error("Counter keys must be unique.");
  }
}

function generate() {
  try {
    const values = getFormValues();
    const rows = collectCountersFromDom();

    validateInput(values, rows);

    currentPackage = buildPackage(values, rows);
    renderPackage(currentPackage);
  } catch (error) {
    alert(error.message || "Failed to generate scaffold.");
  }
}

function addCounter() {
  collectCountersFromDom();

  workingCounters.push(normalizeCounterRow({
    key: `counter${workingCounters.length + 1}`,
    label: `Counter ${workingCounters.length + 1}`,
    icon: "",
    max: 0,
    act1: 0
  }, workingCounters.length));

  renderCounterBuilder();
}

function resetCounters() {
  workingCounters = clone(initialCounters);
  renderCounterBuilder();
}

function moveCounterRow(index, direction) {
  collectCountersFromDom();

  const target = index + direction;
  if (target < 0 || target >= workingCounters.length) return;

  const next = [...workingCounters];
  const temp = next[index];
  next[index] = next[target];
  next[target] = temp;

  workingCounters = next.map((row, i) => normalizeCounterRow(row, i));
  renderCounterBuilder();
}

function deleteCounterRow(index) {
  collectCountersFromDom();

  workingCounters = workingCounters
    .filter((_, i) => i !== index)
    .map((row, i) => normalizeCounterRow(row, i));

  renderCounterBuilder();
}

function loadExample() {
  const gameIdInput = document.getElementById("gameIdInput");
  const gameTitleInput = document.getElementById("gameTitleInput");
  const gameSubtitleInput = document.getElementById("gameSubtitleInput");
  const gameDifficultyInput = document.getElementById("gameDifficultyInput");
  const defaultPhaseIdInput = document.getElementById("defaultPhaseIdInput");
  const defaultPhaseLabelInput = document.getElementById("defaultPhaseLabelInput");

  if (gameIdInput) gameIdInput.value = "ghost-of-tsushima";
  if (gameTitleInput) gameTitleInput.value = "Ghost of Tsushima";
  if (gameSubtitleInput) gameSubtitleInput.value = "Speedrun Controller";
  if (gameDifficultyInput) gameDifficultyInput.value = "Lethal";
  if (defaultPhaseIdInput) defaultPhaseIdInput.value = "legacy_all";
  if (defaultPhaseLabelInput) defaultPhaseLabelInput.value = "Legacy All";

  workingCounters = [
    { key: "trophies", label: "Trophies", icon: "🏆", max: 52, act1: 0 },
    { key: "inari", label: "Inari Shrines", icon: "🦊", max: 49, act1: 22 },
    { key: "hotsprings", label: "Hot Springs", icon: "♨️", max: 18, act1: 9 },
    { key: "bamboo", label: "Bamboo Strikes", icon: "🎋", max: 16, act1: 6 },
    { key: "haiku", label: "Haiku", icon: "📝", max: 19, act1: 8 },
    { key: "records", label: "Records", icon: "📜", max: 20, act1: 0 },
    { key: "artifacts", label: "Artifacts", icon: "🏺", max: 20, act1: 0 },
    { key: "shrines", label: "Shinto Shrines", icon: "⛩️", max: 16, act1: 7 },
    { key: "lighthouses", label: "Lighthouses", icon: "🔥", max: 8, act1: 3 },
    { key: "crickets", label: "Crickets", icon: "🦗", max: 5, act1: 0 },
    { key: "hiddenaltars", label: "Hidden Altars", icon: "🕯️", max: 10, act1: 0 },
    { key: "duels", label: "Duels", icon: "⚔️", max: 25, act1: 0 },
    { key: "territories", label: "Mongol Territories", icon: "🏕️", max: 56, act1: 0 },
    { key: "mythictales", label: "Mythic Tales", icon: "🌩️", max: 7, act1: 0 },
    { key: "sidetales", label: "Side Tales", icon: "📖", max: 61, act1: 0 },
    { key: "monochrome", label: "Monochrome", icon: "🎨", max: 2, act1: 0 },
    { key: "cooper", label: "Cooper", icon: "🦝", max: 3, act1: 0 }
  ].map((row, index) => normalizeCounterRow(row, index));

  initialCounters = clone(workingCounters);
  renderCounterBuilder();
  generate();
}

function setupEvents() {
  const gridEl = document.getElementById("counterBuilderGrid");

  document.getElementById("loadExampleBtn")?.addEventListener("click", loadExample);
  document.getElementById("addCounterBtn")?.addEventListener("click", addCounter);
  document.getElementById("resetCountersBtn")?.addEventListener("click", resetCounters);
  document.getElementById("generateBtn")?.addEventListener("click", generate);

  document.getElementById("copyGamesBtn")?.addEventListener("click", async () => {
    if (!currentPackage) return;
    await copyText(prettyJson(currentPackage.gamesJson));
  });

  document.getElementById("copyPackageBtn")?.addEventListener("click", async () => {
    if (!currentPackage) return;
    const values = getFormValues();
    await copyText(buildPackageText(currentPackage, values.gameId));
  });

  document.getElementById("downloadPackageBtn")?.addEventListener("click", () => {
    if (!currentPackage) return;
    const values = getFormValues();
    const bundle = buildZiplessBundle(currentPackage, values.gameId);
    downloadText(`${values.gameId}-package.json`, prettyJson(bundle));
  });

  gridEl?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.dataset.field === "key") {
      target.value = normalizeCounterKey(target.value);
    }

    const row = target.closest("[data-counter-row]");
    if (row) {
      const title = row.querySelector(".mid");
      const labelInput = row.querySelector('[data-field="label"]');
      const keyInput = row.querySelector('[data-field="key"]');
      const index = Number(row.dataset.counterRow || 0);

      if (title) {
        title.textContent =
          labelInput?.value?.trim() ||
          keyInput?.value?.trim() ||
          `Counter ${index + 1}`;
      }
    }

    renderLiveCountersPreview();
  });

  gridEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-row-action]");
    if (!button) return;

    const row = button.closest("[data-counter-row]");
    if (!row) return;

    const index = Number(row.dataset.counterRow || 0);
    const action = button.dataset.rowAction;

    if (action === "move-up") moveCounterRow(index, -1);
    if (action === "move-down") moveCounterRow(index, 1);
    if (action === "delete") deleteCounterRow(index);
  });
}

function boot() {
  workingCounters = [];
  initialCounters = [];
  currentPackage = null;

  setupEvents();
  renderCounterBuilder();
}

boot();
