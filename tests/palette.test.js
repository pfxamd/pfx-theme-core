import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseHexColor, relativeLuminance, contrastRatio, validatePalette,
  auditPalette, renderPaletteCSS, CONTRAST_MINIMUMS
} from "../src/index.js";

const sample = JSON.parse(readFileSync(new URL("../tokens/neutral.json", import.meta.url), "utf8"));
const clone = () => structuredClone(sample);

test("relative luminance uses WCAG sRGB values and accurate contrast ratios", () => {
  assert.deepEqual(parseHexColor("#AbC"), { r: 170, g: 187, b: 204 });
  assert.deepEqual(parseHexColor("#112233"), { r: 17, g: 34, b: 51 });
  assert.equal(relativeLuminance("#000"), 0);
  assert.equal(relativeLuminance("#fff"), 1);
  assert.equal(contrastRatio("#000", "#fff"), 21);
  assert.equal(contrastRatio("#fff", "#000"), 21);
  assert.equal(contrastRatio("#ababab", "#ababab"), 1);
  assert.ok(Math.abs(contrastRatio("#777", "#fff") - 4.478) < 0.01);
});

test("alpha, named colors, gradients and CSS injection are rejected safely", () => {
  for (const invalid of ["red", "#0000", "#ffffff00", "rgb(0,0,0)", "transparent", "var(--ink)", "linear-gradient(red,blue)", "#fff; body{display:none}", "", null, 123]) {
    assert.throws(() => parseHexColor(invalid), TypeError);
  }
});

test("official thresholds include text, large text and identifiable non-text", () => {
  assert.equal(CONTRAST_MINIMUMS.text.AA, 4.5);
  assert.equal(CONTRAST_MINIMUMS.text.AAA, 7);
  assert.equal(CONTRAST_MINIMUMS["large-text"].AA, 3);
  assert.equal(CONTRAST_MINIMUMS["large-text"].AAA, 4.5);
  assert.equal(CONTRAST_MINIMUMS["non-text"].AA, 3);
  assert.equal(Object.hasOwn(CONTRAST_MINIMUMS["non-text"], "AAA"), false);
});

test("versioned neutral palette passes every declared contrast pair for both modes", () => {
  assert.equal(validatePalette(sample), true);
  const audit = auditPalette(sample);
  assert.equal(audit.passes, true);
  assert.equal(audit.results.length, sample.contrastChecks.length * 2);
  assert.deepEqual([...new Set(audit.results.map(result => result.theme))], ["light", "dark"]);
  assert.ok(audit.results.every(result => result.ratio >= result.minimum));
});

test("failure is detected without rounding ratios before comparing", () => {
  const palette = clone();
  palette.themes.light.text = "#777777";
  palette.themes.light.background = "#ffffff";
  const audit = auditPalette(palette);
  const result = audit.results.find(r => r.theme === "light" && r.foreground === "text" && r.background === "background");
  assert.ok(result.ratio > 4.4 && result.ratio < 4.5);
  assert.equal(result.passes, false);
  assert.equal(audit.passes, false);
});

test("validation rejects malformed palettes and mismatched theme contracts", () => {
  const invalid = [
    null,
    { ...sample, schemaVersion: 2 },
    { ...sample, themes: { light: sample.themes.light } },
    { ...sample, themes: { ...sample.themes, dark: {} } },
    { ...sample, contrastChecks: [] },
  ];
  for (const value of invalid) assert.throws(() => validatePalette(value), TypeError);
  const mismatch = clone();
  delete mismatch.themes.dark.focus;
  assert.throws(() => validatePalette(mismatch), /same semantic tokens/);
  const badName = clone();
  badName.themes.light["hello;body{}"] = "#fff";
  badName.themes.dark["hello;body{}"] = "#fff";
  assert.throws(() => validatePalette(badName), /Invalid semantic token/);
  const badColor = clone();
  badColor.themes.dark.text = "#12345600";
  assert.throws(() => validatePalette(badColor), /Invalid dark.text/);
});

test("invalid, missing or duplicate contrast contracts fail validation", () => {
  const bad = [
    { foreground: "missing", background: "background", usage: "text", level: "AA" },
    { foreground: "text", background: "background", usage: "strange", level: "AA" },
    { foreground: "text", background: "background", usage: "non-text", level: "AAA" },
  ];
  for (const check of bad) {
    const palette = clone();
    palette.contrastChecks.push(check);
    assert.throws(() => validatePalette(palette), TypeError);
  }
  const duplicate = clone();
  duplicate.contrastChecks.push(duplicate.contrastChecks[0]);
  assert.throws(() => validatePalette(duplicate), /Duplicate/);
});

test("generated CSS contains both modes, progressive fallback, semantic properties", () => {
  const css = renderPaletteCSS(sample);
  assert.ok(css.includes(':root[data-pfx-theme="light"]'));
  assert.ok(css.includes(':root[data-pfx-theme="dark"]'));
  assert.ok(css.includes(':root:not([data-pfx-theme])'));
  assert.ok(css.includes("--pfx-color-on-accent: #ffffff;"));
  assert.ok(css.includes("--pfx-color-border: #94a3b8;"));
  assert.ok(css.includes("color-scheme: dark"));
  assert.equal(css, readFileSync(new URL("../src/theme.css", import.meta.url), "utf8"),
    "Generated neutral CSS must match the published fallback file");
});

test("token ordering never changes the generated output", () => {
  const reversed = clone();
  reversed.themes.light = Object.fromEntries(Object.entries(reversed.themes.light).reverse());
  reversed.themes.dark = Object.fromEntries(Object.entries(reversed.themes.dark).reverse());
  assert.equal(renderPaletteCSS(reversed), renderPaletteCSS(sample));
});

test("CLI validates a passing palette and writes only passing CSS", () => {
  const folder = mkdtempSync(join(tmpdir(), "pfx-theme-palette-"));
  try {
    const fixture = join(folder, "palette.json");
    const css = join(folder, "out.css");
    writeFileSync(fixture, JSON.stringify(sample));
    const run = args => spawnSync(process.execPath, [new URL("../scripts/palette-cli.mjs", import.meta.url).pathname, ...args], { encoding: "utf8" });
    const checked = run(["check", fixture]);
    assert.equal(checked.status, 0, checked.stderr);
    const built = run(["build", fixture, css]);
    assert.equal(built.status, 0, built.stderr);
    assert.equal(readFileSync(css, "utf8"), renderPaletteCSS(sample));

    const failed = clone();
    failed.themes.light.text = "#777";
    failed.themes.light.background = "#fff";
    writeFileSync(fixture, JSON.stringify(failed));
    const forbidden = join(folder, "bad.css");
    assert.notEqual(run(["build", fixture, forbidden]).status, 0);
    assert.equal(existsSync(forbidden), false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
