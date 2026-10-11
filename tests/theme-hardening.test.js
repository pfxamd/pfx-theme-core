import test from "node:test";
import assert from "node:assert/strict";
import { createThemeController, DEFAULT_STORAGE_KEY } from "../src/index.js";

function makeHarness({ saved = null, dark = false, modernMediaThrows = false, allSubscriptionsThrow = false, removalsThrow = false } = {}) {
  const attributes = new Map();
  const values = new Map(saved === null ? [] : [[DEFAULT_STORAGE_KEY, saved]]);
  const root = {
    style: { colorScheme: "" },
    setAttribute(key, value) { attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key); },
  };
  const mediaListeners = new Set();
  const storageListeners = new Set();
  const media = {
    matches: dark,
    addEventListener(type, cb) {
      assert.equal(type, "change");
      if (modernMediaThrows || allSubscriptionsThrow) throw new Error("modern unavailable");
      mediaListeners.add(cb);
    },
    removeEventListener(type, cb) {
      if (removalsThrow) throw new Error("media remove blocked");
      mediaListeners.delete(cb);
    },
    addListener(cb) {
      if (allSubscriptionsThrow) throw new Error("legacy unavailable");
      mediaListeners.add(cb);
    },
    removeListener(cb) {
      if (removalsThrow) throw new Error("legacy remove blocked");
      mediaListeners.delete(cb);
    },
    emitDark(next) {
      this.matches = next;
      for (const cb of [...mediaListeners]) cb({ matches: next });
    },
  };
  const localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    clear() { values.clear(); },
  };
  const win = {
    localStorage,
    matchMedia() { return media; },
    addEventListener(type, cb) {
      assert.equal(type, "storage");
      if (allSubscriptionsThrow) throw new Error("storage listener unavailable");
      storageListeners.add(cb);
    },
    removeEventListener(type, cb) {
      if (removalsThrow) throw new Error("storage remove blocked");
      storageListeners.delete(cb);
    },
  };
  return {
    root, win, media, localStorage, attributes, values,
    emitStorage(key, value, area = localStorage) {
      for (const cb of [...storageListeners]) cb({ key, newValue: value, storageArea: area });
    },
    subscriptions() { return [mediaListeners.size, storageListeners.size]; },
  };
}

test("only one active controller can own a root, and destroy releases it", () => {
  const h = makeHarness();
  const a = createThemeController({ root: h.root, window: h.win });
  assert.throws(
    () => createThemeController({ root: h.root, window: h.win }),
    /already active for this root/
  );
  assert.deepEqual(h.subscriptions(), [1, 1]);
  a.destroy();
  assert.deepEqual(h.subscriptions(), [0, 0]);
  const b = createThemeController({ root: h.root, window: h.win });
  b.setMode("dark");
  assert.equal(h.root.style.colorScheme, "dark");
  b.destroy();
});

test("independent document roots do not conflict", () => {
  const h = makeHarness();
  const another = { style: {}, setAttribute() {} };
  const a = createThemeController({ root: h.root, window: h.win });
  const b = createThemeController({ root: another, window: h.win });
  a.setMode("light");
  b.setMode("dark");
  assert.equal(h.root.style.colorScheme, "light");
  assert.equal(another.style.colorScheme, "dark");
  a.destroy();
  b.destroy();
});

test("sessionStorage and other storage areas cannot override the preference", () => {
  const h = makeHarness({ saved: "dark" });
  const controller = createThemeController({ root: h.root, window: h.win });
  const wrongStorage = { getItem() { return "light"; } };
  h.emitStorage(DEFAULT_STORAGE_KEY, "light", wrongStorage);
  h.emitStorage(null, null, wrongStorage);
  assert.equal(controller.getState().mode, "dark");
  h.emitStorage(DEFAULT_STORAGE_KEY, "light");
  assert.equal(controller.getState().mode, "light");
  h.values.clear();
  h.emitStorage(null, null);
  assert.equal(controller.getState().mode, "system");
  controller.destroy();
});

test("reentrant setMode notifications arrive in a stable order", () => {
  const h = makeHarness();
  const controller = createThemeController({ root: h.root, window: h.win });
  const received = [];
  controller.subscribe(({ mode }) => {
    received.push("first:" + mode);
    if (mode === "dark") controller.setMode("light");
  });
  controller.subscribe(({ mode }) => received.push("second:" + mode));
  controller.setMode("dark");
  assert.deepEqual(received, ["first:dark", "second:dark", "first:light", "second:light"]);
  assert.deepEqual(controller.getState(), { mode: "light", resolved: "light" });
  controller.destroy();
});

test("bad subscriber does not block other subscribers or later updates", () => {
  const h = makeHarness();
  const controller = createThemeController({ root: h.root, window: h.win });
  const events = [];
  controller.subscribe(({ mode }) => { if (mode === "dark") throw new Error("observer failed"); });
  controller.subscribe(({ mode }) => events.push(mode));
  assert.throws(() => controller.setMode("dark"), /observer failed/);
  assert.deepEqual(events, ["dark"]);
  assert.equal(controller.getState().mode, "dark");
  controller.setMode("light");
  assert.deepEqual(events, ["dark", "light"]);
  controller.destroy();
});

test("multiple failures are reported and queued transitions still finish", () => {
  const h = makeHarness();
  const controller = createThemeController({ root: h.root, window: h.win });
  const events = [];
  controller.subscribe(({ mode }) => {
    events.push(mode);
    if (mode === "dark") controller.setMode("light");
    throw new Error("first failure");
  });
  controller.subscribe(() => { throw new Error("second failure"); });
  assert.throws(() => controller.setMode("dark"), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 4);
    return true;
  });
  assert.deepEqual(events, ["dark", "light"]);
  assert.equal(controller.getState().mode, "light");
  controller.destroy();
});

test("modern media failure falls back to legacy listeners", () => {
  const h = makeHarness({ modernMediaThrows: true });
  const controller = createThemeController({ root: h.root, window: h.win });
  assert.deepEqual(h.subscriptions(), [1, 1]);
  h.media.emitDark(true);
  assert.equal(controller.getState().resolved, "dark");
  controller.destroy();
  assert.deepEqual(h.subscriptions(), [0, 0]);
});

test("denied subscriptions and cleanup failures cannot block mode switching or root reuse", () => {
  const h = makeHarness({ allSubscriptionsThrow: true });
  const controller = createThemeController({ root: h.root, window: h.win });
  controller.setMode("dark");
  assert.equal(controller.getState().resolved, "dark");
  assert.deepEqual(h.subscriptions(), [0, 0]);
  controller.destroy();

  const other = makeHarness({ removalsThrow: true });
  const first = createThemeController({ root: other.root, window: other.win });
  assert.doesNotThrow(() => first.destroy());
  const second = createThemeController({ root: other.root, window: other.win });
  second.destroy();
});

test("failed initial paint cannot claim a root or register listeners", () => {
  const h = makeHarness();
  const failingRoot = {
    style: {},
    setAttribute() { throw new Error("paint rejected"); },
  };
  assert.throws(
    () => createThemeController({ root: failingRoot, window: h.win }),
    /paint rejected/
  );
  assert.deepEqual(h.subscriptions(), [0, 0]);
  failingRoot.setAttribute = () => {};
  const controller = createThemeController({ root: failingRoot, window: h.win });
  controller.destroy();
});

test("destroy during notification prevents later callbacks", () => {
  const h = makeHarness();
  const controller = createThemeController({ root: h.root, window: h.win });
  const seen = [];
  controller.subscribe(() => { seen.push("first"); controller.destroy(); });
  controller.subscribe(() => seen.push("second"));
  controller.setMode("dark");
  assert.deepEqual(seen, ["first"]);
  assert.deepEqual(h.subscriptions(), [0, 0]);
});
