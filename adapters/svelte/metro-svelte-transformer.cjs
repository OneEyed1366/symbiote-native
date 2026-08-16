// Metro babel transformer that teaches the bundler to read Svelte components (.svelte). Metro
// has no Svelte plugin, so we do the single-pass compile here: run svelte/compiler's compile()
// with this adapter's own compiler options, then hand the generated client JS to RN's own babel
// transformer. This is the Metro twin of adapters/vue/metro-vue-transformer.cjs.
//
// Unlike Vue's transformer, this does NOT rewrite any framework import: compiled output already
// dispatches every node operation to whatever `current_renderer` `mount()` was given
// (svelte-adapter-custom-renderer skill) — there is no @symbiote-native/svelte/runtime-helpers
// retarget the way Vue needs one.
//
// Ships as a package-level export (`@symbiote-native/svelte/metro-svelte-transformer`) rather
// than living in each consuming app: a consumer's own metro.config.js just points
// babelTransformerPath at it.

// Lazy + dynamic import, not a top-level `require('svelte/compiler')`: our git-pinned checkout
// (svelte-adapter-custom-renderer skill — sveltejs/svelte PR #18042 is unreleased, no npm build
// artifact) ships no prebuilt `compiler/index.js` CJS bundle (that is `rollup -c`'s output, and
// we install from source). The package's `require` export condition points AT that missing file,
// so `require('svelte/compiler')` throws MODULE_NOT_FOUND under Metro/Node's CJS resolution —
// `import()` instead resolves the `default`/`types` condition (`./src/compiler/index.js`, real
// ESM source Node loads directly, no build step). Re-check this the moment the pin moves to a
// real npm release, which ships the built bundle and makes `require` viable again.
let compilerPromise;
function compiler() {
  compilerPromise ??= import('svelte/compiler');
  return compilerPromise;
}

const ts = require('typescript');
const { compileCssFile, isStyleFile, resolveUpstreamTransformer } = require('@symbiote-native/css-parser');

const upstreamTransformer = resolveUpstreamTransformer();

// Mirrors adapters/svelte/svelte.config.js's own compilerOptions exactly. `experimental.
// customRenderer` is what actually enables the custom-renderer compile path — see that file's
// header and the svelte-adapter-custom-renderer skill for why the string value itself is inert
// (mount() supplies the real renderer object separately) and for what the compiler now rejects
// at compile time as a direct result of enabling it. Duplicated here rather than imported from
// that file: svelte.config.js is ESM (`export default`, loaded directly by Node-native tooling —
// svelte-check, the language server, Vite), while this file is `require()`d by Metro directly
// and must stay pure CommonJS with no build step of its own, exactly like
// metro-vue-transformer.cjs.
const COMPILER_OPTIONS = {
  fragments: 'tree',
  css: 'external',
  generate: 'client',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
};

// The `<style>` preprocessor, loaded lazily (require() cannot pull an ESM/TS module, but
// `transform` is already async) and once. Unlike the retired web-only-construct guard
// above (which only throws and hands the source back untouched), this one REWRITES the source —
// it compiles the style block into registerStyles() output and scopes every `class` in the
// component's own markup — so its returned `code` is what compile() must be given. See
// src/preprocessor/scoped-styles.ts for why Svelte's own `result.css` cannot be used instead.
let scopedStylesPromise;
function scopedStylesPreprocessor() {
  scopedStylesPromise ??= import('@symbiote-native/svelte/scoped-styles').then(mod =>
    mod.scopedStyles(),
  );
  return scopedStylesPromise;
}
//
// Svelte 5's compiler strips <script lang="ts"> types structurally, with no external type
// resolution needed (unlike @vue/compiler-sfc's compileScript, which needs registerTS + a real
// `fs` for a type-only import from another file) — so no TypeScript/filesystem wiring is needed
// here the way metro-vue-transformer.cjs needs it.
async function compileSvelteFile(src, filename) {
  const { compile } = await compiler();
  const { js } = compile(src, { ...COMPILER_OPTIONS, filename });
  return js.code;
}

// `.svelte.js`/`.svelte.ts` files (adapters/svelte/src/runes/*.svelte.ts and any package that
// ships its own runes, e.g. packages/splash-screen/src/svelte/runes) carry rune syntax
// ($state/$effect/...) OUTSIDE a component's markup, so they need svelte/compiler's separate
// MODULE api, not compile() — compile() expects a component and throws a parse error on a bare
// module (verified directly against svelte@5.56.8). Uncompiled, a literal `$state(...)` call
// hits svelte/index-client.js's dev-guard export and throws `rune_outside_svelte` the instant
// it runs — this filename check was previously MISSING entirely, so every .svelte.ts rune file
// shipped uncompiled and would crash on first call on a real device.
//
// Unlike compile() (which strips <script lang="ts"> types itself via bundled acorn-typescript),
// compileModule() does NOT parse TypeScript at all — verified directly: it throws js_parse_error
// on a bare return-type annotation regardless of the .ts filename passed. So TS has to be
// stripped BEFORE compileModule() ever sees the source. ts.transpileModule() (isolated-file
// "strip only" mode, module:ESNext/target:ESNext) does exactly this: drops type-only
// imports/annotations, keeps every used value import and leaves $state/$effect call expressions
// completely untouched — verified it does not require full-program type information the way
// metro-vue-transformer.cjs's registerTS step does.
function stripTypeScript(src, filename) {
  const { outputText } = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  });
  return outputText;
}

async function compileSvelteModuleFile(src, filename) {
  const { compileModule } = await compiler();
  const { js } = compileModule(stripTypeScript(src, filename), { generate: 'client', filename });
  return js.code;
}

// Exported separately so tests can assert on the compiled output directly without driving the
// full upstream RN Babel preset.
module.exports.compileSvelteFile = compileSvelteFile;
module.exports.compileSvelteModuleFile = compileSvelteModuleFile;

module.exports.transform = async function transform(params) {
  if (params.filename.endsWith('.svelte')) {
    // The web-only-construct guard this used to run here (bind:/transition:/<svelte:head|
    // window|body|document>) is gone: `experimental.customRenderer` above makes the compiler
    // itself reject every one of those at compile time (svelte-adapter-custom-renderer skill) —
    // a real compile error, not a hand-maintained preprocessor pass.
    const preprocessed = await (
      await scopedStylesPreprocessor()
    ).markup({ content: params.src, filename: params.filename });
    const code = await compileSvelteFile(preprocessed.code, params.filename);
    // Re-label as .tsx so RN's transformer processes the module exactly like app source; Metro
    // tracks the real path separately. Matches metro-vue-transformer.cjs's identical trick.
    return upstreamTransformer.transform({ ...params, src: code, filename: params.filename + '.tsx' });
  }
  if (params.filename.endsWith('.svelte.ts') || params.filename.endsWith('.svelte.js')) {
    const code = await compileSvelteModuleFile(params.src, params.filename);
    return upstreamTransformer.transform({ ...params, src: code, filename: params.filename + '.tsx' });
  }
  // A standalone style file (as opposed to a component's own <style> block, handled by the
  // preprocessor above) — the framework-agnostic path (core/css-parser's compileCssFile), usable
  // from this adapter's examples exactly like from any other adapter's. isStyleFile recognizes
  // .css/.scss/.sass/.less/.styl (+ .module.*).
  if (isStyleFile(params.filename)) {
    const { code } = await compileCssFile(params.src, params.filename);
    return upstreamTransformer.transform({ ...params, src: code, filename: params.filename + '.js' });
  }
  return upstreamTransformer.transform(params);
};

// Surface the upstream cache key so RN preset changes still bust Metro's cache. The compile step
// itself is invalidated by `--reset-cache`.
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
