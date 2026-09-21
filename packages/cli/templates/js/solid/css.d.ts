// Ambient module for a plain, side-effect-only `.css` import (`import './App.css'`) —
// @symbiote-native/css-parser compiles it at build time (Metro's babelTransformerPath, see
// metro.config.js) into a registerRules() call; there's no runtime export to type.
declare module '*.css';

// Same shape for the three optional preprocessor sources — css-parser reduces each to plain CSS
// before compiling, so a side-effect import of one is indistinguishable downstream from a `.css`
// one.
declare module '*.scss';
declare module '*.sass';
declare module '*.less';
declare module '*.styl';

// Generic (non-literal) fallback for a `.module.css` import, used by a standalone `tsc` run. The
// `@symbiote-native/css-parser/typescript-plugin` entry in tsconfig.json's `compilerOptions.plugins`
// gives per-file literal-key typing live in the editor instead.
declare module '*.module.css' {
  const styles: Record<string, string>;
  export default styles;
}
