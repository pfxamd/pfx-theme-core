import test from "node:test";
import assert from "node:assert/strict";
import {
  THEME_MODES, DEFAULT_STORAGE_KEY, createThemeController, isThemeMode, resolveTheme
} from "../src/index.js";

function harness({ saved = null, dark = false, storageDenied = false, legacy = false } = {}) {
  const attrs = new Map();
  const root = {
    style: { colorScheme: "" },
    setAttribute(key, value) { attrs.set(key, value); },
    getAttribute(key) { return attrs.get(key); },
  };
  const values = new Map(saved === null ? [] : [[DEFAULT_STORAGE_KEY, saved]]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  const storageListeners = new Set();
  const mediaListeners = new Set();
  const media = {
    matches: dark,
    setDark(value) {
      this.matches = value;
      for (const listener of Array.from(mediaListeners)) listener({ matches: value });
    },
  };
  if (legacy) {
    media.addListener = (listener) => mediaListeners.add(listener);
    media.removeListener = (listener) => mediaListeners.delete(listener);
  } else {
    media.addEventListener = (type, listener) => {
      assert.equal(type, "change");
      mediaListeners.add(listener);
    };
    media.removeEventListener = (type, listener) => {
      assert.equal(type, "change");
      mediaListeners.delete(listener);
    };
  }
  const win = {
    matchMedia(query) {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return media;
    },
    addEventListener(type, listener) {
      if (type === "storage") storageListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "storage") storageListeners.delete(listener);
    },
  };
  Object.defineProperty(win, "localStorage", {
    get() {
      if (storageDenied) throw new Error("blocked");
      return storage;
    },
  });
  return {
    win, root, media, values,
    emitStorage(key, newValue) {
      for (const listener of Array.from(storageListeners)) listener({ key, newValue });
    },
    counts() { return [mediaListeners.size, storageListeners.size]; },
  };
}

test("public API and mode resolution", () => {
  assert.deepEqual([...THEME_MODES], ["light", "dark", "system"]);
  assert.ok(Object.isFrozen(THEME_MODES));
  assert.equal(isThemeMode("dark"), true);
  assert.equal(isThemeMode("unknown"), false);
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.throws(() => resolveTheme("other"), TypeError);
});

test("system theme tracks changes only while system is selected", () => {
  const h = harness({ dark: true });
  const core = createThemeController({ root: h.root, window: h.win });
  assert.deepEqual(core.getState(), { mode: "system", resolved: "dark" });
  assert.equal(h.root.getAttribute("data-pfx-theme"), "dark");
  assert.equal(h.root.getAttribute("data-pfx-theme-mode"), "system");
  assert.equal(h.root.style.colorScheme, "dark");
  const changes = [];
  core.subscribe((value) => changes.push(value));
  h.media.setDark(false);
  assert.equal(core.getState().resolved, "light");
  core.setMode("dark");
  h.media.setDark(true);
  h.media.setDark(false);
  assert.equal(core.getState().resolved, "dark");
  assert.equal(changes.length, 2);
  assert.deepEqual(changes[0], { mode: "system", resolved: "light" });
  core.destroy();
});

test("saved theme, persistence, reset, and no duplicate notifications", () => {
  const h = harness({ saved: "light", dark: true });
  const core = createThemeController({ root: h.root, window: h.win });
  assert.deepEqual(core.getState(), { mode: "light", resolved: "light" });
  let updates = 0;
  const unsubscribe = core.subscribe(() => updates++);
  assert.deepEqual(core.setMode("dark"), { mode: "dark", resolved: "dark" });
  assert.equal(h.values.get(DEFAULT_STORAGE_KEY), "dark");
  core.setMode("dark");
  assert.equal(updates, 1);
  core.reset();
  assert.equal(h.values.get(DEFAULT_STORAGE_KEY), "system");
  assert.deepEqual(core.getState(), { mode: "system", resolved: "dark" });
  unsubscribe();
  core.setMode("light");
  assert.equal(updates, 2);
  core.destroy();
});

test("storage events sync other tabs and honor clears", () => {
  const h = harness({ dark: true });
  const core = createThemeController({ root: h.root, window: h.win });
  h.emitStorage("unrelated-key", "light");
  assert.equal(core.getState().mode, "system");
  h.emitStorage(DEFAULT_STORAGE_KEY, "light");
  assert.deepEqual(core.getState(), { mode: "light", resolved: "light" });
  h.values.clear();
  h.emitStorage(null, null);
  assert.deepEqual(core.getState(), { mode: "system", resolved: "dark" });
  h.emitStorage(DEFAULT_STORAGE_KEY, "invalid");
  assert.equal(core.getState().mode, "system");
  core.destroy();
});

test("blocked storage and missing matchMedia do not stop toggling", () => {
  const h = harness({ storageDenied: true, dark: true });
  const core = createThemeController({ root: h.root, window: h.win });
  core.setMode("light");
  assert.equal(h.root.style.colorScheme, "light");
  core.destroy();

  const root = { style: {}, setAttribute() {} };
  const fallback = createThemeController({ root, window: {} });
  assert.deepEqual(fallback.getState(), { mode: "system", resolved: "light" });
  fallback.destroy();
});

test("legacy media listener, disposal and strict validation", () => {
  const h = harness({ legacy: true });
  assert.throws(() => createThemeController({ root: null, window: {} }), TypeError);
  assert.throws(() => createThemeController({ root: h.root, window: h.win, defaultMode: "sepia" }), TypeError);
  assert.throws(() => createThemeController({ root: h.root, window: h.win, storageKey: "" }), TypeError);
  const core = createThemeController({ root: h.root, window: h.win });
  assert.deepEqual(h.counts(), [1, 1]);
  assert.throws(() => core.setMode("invalid"), TypeError);
  assert.throws(() => core.subscribe(null), TypeError);
  h.media.setDark(true);
  assert.equal(core.getState().resolved, "dark");
  core.destroy();
  core.destroy();
  assert.deepEqual(h.counts(), [0, 0]);
  assert.throws(() => core.setMode("light"), /destroyed/);
});

test("custom storage keys and defaults are independent", () => {
  const h = harness({ dark: false });
  const core = createThemeController({
    root: h.root, window: h.win, storageKey: "custom-theme", defaultMode: "dark"
  });
  assert.deepEqual(core.getState(), { mode: "dark", resolved: "dark" });
  core.setMode("light");
  assert.equal(h.values.get("custom-theme"), "light");
  assert.equal(h.values.has(DEFAULT_STORAGE_KEY), false);
  core.destroy();
});
