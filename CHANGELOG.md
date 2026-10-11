# Changelog

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
