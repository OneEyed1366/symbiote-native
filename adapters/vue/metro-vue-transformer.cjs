// Metro babel transformer that teaches the bundler to read Vue SFCs (.vue). Metro has no Vue
// plugin (unplugin-vue only ships vite/webpack/esbuild/rollup adapters), so we do the
// single-pass compile here: parse the SFC, compile <script setup> + <template> into one
// component module, then hand the JS to RN's own babel transformer - the Metro twin of
// @vitejs/plugin-vue. Imports get retargeted from 'vue' to @symbiote-native/vue/runtime-helpers
// (not bare @vue/runtime-core) because that shim also supplies our own `vShow` - compiled
// v-show imports it by name, and only @vue/runtime-dom's DOM-based version exists otherwise.
//
// Ships as a package-level export (`@symbiote-native/vue/metro-vue-transformer`) rather than
// living in each consuming app: a consumer's own metro.config.js just points
// babelTransformerPath at it.

const nodeFs = require('fs');
const { parse, compileScript, registerTS } = require('@vue/compiler-sfc');
const { createCompoundExpression } = require('@vue/compiler-core');

// A bare-specifier type import (`import type { X } from '@symbiote-native/navigation/vue'`) needs
// real node_modules resolution to turn the specifier into a file path - compileScript's own `fs`
// option only reads paths it's already given, it can't resolve. registerTS (the same hook
// @vitejs/plugin-vue and vue-tsc use) hands the compiler a lazy `typescript` loader that resolves
// via `ts.resolveModuleName` and self-supplies `ts.sys` as the fs fallback.
registerTS(() => require('typescript'));
// Required directly (not via the ./metro-css-parser public subpath, which exists for CONSUMERS)
// so it resolves from this package's own node_modules under pnpm.
const {
  compile: compilePreprocessor,
  compileCssFile,
  compileCssModule,
  compileCssToRules,
  compileScopedCss,
  hashFilePath,
  isStyleFile,
  resolveUpstreamTransformer,
} = require('@symbiote-native/css-parser');

const upstreamTransformer = resolveUpstreamTransformer();

// compileScript needs file system access to resolve a type-only `defineProps<ISomeProps>()`
// imported from another file - without it, Metro's worker process (a real Node process, but one
// @vue/compiler-sfc doesn't auto-detect without registerTS) throws "No fs option provided ...
// in non-Node environment". Wiring Node's own `fs` straight through is simpler than a second
// registerTS-style loader.
const compileScriptFs = {
  fileExists: file => nodeFs.existsSync(file),
  readFile: file => {
    try {
      return nodeFs.readFileSync(file, 'utf-8');
    } catch {
      return undefined;
    }
  },
};

// Rewrites a Vue template AST so every `class`/`:class` binding names a class by the name
// lightningcss RENAMED it to. AST-level, not a raw-text regex: Vue merges a static class= and a
// dynamic :class= on the same element into ONE codegen entry, and text substitution can't
// reproduce that merge safely - letting Vue's own transformElement do the merge on our rewritten
// nodes reuses that logic.
//
// `renames` is compileScopedCss's own name map (authored name -> renamed name), NOT a set of
// names this file re-suffixes. That is the point of the migration: the rewriter and the style
// compiler used to derive the scoped name independently, so any disagreement between them was
// silent. Now there is one source and this half only reads it. One entry per class, keyed as
// AUTHORED — `class="section-label"` is the lookup, `sectionLabel` is not a second spelling of it.
//
// A static class="foo bar" (AttributeNode, prop.type === 6) resolves to its final string here
// at compile time - no runtime call needed. A token the map does not carry belongs to another
// file (App.css, a `:global()` escape hatch, a parent's class) and passes through untouched.
//
// A dynamic :class="expr" (bind DirectiveNode, prop.type === 7) targeting `class`: by the time
// our transform runs, Vue's own transformExpression has already turned prop.exp into either a
// COMPOUND_EXPRESSION (type 8) or, for a bare identifier binding, a SIMPLE_EXPRESSION (type 4).
// createCompoundExpression wraps the original exp node as-is inside
// renameClassTokens(<original>, __scopedClassNames), so codegen reproduces the original
// expression unchanged - no per-shape branching needed, and a fully opaque runtime value
// (`:class="dynamicClass"`) still resolves against the same map at runtime.
function createScopeClassNodeTransform(renames) {
  return function scopeClassNodeTransform(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return;

    for (const prop of node.props) {
      if (
        prop.type === 6 /* NodeTypes.ATTRIBUTE */ &&
        prop.name === 'class' &&
        prop.value
      ) {
        prop.value.content = prop.value.content
          .split(/\s+/)
          .filter(Boolean)
          .map(token => renames.get(token) ?? token)
          .join(' ');
        continue;
      }

      if (
        prop.type === 7 /* NodeTypes.DIRECTIVE */ &&
        prop.name === 'bind' &&
        prop.arg &&
        prop.arg.type === 4 /* NodeTypes.SIMPLE_EXPRESSION */ &&
        prop.arg.content === 'class' &&
        prop.exp
      ) {
        prop.exp = createCompoundExpression(
          ['__scopeClass(', prop.exp, ', __scopedClassNames)'],
          prop.exp.loc,
        );
      }
    }
  };
}

// A short, stable id per file, used as the SFC scope id regardless of whether the file has
// scoped styles - built on css-parser's shared hashFilePath so the algorithm isn't duplicated
// against the standalone .module.css compiler's identical need.
function scopeIdFor(filename) {
  return 'data-v-' + hashFilePath(filename);
}

// The local the compiled component lands in when a <style module> block needs __cssModules hung
// off it (compileScript's genDefaultAs). Same role as @vitejs/plugin-vue's own `_sfc_main`.
const SFC_COMPONENT_VAR = '__sfc__';

// Blocks CONCATENATE - each is compiled on its own, so every block's rules restart at order 0 and
// a later block would tie with an earlier one on the cascade's source-order tie-break, silently
// reordering equally-specific rules. Renumbering on append gives the file one monotonic sequence,
// which is what a single stylesheet holding the concatenated blocks would have produced.
function appendRules(target, rules) {
  for (const rule of rules) {
    target.push({ ...rule, order: target.length });
  }
}

// `combinators` is compile-time-only - the registry matches a rule by token SUBSET and never reads
// it - so it is stripped rather than shipped in every app bundle. Twin of css-parser's own
// serializeRules (core/css-parser/src/metro-css-module/index.ts), which does this for a standalone
// style file.
function serializeRules(rules) {
  return JSON.stringify(
    rules.map(({ tokens, specificity, order, style }) => ({
      tokens,
      specificity,
      order,
      style,
    })),
  );
}

// An SFC style block's `lang` attribute names a preprocessor language directly (`lang="scss"`),
// unlike a standalone file, which is identified by its extension — so this is its own small
// lookup rather than reusing detectLanguage(), which is extension-keyed.
const SFC_STYLE_LANG_TO_PREPROCESSOR = new Map([
  ['scss', 'scss'],
  ['sass', 'scss'],
  ['less', 'less'],
  ['stylus', 'stylus'],
]);

// Reduces one <style> block down to plain CSS text. A lang-less or lang="css" block passes
// through unchanged. Anything outside the four recognized preprocessor langs throws.
async function compileStyleBlockContent(style, filename) {
  if (style.lang == null || style.lang === 'css') return style.content;

  const preprocessorLang = SFC_STYLE_LANG_TO_PREPROCESSOR.get(style.lang);
  if (!preprocessorLang) {
    throw new Error(
      `SFC style lang="${style.lang}" not supported yet — plain CSS only`,
    );
  }

  // Sass' `.sass` indented syntax and `.scss` syntax share one compiler entry point that picks
  // between them off the file extension (see preprocessors.ts's compileScss) — an inline SFC
  // style block has no file of its own, so a synthetic `.sass`-suffixed path is the only way to
  // select the indented syntax. Every other preprocessor only uses the path for relative-import
  // resolution (dirname), where the real .vue file's own path is correct as-is.
  const syntheticPath = style.lang === 'sass' ? `${filename}.sass` : filename;
  return compilePreprocessor(style.content, preprocessorLang, syntheticPath);
}

async function compileSfc(src, filename) {
  const { descriptor, errors } = parse(src, { filename });
  if (errors && errors.length > 0) {
    throw new Error(
      `Vue SFC parse error in ${filename}:\n${errors.map(String).join('\n')}`,
    );
  }
  if (descriptor.scriptSetup == null && descriptor.script == null) {
    throw new Error(
      `Vue SFC ${filename} has no <script> / <script setup> block`,
    );
  }

  const scopeId = scopeIdFor(filename);

  // descriptor.styles is already parsed by @vue/compiler-sfc (one entry per <style> block,
  // content pre-trimmed, scoped as a plain boolean) - no need to re-extract with a regex.
  //
  // Both scoped forms are ONE mechanism, lightningcss's CSS-Modules renaming, differing only in
  // the pattern string (core/css-parser/src/scoped-classes.ts):
  //
  //   <style scoped>   [local]__data-v-<hash>    compileScopedCss - `.card` -> `card__data-v-h`
  //   <style module>   [local]__module__<hash>   compileCssModule - the same call a standalone
  //                                              .module.css takes, so the two cannot diverge
  //   <style>          not renamed at all        compileCssToRules, classes register globally
  //
  // Renaming is our equivalent of Vue's `data-v-hash` ATTRIBUTE (we have no DOM and no
  // attribute-selector matching, so a scope can only be expressed in the name), and `:global(...)`
  // needs no handling here at all: a name lightningcss did not rename is global by definition.
  //
  // Multiple blocks cascade last-block-wins, same as CSS, after each block is scoped
  // independently — carried by the rules' `order`, which appendRules renumbers across blocks.
  //
  // A module block's classes are NEVER auto-applied to a literal class="..." (opt-in via $style.x
  // only), so they stay out of the template rewriter's name map; its output is the name->scopedName
  // map instead, emitted as a preamble const AND attached to the component as __cssModules.
  const rules = [];
  const scopedClassNames = new Map();
  const cssModuleBindings = new Map();

  for (const style of descriptor.styles) {
    // Reduces a preprocessor block to plain CSS BEFORE the renaming below runs - the renaming is
    // language-agnostic, it only ever sees plain CSS.
    const content = await compileStyleBlockContent(style, filename);

    if (style.module) {
      const bindingName =
        typeof style.module === 'string' ? style.module : '$style';
      const compiled = compileCssModule(content, filename);
      appendRules(rules, compiled.rules);
      cssModuleBindings.set(bindingName, {
        ...cssModuleBindings.get(bindingName),
        ...compiled.classMap,
      });
    } else if (style.scoped) {
      const compiled = compileScopedCss(content, {
        filename,
        pattern: `[local]__${scopeId}`,
      });
      appendRules(rules, compiled.rules);
      for (const [name, renamed] of compiled.names)
        scopedClassNames.set(name, renamed);
    } else {
      appendRules(rules, compileCssToRules(content, { filename }).rules);
    }
  }

  // Skipped entirely (not even passed to the compiler) when nothing in this file is scoped, so
  // a .vue with only unscoped/no styles compiles with zero added runtime cost.
  const templateOptions =
    scopedClassNames.size > 0
      ? {
          compilerOptions: {
            nodeTransforms: [createScopeClassNodeTransform(scopedClassNames)],
          },
        }
      : undefined;

  // inlineTemplate folds the <template> render fn into setup(): one module, one `export
  // default`. Only valid with <script setup>, which the canary uses.
  //
  // genDefaultAs turns that `export default {...}` into `const __sfc__ = {...}`, so a <style
  // module> block can hang __cssModules off the component OPTIONS object before the module
  // exports it (the same thing @vitejs/plugin-vue does). Vue resolves a template's `$style` /
  // `classes` off `instance.type.__cssModules`, NOT off module scope, so without this the
  // emitted const is unreachable from the template and `$style.card` throws at render. Only
  // requested when a module block exists, so every other .vue file keeps identical output.
  const hasCssModules = cssModuleBindings.size > 0;
  const compiled = compileScript(descriptor, {
    id: scopeId,
    inlineTemplate: true,
    templateOptions,
    fs: compileScriptFs,
    ...(hasCssModules ? { genDefaultAs: SFC_COMPONENT_VAR } : {}),
  });
  // Retargets every Vue import (compiler-injected helpers AND the user's own `from 'vue'`) at
  // the runtime-helpers shim - no vue/runtime-dom in a native bundle.
  const code = compiled.content.replace(
    /from\s*(['"])vue\1/g,
    'from "@symbiote-native/vue/runtime-helpers"',
  );

  if (rules.length === 0 && !hasCssModules) return code;

  // Only a scoped file needs the runtime rename helper and its per-file map, so these stay
  // unimported for every non-scoped .vue file.
  const engineImports =
    scopedClassNames.size > 0
      ? 'registerRules, renameClassTokens as __scopeClass'
      : 'registerRules';

  const preamble = [
    `import { ${engineImports} } from '@symbiote-native/engine';`,
    `registerRules(${serializeRules(rules)});`,
  ];
  if (scopedClassNames.size > 0) {
    preamble.push(
      `const __scopedClassNames = ${JSON.stringify(Object.fromEntries(scopedClassNames))};`,
    );
  }
  // Each <style module> binding becomes a top-level const holding its name->scopedName map,
  // placed before the component so it's a closed-over module-scope variable usable from
  // <script setup> code itself; the __cssModules tail below is what makes the TEMPLATE see it.
  for (const [bindingName, classMap] of cssModuleBindings) {
    preamble.push(`const ${bindingName} = ${JSON.stringify(classMap)};`);
  }

  const parts = [...preamble, code];
  if (hasCssModules) {
    const bindings = [...cssModuleBindings.keys()]
      .map(name => `${JSON.stringify(name)}: ${name}`)
      .join(', ');
    parts.push(
      `${SFC_COMPONENT_VAR}.__cssModules = { ${bindings} };`,
      `export default ${SFC_COMPONENT_VAR};`,
    );
  }

  return parts.join('\n') + '\n';
}

// Exported separately from `transform` so tests can assert on the compiled SFC output
// (imports, injected `registerRules` call) without driving the full upstream RN Babel preset.
module.exports.compileSfc = compileSfc;

// Async uniformly, including branches that never touch a preprocessor: compileSfc() itself is
// async now (a scss/sass/less/stylus block awaits preprocessors.ts's compile()), and Metro's own
// metro-transform-worker already awaits transformer.transform(...), so this is a supported
// shape - not worth forking a sync fast-path to save one microtask on a build-time,
// content-hash-cached call.
module.exports.transform = async function transform(params) {
  if (params.filename.endsWith('.vue')) {
    const code = await compileSfc(params.src, params.filename);
    // Re-label as .tsx so RN's transformer strips TS from <script setup lang="ts">. Metro
    // tracks the real path separately.
    return upstreamTransformer.transform({
      ...params,
      src: code,
      filename: params.filename + '.tsx',
    });
  }
  // A standalone style file (not a .vue file's inline <style> block) via the framework-agnostic
  // compileCssFile path. isStyleFile recognizes .css/.scss/.sass/.less/.styl/.stylus (+ .module.* twins).
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

// Surface the upstream cache key so RN preset changes still bust Metro's cache. The SFC
// step itself is invalidated by `--reset-cache` (mirrors the babel DEBUG-inline note).
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
