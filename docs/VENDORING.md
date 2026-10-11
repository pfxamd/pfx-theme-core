# PFx Theme Core — vendored installation and safe updates

Version 0.3.0 adds a **build-time manager**, separate from the zero-dependency browser runtime. It works on real directories using the Node standard library. It does not publish or require an npm package and makes no HTTP requests.

## Commands

Run these from a local checkout of **pfx-theme-core** (the CLI always reads source files from its own repository, not from the consuming project):

```bash
# Standard static site. All files go under public/vendor/pfx-theme
node scripts/vendor-core.mjs install ../my-site --layout static

# Astro, Vite or another project with a module source tree:
# theme-init.js -> public/vendor/pfx-theme/
# the remaining JS/CSS/type files -> src/vendor/pfx-theme/
node scripts/vendor-core.mjs install ../my-site --layout split

# Inspect installed integrity and whether the source version is newer:
node scripts/vendor-core.mjs check ../my-site

# Copy newer files after integrity and version checks:
node scripts/vendor-core.mjs update ../my-site
```

Default installation uses the static layout. When already installed, use `check` or `update`, not `install`.

`install` is for unmanaged destinations only: if even one target file already exists, installation refuses to overwrite it. `update` refuses any edits, deleted managed files, unsafe destination paths or downgraded versions. It preserves exactly the file mappings recorded in the original lock. Updating is always explicit; no automatic checks run in consuming browsers.

## Consumer lock

A generated `.pfx-theme-core.lock.json` in the receiving project records:

- `schemaVersion`: currently `1`
- `name`: `@pfxamd/theme-core`
- `version`: the vendor source version
- `files`: each allowlisted source path, its independent destination and a SHA-256 digest

**Commit this lock together with the copied files.** The lock is the source of truth for future versions and detects local modification. Do not manually rewrite hashes to silence a conflict: this would defeat drift protection. The lock is an integrity record, not a cryptographic signature of GitHub releases.

The set of managed source files includes the bootstrap, module controller, CSS tokens, palette utilities, entry point and TypeScript declaration files. Branding and component styles are **not** managed.

## Custom layout

Write a JSON mapping and pass it to `install`:

```bash
node scripts/vendor-core.mjs install ../my-site --config ./examples/vendor-map.json
```

The JSON has `schemaVersion: 1` and a `files` object mapping **all eight** source names to safe, relative, unique destination paths. Example: [examples/vendor-map.json](../examples/vendor-map.json).

- Every destination must be under the consuming project root.
- Paths cannot contain `..` segments, absolute paths, backslashes or symlink ancestors.
- Existing application files are never adopted or replaced silently.
- Changing destinations later requires a deliberate migration; the update command intentionally does not remap them.

## Integrating into UI

The CLI only copies portable source files. Load `theme-init.js` synchronously in the document head before stylesheets, initialize one controller per document root, and bind the project's **existing** appearance control. Explicitly customize tokens in a **project-owned** stylesheet, not in the managed `theme.css` file. The site's colors and layout remain its responsibility.

Bundler and deployment systems may have different rules about loading files from `public`; use the static or split mapping suited to that project. Verify the actual build, browser behavior and production asset paths.

## Safety scope

- Paths, duplicate destinations, untracked-file collisions and symlinks are checked before writing.
- All copy contents are staged before replacing managed files; on ordinary write failures, the manager attempts to restore previously written files. It is **not** a crash-proof filesystem transaction across multiple files or a defense against concurrent hostile processes.
- File hashes detect accidental edits; they do not authenticate untrusted upstream repositories.
- The source version must be newer to update. Source bytes changing without a version bump are rejected for same-version updates.
- On a conflict, reconcile changes in the consumer rather than use a force flag.
- Re-run `npm run check`, the consuming site's tests and real-browser checks after any update. The vendor manager itself does not assert visual correctness.

The core can also be copied manually or via a GitHub connector where there is no filesystem checkout, but a managed-install success must never be claimed unless the lock and actual copied hashes are verified.
