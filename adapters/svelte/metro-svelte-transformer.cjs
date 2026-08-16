// Metro babel transformer that teaches the bundler to read Svelte components (.svelte). Metro
// has no Svelte plugin, so we do the single-pass compile here: run svelte/compiler's compile()
// with this adapter's own compiler options, then hand the generated client JS to RN's own babel
// transformer. This is the Metro twin of adapters/vue/metro-vue-transformer.cjs.
//
// Unlike Vue's transformer, this does NOT rewrite any framework import: the whole
// svelte-adapter-dom-shim strategy is that STOCK compiled Svelte client output (its own
// `import * as $ from 'svelte/internal/client'`) runs completely unchanged against a globalThis
// DOM shim — there is no @symbiote-native/svelte/runtime-helpers retarget the way Vue needs one.
// Verified against the installed svelte@5.56.8: compiling a trivial component with
// {fragments:'tree', css:'external', generate:'client'} produces exactly
// `import * as $ from 'svelte/internal/client'` + `$.from_tree(...)` + `$.set_custom_element_data`
// calls — the same shape the dom-shim's init_operations patches already target.
//
// Ships as a package-level export (`@symbiote-native/svelte/metro-svelte-transformer`) rather
// than living in each consuming app: a consumer's own metro.config.js just points
// babelTransformerPath at it.

const { compile, compileModule } = require('svelte/compiler');
const ts = require('typescript');
const {
  compileCssFile,
  isStyleFile,
  resolveUpstreamTransformer,
} = require('@symbiote-native/css-parser');

const upstreamTransformer = resolveUpstreamTransformer();

// Mirrors adapters/svelte/svelte.config.js's own compilerOptions exactly (fragments:'tree' is
// mandatory per svelte-adapter-dom-shim skill §2 — it makes the compiler emit from_tree(),
// element-by-element via document.createElement, never from_html()'s innerHTML-on-a-<template>,
// so the shim needs no HTML parser; css:'external' keeps Svelte from injecting a <style> into a
// document.head that doesn't meaningfully exist). Duplicated here rather than imported from that
// file: svelte.config.js is ESM (`export default`, loaded directly by Node-native tooling —
// svelte-check, the language server, Vite), while this file is `require()`d by Metro directly
// and must stay pure CommonJS with no build step of its own, exactly like
// metro-vue-transformer.cjs.
const COMPILER_OPTIONS = { fragments: 'tree', css: 'external', generate: 'client' };

// The web-only-construct guard (svelte-adapter-dom-shim skill §7/§22) RUNS HERE, on every
// `.svelte` Metro compiles — not just via svelte-check/the language server. `{@html}` compiles
// to `$.html()`, which assigns to an `innerHTML` the shim does not define, so the content
// silently never renders; editor tooling only covers a developer who has it wired up, and a
// consuming app whose own `svelte.config.js` never registers the preprocessor would still ship
// the broken bundle. A build-time gate is the only one nobody can be missing.
//
// Resolved by package self-reference rather than a relative path so the same line works from
// `src/*.ts` in this workspace and from `build/*.js` in a published install — `exports` and
// `publishConfig.exports` each map `./preprocessor` at their own target. Loaded lazily and once:
// `require()` cannot pull an ESM/TS module, but `transform` is already async.
let preprocessorPromise;
function webOnlyConstructGuard() {
  preprocessorPromise ??= import('@symbiote-native/svelte/preprocessor').then(mod =>
    mod.forbidWebOnlyConstructs(),
  );
  return preprocessorPromise;
}

// The `<style>` preprocessor, loaded the same lazy way and for the same reason. Unlike the guard
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
function compileSvelteFile(src, filename) {
  const { js } = compile(src, { ...COMPILER_OPTIONS, filename });
  return js.code;
}

// `.svelte.js`/`.svelte.ts` files (adapters/svelte/src/runes/*.svelte.ts and any package that
// ships its own runes) carry rune syntax ($state/$effect/...) OUTSIDE a component's markup, so
// they need svelte/compiler's separate MODULE api, not compile() — compile() expects a
// component and throws a parse error on a bare module. Uncompiled, a literal `$state(...)` call
// hits svelte/index-client.js's dev-guard export and throws `rune_outside_svelte` the instant it
// runs — this filename check was previously MISSING entirely, so every .svelte.ts rune file
// shipped uncompiled and would crash on first call on a real device.
//
// Unlike compile() (which strips <script lang="ts"> types itself via bundled acorn-typescript),
// compileModule() does NOT parse TypeScript at all — it throws js_parse_error on a bare
// return-type annotation regardless of the .ts filename passed. So TS has to be stripped BEFORE
// compileModule() ever sees the source. ts.transpileModule() (isolated-file "strip only" mode,
// module:ESNext/target:ESNext) does exactly this: drops type-only imports/annotations, keeps
// every used value import, and leaves $state/$effect call expressions untouched — it does not
// require full-program type information the way metro-vue-transformer.cjs's registerTS step does.
function stripTypeScript(src, filename) {
  const { outputText } = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  });
  return outputText;
}

function compileSvelteModuleFile(src, filename) {
  const { js } = compileModule(stripTypeScript(src, filename), { generate: 'client', filename });
  return js.code;
}

// Exported separately so tests can assert on the compiled output directly without driving the
// full upstream RN Babel preset.
module.exports.compileSvelteFile = compileSvelteFile;
module.exports.compileSvelteModuleFile = compileSvelteModuleFile;

module.exports.transform = async function transform(params) {
  if (params.filename.endsWith('.svelte')) {
    // Throws with a message naming the RN alternative. Deliberately BEFORE compile(), so the
    // author sees the real diagnosis rather than a downstream symptom.
    (await webOnlyConstructGuard()).markup({ content: params.src, filename: params.filename });
    const preprocessed = await (
      await scopedStylesPreprocessor()
    ).markup({ content: params.src, filename: params.filename });
    const code = compileSvelteFile(preprocessed.code, params.filename);
    // Re-label as .tsx so RN's transformer processes the module exactly like app source; Metro
    // tracks the real path separately. Matches metro-vue-transformer.cjs's identical trick.
    return upstreamTransformer.transform({
      ...params,
      src: code,
      filename: params.filename + '.tsx',
    });
  }
  if (params.filename.endsWith('.svelte.ts') || params.filename.endsWith('.svelte.js')) {
    const code = compileSvelteModuleFile(params.src, params.filename);
    return upstreamTransformer.transform({
      ...params,
      src: code,
      filename: params.filename + '.tsx',
    });
  }
  // A standalone style file (as opposed to a component's own <style> block, handled by the
  // preprocessor above) — the framework-agnostic path (core/css-parser's compileCssFile), usable
  // from this adapter's examples exactly like from any other adapter's. isStyleFile recognizes
  // .css/.scss/.sass/.less/.styl (+ .module.*).
  if (isStyleFile(params.filename)) {
    const { code } = await compileCssFile(params.src, params.filename);
    return upstreamTransformer.transform({
      ...params,
      src: code,
      filename: params.filename + '.js',
    });
  }
  return upstreamTransformer.transform(params);
};

// Surface the upstream cache key so RN preset changes still bust Metro's cache. The compile step
// itself is invalidated by `--reset-cache`.
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
