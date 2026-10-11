/**
 * PFx Theme Core v0.1.0
 * Framework-independent theme preference and resolved color scheme.
 * No dependencies, globals, rendering logic, or network requests.
 */
export const THEME_MODES = Object.freeze(["light", "dark", "system"]);
export const DEFAULT_STORAGE_KEY = "pfx-theme-mode";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** @param {unknown} value */
export function isThemeMode(value) {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Pure mapping from user preference + system state to an actual color scheme.
 * @param {"light"|"dark"|"system"} mode
 * @param {boolean} prefersDark
 */
export function resolveTheme(mode, prefersDark = false) {
  if (!isThemeMode(mode)) {
    throw new TypeError("Invalid theme mode: expected light, dark, or system");
  }
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

function readStorage(win, key) {
  try {
    return win?.localStorage?.getItem(key) ?? null;
  } catch {
    // Storage may be denied (sandbox, privacy controls, opaque origin).
    return null;
  }
}

function writeStorage(win, key, value) {
  try {
    win?.localStorage?.setItem(key, value);
  } catch {
    // A theme change must work for this tab without storage.
  }
}

function getMediaQuery(win) {
  try {
    return typeof win?.matchMedia === "function" ? win.matchMedia(DARK_QUERY) : null;
  } catch {
    return null;
  }
}

/**
 * Create one controller for one document root. Call destroy() when unmounting.
 *
 * @param {{
 *  root?: HTMLElement,
 *  window?: Window,
 *  storageKey?: string,
 *  defaultMode?: "light"|"dark"|"system"
 * }} [options]
 */
export function createThemeController(options = {}) {
  const win = options.window ?? globalThis.window;
  const root = options.root ?? win?.document?.documentElement;
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const defaultMode = options.defaultMode ?? "system";

  if (!root || typeof root.setAttribute !== "function") {
    throw new TypeError("A document root with setAttribute() is required");
  }
  if (!storageKey || typeof storageKey !== "string") {
    throw new TypeError("storageKey must be a non-empty string");
  }
  if (!isThemeMode(defaultMode)) {
    throw new TypeError("defaultMode must be light, dark, or system");
  }

  const media = getMediaQuery(win);
  const saved = readStorage(win, storageKey);
  let mode = isThemeMode(saved) ? saved : defaultMode;
  let resolved = resolveTheme(mode, media?.matches === true);
  let destroyed = false;
  const subscribers = new Set();

  const getState = () => ({ mode, resolved });

  function paint() {
    root.setAttribute("data-pfx-theme", resolved);
    root.setAttribute("data-pfx-theme-mode", mode);
    if (root.style) root.style.colorScheme = resolved;
  }

  function update(previousMode, previousResolved) {
    resolved = resolveTheme(mode, media?.matches === true);
    paint();
    if (previousMode !== mode || previousResolved !== resolved) {
      const snapshot = getState();
      for (const listener of Array.from(subscribers)) {
        listener(snapshot);
      }
    }
  }

  function assertActive() {
    if (destroyed) throw new Error("Theme controller has been destroyed");
  }

  function setMode(nextMode) {
    assertActive();
    if (!isThemeMode(nextMode)) {
      throw new TypeError("Theme mode must be light, dark, or system");
    }
    const previousMode = mode;
    const previousResolved = resolved;
    mode = nextMode;
    writeStorage(win, storageKey, mode);
    update(previousMode, previousResolved);
    return getState();
  }

  function onMediaChange() {
    if (destroyed || mode !== "system") return;
    update(mode, resolved);
  }

  function onStorageChange(event) {
    if (destroyed || (event.key !== storageKey && event.key !== null)) return;
    const previousMode = mode;
    const previousResolved = resolved;
    const value = event.key === null ? readStorage(win, storageKey) : event.newValue;
    mode = isThemeMode(value) ? value : defaultMode;
    update(previousMode, previousResolved);
  }

  if (typeof media?.addEventListener === "function") {
    media.addEventListener("change", onMediaChange);
  } else if (typeof media?.addListener === "function") {
    media.addListener(onMediaChange);
  }
  win?.addEventListener?.("storage", onStorageChange);

  paint();

  return Object.freeze({
    getState,
    setMode,
    reset() {
      return setMode("system");
    },
    subscribe(listener) {
      assertActive();
      if (typeof listener !== "function") {
        throw new TypeError("Theme subscriber must be a function");
      }
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (typeof media?.removeEventListener === "function") {
        media.removeEventListener("change", onMediaChange);
      } else if (typeof media?.removeListener === "function") {
        media.removeListener(onMediaChange);
      }
      win?.removeEventListener?.("storage", onStorageChange);
      subscribers.clear();
    },
  });
}
