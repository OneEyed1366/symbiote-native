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
  classTokensIn,
  compile: compilePreprocessor,
  compileCssFile,
  globalClassNamesIn,
  globalClassTokensIn,
  hashFilePath,
  isStyleFile,
  kebabToCamel,
  parseCSS,
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

// Rewrites a Vue template AST so every `class`/`:class` binding resolves against this file's
// scoped class names via @symbiote-native/engine's scopeClassName(value, localNames, scopeId).
// AST-level, not a raw-text regex: Vue merges a static class= and a dynamic :class= on the same
// element into ONE codegen entry, and text substitution can't reproduce that merge safely -
// letting Vue's own transformElement do the merge on our rewritten nodes reuses that logic.
//
// A static class="foo bar" (AttributeNode, prop.type === 6) resolves to its final string here
// at compile time - no runtime call needed. Each token is normalized kebab->camel FIRST since
// css-parser always registers the camel form and localNames is camelCase-keyed.
//
// A dynamic :class="expr" (bind DirectiveNode, prop.type === 7) targeting `class`: by the time
// our transform runs, Vue's own transformExpression has already turned prop.exp into either a
// COMPOUND_EXPRESSION (type 8) or, for a bare identifier binding, a SIMPLE_EXPRESSION (type 4).
// createCompoundExpression wraps the original exp node as-is inside
// scopeClassName(<original>, __localScopedClassNames, __scopeId), so codegen reproduces the
// original expression unchanged - no per-shape branching needed, and a fully opaque runtime
// value (`:class="dynamicClass"`) still defers correctly to scopeClassName's own token matching.
function createScopeClassNodeTransform(localNames, scopeId) {
  return function scopeClassNodeTransform(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return;

    for (const prop of node.props) {
      if (prop.type === 6 /* NodeTypes.ATTRIBUTE */ && prop.name === 'class' && prop.value) {
        prop.value.content = prop.value.content
          .split(/\s+/)
          .filter(Boolean)
          .map(token => {
            const camelToken = kebabToCamel(token);
            return localNames.has(camelToken) ? `${camelToken}__${scopeId}` : camelToken;
          })
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
          ['__scopeClass(', prop.exp, ', __localScopedClassNames, __scopeId)'],
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
    throw new Error(`SFC style lang="${style.lang}" not supported yet — plain CSS only`);
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
    throw new Error(`Vue SFC parse error in ${filename}:\n${errors.map(String).join('\n')}`);
  }
  if (descriptor.scriptSetup == null && descriptor.script == null) {
    throw new Error(`Vue SFC ${filename} has no <script> / <script setup> block`);
  }

  const scopeId = scopeIdFor(filename);

  // descriptor.styles is already parsed by @vue/compiler-sfc (one entry per <style> block,
  // content pre-trimmed, scoped as a plain boolean) - no need to re-extract with a regex.
  //
  // A scoped block's classes get their key SUFFIXED with this file's scopeId (`card` ->
  // `card__data-v-xxxxxxxx`) so two components can each define `.card` without colliding in the
  // shared global registry - our name-suffix equivalent of Vue's `data-v-hash` attribute (we
  // have no DOM/attribute-selector matching). `:global(...)` selectors are exempted from
  // suffixing; globalClassNamesIn re-walks the block's selectors to find which keys to exempt.
  //
  // Multiple blocks cascade last-block-wins, same as CSS, after each block is scoped independently.
  //
  // <style module> (CSS Modules) reuses this same suffixing machinery: `.card` still goes
  // through parseCSS and registerStyles unchanged, just under a suffixed key - the only new
  // output is a name->scopedName object ($style by default) emitted as a preamble const, so
  // `:class="$style.card"` passes the already-scoped string straight to resolveClassName's
  // exact-match path. Unlike `scoped`, module classes are NEVER auto-applied to a literal
  // class="..." (opt-in via $style.x only), so they're kept out of localScopedNames. The
  // registry key gets an extra `module` tag (`card__module__<scopeId>` vs scoped's
  // `card__<scopeId>`) so a file mixing both kinds can't collide.
  const styles = {};
  const localScopedNames = new Set();
  const cssModuleBindings = new Map();

  for (const style of descriptor.styles) {
    // Reduces a preprocessor block to plain CSS BEFORE the scoping logic below runs - that
    // logic is language-agnostic, it only ever sees parseCSS's plain-CSS output.
    const content = await compileStyleBlockContent(style, filename);
    const parsed = parseCSS(content, { filename });

    if (style.module) {
      const bindingName = typeof style.module === 'string' ? style.module : '$style';
      // Scanned against the COMPILED content, not style.content, so it can't drift under
      // preprocessor nesting/interpolation.
      const exemptFromScope = globalClassNamesIn(content);
      const classMap = cssModuleBindings.get(bindingName) ?? {};
      for (const [className, props] of Object.entries(parsed)) {
        const isExempt = exemptFromScope.has(className);
        const registeredName = isExempt ? className : `${className}__module__${scopeId}`;
        classMap[className] = registeredName;
        styles[registeredName] = { ...styles[registeredName], ...props };
      }
      cssModuleBindings.set(bindingName, classMap);
    } else if (style.scoped) {
      const exemptFromScope = globalClassNamesIn(content);
      // A compound/descendant selector registers under ONE collapsed key (`.card.big` ->
      // `cardBig`) that never appears in the template - the template writes
      // `class="card big"` - so the nodeTransform must recognize the individual TOKENS, not
      // just the collapsed key.
      const tokensByName = classTokensIn(content, { filename });
      // ...and a token out of a `:global(...)` payload is the one exception to that: in
      // `.card :global(.reset)` the KEY (`cardReset`) is this file's own, because `.card` is,
      // but `reset` was written precisely to name markup this file does not own. Suffixing it
      // along with the rest of its chain scope-mangles the escape hatch into matching nothing.
      const globalTokens = globalClassTokensIn(content, { filename });
      for (const [className, props] of Object.entries(parsed)) {
        const isExempt = exemptFromScope.has(className);
        const registeredName = isExempt ? className : `${className}__${scopeId}`;
        if (!isExempt) {
          localScopedNames.add(className);
          for (const token of tokensByName.get(className) ?? []) {
            if (!globalTokens.has(token)) localScopedNames.add(token);
          }
        }
        styles[registeredName] = { ...styles[registeredName], ...props };
      }
    } else {
      for (const [className, props] of Object.entries(parsed)) {
        styles[className] = { ...styles[className], ...props };
      }
    }
  }

  // Skipped entirely (not even passed to the compiler) when nothing in this file is scoped, so
  // a .vue with only unscoped/no styles compiles with zero added runtime cost.
  const templateOptions =
    localScopedNames.size > 0
      ? {
          compilerOptions: {
            nodeTransforms: [createScopeClassNodeTransform(localScopedNames, scopeId)],
          },
        }
      : undefined;

  // inlineTemplate folds the <template> render fn into setup(): one module, one `export
  // default`. Only valid with <script setup>, which the canary uses.
  const compiled = compileScript(descriptor, {
    id: scopeId,
    inlineTemplate: true,
    templateOptions,
    fs: compileScriptFs,
  });
  // Retargets every Vue import (compiler-injected helpers AND the user's own `from 'vue'`) at
  // the runtime-helpers shim - no vue/runtime-dom in a native bundle.
  const code = compiled.content.replace(
    /from\s*(['"])vue\1/g,
    'from "@symbiote-native/vue/runtime-helpers"',
  );

  if (Object.keys(styles).length === 0) return code;

  // Only a scoped file needs scopeClassName + its two per-file constants, so these stay
  // unimported for every non-scoped .vue file.
  const engineImports =
    localScopedNames.size > 0 ? 'registerStyles, scopeClassName as __scopeClass' : 'registerStyles';

  const preamble = [`registerStyles(${JSON.stringify(styles)});`];
  if (localScopedNames.size > 0) {
    preamble.push(
      `const __localScopedClassNames = new Set(${JSON.stringify([...localScopedNames])});`,
      `const __scopeId = ${JSON.stringify(scopeId)};`,
    );
  }
  // Each <style module> binding becomes a top-level const holding its name->scopedName map,
  // placed before the compiled `export default {...}` so it's a closed-over module-scope
  // variable usable both from the inlined template and from <script setup> code itself.
  for (const [bindingName, classMap] of cssModuleBindings) {
    preamble.push(`const ${bindingName} = ${JSON.stringify(classMap)};`);
  }

  return (
    [`import { ${engineImports} } from '@symbiote-native/engine';`, ...preamble, code].join('\n') +
    '\n'
  );
}

// Exported separately from `transform` so tests can assert on the compiled SFC output
// (imports, injected `registerStyles` call) without driving the full upstream RN Babel preset.
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
