# Semantic color contracts (optional)

PFx Theme Core v0.2.0 keeps appearance **state** separate from each project's **visual design**. This module is optional: existing projects can continue to use `theme.css` and manually define their colors.

## Inputs

A JSON manifest is the single source for each project's semantic colors. The provided `tokens/neutral.json` is an **example**, not a visual identity to impose on consumers.

```json
{
  "schemaVersion": 1,
  "themes": {
    "light": { "background": "#ffffff", "text": "#111111", "accent": "#124ac7", "on-accent": "#ffffff" },
    "dark": { "background": "#101010", "text": "#f5f5f5", "accent": "#b5cbff", "on-accent": "#101010" }
  },
  "contrastChecks": [
    { "foreground": "text", "background": "background", "usage": "text", "level": "AA" },
    { "foreground": "on-accent", "background": "accent", "usage": "text", "level": "AA" }
  ]
}
```

Token identifiers may contain lowercase ASCII letters, digits and hyphens, and must start with a letter. Both themes must declare the exact same keys. Colors must be explicit opaque sRGB `#RGB` or `#RRGGBB` values. Unsupported or transparent colors **fail** validation rather than being guessed. Every intended contrast pair must be declared: the tool does not attempt to infer which elements overlap.

## Contrast rules

The implementation follows WCAG 2.2's relative luminance definition (sRGB threshold `0.04045`). Comparisons are made with unrounded numbers.

| Usage | AA | AAA |
| --- | --- | --- |
| `text` (normal) | 4.5:1 | 7:1 |
| `large-text` | 3:1 | 4.5:1 |
| `non-text` (meaningful UI/graphic) | 3:1 | not defined by this tool |

Apply `large-text` only when the actual rendering qualifies as large text. Apply `non-text` to visually essential controls/graphics, not every decorative border. A ratio passing in a palette **does not establish accessibility compliance** for actual pages.

Official references:
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- https://www.w3.org/WAI/WCAG21/Understanding/relative-luminance.html

## Validate and generate

```bash
node scripts/palette-cli.mjs check tokens/neutral.json
node scripts/palette-cli.mjs build tokens/neutral.json src/theme.css
```

The first command checks all declared pairs in both modes. The second runs the same checks **before** producing CSS and refuses output if one fails.

Generated variables are named `--pfx-color-<token>` and include:
- `:root` and `:root[data-pfx-theme="light"]`
- `:root[data-pfx-theme="dark"]`
- `@media (prefers-color-scheme: dark)` fallback when no JS theme attribute exists

Keep a project's manifest, generated stylesheet and UI styles together in its own repository. This does not require publication to npm or a runtime connection to the core repository.

## Supported boundaries

- No attempt to parse unsupported colors, alpha blending, gradients or photos.
- No invented dark scheme from a bright brand palette: authors supply both intentional sets.
- No CSS selectors for component layouts, resets or typography.
- No claim that token-level contrast checks replace browser accessibility audits.
- No network calls or third-party runtime dependencies.
