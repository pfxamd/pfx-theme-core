/**
 * PFx Theme Core v0.1.1
 * Framework-independent theme preference and resolved color scheme.
 * No dependencies, globals, rendering logic, or network requests.
 */
export const THEME_MODES = Object.freeze(["light", "dark", "system"]);
export const DEFAULT_STORAGE_KEY = "pfx-theme-mode";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const activeRoots = new WeakMap();

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
 * Attach modern or legacy media listeners. Browsers/shims may expose a
 * method that nevertheless throws; never make appearance switching depend
 * on an optional event subscription.
 */
function listenForSystemChanges(media, listener) {
  if (typeof media?.addEventListener === "function") {
    try {
      media.addEventListener("change", listener);
      return () => media.removeEventListener?.("change", listener);
    } catch {
      // Fall through to older APIs where available.
    }
  }
  if (typeof media?.addListener === "function") {
    try {
      media.addListener(listener);
      return () => media.removeListener?.(listener);
    } catch {
      // The initial preference can still be applied without live updates.
    }
  }
  return () => {};
}

function listenForStorageChanges(win, listener) {
  try {
    if (typeof win?.addEventListener !== "function") return () => {};
    win.addEventListener("storage", listener);
    return () => win.removeEventListener?.("storage", listener);
  } catch {
    return () => {};
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
  if (activeRoots.has(root)) {
    throw new Error("A theme controller is already active for this root; destroy it before creating another");
  }

  const media = getMediaQuery(win);
  const saved = readStorage(win, storageKey);
  let mode = isThemeMode(saved) ? saved : defaultMode;
  let resolved = resolveTheme(mode, media?.matches === true);
  let destroyed = false;
  let notifying = false;
  const subscribers = new Set();
  const notifications = [];

  const getState = () => ({ mode, resolved });

  function paint() {
    root.setAttribute("data-pfx-theme", resolved);
    root.setAttribute("data-pfx-theme-mode", mode);
    if (root.style) root.style.colorScheme = resolved;
  }

  function flushNotifications() {
    if (notifying || destroyed) return;
    notifying = true;
    const errors = [];
    try {
      // Serialize re-entrant changes. Every subscriber sees the same sequence
      // of snapshots, even when another subscriber immediately calls setMode().
      while (notifications.length && !destroyed) {
        const snapshot = notifications.shift();
        for (const listener of Array.from(subscribers)) {
          if (destroyed) break;
          try {
            listener(snapshot);
          } catch (error) {
            // One faulty observer must not prevent other observers running.
            errors.push(error);
          }
        }
      }
    } finally {
      notifying = false;
      if (destroyed) notifications.length = 0;
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Multiple theme subscribers failed");
    }
  }

  function update(previousMode, previousResolved) {
    resolved = resolveTheme(mode, media?.matches === true);
    paint();
    if (previousMode !== mode || previousResolved !== resolved) {
      notifications.push(Object.freeze(getState()));
      flushNotifications();
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
    if (destroyed || !event || (event.key !== storageKey && event.key !== null)) return;

    // "storage" also fires for sessionStorage changes in same-origin
    // iframes. Never confuse those with the persisted localStorage choice.
    if (event.storageArea != null) {
      try {
        if (event.storageArea !== win?.localStorage) return;
      } catch {
        return;
      }
    }

    const previousMode = mode;
    const previousResolved = resolved;
    const value = event.key === null ? readStorage(win, storageKey) : event.newValue;
    mode = isThemeMode(value) ? value : defaultMode;
    update(previousMode, previousResolved);
  }

  // First paint precedes listener registration. If a custom root rejects a
  // write, constructor failure cannot leave any browser subscriptions behind.
  paint();
  const detachMedia = listenForSystemChanges(media, onMediaChange);
  const detachStorage = listenForStorageChanges(win, onStorageChange);

  const controller = Object.freeze({
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
      notifications.length = 0;
      subscribers.clear();
      // Both cleanups are attempted, even when a browser shim throws.
      try {
        detachMedia();
      } catch {
        // Best effort: still detach storage listener and release ownership.
      }
      try {
        detachStorage();
      } catch {
        // Best effort: ownership is always released.
      }
      activeRoots.delete(root);
    },
  });

  activeRoots.set(root, controller);
  return controller;
}
