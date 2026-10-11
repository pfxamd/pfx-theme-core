/**
 * PFx Theme Core: synchronous first-paint bootstrap.
 * Load as a classic, non-async script in <head>, BEFORE any stylesheets.
 * Must agree with DEFAULT_STORAGE_KEY and theme attributes in theme-core.js.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  if (!root) return;

  var mode = "system";
  try {
    var stored = window.localStorage.getItem("pfx-theme-mode");
    if (stored === "light" || stored === "dark" || stored === "system") {
      mode = stored;
    }
  } catch (_) {
    // localStorage may be unavailable. System preference still works.
  }

  var dark = false;
  if (mode === "system") {
    try {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (_) {
      // Browsers without matchMedia default to light.
    }
  }

  var resolved = mode === "system" ? (dark ? "dark" : "light") : mode;
  root.setAttribute("data-pfx-theme", resolved);
  root.setAttribute("data-pfx-theme-mode", mode);
  if (root.style) root.style.colorScheme = resolved;
})();
