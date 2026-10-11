# API — v0.1.0

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

Controller methods:

- `getState()` returns `{ mode, resolved }`.
- `setMode("light" | "dark" | "system")` updates the preference, paints root, persists best-effort, and returns state.
- `reset()` selects and persists `system`.
- `subscribe(listener)` receives state when a preference or effective scheme changes; returns an unsubscribe function. Invoke `getState()` to render the initial state.
- `destroy()` removes media query and storage listeners; calling it twice is safe. Calling `setMode()` after it throws.

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
