#!/usr/bin/env node
/**
 * Optional build-time tool. The runtime engine never reads palette JSON.
 * Usage: node scripts/palette-cli.mjs check palette.json
 *        node scripts/palette-cli.mjs build palette.json output.css
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { auditPalette, renderPaletteCSS } from "../src/palette.js";

async function main() {
  const [command, input, output, ...extra] = process.argv.slice(2);
  if (extra.length || !input ||
      (command !== "check" && command !== "build") ||
      (command === "check" && output) ||
      (command === "build" && !output)) {
    throw new Error("Usage: palette-cli.mjs check <palette.json> | build <palette.json> <output.css>");
  }
  const source = resolve(input);
  const destination = output && resolve(output);
  if (destination && (destination === source || extname(destination) !== ".css")) {
    throw new Error("Output must be a separate .css file");
  }
  const palette = JSON.parse(await readFile(source, "utf8"));
  const audit = auditPalette(palette);
  for (const result of audit.results) {
    const label = result.passes ? "PASS" : "FAIL";
    console.log(`${label} ${result.theme} ${result.foreground}/${result.background} ${result.usage}-${result.level}: ${result.ratio.toFixed(3)}:1 (min ${result.minimum}:1)`);
  }
  if (!audit.passes) throw new Error("Contrast checks failed: CSS output was not written");
  if (command === "build") {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, renderPaletteCSS(palette), "utf8");
    console.log("Generated " + destination);
  }
  console.log("Validated " + audit.results.length + " contrast pairs across light and dark");
}
main().catch(error => {
  console.error("Palette error: " + error.message);
  process.exitCode = 1;
});
