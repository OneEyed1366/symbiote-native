// Ambient module for a plain, side-effect-only `.css` import (`import './App.css'`) —
// @symbiote-native/css-parser compiles it at build time (Metro's babelTransformerPath, see
// metro.config.js) into a registerStyles() call; there's no runtime export to type. Mirrors
// examples/react/css.d.ts, examples/svelte/css.d.ts and examples/angular/css.d.ts.
declare module '*.css';

// Generic (non-literal) fallback for a `.module.css` import, used by a standalone `tsc` run. The
// `@symbiote-native/css-parser/typescript-plugin` entry in tsconfig.json's `compilerOptions.plugins`
// gives per-file literal-key typing live in the editor instead — TS plugins never load for a plain
// `tsc`/CI run, which is why both mechanisms exist side by side.
declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}
