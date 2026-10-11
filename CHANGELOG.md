# Changelog

## 0.3.0 — 2026-10-11

- Added optional dependency-free vendor manager with install/check/update commands.
- Added a consumer-side lock containing exact upstream version, file destinations and SHA-256 digests.
- Added collision, symlink, path traversal, version and local modification guards.
- Added staged file updates and best-effort restoration if commit operations fail.
- Added static, split and explicit project-specific mapping layouts.
- Added regression tests for installs, updates, drift, collisions and malicious paths, plus integration documentation.
- No changes to theme runtime, palette contracts, or dependency requirements.

## 0.2.0 — 2026-10-11

- Added optional versioned semantic light/dark palette manifests.
- Added pure WCAG 2.2 sRGB relative luminance and contrast audit helpers.
- Added strict input validation and deterministic CSS token generation.
- Added a standalone, dependency-free Node CLI for palette verification and generation.
- Added tests for contrast thresholds, invalid colors, schema, deterministic output, and CLI failure behavior.
- Retained the existing light/dark/system runtime API and zero runtime dependencies.

## 0.1.1 — 2026-10-11

- Prevented multiple active controllers from claiming the same document root; ownership is released on destroy.
- Ignored storage events from unrelated storage areas, including sessionStorage.
- Serialized re-entrant subscriber updates and isolated observer failures while retaining error reporting.
- Hardened optional event registration/cleanup, including legacy media query fallback.
- Added regression tests for lifecycle, subscriptions, and storage synchronization.
- Kept the public API and optional first-paint bootstrap unchanged; no dependencies added.

## 0.1.0 — 2026-10-11

- Created the standalone theme preference controller and synchronous first-paint bootstrap.
- Added light, dark, and system preference with runtime OS change tracking.
- Added safe storage handling, cross-tab synchronization, subscriptions, and teardown.
- Added semantic CSS tokens and TypeScript declarations.
- Added automated tests, GitHub Actions workflow, and a standalone browser example.
- Documented vendored integration without a package registry dependency.
