import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const choices = { chromium, firefox, webkit };
const name = process.env.PFX_BROWSER || "chromium";
if (!Object.hasOwn(choices, name)) throw new Error("Unknown PFX_BROWSER: " + name);

const directory = resolve(fileURLToPath(new URL("../", import.meta.url)));
const output = resolve(directory, "browser-artifacts", name);
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname === "/" ? "/examples/basic/index.html" : url.pathname);
    const file = resolve(directory, "." + pathname);
    if (!file.startsWith(directory + sep)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": (mime[extname(file)] || "application/octet-stream") + "; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((done, fail) => {
  server.once("error", fail);
  server.listen(0, "127.0.0.1", done);
});
const url = "http://127.0.0.1:" + server.address().port;
const report = { browser: name, checks: [], screenshots: [], result: "PENDING" };
let browser;

async function check(label, work) {
  await work();
  report.checks.push(label);
  console.log("PASS " + name + " / " + label);
}
async function state(page, mode, scheme) {
  const actual = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      mode: root.getAttribute("data-pfx-theme-mode"),
      scheme: root.getAttribute("data-pfx-theme"),
      native: getComputedStyle(root).colorScheme,
    };
  });
  assert.deepEqual(actual, { mode, scheme, native: scheme });
}
async function select(page, mode) {
  await page.locator('[data-theme-mode="' + mode + '"]').click();
}
async function capture(page, filename) {
  await page.screenshot({ path: resolve(output, filename), fullPage: true, animations: "disabled" });
  report.screenshots.push(filename);
}
function noErrors(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  return () => assert.deepEqual(errors, []);
}

try {
  browser = await choices[name].launch({ headless: true });
  report.browserVersion = browser.version();

  for (const system of ["light", "dark"]) {
    const context = await browser.newContext({ colorScheme: system });
    try {
      await check("first paint: " + system, async () => {
        const page = await context.newPage();
        const errors = noErrors(page);
        await page.goto(url + "/tests/fixtures/first-paint.html");
        const before = await page.evaluate(() => window.__pfxBeforeCSS);
        assert.deepEqual(before, { mode: "system", scheme: system, native: system });
        await state(page, "system", system);
        assert.equal(
          await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
          system === "dark" ? "rgb(11, 18, 32)" : "rgb(248, 250, 252)"
        );
        errors();
      });
    } finally { await context.close(); }
  }

  const context = await browser.newContext({ colorScheme: "light", viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    const errors = noErrors(page);
    await page.goto(url + "/examples/basic/index.html");
    await check("initial system preference", async () => {
      await state(page, "system", "light");
      assert.equal(await page.locator('[data-theme-mode="system"]').getAttribute("aria-pressed"), "true");
    });
    await capture(page, "desktop-light.png");

    await check("manual dark + persistence", async () => {
      await select(page, "dark");
      await state(page, "dark", "dark");
      assert.equal(await page.evaluate(() => localStorage.getItem("pfx-theme-mode")), "dark");
    });
    await capture(page, "desktop-dark.png");

    await check("reload keeps preference", async () => {
      await page.reload();
      await state(page, "dark", "dark");
      assert.equal(await page.locator("#selected-mode").innerText(), "dark");
    });

    await check("keyboard + pressed state", async () => {
      const light = page.locator('[data-theme-mode="light"]');
      await light.focus();
      await page.keyboard.press("Enter");
      await state(page, "light", "light");
      assert.equal(await light.getAttribute("aria-pressed"), "true");
    });

    const other = await context.newPage();
    const otherErrors = noErrors(other);
    await other.goto(url + "/examples/basic/index.html");
    await check("cross-tab native storage event", async () => {
      await select(other, "dark");
      await page.waitForFunction(() => document.documentElement.getAttribute("data-pfx-theme-mode") === "dark");
      await state(page, "dark", "dark");
    });
    await check("cross-tab preference removal", async () => {
      await other.evaluate(() => localStorage.removeItem("pfx-theme-mode"));
      await page.waitForFunction(() => document.documentElement.getAttribute("data-pfx-theme-mode") === "system");
      await state(page, "system", "light");
    });
    await check("live operating-system switch", async () => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() => document.documentElement.getAttribute("data-pfx-theme") === "dark");
      await state(page, "system", "dark");
      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(() => document.documentElement.getAttribute("data-pfx-theme") === "light");
      await state(page, "system", "light");
    });
    await check("manual choice ignores OS change", async () => {
      await select(page, "light");
      await page.emulateMedia({ colorScheme: "dark" });
      await state(page, "light", "light");
    });
    await check("real sessionStorage is ignored", async () => {
      await select(page, "dark");
      const iframe = await page.evaluateHandle(() => {
        const frame = document.createElement("iframe");
        frame.src = "/tests/fixtures/frame.html";
        document.body.append(frame);
        return frame;
      });
      const target = await iframe.asElement().contentFrame();
      await target.waitForLoadState();
      await target.evaluate(() => sessionStorage.setItem("pfx-theme-mode", "light"));
      await page.waitForTimeout(150);
      await state(page, "dark", "dark");
    });
    await check("duplicate root rejected by real DOM", async () => {
      const rejected = await page.evaluate(async () => {
        const { createThemeController } = await import("/src/index.js");
        try { createThemeController(); return false; }
        catch (error) { return /already active/.test(String(error)); }
      });
      assert.equal(rejected, true);
    });
    errors();
    otherErrors();
  } finally { await context.close(); }

  const mobile = await browser.newContext({ colorScheme: "dark", viewport: { width: 390, height: 844 } });
  try {
    const page = await mobile.newPage();
    const errors = noErrors(page);
    await page.goto(url + "/examples/basic/index.html");
    await check("mobile layout and theme", async () => {
      await state(page, "system", "dark");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
      await capture(page, "mobile-dark.png");
      await select(page, "light");
      await state(page, "light", "light");
      await capture(page, "mobile-light.png");
      errors();
    });
  } finally { await mobile.close(); }

  const custom = await browser.newContext({ colorScheme: "light" });
  try {
    await check("custom storage key and default before first paint", async () => {
      const page = await custom.newPage();
      await page.goto(url + "/tests/fixtures/custom.html");
      const before = await page.evaluate(() => window.__pfxBeforeCSS);
      assert.deepEqual(before, { mode: "dark", scheme: "dark", native: "dark" });
      assert.equal(await page.evaluate(() => window.__customMode), "dark");
    });
  } finally { await custom.close(); }

  const unavailable = await browser.newContext({ colorScheme: "light" });
  try {
    await unavailable.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("Storage disabled", "SecurityError"); },
      });
    });
    await check("blocked storage preserves live switching", async () => {
      const page = await unavailable.newPage();
      const errors = noErrors(page);
      await page.goto(url + "/examples/basic/index.html");
      await state(page, "system", "light");
      await select(page, "dark");
      await state(page, "dark", "dark");
      errors();
    });
  } finally { await unavailable.close(); }

  const disabled = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false });
  try {
    await check("no JavaScript: CSS uses system dark", async () => {
      const page = await disabled.newPage();
      await page.goto(url + "/tests/fixtures/first-paint.html");
      const computed = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return { background: root.backgroundColor, scheme: root.colorScheme };
      });
      assert.deepEqual(computed, { background: "rgb(11, 18, 32)", scheme: "dark" });
    });
  } finally { await disabled.close(); }
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = String(error && error.stack || error);
  console.error(error);
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
  console.log(name + ": " + report.result + " / " + report.checks.length + " checks / " + report.screenshots.length + " screenshots");
}
