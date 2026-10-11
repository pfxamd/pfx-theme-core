import { createThemeController } from "../../src/index.js";

const controller = createThemeController();
const buttons = [...document.querySelectorAll("[data-theme-mode]")];
const selected = document.getElementById("selected-mode");
const resolved = document.getElementById("resolved-mode");

function render({ mode, resolved: effectiveTheme }) {
  selected.textContent = mode;
  resolved.textContent = effectiveTheme;
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button.dataset.themeMode === mode));
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    controller.setMode(button.dataset.themeMode);
  });
}

controller.subscribe(render);
render(controller.getState());
