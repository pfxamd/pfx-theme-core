# Agent instructions — PFx Theme Core

- This is a reusable low-level core, not a SaaS theme template or site framework.
- No dependencies, external font fetches, required package publication, or AI service calls.
- Keep `src/theme-init.js` standalone and synchronous for the first paint.
- Keep the storage key, supported modes, and HTML attributes consistent between bootstrap and runtime.
- Maintain portability: standard web APIs, plain ESM, CSS custom properties.
- Make backward-compatible API changes by default. Update declarations, examples, tests, and documentation together.
- Tests use Node's built-in test runner. Do not claim browser screenshots or visual regression checks without real evidence.
- When requested to apply the core to another repo, follow INTEGRATION.md and keep the destination design unchanged except for authorized appearance changes.
