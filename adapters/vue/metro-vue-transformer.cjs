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
const {
  parse,
  parseCache,
  compileScript,
  registerTS,
  // Babel's own parser, re-exported. Using it costs no new dependency, which matters: @babel/parser
  // does not resolve from this package under pnpm's isolated layout, and the alternative — adding
  // @babel/{parser,types,generator} to a PUBLISHED adapter — would also force every example through
  // a full reinstall, because the overlay's folder swap cannot install a new dependency.
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

// Which primitives lower, and to which tag, comes from the SHARED SPEC — this file used to keep
// its own copy of the map, one of four, and the copies had already drifted apart (Vue folded
// `id` -> `nativeID` on neither tag while Solid did both and Svelte did one).
//
// Only the `intrinsic` field is read here. `aliases` deliberately is NOT: Vue applies that fold at
// RUNTIME in `src/renderer/index.ts`'s patchProp, because Vue reaches a node by four paths and
// compile time covers only two of them. The spec says so at its `aliases` declaration; a transform
// does not own a fold just because the spec describes it.
//
// WHY lower at all, measured 2026-08-23: Vue charges a full component instance
// (createComponentInstance + initProps + initSlots + setupRenderEffect) for a functional component
// too, and our benchmark row is 7 instances (Row + View + 3 Text + 2 Pressable) where React pays 7
// far cheaper fibers. That is the whole reason Vue is level with React on the web (a <div> is an
// element) and 1.8x behind here. Same 36 001-node tree with View/Text lowered: 138.0 -> 118.5 ms,
// 14.1%. It also lets Vue hoist static props out of the render fn and emit patch flags, neither of
// which a component gets.
const {
  HOST_PRIMITIVES,
} = require('@symbiote-native/components/host-primitives');

// Only the STATE KEYS are shared here, not the specializer. This path has no JS AST in hand — the
// SFC compiler gives an expression as SOURCE TEXT — so it emits the CALL form and never the
// substituted one. That is a difference in OPTIMISATION, deliberately not a difference in verdict:
// which call sites lower is decided by `callableStyleShape`, which classifies the same three
// shapes the JSX twin does, off a real Babel AST. See babel-lower-host-primitives.cjs for the two
// mechanisms and why only one of them is allowed to gate lowering.
const {
  STATE_KEYS,
} = require('@symbiote-native/components/specialize-state-style');

const LOWERABLE_HOST_PRIMITIVES = new Map(
  Object.entries(HOST_PRIMITIVES).map(([name, spec]) => [
    name,
    { intrinsic: spec.intrinsic, observesState: spec.observesState === true },
  ]),
);

// Lower ONLY a name this file actually imported from us. Matching on the bare tag would silently
// rewrite an app's own <View>, and the failure would be invisible: the app's component never
// renders and the intrinsic paints an empty box. Alias-aware, so `import { View as RNView }`
// lowers RNView and leaves View alone.
const SYMBIOTE_VUE_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*['"]@symbiote-native\/vue['"]/g;

function lowerableTagsIn(descriptor) {
  const source =
    (descriptor.scriptSetup?.content ?? '') +
    (descriptor.script?.content ?? '');
  const tags = new Map();
  for (const match of source.matchAll(SYMBIOTE_VUE_IMPORT)) {
    for (const clause of match[1].split(',')) {
      const [imported, local] = clause.trim().split(/\s+as\s+/);
      const entry = LOWERABLE_HOST_PRIMITIVES.get(imported);
      if (entry !== undefined) tags.set(local ?? imported, entry);
    }
  }
  return tags;
}

// A primitive that OWNS STATE (Pressable's pressed) can only lower when the template does not read
// that state — an element has no instance to read it from, so the machine moves to the engine node
// and there is nothing left to hand a template. Two authoring shapes ask for it, and both are
// visible here:
//
//   :style="fnStyle"                     the style is a function of press state
//   v-slot="{ pressed }" / #default=…    the children are a function of press state
//
// REFUSING IS ALWAYS SAFE and under-refusing never is: a refused element keeps today's behaviour
// and merely misses the win, while a wrongly-lowered one is a button that stops responding
// visually, on device, with every test green. Every judgement below therefore defaults to refusing
// whenever it cannot PROVE the safe case.
//
// The one thing that can be proven is an object literal. `:style="{ borderColor: c }"` provably is
// not a function; `:style="anything else"` cannot be told apart from one at compile time, because
// the compiler sees an expression, never its value. That asymmetry is also what makes the
// ActionButton migration work: move `opacity` into `.action-button:active` and what remains is an
// object literal, so the same button lowers without the transform learning anything new.
function refusesLowering(node) {
  for (const prop of node.props) {
    // REFUSAL_CATEGORIES.instanceBoundDirective, and it is checked before the directive filter
    // because `ref="x"` is a plain ATTRIBUTE while `:ref="x"` is a directive. `ref` on a component
    // yields the component instance and on an element the host node, so lowering silently changes
    // what the app receives. Found by the shared verdict table, not by a Vue test.
    if (prop.type === 6 /* ATTRIBUTE */ && prop.name === 'ref') return true;
    if (prop.type !== 7 /* NodeTypes.DIRECTIVE */) continue;
    if (prop.name === 'bind' && prop.arg?.content === 'ref') return true;

    // `v-bind="obj"` — a whole attribute set this pass cannot enumerate, so it may be hiding a
    // functional `style`. REFUSAL_CATEGORIES.unreadableAttributeSet.
    if (prop.name === 'bind' && !prop.arg) return true;

    // REFUSAL_CATEGORIES.stateInTemplate no longer fires on a `style`: every shape is covered, by
    // an inert passthrough, a direct call, or the runtime helper. The one thing still unreachable
    // is an expression whose source text cannot be reconstructed at all, which cannot occur in a
    // file that compiles — `styleEmissionKind` returning undefined keeps the component if it does.
    if (
      prop.name === 'bind' &&
      prop.arg?.content === 'style' &&
      !isInertValueExpression(prop.exp) &&
      styleEmissionKind(prop.exp) === undefined
    )
      return true;

    // `v-slot="{ pressed }"` on the element itself. REFUSAL_CATEGORIES.renderPropChild.
    if (prop.name === 'slot' && prop.exp) return true;
  }

  // ANY `<template>` child, with or without a slot argument — not only the `#default="{ pressed }"`
  // form this rule was written for. Measured through the real compileSfc: lowering an element that
  // has one makes codegen throw `Codegen node is missing for element/if/for node`, because the
  // element path never builds a codegen node for a child the slot path owns. Loud rather than
  // silent, but still a build failure in an app that writes a perfectly ordinary template, so it
  // refuses here. This is the one place the spec's "zero-arity is not a refusal" carve-out does
  // NOT apply: it is about a JSX function child, and an SFC `<template>` child cannot be lowered
  // at all.
  return node.children.some(
    child =>
      child.type === 1 /* ELEMENT */ && child.tagType === 3 /* TEMPLATE */,
  );
}

// An ALLOW-LIST, never a hunt for a function literal, and the shared spec pins all five transforms
// to this side of it (`REFUSAL_CATEGORIES.stateInTemplate`). `:style="styleFn"` is an identifier at
// compile time and NO transform can tell whether it holds an object or a function, so only
// provably inert value shapes lower — object, array, string/number literal, template literal — and
// everything else refuses. A narrow "refuse a function literal" reading passes every obvious test
// and fails on the one call site that hoists its style into a variable, which is exactly what
// ActionButton does.
//
// Which AST node carries the source is NOT what intuition says, and the probe that established it
// is why this reads both shapes. `transformExpression` runs before this pass and rewrites every
// setup binding, so `:style="{ borderColor: c }"` arrives as a COMPOUND (type 8) with children
// `['{ borderColor: ', '$setup.c', ' }']`, while the dangerous `:style="fnStyle"` arrives SIMPLE
// (type 4) as `'$setup.fnStyle'`. Testing `type === 4` alone therefore refuses exactly the shape it
// should allow — the first version of this did that, and the probe caught it before any test ran.
// An object literal with nothing to rewrite (`{ borderColor: 1 }`) stays SIMPLE, so both matter.
const INERT_VALUE_HEAD = /^[{['"`\d]/;

function isInertValueExpression(exp) {
  const head = leadingSource(exp);
  return head !== undefined && INERT_VALUE_HEAD.test(head.trimStart());
}

// The literal source text the expression opens with. An arrow never opens with one of the
// characters above — it opens with `(` or its parameter name — so reading only the head is sound.
function leadingSource(exp) {
  if (exp?.type === 4 /* SIMPLE_EXPRESSION */) return exp.content;
  if (exp?.type !== 8 /* COMPOUND_EXPRESSION */) return undefined;
  const head = exp.children?.[0];
  return typeof head === 'string' ? head : undefined;
}

// The FINAL source text of a template expression — what codegen would have emitted. Not
// `exp.loc.source`, which is the text the AUTHOR wrote: `transformExpression` runs before this pass
// and rewrites every setup binding, so `loc.source` still says `color` where the compiled render fn
// must say what the compound's children say. Reading the children is therefore the only correct
// reconstruction, and re-emitting it verbatim is what keeps the rewrite intact.
function expressionSource(exp) {
  if (exp === undefined || exp === null) return undefined;
  if (exp.type === 4 /* SIMPLE_EXPRESSION */) return exp.content;
  if (exp.type !== 8 /* COMPOUND_EXPRESSION */) return undefined;
  let source = '';
  for (const child of exp.children) {
    if (typeof child === 'string') {
      source += child;
      continue;
    }
    const nested = expressionSource(child);
    if (nested === undefined) return undefined;
    source += nested;
  }
  return source;
}

// HOW the pair is emitted, never WHETHER the element lowers — every shape lowers. Classified off a
// real Babel AST so this path and the JSX path cannot drift by reading the same text differently.
//
//   literal    (EXPR)({ pressed: false })                      two closures, no read hazard
//   reference  typeof (E) === 'function' ? (E)({…}) : (E)      E printed twice, but it is a read
//   opaque     v-bind="__helper(EXPR)"                          EXPR printed ONCE — required
//
// The third bucket is `REFUSAL_CATEGORIES.emitStyleExpressionOnce`: `getStyle()`, `bag[i]` and
// `flag ? a : b` change meaning when printed twice. It is not the default because a spread is the
// only Vue form yielding two props from one evaluation, and a spread costs the element its patch
// flag — measured on the real compileSfc, `12 /* STYLE, PROPS */` becomes `16 /* FULL_PROPS */`
// plus a mergeProps on every render. Paid only where a repeated read would actually be wrong.
function styleEmissionKind(exp) {
  const source = expressionSource(exp);
  if (source === undefined) return undefined;
  let expression;
  try {
    // Wrapped in parens so a bare object or an arrow parses as an EXPRESSION rather than a block.
    // `typescript` because a template in a lang="ts" SFC may carry an annotation on the callback's
    // parameter — which is exactly how the real call sites are written.
    const file = babelParse(`(${source})`, { plugins: ['typescript'] });
    expression = file.program.body[0]?.expression;
  } catch {
    // An expression this parser cannot read is one we cannot classify, so it keeps the component.
    return undefined;
  }
  if (expression === undefined) return undefined;
  if (
    expression.type === 'ArrowFunctionExpression' ||
    expression.type === 'FunctionExpression'
  )
    return 'literal';
  return isCheapReferenceNode(expression) ? 'reference' : 'opaque';
}

function isCheapReferenceNode(node) {
  if (node.type === 'Identifier') return true;
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    isCheapReferenceNode(node.object)
  );
}

// `{ pressed: <value> }`, built from the SHARED state keys rather than a literal name, so a
// primitive that later exposes a second state key does not need this edited in five transforms.
function stateArgumentSource(value) {
  return `{ ${[...STATE_KEYS].map(key => `${key}: ${value}`).join(', ')} }`;
}

// `:style="fn"` becomes `style` + `activeStyle`, each the callback applied to one state. The engine
// consumes `activeStyle` in routeProp and never forwards it to Fabric; while the node is pressed it
// stands in for SLOT 1, the authored style's slot, so a `:active` CSS rule still wins slot 0
// underneath and the two mechanisms compose rather than race.
//
// A cheap REFERENCE cannot be told from a plain style object at compile time — `:style="props.x"`
// is the same syntax either way — so it carries a runtime typeof guard, and that guard is what
// closes the hoisted-callback call site no compile-time analysis could reach. `activeStyle` falls
// back to `undefined` for a non-function, which the engine reads as "no active variant".
function expandStateStyles(node, helper) {
  for (const [index, prop] of node.props.entries()) {
    if (prop.type !== 7 /* DIRECTIVE */) continue;
    if (prop.name !== 'bind' || prop.arg?.content !== 'style') continue;
    if (isInertValueExpression(prop.exp)) continue;
    const kind = styleEmissionKind(prop.exp);
    if (kind === undefined) continue;
    const source = expressionSource(prop.exp);

    // The one shape that must reach the output exactly once. `v-bind` with no argument is the only
    // Vue form that turns one evaluation into two props, which is why it is not the default.
    if (kind === 'opaque') {
      node.props[index] = {
        ...prop,
        arg: undefined,
        exp: createSimpleExpression(
          `${helper.reference()}(${source})`,
          false,
          prop.exp.loc,
        ),
      };
      return;
    }

    const apply = value =>
      kind === 'literal'
        ? `(${source})(${stateArgumentSource(value)})`
        : `typeof (${source}) === 'function' ? (${source})(${stateArgumentSource(value)}) : ${value ? 'undefined' : `(${source})`}`;
    node.props.push({
      ...prop,
      arg: createSimpleExpression('activeStyle', true, prop.arg.loc),
      exp: createSimpleExpression(apply(true), false, prop.exp.loc),
    });
    prop.exp = createSimpleExpression(apply(false), false, prop.exp.loc);
    return;
  }
}

// The helper import, emitted at most once per file and only when an opaque style actually asked
// for it — every other lowered file keeps byte-identical output to before this existed.
const STATE_STYLE_LOCAL = '__symbioteStateStyle';

function createStateStyleHelper() {
  let used = false;
  return {
    reference() {
      used = true;
      return STATE_STYLE_LOCAL;
    },
    get isUsed() {
      return used;
    },
  };
}

// The parser has already decided `<View>` is a COMPONENT (capitalized, and a <script setup>
// binding), so renaming the tag is not enough — isCustomElement is consulted for the ORIGINAL tag
// and tagType must be flipped in the same pass, before transformElement's exit hook turns the
// children into withCtx slots. Get either half wrong and codegen emits a component whose children
// are slots the element path never mounts: a silently empty subtree, which is how the first
// attempt at this read.
function createHostPrimitiveLowering(tags, helper) {
  return function lowerHostPrimitive(node) {
    if (node.type !== 1 /* NodeTypes.ELEMENT */) return;
    const entry = tags.get(node.tag);
    if (entry === undefined) return;
    if (entry.observesState && refusesLowering(node)) return;
    if (entry.observesState) expandStateStyles(node, helper);
    node.tag = entry.intrinsic;
    node.tagType = 0; /* ElementTypes.ELEMENT */
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
  // `parse` memoizes its descriptor on (source, filename) in a module-global LRU, and the node
  // transforms below MUTATE that descriptor's template AST in place — the lowering one rewrites
  // `node.tag`/`node.tagType`, the scope-class one replaces `prop.exp`. Handing the same object to
  // a second compile therefore walks a half-transformed tree and generation dies with `Codegen
  // node is missing for element/if/for node`.
  //
  // Metro compiles each file once per build, so the cache buys this caller nothing; the only place
  // it was ever exercised is css-parser's golden-corpus determinism check, which compiles one
  // source twice on purpose. That is the ONLY test anywhere that can see this, which is why a
  // transform bug surfaced as a failure in another package's corpus.
  //
  // `clear()` rather than deleting our one key: the key is `source + JSON.stringify(options)`
  // (`@vue/shared`'s genCacheKey), so reproducing it here would couple this file to an internal
  // format across every Vue bump. Clearing a pure memo is always safe — the only cost is a
  // re-parse, which is what we need anyway.

  parseCache.clear();
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

  // Scoped-class rewriting is skipped entirely (not even passed to the compiler) when nothing in
  // this file is scoped, so a .vue with only unscoped/no styles adds no runtime cost. Host-
  // primitive lowering is independent of it and applies whenever the file imports one.
  const lowerableTags = lowerableTagsIn(descriptor);
  const stateStyleHelper = createStateStyleHelper();
  const nodeTransforms = [];
  if (lowerableTags.size > 0)
    nodeTransforms.push(
      createHostPrimitiveLowering(lowerableTags, stateStyleHelper),
    );
  if (scopedClassNames.size > 0)
    nodeTransforms.push(createScopeClassNodeTransform(scopedClassNames));
  // `.values()` yields the SPEC ENTRIES, so this must map to `.intrinsic` — a Set of entry objects
  // makes `loweredTags.has('symbiote-pressable')` permanently false, and the failure is not the
  // obvious one. Pass 1 rewrites the tag and forces tagType, so the file compiles; `@vue/compiler-
  // sfc` then caches the descriptor by (source, filename) and pass 2 walks the ALREADY-REWRITTEN
  // AST, where neither `lowerableTags` nor a broken `loweredTags` recognises `symbiote-pressable`.
  // The node is then an unknown component with no codegen node and generation throws
  // `Codegen node is missing for element/if/for node` — in the only test anywhere that compiles one
  // source twice, which is css-parser's golden-corpus determinism check, i.e. nowhere near here.
  const loweredTags = new Set(
    [...lowerableTags.values()].map(entry => entry.intrinsic),
  );
  const templateOptions =
    nodeTransforms.length > 0
      ? {
          compilerOptions: {
            nodeTransforms,
            isCustomElement: tag =>
              lowerableTags.has(tag) || loweredTags.has(tag),
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

  // Before the styles-only early return: a .vue with no <style> block still needs this import if
  // its template lowered an opaque style. Getting the order wrong here is invisible to every test
  // that happens to use a styled fixture.
  const helperImport = stateStyleHelper.isUsed
    ? `import { resolveStateStyle as ${STATE_STYLE_LOCAL} } from '@symbiote-native/vue/state-style';\n`
    : '';

  if (rules.length === 0 && !hasCssModules) return helperImport + code;

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

  const parts = [helperImport + preamble.join('\n'), code];
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
