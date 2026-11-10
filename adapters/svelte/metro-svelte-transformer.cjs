// Metro babel transformer that reads Svelte components (.svelte), twin of metro-vue-transformer.cjs
// Metro has no Svelte plugin, so `compile()` runs here, then RN's own transformer takes the JS

// Unlike Vue's, it rewrites no framework import: stock Svelte client output runs unchanged
// against the `globalThis` DOM shim, so no runtime-helpers retarget is needed

// `compile()` with `{fragments:'tree', css:'external', generate:'client'}` emits `$.from_tree(...)`
// and `$.set_custom_element_data`, the shape the dom-shim's `init_operations` patches target

// Ships as the package export `@symbiote-native/svelte/metro-svelte-transformer`
// A consumer's metro.config.js points `babelTransformerPath` at it

const { compile, compileModule } = require('svelte/compiler');
const ts = require('typescript');
const {
  createCssMetroTransformer,
  relabelForUpstream,
  resolveUpstreamTransformer,
} = require('@symbiote-native/css-parser');

const upstreamTransformer = resolveUpstreamTransformer();

const SVELTE_EXTENSION = '.svelte';
const RELABEL_EXTENSION = '.tsx';

// The same `compilerOptions` as `svelte.config.js`, which is ESM while this file stays CommonJS
// `fragments: 'tree'` is mandatory: it emits `from_tree()`, so the shim needs no HTML parser

// `css: 'external'` keeps Svelte from injecting a <style> into a `document.head` that is a shim
const COMPILER_OPTIONS = {
  fragments: 'tree',
  css: 'external',
  generate: 'client',
};

// The web-only-construct guard runs here on every `.svelte` Metro compiles, not only in the editor
// `{@html}` compiles to `$.html()`, which assigns an `innerHTML` the shim lacks, so nothing renders

// Resolved by package self-reference so it works from `src/*.ts` here and `build/*.js` installed
// Loaded lazily once, as `require()` cannot pull an ESM/TS module but `transform` is async
let preprocessorPromise;
function webOnlyConstructGuard() {
  preprocessorPromise ??= import('@symbiote-native/svelte/preprocessor').then(
    mod => mod.forbidWebOnlyConstructs(),
  );
  return preprocessorPromise;
}

// The `<style>` preprocessor loads the same lazy way, but it REWRITES the source it is given
// Its returned `code` is what `compile()` must get (see `scoped-styles.ts` on why not `result.css`)
let scopedStylesPromise;
function scopedStylesPreprocessor() {
  scopedStylesPromise ??= import('@symbiote-native/svelte/scoped-styles').then(
    mod => mod.scopedStyles(),
  );
  return scopedStylesPromise;
}

// Collapses whitespace in Text content as a browser or Vue would, loaded the same lazy way
// Without it a sentence wrapped across source lines renders a forced line break on device
let collapseTextWhitespacePromise;
function collapseTextWhitespacePreprocessor() {
  collapseTextWhitespacePromise ??=
    import('@symbiote-native/svelte/collapse-text-whitespace').then(mod =>
      mod.collapseTextWhitespace(),
    );
  return collapseTextWhitespacePromise;
}

// Svelte 5's compiler strips `<script lang="ts">` types structurally, with no type resolution
// So unlike the Vue transformer it needs no TypeScript or filesystem wiring
function compileSvelteFile(src, filename) {
  const { js } = compile(src, { ...COMPILER_OPTIONS, filename });
  return js.code;
}

// `.svelte.js` and `.svelte.ts` files carry runes outside markup, so they need `compileModule()`
// Uncompiled, a literal `$state(...)` throws `rune_outside_svelte` on the first call on device

// `compileModule()` does not parse TypeScript and throws `js_parse_error` on a return type
// So `ts.transpileModule()` strips types first, keeps value imports and leaves rune calls alone
function stripTypeScript(src, filename) {
  const { outputText } = ts.transpileModule(src, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  });
  return outputText;
}

function compileSvelteModuleFile(src, filename) {
  const { js } = compileModule(stripTypeScript(src, filename), {
    generate: 'client',
    filename,
  });
  return js.code;
}

function isRuneModule(filename) {
  return filename.endsWith('.svelte.ts') || filename.endsWith('.svelte.js');
}

async function compileComponent({ src, filename }) {
  // Throws naming the RN alternative, before `compile()`, so the author sees the real diagnosis
  (await webOnlyConstructGuard()).markup({ content: src, filename });
  const stylePreprocessed = await (
    await scopedStylesPreprocessor()
  ).markup({ content: src, filename });
  const preprocessed = await (
    await collapseTextWhitespacePreprocessor()
  ).markup({ content: stylePreprocessed.code, filename });
  return compileSvelteFile(preprocessed.code, filename);
}

// Exported separately so tests can assert on the compiled output without driving RN's Babel preset
module.exports.compileSvelteFile = compileSvelteFile;
module.exports.compileSvelteModuleFile = compileSvelteModuleFile;

// A standalone style file, not a component's `<style>` block, is compiled by this shared wrapper
const styleFileTransformer = createCssMetroTransformer(upstreamTransformer);

// Re-label as .tsx so RN's transformer processes the module like app source
// Metro tracks the real path separately
module.exports.transform = async function transform(params) {
  if (params.filename.endsWith(SVELTE_EXTENSION)) {
    const code = await compileComponent(params);
    return upstreamTransformer.transform(
      relabelForUpstream(params, code, RELABEL_EXTENSION),
    );
  }
  if (isRuneModule(params.filename)) {
    const code = compileSvelteModuleFile(params.src, params.filename);
    return upstreamTransformer.transform(
      relabelForUpstream(params, code, RELABEL_EXTENSION),
    );
  }
  return styleFileTransformer.transform(params);
};

// Surface the upstream cache key so RN preset changes still bust Metro's cache
// The compile step itself is invalidated by `--reset-cache`
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
