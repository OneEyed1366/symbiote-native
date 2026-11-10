// Metro babel transformer for Vue SFCs (.vue), the Metro twin of @vitejs/plugin-vue
// It compiles <script setup> and <template> into one module, then hands the JS to RN's babel
// Imports go to @symbiote-native/vue/runtime-helpers, which also supplies our own `vShow`

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
  conditionsArgument,
  hashFilePath,
  isStyleFile,
  propertiesCall,
  resolveUpstreamTransformer,
  serializeRules,
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

// Rewrites each `class`/`:class` binding in the template AST to the renamed class
// Done on the AST because Vue merges a static `class` and a `:class` into one codegen entry
// `renames` is the `compileScopedCss` name map, one source shared with the style compiler
function createScopeClassNodeTransform(renames) {
  return function scopeClassNodeTransform(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return;

    for (const prop of node.props) {
      if (
        prop.type === 6 /* NodeTypes.ATTRIBUTE */ &&
        prop.name === 'class' &&
        prop.value
      ) {
        // A token the map lacks is another file's (`:global()`, a parent's class), left as is
        prop.value.content = prop.value.content
          .split(/\s+/)
          .filter(Boolean)
          .map(token => renames.get(token) ?? token)
          .join(' ');
        continue;
      }

      const isBind = prop.type === 7 /* NodeTypes.DIRECTIVE */ && prop.name === 'bind';
      const isClassArg =
        prop.arg?.type === 4 /* NodeTypes.SIMPLE_EXPRESSION */ &&
        prop.arg.content === 'class';
      if (isBind && isClassArg && prop.exp) {
        // Wrapping the original expression as-is keeps codegen unchanged for any expression shape
        prop.exp = createCompoundExpression(
          ['__scopeClass(', prop.exp, ', __scopedClassNames)'],
          prop.exp.loc,
        );
      }
    }
  };
}

// Vue's `condense()` leaves one boundary space on a multi-line text node, and RN Text renders it
// Babel's JSX cleaner trims it for the other adapters, so this does the same
// Only a node whose source has a line break is touched, so a one-line `<text>` keeps its space
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

// Shared with ./babel-jsx.cjs: Vue's two compilers must give one answer to element-vs-component.
const INTRINSIC_TAGS = require('./intrinsic-tags.cjs');

const SYMBIOTE_SOURCE_PREFIX = '@symbiote-native/';

// Local names the file imports from any `@symbiote-native/*` package (`FlatList`, `Animated`).
function symbioteImportsOf(descriptor) {
  const locals = new Set();
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (block == null) continue;
    const plugins = block.lang === 'ts' || block.lang === 'tsx' ? ['typescript'] : [];
    const program = babelParse(block.content, { sourceType: 'module', plugins }).program;
    for (const statement of program.body) {
      if (
        statement.type !== 'ImportDeclaration' ||
        !statement.source.value.startsWith(SYMBIOTE_SOURCE_PREFIX)
      )
        continue;
      for (const specifier of statement.specifiers) locals.add(specifier.local.name);
    }
  }
  return locals;
}

// Vue casts a bare attribute to `true` only for a prop declared Boolean. Our tags and components
// declare none, so `nested-scroll-enabled` reached Android as "" and the ViewManager threw
// `String cannot be cast to Boolean`. The app's own components keep Vue's semantics.
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


// A short, stable id per file used as the SFC scope id, scoped styles or not
// Built on css-parser's `hashFilePath`, which the standalone .module.css compiler shares
function scopeIdFor(filename) {
  return 'data-v-' + hashFilePath(filename);
}

// The local the compiled component lands in when a <style module> block needs __cssModules hung
// off it (compileScript's genDefaultAs). Same role as @vitejs/plugin-vue's own `_sfc_main`.
const SFC_COMPONENT_VAR = '__sfc__';

// Blocks concatenate and each compiles alone, so `order` restarts at zero and `cond` points into
// that block's own table: both are renumbered on append, as one stylesheet would have numbered them
function appendRules(sink, compiled) {
  const offset = sink.conditions.length;
  sink.conditions.push(...compiled.conditions);
  for (const rule of compiled.rules) {
    sink.rules.push({
      ...withOffsetCond(rule, offset),
      order: sink.rules.length,
    });
  }
  // A `:root` block cascades in append order, the way one stylesheet would
  for (const variable of compiled.rootVariables) {
    sink.rootVariables.push(withOffsetCond(variable, offset));
  }
  for (const property of compiled.properties) {
    sink.properties.push(withOffsetCond(property, offset));
  }
}

function withOffsetCond(item, offset) {
  return item.cond === undefined ? item : { ...item, cond: item.cond + offset };
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

// Reduces one `<style>` block to plain CSS text, a lang-less or `lang="css"` block passes through
// A lang outside the four preprocessors throws
async function compileStyleBlockContent(style, filename) {
  if (style.lang == null || style.lang === 'css') return style.content;

  const preprocessorLang = SFC_STYLE_LANG_TO_PREPROCESSOR.get(style.lang);
  if (!preprocessorLang) {
    throw new Error(
      `SFC style lang="${style.lang}" not supported yet — plain CSS only`,
    );
  }

  // The Sass entry point picks the indented or `.scss` syntax off the file extension
  // An inline block has no file of its own, so a synthetic `.sass` path selects the indented one
  // Other preprocessors read the path only for relative imports, where the real path is right
  const syntheticPath = style.lang === 'sass' ? `${filename}.sass` : filename;
  return compilePreprocessor(style.content, preprocessorLang, syntheticPath);
}

// Cleared first: the scope-class transform mutates the cached template AST in place
// A whole `clear()` because one key would couple this file to Vue's internal cache key format
function parseDescriptor(src, filename) {
  parseCache.clear();
  // Intrinsics are named here since `compileScript` reuses this parse and its fixed `tagType`
  const { descriptor, errors } = parse(src, {
    filename,
    templateParseOptions: { isCustomElement: tag => INTRINSIC_TAGS.has(tag) },
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

// Adds one style block's rules and names to `sink`, scoped the way its attributes ask
// `<style module>` and `<style scoped>` both rename through lightningcss, only the pattern differs
function addStyleBlock(sink, style, content, scope) {
  const { filename, scopeId } = scope;
  if (style.module) {
    const bindingName =
      typeof style.module === 'string' ? style.module : '$style';
    const compiled = compileCssModule(content, filename);
    appendRules(sink, compiled);
    sink.cssModuleBindings.set(bindingName, {
      ...sink.cssModuleBindings.get(bindingName),
      ...compiled.classMap,
    });
    return;
  }
  if (style.scoped) {
    const compiled = compileScopedCss(content, {
      filename,
      pattern: `[local]__${scopeId}`,
    });
    appendRules(sink, compiled);
    for (const [name, renamed] of compiled.names)
      sink.scopedClassNames.set(name, renamed);
    return;
  }
  appendRules(sink, compileCssToRules(content, { filename }));
}

// Kept apart so `compileSfc` reads as parse, styles, template, emit
// Blocks cascade last-wins through `order`, which `appendRules` renumbers across blocks
async function compileStyleBlocks(descriptor, filename) {
  // Preprocessors run first and in parallel, the renaming only ever sees plain CSS
  const contents = await Promise.all(
    descriptor.styles.map(style => compileStyleBlockContent(style, filename)),
  );
  const sink = {
    rules: [],
    conditions: [],
    rootVariables: [],
    properties: [],
    scopedClassNames: new Map(),
    cssModuleBindings: new Map(),
  };
  const scope = { filename, scopeId: scopeIdFor(filename) };
  for (const [index, style] of descriptor.styles.entries())
    addStyleBlock(sink, style, contents[index], scope);
  return sink;
}

// Scoped rewriting is skipped when no style is scoped, so other files add no runtime cost
function templateOptionsFor(descriptor, scopedClassNames) {
  const nodeTransforms = [
    trimReflowedTextNodeTransform,
    createBareBooleanNodeTransform(symbioteImportsOf(descriptor)),
  ];
  if (scopedClassNames.size > 0)
    nodeTransforms.push(createScopeClassNodeTransform(scopedClassNames));
  // Covers every intrinsic, not just imported ones, or `<pressable>` turns into a component
  return {
    compilerOptions: {
      nodeTransforms,
      isCustomElement: tag => INTRINSIC_TAGS.has(tag),
    },
  };
}

// The module text ahead of the component: the registration, the scope map and the module maps
// Only a scoped file imports the rename helper, so other files leave it out
function buildPreamble(styles) {
  const {
    rules,
    conditions,
    rootVariables,
    properties,
    scopedClassNames,
    cssModuleBindings,
  } = styles;
  const isScoped = scopedClassNames.size > 0;
  const hasRoot = rootVariables.length > 0;
  const hasProperties = properties.length > 0;
  const engineImports = [
    'registerRules',
    ...(hasRoot ? ['registerRootVariables'] : []),
    ...(hasProperties ? ['registerProperties'] : []),
    ...(isScoped ? ['renameClassTokens as __scopeClass'] : []),
  ].join(', ');
  const table = conditionsArgument(conditions);
  const preamble = [
    `import { ${engineImports} } from '@symbiote-native/engine';`,
    `registerRules(${serializeRules(rules)}${table});`,
  ];
  if (hasRoot) {
    preamble.push(
      `registerRootVariables(${JSON.stringify(rootVariables)}${table});`,
    );
  }
  if (hasProperties) preamble.push(propertiesCall(properties, conditions));
  if (isScoped) {
    preamble.push(
      `const __scopedClassNames = ${JSON.stringify(Object.fromEntries(scopedClassNames))};`,
    );
  }
  // Module scope so `<script setup>` can use a map, the template gets it via `__cssModules`
  for (const [bindingName, classMap] of cssModuleBindings) {
    preamble.push(`const ${bindingName} = ${JSON.stringify(classMap)};`);
  }
  return preamble.join('\n');
}

async function compileSfc(src, filename) {
  const descriptor = parseDescriptor(src, filename);
  const styles = await compileStyleBlocks(descriptor, filename);
  const { cssModuleBindings } = styles;

  // `genDefaultAs` lets a `<style module>` block hang `__cssModules` on the component options
  // Vue reads `$style` from `instance.type.__cssModules`, so module scope alone is unreachable
  // Only set when a module block exists, so other files keep identical output
  const hasCssModules = cssModuleBindings.size > 0;
  const compiled = compileScript(descriptor, {
    id: scopeIdFor(filename),
    inlineTemplate: true,
    templateOptions: templateOptionsFor(descriptor, styles.scopedClassNames),
    fs: compileScriptFs,
    ...(hasCssModules ? { genDefaultAs: SFC_COMPONENT_VAR } : {}),
  });
  // Retargets every Vue import (compiler-injected helpers AND the user's own `from 'vue'`) at
  // the runtime-helpers shim - no vue/runtime-dom in a native bundle.
  const code = compiled.content.replace(
    /from\s*(['"])vue\1/g,
    'from "@symbiote-native/vue/runtime-helpers"',
  );

  const hasRegistrations =
    styles.rules.length > 0 ||
    styles.rootVariables.length > 0 ||
    styles.properties.length > 0;
  if (!hasRegistrations && !hasCssModules) return code;

  const parts = [buildPreamble(styles), code];
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

// Async for every branch because `compileSfc` awaits the style preprocessors
// Metro's transform worker already awaits `transform`, so a sync fast path saves nothing
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
