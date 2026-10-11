/**
 * PFx Theme Core: synchronous first-paint bootstrap.
 * Load as a classic, non-async script in <head>, BEFORE any stylesheets.
 * Optional script attributes:
 *   data-pfx-storage-key="pfx-theme-mode"
 *   data-pfx-default-mode="system"
 * Match those values in createThemeController().
 */
(function () {
  "use strict";

  var root = document.documentElement;
  if (!root) return;

  var script = document.currentScript;
  var configuredKey = script && script.getAttribute("data-pfx-storage-key");
  var key = configuredKey || "pfx-theme-mode";
  var configuredDefault = script && script.getAttribute("data-pfx-default-mode");
  var defaultMode =
    configuredDefault === "light" ||
    configuredDefault === "dark" ||
    configuredDefault === "system"
      ? configuredDefault
      : "system";

  var mode = defaultMode;
  try {
    var stored = window.localStorage.getItem(key);
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
