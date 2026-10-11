import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/vendor-core.mjs", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const files = [
  "src/theme-init.js", "src/theme-core.js", "src/index.js", "src/theme.css",
  "src/palette.js", "src/index.d.ts", "src/theme-core.d.ts", "src/palette.d.ts",
];
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function run(command, root, ...args) {
  return spawnSync(process.execPath, [script, command, root, ...args], { encoding: "utf8" });
}
function workspace(fn) {
  const root = mkdtempSync(join(tmpdir(), "pfx-theme-vendor-"));
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}
function lock(root) {
  return JSON.parse(readFileSync(join(root, ".pfx-theme-core.lock.json"), "utf8"));
}
function assertCopied(root, entry) {
  for (const source of files) {
    const destination = join(root, entry.files[source].destination);
    assert.equal(existsSync(destination), true, destination + " exists");
    assert.equal(digest(readFileSync(destination)), entry.files[source].sha256);
  }
}

test("static installation copies source with fingerprinted manifest and is independent", () => workspace(root => {
  writeFileSync(join(root, "app.css"), "/* project brand */");
  const installed = run("install", root);
  assert.equal(installed.status, 0, installed.stderr);
  const info = lock(root);
  assert.equal(info.version, pkg.version);
  assert.equal(info.name, "@pfxamd/theme-core");
  assert.equal(Object.keys(info.files).length, 8);
  assertCopied(root, info);
  assert.equal(readFileSync(join(root, "app.css"), "utf8"), "/* project brand */");
  assert.equal(info.files["src/theme-init.js"].destination, "public/vendor/pfx-theme/theme-init.js");
  const checked = run("check", root);
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /CLEAN.*current/);
  assert.equal(run("update", root).status, 0);
  assert.equal(run("install", root).status, 1);
}));

test("split layout keeps head bootstrap public and source modules private", () => workspace(root => {
  const result = run("install", root, "--layout", "split");
  assert.equal(result.status, 0, result.stderr);
  const info = lock(root);
  assert.equal(info.files["src/theme-init.js"].destination, "public/vendor/pfx-theme/theme-init.js");
  assert.equal(info.files["src/index.js"].destination, "src/vendor/pfx-theme/index.js");
  assertCopied(root, info);
  assert.equal(run("check", root).status, 0);
}));

test("strict custom map supports unusual project structure without touching other files", () => workspace(root => {
  mkdirSync(join(root, "code"));
  writeFileSync(join(root, "code", "local.css"), "body{color:rebeccapurple}");
  const mapping = Object.fromEntries(files.map(file => [file, "assets/core/" + file.split("/").pop()]));
  mapping["src/theme-init.js"] = "static/scripts/theme-init.js";
  const config = join(root, "map.json");
  writeFileSync(config, JSON.stringify({ schemaVersion: 1, files: mapping }));
  const result = run("install", root, "--config", config);
  assert.equal(result.status, 0, result.stderr);
  assertCopied(root, lock(root));
  assert.equal(readFileSync(join(root, "code", "local.css"), "utf8"), "body{color:rebeccapurple}");
}));

test("check rejects edits and omissions, update refuses to overwrite either", () => workspace(root => {
  assert.equal(run("install", root).status, 0);
  const info = lock(root);
  const changed = join(root, info.files["src/theme-core.js"].destination);
  writeFileSync(changed, "/* local modification */");
  assert.notEqual(run("check", root).status, 0);
  assert.notEqual(run("update", root).status, 0);
  assert.equal(readFileSync(changed, "utf8"), "/* local modification */");
  assert.equal(lock(root).version, pkg.version);
  const missing = join(root, info.files["src/theme.css"].destination);
  rmSync(missing);
  const check = run("check", root);
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /missing/);
}));

test("updates pinned old version without overwriting consumer-owned content", () => workspace(root => {
  assert.equal(run("install", root, "--layout", "split").status, 0);
  const before = lock(root);
  before.version = "0.2.0";
  writeFileSync(join(root, ".pfx-theme-core.lock.json"), JSON.stringify(before));
  writeFileSync(join(root, "my-brand.css"), "--brand:#fff");
  const status = run("check", root);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /upgrade available/);
  const updated = run("update", root);
  assert.equal(updated.status, 0, updated.stderr);
  assert.match(updated.stdout, /Updated PFx Theme Core/);
  assert.equal(lock(root).version, pkg.version);
  assertCopied(root, lock(root));
  assert.equal(readFileSync(join(root, "my-brand.css"), "utf8"), "--brand:#fff");
}));

test("downgrades and same-version source divergence are blocked", () => workspace(root => {
  assert.equal(run("install", root).status, 0);
  const tooNew = lock(root);
  tooNew.version = "9.0.0";
  writeFileSync(join(root, ".pfx-theme-core.lock.json"), JSON.stringify(tooNew));
  assert.match(run("update", root).stderr, /Refusing downgrade/);
  const same = lock(root);
  same.version = pkg.version;
  const source = "src/theme.css";
  const dst = join(root, same.files[source].destination);
  writeFileSync(dst, "/* older upstream with same version */");
  same.files[source].sha256 = digest(readFileSync(dst));
  writeFileSync(join(root, ".pfx-theme-core.lock.json"), JSON.stringify(same));
  assert.equal(run("check", root).status, 0);
  assert.match(run("update", root).stderr, /without a version bump/);
  assert.equal(readFileSync(dst, "utf8"), "/* older upstream with same version */");
}));

test("rejects unmanaged collision and leaves source file untouched", () => workspace(root => {
  mkdirSync(join(root, "public/vendor/pfx-theme"), { recursive: true });
  const existing = join(root, "public/vendor/pfx-theme/theme-core.js");
  writeFileSync(existing, "do not touch");
  const runResult = run("install", root);
  assert.notEqual(runResult.status, 0);
  assert.match(runResult.stderr, /non-vendored/);
  assert.equal(readFileSync(existing, "utf8"), "do not touch");
  assert.equal(existsSync(join(root, ".pfx-theme-core.lock.json")), false);
}));

test("rejects traversal, duplicate, absolute paths and bad mapping schema", () => workspace(root => {
  const mapping = Object.fromEntries(files.map(file => [file, "vendor/" + file.split("/").pop()]));
  const config = join(root, "map.json");
  const invalid = [
    { ...mapping, "src/theme-core.js": "../escape.js" },
    { ...mapping, "src/theme-core.js": "/absolute.js" },
    { ...mapping, "src/theme-core.js": mapping["src/index.js"] },
    { ...mapping, "src/theme-core.js": "folder\\bad.js" },
    Object.fromEntries(Object.entries(mapping).slice(1)),
  ];
  for (const filesMap of invalid) {
    writeFileSync(config, JSON.stringify({ schemaVersion: 1, files: filesMap }));
    assert.notEqual(run("install", root, "--config", config).status, 0);
    assert.equal(existsSync(join(root, ".pfx-theme-core.lock.json")), false);
  }
  assert.notEqual(run("install", root, "--layout", "nonsense").status, 0);
}));

test("rejects symlink ancestors and symlink destination files", () => workspace(root => {
  const external = mkdtempSync(join(tmpdir(), "pfx-theme-outside-"));
  try {
    mkdirSync(join(root, "public/vendor"), { recursive: true });
    symlinkSync(external, join(root, "public/vendor/pfx-theme"), "dir");
    const result = run("install", root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Symlinks are forbidden/);
    assert.equal(existsSync(join(external, "theme-core.js")), false);
    assert.equal(existsSync(join(root, ".pfx-theme-core.lock.json")), false);
  } finally {
    rmSync(external, { recursive: true, force: true });
  }
}));

test("invalid lock cannot be used to replace arbitrary project files", () => workspace(root => {
  assert.equal(run("install", root).status, 0);
  const info = lock(root);
  info.files["src/index.js"].destination = "my-local.js";
  writeFileSync(join(root, "my-local.js"), "important app code");
  writeFileSync(join(root, ".pfx-theme-core.lock.json"), JSON.stringify(info));
  const result = run("update", root);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(join(root, "my-local.js"), "utf8"), "important app code");
}));

test("read-only check does not rewrite the lock or source files", () => workspace(root => {
  assert.equal(run("install", root).status, 0);
  const info = readFileSync(join(root, ".pfx-theme-core.lock.json"));
  const core = readFileSync(join(root, "public/vendor/pfx-theme/theme-core.js"));
  const result = run("check", root);
  assert.equal(result.status, 0);
  assert.deepEqual(readFileSync(join(root, ".pfx-theme-core.lock.json")), info);
  assert.deepEqual(readFileSync(join(root, "public/vendor/pfx-theme/theme-core.js")), core);
}));
