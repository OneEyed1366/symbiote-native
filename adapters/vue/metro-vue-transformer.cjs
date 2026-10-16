// Metro babel transformer that reads Vue SFCs (.vue), the Metro twin of @vitejs/plugin-vue
// Metro has no Vue plugin, so the single-pass compile happens here before RN's own transformer

// Imports of 'vue' go to `@symbiote-native/vue/runtime-helpers`, not `@vue/runtime-core`
// That shim supplies our own `vShow`, which compiled v-show imports by name

// Ships as the package export `@symbiote-native/vue/metro-vue-transformer`
// A consumer's metro.config.js points `babelTransformerPath` at it

const nodeFs = require('fs');
const {
  parse,
  parseCache,
  compileScript,
  registerTS,
  babelParse,
} = require('@vue/compiler-sfc');
const {
  createCompoundExpression,
  createSimpleExpression,
} = require('@vue/compiler-core');

// A bare-specifier type import needs node_modules resolution that the `fs` option cannot do
// `registerTS` gives the compiler a lazy `typescript` loader that resolves it, like plugin-vue
registerTS(() => require('typescript'));
// Required directly, not via the ./metro-css-parser subpath that exists for CONSUMERS
// so it resolves from this package's own node_modules under pnpm
const {
  compile: compilePreprocessor,
  compileCssModule,
  compileCssToRules,
  compileScopedCss,
  createCssMetroTransformer,
  hashFilePath,
  relabelForUpstream,
  resolveUpstreamTransformer,
} = require('@symbiote-native/css-parser');

const upstreamTransformer = resolveUpstreamTransformer();

// `compileScript` reads other files to resolve a type-only `defineProps<ISomeProps>()`
// Metro's worker is not detected as Node, so without this it throws "No fs option provided"
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

// Shared with ./babel-jsx.cjs: Vue's two compilers must give one answer to element-vs-component
const INTRINSIC_TAGS = require('./intrinsic-tags.cjs');

const isIntrinsicTag = tag => INTRINSIC_TAGS.has(tag);

const CLASS_PROP = 'class';
const IMPORT_DECLARATION = 'ImportDeclaration';
const PLAIN_CSS_LANG = 'css';

// Rewrites every `class` and `:class` binding to the name lightningcss renamed it to
// It works on the AST because Vue merges a static and a dynamic class into one codegen entry

// `renames` is the `compileScopedCss` map of authored name to renamed name
// A token it lacks belongs to another file (App.css, `:global()`, a parent) and passes through

// A dynamic `:class` is wrapped as `__scopeClass(<original>, __scopedClassNames)` by Vue's codegen
// So any expression shape, even an opaque runtime value, resolves against the same map
function createScopeClassNodeTransform(renames) {
  return function scopeClassNodeTransform(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return;

    for (const prop of node.props) {
      if (
        prop.type === 6 /* NodeTypes.ATTRIBUTE */ &&
        prop.name === CLASS_PROP &&
        prop.value
      ) {
        prop.value.content = prop.value.content
          .split(/\s+/)
          .filter(Boolean)
          .map(token => renames.get(token) ?? token)
          .join(' ');
        continue;
      }

      if (isClassBinding(prop)) {
        prop.exp = createCompoundExpression(
          ['__scopeClass(', prop.exp, ', __scopedClassNames)'],
          prop.exp.loc,
        );
      }
    }
  };
}

// By now Vue's `transformExpression` made `prop.exp` a compound or a simple expression
function isClassBinding(prop) {
  return (
    prop.type === 7 /* NodeTypes.DIRECTIVE */ &&
    prop.name === 'bind' &&
    prop.arg &&
    prop.arg.type === 4 /* NodeTypes.SIMPLE_EXPRESSION */ &&
    prop.arg.content === CLASS_PROP &&
    Boolean(prop.exp)
  );
}

// The parser's `condense()` collapses multi-line whitespace to one space but never trims it
// `<text>\n  plain\n</text>` compiles to " plain ", a real space on the rendered RN Text

// Babel's JSX whitespace cleaner trims it for every other adapter, so we do it once per template
// Only a text node whose source crosses a line break is touched, as Babel does
function trimReflowedTextNodeTransform(node) {
  if (node.type !== 1 /* NodeTypes.ELEMENT */ || node.children.length === 0)
    return;
  const first = node.children[0];
  if (
    first.type === 2 /* NodeTypes.TEXT */ &&
    first.loc.source.includes('\n') &&
    first.content.startsWith(' ')
  ) {
    first.content = first.content.slice(1);
  }
  const last = node.children[node.children.length - 1];
  if (
    last.type === 2 /* NodeTypes.TEXT */ &&
    last.loc.source.includes('\n') &&
    last.content.endsWith(' ')
  ) {
    last.content = last.content.slice(0, -1);
  }
}

const SYMBIOTE_SOURCE_PREFIX = '@symbiote-native/';

// Local names the file imports from any `@symbiote-native/*` package (`FlatList`, `Animated`)
function symbioteImportsOf(descriptor) {
  const locals = new Set();
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (block == null) continue;
    const plugins = block.lang === 'ts' || block.lang === 'tsx' ? ['typescript'] : [];
    const program = babelParse(block.content, { sourceType: 'module', plugins }).program;
    for (const statement of program.body) {
      if (
        statement.type !== IMPORT_DECLARATION ||
        !statement.source.value.startsWith(SYMBIOTE_SOURCE_PREFIX)
      )
        continue;
      for (const specifier of statement.specifiers) locals.add(specifier.local.name);
    }
  }
  return locals;
}

// Vue casts a bare attribute to `true` only for a declared Boolean prop, and our tags declare none
// So `nested-scroll-enabled` reached Android as "" and threw `String cannot be cast to Boolean`
function createBareBooleanNodeTransform(symbioteLocals) {
  const isOurs = tag =>
    INTRINSIC_TAGS.has(tag) || symbioteLocals.has(tag.split('.')[0]);
  return function bareBooleanNodeTransform(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */ || !isOurs(node.tag)) return;
    node.props = node.props.map(prop =>
      prop.type === 6 /* NodeTypes.ATTRIBUTE */ && prop.value === undefined
        ? {
            type: 7 /* NodeTypes.DIRECTIVE */,
            name: 'bind',
            rawName: `:${prop.name}`,
            arg: createSimpleExpression(prop.name, true, prop.loc),
            exp: createSimpleExpression('true', false, prop.loc, 3 /* CAN_STRINGIFY */),
            modifiers: [],
            loc: prop.loc,
          }
        : prop,
    );
  };
}

// A short, stable id per file, used as the SFC scope id whether or not it has scoped styles
// Built on css-parser's `hashFilePath`, shared with the standalone .module.css compiler
function scopeIdFor(filename) {
  return 'data-v-' + hashFilePath(filename);
}

// The local the compiled component lands in when a <style module> block hangs `__cssModules` on it
// It is `genDefaultAs` of `compileScript`, the same role as plugin-vue's `_sfc_main`
const SFC_COMPONENT_VAR = '__sfc__';

// Each block restarts its rules at order 0, so a later one would tie an earlier one
// Renumbering on append gives the file one monotonic sequence, as one stylesheet would
function appendRules(target, rules) {
  for (const rule of rules) {
    target.push({ ...rule, order: target.length });
  }
}

// `combinators` is compile-time-only, as the registry matches by token subset, so it is not shipped
// Twin of css-parser's `serializeRules` (metro-css-module/index.ts) for a standalone style file
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

// A style block's `lang` names a preprocessor (`lang="scss"`), where a file has an extension
// So this is its own small lookup, not `detectLanguage()`, which is extension-keyed
const SFC_STYLE_LANG_TO_PREPROCESSOR = new Map([
  ['scss', 'scss'],
  ['sass', 'scss'],
  ['less', 'less'],
  ['stylus', 'stylus'],
]);

// Reduces one <style> block to plain CSS: lang-less and `lang="css"` pass through, others compile
async function compileStyleBlockContent(style, filename) {
  if (style.lang == null || style.lang === PLAIN_CSS_LANG) return style.content;

  const preprocessorLang = SFC_STYLE_LANG_TO_PREPROCESSOR.get(style.lang);
  if (!preprocessorLang) {
    throw new Error(
      `SFC style lang="${style.lang}" not supported yet — plain CSS only`,
    );
  }

  // `.sass` and `.scss` share one compiler entry that picks the syntax by file extension
  // An inline block has no file, so a synthetic `.sass` path selects the indented syntax
  const syntheticPath = style.lang === 'sass' ? `${filename}.sass` : filename;
  return compilePreprocessor(style.content, preprocessorLang, syntheticPath);
}

// `parse` memoizes its descriptor and the scope-class transform mutates its AST in place
// A second compile of one source would walk a half-transformed tree and die in codegen
// `clear()` rather than deleting our key, as the key format is internal to `@vue/shared`
function parseDescriptor(src, filename) {
  parseCache.clear();
  // The parser decides element vs component, and `compileScript` reuses that parsed AST
  // Without `isCustomElement` here, `<pressable>` stays a component: `resolveComponent(...)`
  const { descriptor, errors } = parse(src, {
    filename,
    templateParseOptions: { isCustomElement: isIntrinsicTag },
  });
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
  return descriptor;
}

// `<style scoped>` and `<style module>` are one mechanism, lightningcss' CSS-Modules renaming
// Only the pattern differs, and a plain `<style>` is not renamed, so its classes register globally

// Renaming stands in for Vue's `data-v-hash` attribute, as there is no DOM to match one against
// `:global(...)` needs no handling here, since a name lightningcss did not rename is global
function compileSfcStyleBlock({ style, content, filename, scopeId }) {
  if (style.module) {
    const compiled = compileCssModule(content, filename);
    const bindingName = typeof style.module === 'string' ? style.module : '$style';
    return { rules: compiled.rules, binding: [bindingName, compiled.classMap] };
  }
  if (style.scoped) {
    const compiled = compileScopedCss(content, {
      filename,
      pattern: `[local]__${scopeId}`,
    });
    return { rules: compiled.rules, names: compiled.names };
  }
  return { rules: compileCssToRules(content, { filename }).rules };
}

// Blocks cascade last-wins like CSS, carried by the rules' `order` that `appendRules` renumbers
// A module block's classes never apply to a literal `class`, only through `$style.x`
async function compileStyles(descriptor, filename, scopeId) {
  // A preprocessor block is reduced to plain CSS first, as the renaming only ever sees plain CSS
  const contents = await Promise.all(
    descriptor.styles.map(style => compileStyleBlockContent(style, filename)),
  );
  const rules = [];
  const scopedClassNames = new Map();
  const cssModuleBindings = new Map();
  descriptor.styles.forEach((style, index) => {
    const block = compileSfcStyleBlock({
      style,
      content: contents[index],
      filename,
      scopeId,
    });
    appendRules(rules, block.rules);
    for (const [name, renamed] of block.names ?? [])
      scopedClassNames.set(name, renamed);
    if (block.binding) {
      const [bindingName, classMap] = block.binding;
      cssModuleBindings.set(bindingName, {
        ...cssModuleBindings.get(bindingName),
        ...classMap,
      });
    }
  });
  return { rules, scopedClassNames, cssModuleBindings };
}

// Scoped-class rewriting is skipped when nothing in the file is scoped, so it adds no runtime cost
function templateOptionsFor(descriptor, scopedClassNames) {
  const nodeTransforms = [
    trimReflowedTextNodeTransform,
    createBareBooleanNodeTransform(symbioteImportsOf(descriptor)),
  ];
  if (scopedClassNames.size > 0)
    nodeTransforms.push(createScopeClassNodeTransform(scopedClassNames));
  // Every intrinsic, not just the imported ones: a narrower list leaves `<pressable>` a blank
  // `resolveComponent(...)` and makes `<switch v-model>` a compile error
  return { compilerOptions: { nodeTransforms, isCustomElement: isIntrinsicTag } };
}

// `inlineTemplate` folds the render fn into `setup()`, giving one module and one export default
// `genDefaultAs` makes it a const so `__cssModules` can hang off it, as Vue reads `$style` there
function compileComponentScript(descriptor, scopeId, styles) {
  const hasCssModules = styles.cssModuleBindings.size > 0;
  const compiled = compileScript(descriptor, {
    id: scopeId,
    inlineTemplate: true,
    templateOptions: templateOptionsFor(descriptor, styles.scopedClassNames),
    fs: compileScriptFs,
    ...(hasCssModules ? { genDefaultAs: SFC_COMPONENT_VAR } : {}),
  });
  // Every Vue import, injected helpers and the user's own, goes to the shim: no runtime-dom
  return compiled.content.replace(
    /from\s*(['"])vue\1/g,
    'from "@symbiote-native/vue/runtime-helpers"',
  );
}

function withStyleRegistration(code, { rules, scopedClassNames, cssModuleBindings }) {
  const hasCssModules = cssModuleBindings.size > 0;
  if (rules.length === 0 && !hasCssModules) return code;

  // Only a scoped file needs the runtime rename helper and its per-file map
  const isScoped = scopedClassNames.size > 0;
  const engineImports = isScoped
    ? 'registerRules, renameClassTokens as __scopeClass'
    : 'registerRules';

  const preamble = [
    `import { ${engineImports} } from '@symbiote-native/engine';`,
    `registerRules(${serializeRules(rules)});`,
  ];
  if (isScoped) {
    preamble.push(
      `const __scopedClassNames = ${JSON.stringify(Object.fromEntries(scopedClassNames))};`,
    );
  }
  // Each <style module> binding is a top-level const placed before the component, so <script setup>
  // can close over it; the `__cssModules` tail below is what makes the TEMPLATE see it
  for (const [bindingName, classMap] of cssModuleBindings) {
    preamble.push(`const ${bindingName} = ${JSON.stringify(classMap)};`);
  }

  const parts = [preamble.join('\n'), code];
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

async function compileSfc(src, filename) {
  const descriptor = parseDescriptor(src, filename);
  const scopeId = scopeIdFor(filename);
  const styles = await compileStyles(descriptor, filename, scopeId);
  const code = compileComponentScript(descriptor, scopeId, styles);
  return withStyleRegistration(code, styles);
}

// Exported separately from `transform` so tests can assert on the compiled SFC output
// (imports, injected `registerRules` call) without driving RN's whole Babel preset
module.exports.compileSfc = compileSfc;

// A standalone style file, not the inline `<style>` of a .vue, is compiled by this shared wrapper
const styleFileTransformer = createCssMetroTransformer(upstreamTransformer);

// Async throughout, as `compileSfc` awaits the style preprocessors and Metro awaits `transform`
module.exports.transform = async function transform(params) {
  if (params.filename.endsWith('.vue')) {
    const code = await compileSfc(params.src, params.filename);
    // Re-label as .tsx so RN's transformer strips TS from `<script setup lang="ts">`
    // Metro tracks the real path separately
    return upstreamTransformer.transform(relabelForUpstream(params, code, '.tsx'));
  }
  return styleFileTransformer.transform(params);
};

// Surface the upstream cache key so RN preset changes still bust Metro's cache
// The SFC step itself is invalidated by `--reset-cache`
module.exports.getCacheKey = upstreamTransformer.getCacheKey;
