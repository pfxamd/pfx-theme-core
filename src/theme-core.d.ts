export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
}

export interface ThemeController {
  getState(): ThemeState;
  setMode(nextMode: ThemeMode): ThemeState;
  reset(): ThemeState;
  subscribe(listener: (state: ThemeState) => void): () => boolean;
  destroy(): void;
}

export interface ThemeOptions {
  root?: HTMLElement;
  window?: Window;
  storageKey?: string;
  defaultMode?: ThemeMode;
}

export declare const THEME_MODES: readonly ThemeMode[];
export declare const DEFAULT_STORAGE_KEY: "pfx-theme-mode";
export declare function isThemeMode(value: unknown): value is ThemeMode;
export declare function resolveTheme(mode: ThemeMode, prefersDark?: boolean): ResolvedTheme;
export declare function createThemeController(options?: ThemeOptions): ThemeController;
