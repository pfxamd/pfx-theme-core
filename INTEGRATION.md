# PFx Theme Core — integration contract

Use these instructions when applying the core to an existing or new website.

## Operating principle

PFx Theme Core handles the preference and resolves the active scheme. The destination project owns its appearance. Do not replace the project's design with a generic black/white theme.

## Required procedure

1. Inspect the destination project's existing layout, stylesheets, framework, routing, theme logic, CSP, and browser entry points before editing.
2. Copy the four portable source files (`src/theme-init.js`, `src/theme-core.js`, `src/index.js`, `src/theme.css`) into a dedicated local directory in the destination repository. Do not introduce a runtime GitHub/CDN dependency or require an npm publication.
3. Load `theme-init.js` as a classic **blocking** head script **before** stylesheets, using the correct deployment base path. Do not load it asynchronously. If the framework/server already has a correct first-paint theme strategy, adapt the integration to preserve it rather than layering conflicting bootstrap scripts.
4. Initialize `createThemeController()` only once per document root. Wire the project's existing switcher to `setMode()`, and use `subscribe()` / `getState()` to reflect current selection. Keep the preference `system` distinct from the resolved scheme `light` or `dark`.
5. Map existing semantic design tokens to both themes. Preserve typography, layouts, responsiveness, transitions, and all non-theme behavior. Make no unrelated changes.
6. Remove or disable *conflicting* old theme writers/listeners only after the new controller is integrated. Avoid maintaining competing `class="dark"` and `data-pfx-theme` states unless the mapping is explicit.
7. Validate with automated checks and real browser views where available. Report which tests were actually run; never claim a visual check from code inspection alone.

## Configuration consistency

Default storage key: `pfx-theme-mode`. Default preference: `system`.

If `createThemeController({ storageKey, defaultMode })` changes either default, pass matching `data-pfx-storage-key` and `data-pfx-default-mode` on the bootstrap script.

## Minimum acceptance checks

- First visit under OS light and OS dark
- Explicit light/dark selections, refresh, and reopening
- System mode reacts to OS changes
- Preference changes in a second tab sync correctly
- Storage unavailable or denied does not break the switcher
- Keyboard operation, visible focus, legible text and controls
- Responsive views, forms, dialogs, navbars, and native form elements
- No theme flash caused by late initialization, to the extent the target environment allows verification
- No regressions to unrelated features

## What to copy in a ChatGPT instruction

> Apply the PFx Theme Core from https://github.com/pfxamd/pfx-theme-core to this repository. Read INTEGRATION.md and the source. Vendor the core locally rather than requiring a package or runtime connection. Respect the project's existing design and functions, implement both appearance modes and system preference, then run real checks. Report verified outcomes and any limits.

## Optional semantic palettes

For projects that want a single source of color truth, define an independent versioned light/dark manifest with tested foreground/background pairs as documented in `docs/COLORS.md`. At build/design time, run the CLI to check it and generate the project's semantic CSS. Keep the project palette in the consuming repository. Do not overwrite existing design colors with the sample neutral palette. Do not claim automated contrast checking alone certifies the rendered interface as WCAG compliant.

## Vendor manager (v0.3.0)

When the current task authorizes implementing the core, prefer the checked-in build-time utility `scripts/vendor-core.mjs` from this repository wherever local files are available. It installs all 8 portable source and declaration files and writes `.pfx-theme-core.lock.json` into the receiving project, capturing both version and SHA-256 file hashes.

- New vanilla/static projects: `node scripts/vendor-core.mjs install /path/to/project --layout static`.
- Frontend bundlers (such as Astro): `node scripts/vendor-core.mjs install /path/to/project --layout split` (early init in `public/`, importable sources in `src/`).
- Special layouts: supply `--config path/to/map.json`, with an explicit manifest (see `docs/VENDORING.md`).
- Check: `node scripts/vendor-core.mjs check /path/to/project`.
- Update deliberately: `node scripts/vendor-core.mjs update /path/to/project` and rerun consumer tests, browser visual checks and any theme contrast checks.

The manager **never edits the consuming project's components or CSS overrides**, never installs a runtime package and never automatically updates without an explicit command. The agent is responsible for integrating the copied engine with the destination's own stylesheet, UI switcher and head script. Commit the lock and vendored files together. If local changes to vendored files are detected, stop and reconcile rather than force-writing them. If only a GitHub connector is available, copy the same allowlisted source files and create a matching lock using SHA-256 calculated from their actual bytes, or report that lock-backed update functionality was not established; do not invent a successful vendor-manager run.
