import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DEFAULT_STORAGE_KEY, createThemeController } from "../src/index.js";

const bootstrap = readFileSync(new URL("../src/theme-init.js", import.meta.url), "utf8");

function runBootstrap({ saved = null, dark = false, blocked = false, noMedia = false } = {}) {
  const attrs = new Map();
  const root = {
    style: { colorScheme: "" },
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name); },
  };
  const win = {
    matchMedia() {
      if (noMedia) throw new Error("unsupported");
      return { matches: dark };
    },
  };
  Object.defineProperty(win, "localStorage", {
    get() {
      if (blocked) throw new Error("denied");
      return { getItem(key) { return key === DEFAULT_STORAGE_KEY ? saved : null; } };
    },
  });
  runInNewContext(bootstrap, { window: win, document: { documentElement: root } });
  return root;
}

test("bootstrap produces correct first-paint mode", () => {
  for (const [saved, dark, expected] of [
    ["light", true, "light"], ["dark", false, "dark"],
    ["system", true, "dark"], ["system", false, "light"],
    [null, true, "dark"], ["garbage", false, "light"]
  ]) {
    const root = runBootstrap({ saved, dark });
    assert.equal(root.getAttribute("data-pfx-theme"), expected);
    assert.equal(root.style.colorScheme, expected);
  }
});

test("bootstrap degrades safely when browser storage or media APIs fail", () => {
  assert.equal(runBootstrap({ blocked: true, dark: true }).style.colorScheme, "dark");
  assert.equal(runBootstrap({ noMedia: true }).style.colorScheme, "light");
});

test("bootstrap and runtime agree on stored preference and effective theme", () => {
  const root = runBootstrap({ saved: "system", dark: true });
  const win = {
    localStorage: { getItem() { return "system"; }, setItem() {} },
    matchMedia() { return { matches: true, addEventListener() {}, removeEventListener() {} }; },
    addEventListener() {}, removeEventListener() {},
  };
  const core = createThemeController({ root, window: win });
  assert.equal(root.getAttribute("data-pfx-theme"), core.getState().resolved);
  assert.equal(root.getAttribute("data-pfx-theme-mode"), core.getState().mode);
  core.destroy();
});
