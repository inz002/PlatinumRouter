// js/game-editor.js

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildGameEntry({ id, title, path }) {
  return {
    id,
    title,
    path: path || `./data/${id}`
  };
}

function buildGamesJson(entry) {
  return {
    defaultGameId: entry.id,
    games: [entry]
  };
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
  } catch {
    console.warn("Copy failed");
  }
}

function normalizeId(id) {
  return id
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function renderOutput(obj) {
  const el = document.getElementById("output");
  if (!el) return;
  el.textContent = JSON.stringify(obj, null, 2);
}

function generate() {
  const rawId = document.getElementById("gameId")?.value || "";
  const title = document.getElementById("gameTitle")?.value || "";
  const path = document.getElementById("gamePath")?.value || "";

  const id = normalizeId(rawId);

  if (!id || !title) {
    alert("Game ID and Title are required");
    return null;
  }

  const entry = buildGameEntry({ id, title, path });
  const json = buildGamesJson(entry);

  renderOutput(json);

  return json;
}

function setup() {
  let currentJson = null;

  document.getElementById("generateBtn")?.addEventListener("click", () => {
    currentJson = generate();
  });

  document.getElementById("copyBtn")?.addEventListener("click", () => {
    if (!currentJson) return;
    copyText(JSON.stringify(currentJson, null, 2));
  });

  document.getElementById("downloadBtn")?.addEventListener("click", () => {
    if (!currentJson) return;
    downloadJson("games.json", currentJson);
  });
}

setup();
