export function createDebugger({
  name = "app",
  panelId = "debugPanel",
  bodyId = "debugBody",
  statusId = "debugStatus",
  toggleId = "debugToggle",
  clearId = "debugClear",
  copyId = "debugCopy",
  maxLogs = 120
} = {}) {
  const panel = document.getElementById(panelId);
  const body = document.getElementById(bodyId);
  const statusEl = document.getElementById(statusId);
  const toggleBtn = document.getElementById(toggleId);
  const clearBtn = document.getElementById(clearId);
  const copyBtn = document.getElementById(copyId);

  const state = {
    open: false,
    logs: [],
    status: {},
    snapshotBuilder: null
  };

  function now() {
    return new Date().toLocaleTimeString();
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  function renderStatus() {
    if (!statusEl) return;
    const entries = Object.entries(state.status);

    if (!entries.length) {
      statusEl.innerHTML = `<div class="debugEmpty">No status yet</div>`;
      return;
    }

    statusEl.innerHTML = entries.map(([key, value]) => `
      <div class="debugStatusRow">
        <span class="debugStatusKey">${escapeHtml(key)}</span>
        <span class="debugStatusValue">${escapeHtml(String(value))}</span>
      </div>
    `).join("");
  }

  function renderLogs() {
    if (!body) return;

    if (!state.logs.length) {
      body.innerHTML = `<div class="debugEmpty">No logs yet</div>`;
      return;
    }

    body.innerHTML = state.logs
      .slice()
      .reverse()
      .map(entry => `
        <div class="debugLog debugLog-${entry.level}">
          <div class="debugLogTop">
            <span class="debugLogName">${escapeHtml(name)}</span>
            <span class="debugLogTime">${escapeHtml(entry.time)}</span>
            <span class="debugLogLevel">${escapeHtml(entry.level.toUpperCase())}</span>
          </div>
          <div class="debugLogMsg">${escapeHtml(entry.message)}</div>
          ${entry.data === undefined ? "" : `<pre class="debugLogData">${escapeHtml(safeStringify(entry.data))}</pre>`}
        </div>
      `)
      .join("");
  }

  function render() {
    if (!panel) return;
    panel.classList.toggle("open", state.open);
    renderStatus();
    renderLogs();

    if (toggleBtn) {
      toggleBtn.textContent = state.open ? "🐞 Hide Debug" : "🐞 Show Debug";
    }
  }

  function push(level, message, data) {
    state.logs.push({
      level,
      message,
      data,
      time: now()
    });

    if (state.logs.length > maxLogs) {
      state.logs.splice(0, state.logs.length - maxLogs);
    }

    render();
  }

  function log(message, data) {
    push("info", message, data);
  }

  function warn(message, data) {
    push("warn", message, data);
  }

  function error(message, data) {
    push("error", message, data);
  }

  function setStatus(key, value) {
    state.status[key] = value;
    renderStatus();
  }

  function toggle() {
    state.open = !state.open;
    render();
  }

  function clear() {
    state.logs = [];
    renderLogs();
  }

  function setSnapshotBuilder(fn) {
    state.snapshotBuilder = fn;
  }

  async function copySnapshot() {
    if (!state.snapshotBuilder) return;

    const snapshot = state.snapshotBuilder();
    const text = safeStringify(snapshot);

    try {
      await navigator.clipboard.writeText(text);
      log("Debug snapshot copied");
    } catch {
      warn("Clipboard blocked", snapshot);
    }
  }

  toggleBtn?.addEventListener("click", toggle);
  clearBtn?.addEventListener("click", clear);
  copyBtn?.addEventListener("click", copySnapshot);

  window.addEventListener("keydown", (e) => {
    if (e.key === "`" && e.shiftKey) {
      toggle();
    }
  });

  render();

  return {
    log,
    warn,
    error,
    setStatus,
    setSnapshotBuilder,
    render
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
