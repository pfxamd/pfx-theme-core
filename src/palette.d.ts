export type PaletteMode = "light" | "dark";
export type ContrastUsage = "text" | "large-text" | "non-text";
export type ContrastLevel = "AA" | "AAA";
export interface ContrastCheck {
  foreground: string;
  background: string;
  usage: ContrastUsage;
  level: ContrastLevel;
}
export interface Palette {
  schemaVersion: 1;
  themes: { light: Record<string, string>; dark: Record<string, string> };
  contrastChecks: ContrastCheck[];
}
export interface ContrastResult extends ContrastCheck {
  theme: PaletteMode;
  ratio: number;
  minimum: number;
  passes: boolean;
}
export declare const CONTRAST_MINIMUMS: Readonly<{
  text: Readonly<{ AA: 4.5; AAA: 7 }>;
  "large-text": Readonly<{ AA: 3; AAA: 4.5 }>;
  "non-text": Readonly<{ AA: 3 }>;
}>;
export declare function parseHexColor(value: string): Readonly<{r:number;g:number;b:number}>;
export declare function relativeLuminance(color: string): number;
export declare function contrastRatio(foreground: string, background: string): number;
export declare function validatePalette(palette: Palette): true;
export declare function auditPalette(palette: Palette): Readonly<{
  passes: boolean;
  results: readonly Readonly<ContrastResult>[];
}>;
export declare function renderPaletteCSS(palette: Palette): string;
