# PFx Theme Core

A small, framework-independent appearance engine for websites and web applications.

**Version:** 0.1.1 · **License:** MIT · **Dependencies:** 0 · **Publishing to npm:** not required

The core manages the **light / dark / system** preference. Each project keeps its own brand identity, colors, typography, components, and layouts.

## What is included

- Theme preference: `light`, `dark`, `system`
- Browser system preference detection and live updates
- Best-effort first-paint setup using a synchronous head script
- Safe persistence, including when browser storage is unavailable
- Cross-tab synchronization via storage events
- A small observable controller with cleanup and duplicate-root protection
- Semantic CSS tokens you can override
- Browser-native `color-scheme` support
- TypeScript declaration files without a mandatory TypeScript dependency
- Node built-in tests and GitHub Actions verification

## Install by copying files (no npm)

Copy these files to a directory within your project, for example `public/vendor/pfx-theme/`:

```text
src/theme-init.js
src/theme-core.js
src/index.js
src/theme.css
```

Then add the following to the document. **Load the classic bootstrap script synchronously in the head before any stylesheets**, not with `async`, `defer`, or `type="module"`.

```html
<head>
  <script src="/vendor/pfx-theme/theme-init.js"></script>
  <link rel="stylesheet" href="/vendor/pfx-theme/theme.css">
  <link rel="stylesheet" href="/assets/app.css">
</head>
```

Initialize the controller once when the application's JavaScript starts:

```js
import { createThemeController } from "/vendor/pfx-theme/index.js";

const theme = createThemeController();
theme.setMode("dark"); // or "light" or "system"
console.log(theme.getState()); // { mode: "dark", resolved: "dark" }

// Reflect external changes (OS preference or another tab):
const unsubscribe = theme.subscribe(({ mode, resolved }) => {
  console.log(mode, resolved);
});

// Optional cleanup during teardown:
// unsubscribe();
// theme.destroy();
```

Do not call `setMode` automatically on every page load; the controller restores a saved preference on its own. **Only create one active controller per document root.** A second creation for the same root throws until the first controller is destroyed.

The current effective scheme is reflected on the HTML element:

```html
<html data-pfx-theme="dark" data-pfx-theme-mode="system">
```

The CSS file defines **tokens only** and does not restyle your page automatically. Your own styles decide which elements use them:

```css
body {
  background: var(--pfx-color-background);
  color: var(--pfx-color-text);
}
.panel { background: var(--pfx-color-surface); }
```

Replace the default colors with the project's own tokens in its stylesheet, loaded **after** `theme.css`:

```css
:root[data-pfx-theme="light"] {
  --pfx-color-background: #ffffff;
  --pfx-color-text: #171717;
}
:root[data-pfx-theme="dark"] {
  --pfx-color-background: #101010;
  --pfx-color-text: #f5f5f5;
}
```

## Optional configuration

By default, storage key is `pfx-theme-mode` and initial preference is `system`.

If you customize the controller, **match the bootstrap script options** or the first paint may use the wrong preference:

```html
<script
  src="/vendor/pfx-theme/theme-init.js"
  data-pfx-storage-key="my-theme"
  data-pfx-default-mode="dark"
></script>
```

```js
const theme = createThemeController({
  storageKey: "my-theme",
  defaultMode: "dark"
});
```

## Run example / tests

- Example: `examples/basic/index.html` (serve from a static HTTP server, not `file://`).
- Verify: `npm run check` or `node --test` (Node 20+, no dependencies to install).
- Complete API: [docs/API.md](docs/API.md)
- Instructions for applying this core to another repository: [INTEGRATION.md](INTEGRATION.md)

## Runtime hardening (0.1.1)

- Ignores unrelated storage areas; cross-tab preference events must correspond to localStorage.
- Guarantees subscription event order for synchronous, re-entrant theme updates. Subscription callbacks receive read-only state snapshots.
- If a subscriber throws, other subscribers still run; the original error (or an `AggregateError` for multiple failures) is rethrown after dispatch. Avoid throwing from UI subscribers.
- Handles missing/throwing optional media and storage event registration APIs. Destroy cleans up best-effort.
- The API and copied-file installation remain compatible with 0.1.0. Consumers need to replace only `theme-core.js` for this maintenance update.

## Scope and limitations

- This core does not generate a complete dark palette for an arbitrary website. Adapt the project's existing design tokens and check contrast for every important component.
- The blocking head bootstrap reduces theme flashes when correctly loaded; site-specific server rendering, CSP restrictions, slow resource loading, or an incorrectly ordered script may still need special handling.
- If JavaScript is disabled, `theme.css` offers a system-preference fallback, but cannot retrieve the stored manual choice.
- Browser-based visual and accessibility checks must be performed within the actual consuming project.

© 2026 PFxamd
