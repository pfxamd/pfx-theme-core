# API — v0.2.0

Import from `src/index.js` (or its copied path inside a consuming project).

## Exports

### `createThemeController(options?)`

Options:

| Name | Type | Default | Meaning |
| --- | --- | --- | --- |
| `root` | `HTMLElement` | `document.documentElement` | Root receiving theme attributes |
| `window` | `Window` | Browser `window` | Browser APIs; injectable for tests |
| `storageKey` | `string` | `"pfx-theme-mode"` | Preference persistence key |
| `defaultMode` | `ThemeMode` | `"system"` | Fallback when no valid stored value |

One active controller owns each root. Creating another controller for the same root before calling `destroy()` throws. This is intentional: competing controllers would write conflicting attributes. Separate roots remain independent.

Controller methods:

- `getState()` returns `{ mode, resolved }`.
- `setMode("light" | "dark" | "system")` updates the preference, paints root, persists best-effort, and returns state.
- `reset()` selects and persists `system`.
- `subscribe(listener)` receives an immutable state snapshot when a preference or effective scheme changes; returns an unsubscribe function. Invoke `getState()` to render the initial state. Re-entrant changes are delivered in FIFO order. A throwing subscriber does not stop remaining callbacks; errors propagate after the queue is drained, as the original error or `AggregateError` when there is more than one.
- `destroy()` removes media query and storage listeners on a best-effort basis and releases root ownership; calling it twice is safe. Calling `setMode()` after it throws.

Additional exports:

- `THEME_MODES`: frozen array of the three mode strings.
- `DEFAULT_STORAGE_KEY`: `"pfx-theme-mode"`.
- `isThemeMode(value)`: type guard.
- `resolveTheme(mode, prefersDark)`: pure resolver, throws on invalid mode.

Attributes set on the root:

- `data-pfx-theme`: `light` or `dark`, the *effective* scheme
- `data-pfx-theme-mode`: `light`, `dark`, or `system`, the preference
- Inline `style.colorScheme`: `light` or `dark`, for native controls

## Bootstrap script

`src/theme-init.js` runs synchronously in `<head>` before stylesheets.
Optional HTML attributes on that script: `data-pfx-storage-key`, `data-pfx-default-mode`.
They must match the controller options.

## CSS tokens

`theme.css` defines no component selectors, only the following semantic variables:

- `--pfx-color-background`
- `--pfx-color-surface`
- `--pfx-color-text`
- `--pfx-color-muted`
- `--pfx-color-border`
- `--pfx-color-accent`
- `--pfx-color-on-accent`
- `--pfx-color-focus`

The app is responsible for mapping these into actual styles and ensuring appropriate contrast.

## Optional semantic palette utilities (v0.2.0)

Independent pure functions from `src/palette.js` (also re-exported by `src/index.js`):

- `parseHexColor(hex)` accepts opaque #RGB/#RRGGBB, rejects ambiguous alpha or CSS values.
- `relativeLuminance(hex)`, `contrastRatio(foreground, background)` implement WCAG 2.2 sRGB math without rounding decision values.
- `validatePalette(palette)` checks a versioned, structurally matching light/dark pair and declared usage/level rules.
- `auditPalette(palette)` returns immutable `{ passes, results }`, one numerical result per declared pair and theme.
- `renderPaletteCSS(palette)` generates deterministic CSS custom properties and a no-script system fallback.

All palette functions are optional. They do not instantiate a controller, inspect DOM, or apply a brand. See [COLORS.md](COLORS.md).
