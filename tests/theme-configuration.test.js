import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/theme-init.js", import.meta.url), "utf8");

function initialize({ key = null, fallback = null, stored = null, dark = false } = {}) {
  const attrs = new Map();
  const root = {
    style: {},
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name); }
  };
  const readKeys = [];
  const script = {
    getAttribute(name) {
      if (name === "data-pfx-storage-key") return key;
      if (name === "data-pfx-default-mode") return fallback;
      return null;
    }
  };
  runInNewContext(source, {
    document: { documentElement: root, currentScript: script },
    window: {
      localStorage: {
        getItem(name) { readKeys.push(name); return stored; }
      },
      matchMedia() { return { matches: dark }; }
    }
  });
  return { root, readKeys };
}

test("bootstrap supports custom storage key and default mode", () => {
  const h = initialize({ key: "theme-pref", fallback: "dark" });
  assert.deepEqual(h.readKeys, ["theme-pref"]);
  assert.equal(h.root.getAttribute("data-pfx-theme"), "dark");
  assert.equal(h.root.getAttribute("data-pfx-theme-mode"), "dark");
});

test("saved valid preference overrides configured default", () => {
  const h = initialize({ fallback: "dark", stored: "light" });
  assert.equal(h.root.getAttribute("data-pfx-theme"), "light");
});

test("invalid default mode falls back to system", () => {
  const h = initialize({ fallback: "blue", dark: true });
  assert.equal(h.root.getAttribute("data-pfx-theme-mode"), "system");
  assert.equal(h.root.getAttribute("data-pfx-theme"), "dark");
});
