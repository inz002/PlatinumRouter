const STORAGE_KEY = "platinumrouter_state_v1";

export function loadState(customKey = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(customKey);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("Failed to load state from localStorage", error);
    return {};
  }
}

export function saveState(customKey = STORAGE_KEY, state = {}) {
  try {
    localStorage.setItem(customKey, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state to localStorage", error);
  }
}

export function clearState(customKey = STORAGE_KEY) {
  try {
    localStorage.removeItem(customKey);
  } catch (error) {
    console.error("Failed to clear state from localStorage", error);
  }
}
