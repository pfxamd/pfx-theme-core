#!/usr/bin/env node
/**
 * PFx Theme Core vendor manager. Build-time only, Node standard library.
 *
 * install <project> [--layout static|split] [--config mapping.json]
 * check   <project>
 * update  <project>
 *
 * Never edits a project's own CSS, HTML, JS or application configuration.
 */
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, lstat, realpath } from "node:fs/promises";
import { dirname, basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const SOURCE = fileURLToPath(new URL("../", import.meta.url));
const LOCK_NAME = ".pfx-theme-core.lock.json";
const SOURCE_FILES = Object.freeze([
  "src/theme-init.js",
  "src/theme-core.js",
  "src/index.js",
  "src/theme.css",
  "src/palette.js",
  "src/index.d.ts",
  "src/theme-core.d.ts",
  "src/palette.d.ts",
]);
const DIGEST = /^[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function fail(message) {
  throw new Error(message);
}
function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validDestination(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 &&
    !value.includes("\\") &&
    value.split("/").every(part => part && part !== "." && part !== ".." &&
      /^[a-zA-Z0-9_.-]+$/.test(part));
}
function validateMapping(files) {
  if (!object(files) ||
      Object.keys(files).length !== SOURCE_FILES.length ||
      SOURCE_FILES.some(name => !Object.hasOwn(files, name))) {
    fail("Mapping must contain exactly the eight supported core source files");
  }
  const used = new Set();
  for (const name of SOURCE_FILES) {
    const destination = files[name];
    if (!validDestination(destination)) fail("Unsafe destination for " + name);
    if (used.has(destination) || destination === LOCK_NAME || destination.startsWith(LOCK_NAME + "/") ||
        [...used].some(other => destination.startsWith(other + "/") || other.startsWith(destination + "/"))) {
      fail("Duplicate, nested or reserved destination: " + destination);
    }
    used.add(destination);
  }
  return files;
}
function defaultMapping(layout) {
  if (layout !== "static" && layout !== "split") fail("Layout must be static or split");
  return Object.fromEntries(SOURCE_FILES.map(name => {
    const destination = layout === "split" && name !== "src/theme-init.js"
      ? "src/vendor/pfx-theme/" + basename(name)
      : "public/vendor/pfx-theme/" + basename(name);
    return [name, destination];
  }));
}
async function safePath(root, destination) {
  if (!validDestination(destination)) fail("Unsafe destination: " + destination);
  let current = root;
  const parts = destination.split("/");
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) fail("Symlinks are forbidden in managed paths: " + destination);
    if (index < parts.length - 1 && !stat.isDirectory()) fail("Parent is not a directory: " + destination);
    if (index === parts.length - 1 && !stat.isFile()) fail("Destination is not a regular file: " + destination);
  }
  return join(root, ...parts);
}
async function existingBytes(path) {
  try { return await readFile(path); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function compareVersions(a, b) {
  if (!SEMVER.test(a) || !SEMVER.test(b)) fail("Only numeric major.minor.patch versions are supported");
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}
function validateLock(lock) {
  if (!object(lock) || lock.schemaVersion !== 1 ||
      lock.name !== "@pfxamd/theme-core" || typeof lock.version !== "string" ||
      !SEMVER.test(lock.version) || !object(lock.files) ||
      Object.keys(lock.files).length !== SOURCE_FILES.length) {
    fail("Invalid vendor lock format");
  }
  const map = {};
  for (const source of SOURCE_FILES) {
    const entry = lock.files[source];
    if (!object(entry) || !DIGEST.test(entry.sha256)) fail("Invalid digest for " + source);
    map[source] = entry.destination;
  }
  validateMapping(map);
  return map;
}
async function inspect(root, lock) {
  const issues = [];
  for (const source of SOURCE_FILES) {
    const entry = lock.files[source];
    try {
      const path = await safePath(root, entry.destination);
      const bytes = await existingBytes(path);
      if (!bytes) issues.push(entry.destination + ": missing");
      else if (hash(bytes) !== entry.sha256) issues.push(entry.destination + ": modified");
    } catch (error) {
      issues.push(entry.destination + ": " + error.message);
    }
  }
  return issues;
}
async function sourceState() {
  const pkg = JSON.parse(await readFile(join(SOURCE, "package.json"), "utf8"));
  if (pkg.name !== "@pfxamd/theme-core" || !SEMVER.test(pkg.version)) fail("Invalid source package version");
  const bytes = {};
  for (const source of SOURCE_FILES) bytes[source] = await readFile(join(SOURCE, source));
  return { version: pkg.version, bytes };
}
function makeLock(version, mapping, bytes) {
  return {
    schemaVersion: 1,
    name: "@pfxamd/theme-core",
    version,
    files: Object.fromEntries(SOURCE_FILES.map(source => [
      source, { destination: mapping[source], sha256: hash(bytes[source]) },
    ])),
  };
}
/**
 * Preflight every destination, stage all copies, then commit the manifest last.
 * If writing one file fails, restore previous bytes for already-written files.
 */
async function commitFiles(root, next, bytes, previous = null) {
  const originals = new Map();
  for (const source of SOURCE_FILES) {
    const destination = next.files[source].destination;
    const path = await safePath(root, destination);
    originals.set(path, await existingBytes(path));
    if (!previous && originals.get(path) !== null) {
      fail("Refusing to overwrite existing non-vendored file: " + destination);
    }
  }
  const lockPath = await safePath(root, LOCK_NAME);
  const previousLock = await existingBytes(lockPath);
  if (!previous && previousLock !== null) fail("A vendor lock already exists");
  if (previous && previousLock === null) fail("Vendor lock disappeared during update");

  const stage = await mkdtemp(join(root, ".pfx-theme-stage-"));
  const replaced = [];
  try {
    for (const [index, source] of SOURCE_FILES.entries()) {
      await writeFile(join(stage, String(index)), bytes[source], { flag: "wx" });
    }
    await writeFile(join(stage, "manifest"), JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
    try {
      for (const [index, source] of SOURCE_FILES.entries()) {
        const destination = next.files[source].destination;
        const path = await safePath(root, destination);
        const current = await existingBytes(path);
        const original = originals.get(path);
        if ((current === null) !== (original === null) ||
            (current !== null && !current.equals(original))) {
          fail("Destination changed during update: " + destination);
        }
        await mkdir(dirname(path), { recursive: true });
        await rename(join(stage, String(index)), path);
        replaced.push(path);
      }
      await rename(join(stage, "manifest"), lockPath);
    } catch (error) {
      const failures = [];
      for (const path of replaced.reverse()) {
        try {
          const previousBytes = originals.get(path);
          if (previousBytes === null) await rm(path, { force: true });
          else await writeFile(path, previousBytes);
        } catch (rollbackError) {
          failures.push(rollbackError.message);
        }
      }
      if (failures.length) {
        fail(error.message + "; rollback incomplete: " + failures.join("; "));
      }
      throw error;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
async function main() {
  const [command, target, ...args] = process.argv.slice(2);
  if (!["install", "check", "update"].includes(command) || !target) {
    fail("Usage: vendor-core.mjs install|check|update <project> [--layout static|split | --config file.json]");
  }
  if (command !== "install" && args.length) fail("Only install accepts options");
  const root = await realpath(resolve(target));
  const lockPath = await safePath(root, LOCK_NAME);
  const lockBytes = await existingBytes(lockPath);
  if (command === "install") {
    if (lockBytes) fail("Already installed; use check or update");
    let mapping = defaultMapping("static");
    if (args.length) {
      if (args.length !== 2) fail("Expected --layout <static|split> or --config <file.json>");
      if (args[0] === "--layout") {
        mapping = defaultMapping(args[1]);
      } else if (args[0] === "--config") {
        const config = JSON.parse(await readFile(resolve(args[1]), "utf8"));
        if (!object(config) || config.schemaVersion !== 1) fail("Invalid integration mapping schema");
        mapping = validateMapping(config.files);
      } else {
        fail("Unknown install option: " + args[0]);
      }
    }
    validateMapping(mapping);
    const source = await sourceState();
    const lock = makeLock(source.version, mapping, source.bytes);
    await commitFiles(root, lock, source.bytes);
    console.log("Installed PFx Theme Core " + lock.version + " (" + SOURCE_FILES.length + " vendored files)");
    return;
  }
  if (!lockBytes) fail("Not installed: lock file is missing");
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const mapping = validateLock(lock);
  const issues = await inspect(root, lock);
  if (issues.length) {
    for (const issue of issues) console.error("DRIFT " + issue);
    fail("Managed files differ from their lock. No files changed.");
  }
  const source = await sourceState();
  const order = compareVersions(source.version, lock.version);
  if (command === "check") {
    console.log("CLEAN PFx Theme Core " + lock.version +
      (order > 0 ? " (upgrade available: " + source.version + ")" :
        order < 0 ? " (local source older: " + source.version + ")" : " (current)"));
    return;
  }
  if (order < 0) fail("Refusing downgrade from " + lock.version + " to " + source.version);
  const next = makeLock(source.version, mapping, source.bytes);
  if (order === 0) {
    for (const file of SOURCE_FILES) {
      if (next.files[file].sha256 !== lock.files[file].sha256) {
        fail("Upstream source changed without a version bump; refusing ambiguous update");
      }
    }
    console.log("Already current: " + lock.version);
    return;
  }
  await commitFiles(root, next, source.bytes, lock);
  console.log("Updated PFx Theme Core " + lock.version + " -> " + next.version);
}

main().catch(error => {
  console.error("PFx vendor error: " + error.message);
  process.exitCode = 1;
});
