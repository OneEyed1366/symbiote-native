// Every Vue style form, proven END TO END: real SFC source -> the real metro-vue-transformer ->
// the emitted module EXECUTED -> mounted through the real Vue adapter -> the style that actually
// lands on the committed Fabric node.
//
// Why the whole chain rather than the compiled output alone: the template rewriter and the style
// compiler are two separate pieces of `metro-vue-transformer.cjs`, and a bug lives exactly where
// they disagree about a class NAME. `metro-vue-transformer.test.ts` asserts what registerRules()
// receives; `core/engine/src/style-registry/scoped-conformance.test.ts` asserts what
// resolveClassName() does with hand-written keys. Nothing joined the two, which is how the
// `__module__` shape stayed at zero coverage while a compound rule in it was dead for five days.
// Here the class token is never typed by hand — it is whatever the compiled template puts on the
// element, and the assertion is the resolved RN style object.
//
// The harness executes the emitted module: `typescript` (already a dependency of this package,
// the SFC compiler's own `registerTS` hook uses it) transpiles the emitted TS to CommonJS, and a
// three-entry require shim supplies the three specifiers the emitted code can name. That is the
// same code Metro would ship, minus Metro.

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import ts from 'typescript';
import type { Component } from '@vue/runtime-core';
import {
  clearGlobalStyles,
  registerRules,
  resolveClassName,
} from '@symbiote-native/engine';
import * as engine from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import { mount, unmount } from '@symbiote-native/vue';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import * as runtimeHelpers from './runtime-helpers';
import metroVueTransformer from '../metro-vue-transformer.cjs';

const {
  compileSfc,
}: { compileSfc: (src: string, filename: string) => Promise<string> } =
  metroVueTransformer;

const ROOT_TAG = 973;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  // The registry is one flat process-wide Map; a fixture registering `card` unscoped would
  // otherwise leak into the next test (the cross-file collision the style-registry-collisions
  // rule describes, reproduced inside one suite).
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

type IModuleRequire = (specifier: string) => unknown;

interface IEvaluatedModule {
  exports: Record<string, unknown>;
}

// The emitted module names exactly these three specifiers - the engine (registerRules /
// renameClassTokens), the Vue runtime shim every compiled SFC imports from, and whatever the
// fixture's own <script setup> imports. Anything else is a fixture mistake, not a silent stub.
const moduleRequire: IModuleRequire = specifier => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  throw new Error(
    `compiled SFC required an unexpected specifier: ${specifier}`,
  );
};

function isVueComponent(value: unknown): value is Component {
  return typeof value === 'object' && value !== null && 'setup' in value;
}

function evaluateCompiledSfc(code: string): Component {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const evaluated: IEvaluatedModule = { exports: {} };
  const factory: unknown = new Function(
    'require',
    'module',
    'exports',
    outputText,
  );
  if (typeof factory !== 'function') {
    throw new Error('the compiled SFC did not evaluate to a module factory');
  }
  factory(moduleRequire, evaluated, evaluated.exports);

  const component = evaluated.exports.default;
  if (!isVueComponent(component)) {
    throw new Error('the compiled SFC has no default-exported component');
  }
  return component;
}

// The style that reached Fabric for one element, keyed by the testID the fixture gave it. The
// engine flattens the class-derived and explicit style halves into the committed prop bag, so
// what comes back IS the RN style object - testID dropped, being the lookup key rather than style.
//
// Walks `committed` rather than `created`, and matches on testID rather than viewName: both are
// the harness traps in .claude/rules/test-harness-false-greens.md (a clone-on-write supersedes a
// created node's frozen props; the tree carries container RCTViews of the same name).
function findCommitted(
  nodes: readonly IFakeNode[],
  testId: string,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.props.testID === testId) return node;
    const found = findCommitted(node.children, testId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function committedStyleOf(testId: string): Record<string, unknown> {
  const node = findCommitted(fabric.committed, testId);
  if (node === undefined) {
    throw new Error(`no committed node carries testID "${testId}"`);
  }
  const { testID: _testId, ...style } = node.props;
  return style;
}

async function renderSfc(source: string, filename: string): Promise<string> {
  const code = await compileSfc(source, filename);
  mount(ROOT_TAG, evaluateCompiledSfc(code));
  await waitUntil(
    () => fabric.counts.completeRoot > 0,
    `the Vue commit for ${filename} to reach Fabric`,
  );
  return code;
}

// The class value the compiled template hands the element, read out of the render function rather
// than guessed - `class: "card__data-v-h big__data-v-h"` for a static attribute the nodeTransform
// rewrote at compile time. A dynamic binding compiles to a call expression instead and has no
// literal to read; those cells are proven by the committed style alone.
function staticClassTokensOf(code: string, testId: string): string {
  const match = new RegExp(`class: "([^"]*)",\\s*testID: "${testId}"`).exec(
    code,
  );
  if (match?.[1] === undefined) {
    throw new Error(
      `no static class= attribute compiled for testID "${testId}"`,
    );
  }
  return match[1];
}

type IStyleRules = Parameters<typeof registerRules>[0];

// The compiled output is our own compiler's JSON, so the guard only has to rule out "not an
// array" - it is a narrowing step, not a schema validator.
function isStyleRules(value: unknown): value is IStyleRules {
  return Array.isArray(value);
}

function isNameMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(entry => typeof entry === 'string')
  );
}

function registeredRulesOf(code: string): IStyleRules {
  const match = /registerRules\((\[[\s\S]*?\])\);/.exec(code);
  if (match?.[1] === undefined) {
    throw new Error('no registerRules(...) call in the compiled output');
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (!isStyleRules(parsed)) {
    throw new Error('registerRules(...) was not called with an array');
  }
  return parsed;
}

function moduleBindingOf(
  code: string,
  bindingName: string,
): Record<string, string> {
  // `$style` is the default binding name and `$` is a regex special, so escape before embedding.
  const escapedName = bindingName.replace(/\$/g, '\\$');
  const match = new RegExp(`const ${escapedName} = (\\{[^\\n]*\\});`).exec(
    code,
  );
  if (match?.[1] === undefined) {
    throw new Error(
      `no \`const ${bindingName} = {...}\` in the compiled output`,
    );
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (!isNameMap(parsed)) {
    throw new Error(`the ${bindingName} binding is not a name map`);
  }
  return parsed;
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────────
// One fixture per style form, carrying every cell of the matrix as its own testID'd element, so
// a cell is a one-line assertion against the same compiled artifact its neighbours came from.

const UNSCOPED_SFC = `
<script setup lang="ts">
import { View } from '@symbiote-native/vue'
const isBig = true
</script>
<template>
  <View class="card" testID="single" />
  <View class="card big" testID="compound" />
  <View class="reset" testID="globalWhole" />
  <View class="card legacy" testID="globalPartial" />
  <View :class="{ card: isBig, big: isBig }" testID="dynamicObject" />
  <View :class="['card', 'big']" testID="dynamicArray" />
  <View class="section-label" testID="kebab" />
</template>
<style>
.card { padding: 10px; background-color: red; }
.card.big { padding: 20px; }
:global(.reset) { margin: 0px; }
.card :global(.legacy) { opacity: 1; }
.section-label { color: red; }
</style>
<style>
.card { background-color: blue; }
</style>
`;

const SCOPED_SFC = `
<script setup lang="ts">
import { View } from '@symbiote-native/vue'
const isBig = true
const opaqueClass = 'card big'
</script>
<template>
  <View class="card" testID="single" />
  <View class="card big" testID="compound" />
  <View class="reset" testID="globalWhole" />
  <View class="card legacy" testID="globalPartial" />
  <View :class="{ card: isBig, big: isBig }" testID="dynamicObject" />
  <View :class="['card', 'big']" testID="dynamicArray" />
  <View class="card" :class="{ big: isBig }" testID="staticPlusDynamic" />
  <View :class="opaqueClass" testID="opaque" />
  <View class="section-label" testID="kebab" />
</template>
<style scoped>
.card { padding: 10px; background-color: blue; }
.card.big { padding: 20px; }
:global(.reset) { margin: 0px; }
.card :global(.legacy) { opacity: 1; }
.section-label { color: red; }
</style>
`;

// `$style.x` read in <script setup> and handed to the template through an ordinary setup binding.
// The template can also name `$style` directly (the describe below); the two routes reach the same
// map by different mechanisms — this one closes over the emitted module-scope const, that one reads
// `instance.type.__cssModules`.
//
// Each compound cell is written the way CSS Modules writes one — one token per authored class —
// because the map carries no collapsed `cardBig` key: lightningcss exports the classes the AUTHOR
// declared, and `.card.big` declares two.
const MODULE_VIA_SETUP_BINDING_SFC = `
<script setup lang="ts">
import { View } from '@symbiote-native/vue'
const singleClass = $style.card
const compoundClass = $style.card + ' ' + $style.big
const globalWholeClass = $style.reset
const globalPartialClass = $style.card + ' ' + $style.legacy
</script>
<template>
  <View :class="singleClass" testID="single" />
  <View :class="compoundClass" testID="compound" />
  <View :class="globalWholeClass" testID="globalWhole" />
  <View :class="globalPartialClass" testID="globalPartial" />
</template>
<style module>
.card { padding: 10px; background-color: blue; }
.card.big { padding: 20px; }
:global(.reset) { margin: 0px; }
.card :global(.legacy) { opacity: 1; }
</style>
`;

const MODULE_VIA_TEMPLATE_SFC = `
<script setup lang="ts">
import { View } from '@symbiote-native/vue'
</script>
<template>
  <View :class="$style.card" testID="single" />
</template>
<style module>
.card { padding: 10px; }
</style>
`;

// Vue's own documented accessor for a module block. It reads `instance.type.__cssModules` — the
// same field the template resolver reads — so it is the third route to one map, and it was dead
// for the same reason the template one was.
const MODULE_VIA_USE_CSS_MODULE_SFC = `
<script setup lang="ts">
import { useCssModule } from 'vue'
import { View } from '@symbiote-native/vue'
const styles = useCssModule()
</script>
<template>
  <View :class="styles.card" testID="single" />
</template>
<style module>
.card { padding: 10px; }
</style>
`;

const NAMED_MODULE_VIA_TEMPLATE_SFC = `
<script setup lang="ts">
import { View } from '@symbiote-native/vue'
</script>
<template>
  <View :class="classes.card" testID="single" />
</template>
<style module="classes">
.card { padding: 10px; }
</style>
`;

describe('<style> — an unscoped block reaches the element unrenamed', () => {
  it('applies a single class', async () => {
    const code = await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    expect(staticClassTokensOf(code, 'single')).toBe('card');
    // backgroundColor comes from the SECOND <style> block: two blocks in one SFC cascade
    // last-wins, per-property, exactly like two stylesheets would.
    expect(committedStyleOf('single')).toEqual({
      padding: 10,
      backgroundColor: '#00f',
    });
  });

  it('applies a compound rule to an element carrying both tokens', async () => {
    const code = await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    expect(staticClassTokensOf(code, 'compound')).toBe('card big');
    // The compound layers OVER the single-class rule rather than replacing it.
    expect(committedStyleOf('compound')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('applies a whole-selector :global() rule', async () => {
    await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    expect(committedStyleOf('globalWhole')).toEqual({ margin: 0 });
  });

  it('applies a partial :global() rule to an element carrying both its tokens', async () => {
    await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    // `.card :global(.legacy)` is a rule over the two tokens `card` and `legacy`, which the
    // element carries - the same path `.card.legacy` would take. (A descendant selector is
    // indistinguishable from a compound one here: the sixth trap in
    // .claude/rules/style-registry-collisions.md, `combinators` being carried but not yet
    // consumed. Asserted as it behaves, not as CSS would.)
    expect(committedStyleOf('globalPartial')).toEqual({
      padding: 10,
      backgroundColor: '#00f',
      opacity: 1,
    });
  });

  it('applies an object :class binding', async () => {
    await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    expect(committedStyleOf('dynamicObject')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('applies an array :class binding', async () => {
    await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    expect(committedStyleOf('dynamicArray')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('applies a kebab-case class written kebab in the template', async () => {
    const code = await renderSfc(UNSCOPED_SFC, 'Unscoped.vue');
    // No scoped block, so no nodeTransform runs and the raw kebab token survives to runtime,
    // where it matches the rule's token directly - the class registers as authored.
    expect(staticClassTokensOf(code, 'kebab')).toBe('section-label');
    expect(committedStyleOf('kebab')).toEqual({ color: '#f00' });
  });
});

describe('<style scoped> — every local token is renamed, and still resolves', () => {
  it('suffixes a single class in the template and resolves it', async () => {
    const code = await renderSfc(SCOPED_SFC, 'Scoped.vue');
    expect(staticClassTokensOf(code, 'single')).toMatch(
      /^card__data-v-[0-9a-z]+$/,
    );
    expect(committedStyleOf('single')).toEqual({
      padding: 10,
      backgroundColor: '#00f',
    });
  });

  it('resolves a compound rule whose tokens were each suffixed', async () => {
    const code = await renderSfc(SCOPED_SFC, 'Scoped.vue');
    // Both halves suffix PER TOKEN now, so there is nothing to reconcile: the rule names
    // `card__data-v-h` + `big__data-v-h` and the template writes the same two. `big` has no
    // standalone rule, so it reaches the rename map only through the compound selector's tokens.
    expect(staticClassTokensOf(code, 'compound')).toMatch(
      /^card__data-v-([0-9a-z]+) big__data-v-\1$/,
    );
    expect(committedStyleOf('compound')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('leaves a whole-selector :global() token unsuffixed', async () => {
    const code = await renderSfc(SCOPED_SFC, 'Scoped.vue');
    expect(staticClassTokensOf(code, 'globalWhole')).toBe('reset');
    expect(committedStyleOf('globalWhole')).toEqual({ margin: 0 });
  });

  it('suffixes only the owned half of a partial :global() selector', async () => {
    const code = await renderSfc(SCOPED_SFC, 'Scoped.vue');
    // The escape hatch exempts the `legacy` token on BOTH sides - the rule names
    // `card__data-v-h` + `legacy`, and the element carries exactly that pair. One scoped and one
    // unscoped token in a single rule, matched as a subset with no scope to factor back out.
    expect(staticClassTokensOf(code, 'globalPartial')).toMatch(
      /^card__data-v-[0-9a-z]+ legacy$/,
    );
    expect(committedStyleOf('globalPartial')).toEqual({
      padding: 10,
      backgroundColor: '#00f',
      opacity: 1,
    });
  });

  it('scopes an object :class binding', async () => {
    await renderSfc(SCOPED_SFC, 'Scoped.vue');
    expect(committedStyleOf('dynamicObject')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('scopes an array :class binding', async () => {
    await renderSfc(SCOPED_SFC, 'Scoped.vue');
    expect(committedStyleOf('dynamicArray')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('scopes a static class= and a :class binding merged on one element', async () => {
    await renderSfc(SCOPED_SFC, 'Scoped.vue');
    expect(committedStyleOf('staticPlusDynamic')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('scopes an opaque runtime class string', async () => {
    await renderSfc(SCOPED_SFC, 'Scoped.vue');
    // `:class="opaqueClass"` is unreadable at compile time, so renameClassTokens does the token
    // matching at runtime against the same name map the styles registered under.
    expect(committedStyleOf('opaque')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
  });

  it('keeps a kebab-case class kebab in its scoped name', async () => {
    const code = await renderSfc(SCOPED_SFC, 'Scoped.vue');
    expect(staticClassTokensOf(code, 'kebab')).toMatch(
      /^section-label__data-v-[0-9a-z]+$/,
    );
    expect(committedStyleOf('kebab')).toEqual({ color: '#f00' });
  });
});

describe('<style scoped> — the compiled token and the registered key are the same string', () => {
  // The literal chain the rest of this file runs implicitly: take the registerRules() argument
  // and the template's own class token out of ONE compiled artifact, drive the real registry with
  // them, and assert the style. It proves the two halves agree as STRINGS, which the mounted
  // assertions above can only prove indirectly.
  it('resolves every static token straight through registerRules/resolveClassName', async () => {
    const code = await compileSfc(SCOPED_SFC, 'Scoped.vue');
    registerRules(registeredRulesOf(code));

    expect(resolveClassName(staticClassTokensOf(code, 'single'))).toEqual({
      padding: 10,
      backgroundColor: '#00f',
    });
    expect(resolveClassName(staticClassTokensOf(code, 'compound'))).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
    expect(resolveClassName(staticClassTokensOf(code, 'globalWhole'))).toEqual({
      margin: 0,
    });
    expect(
      resolveClassName(staticClassTokensOf(code, 'globalPartial')),
    ).toEqual({ padding: 10, backgroundColor: '#00f', opacity: 1 });
    expect(resolveClassName(staticClassTokensOf(code, 'kebab'))).toEqual({
      color: '#f00',
    });
  });
});

describe('<style module> — the name map is correct, and the template reaches it', () => {
  it('resolves `:class="$style.card"` named directly in the template', async () => {
    const code = await compileSfc(MODULE_VIA_TEMPLATE_SFC, 'Module.vue');
    // Vue's template compiler resolves a `$`-prefixed name off the INSTANCE (`_ctx.$style`), which
    // it reads from `instance.type.__cssModules` — a module-scope `const $style` is invisible to
    // it. Until 2026-08-20 nothing set `__cssModules`, so this threw `Cannot read properties of
    // undefined (reading 'card')` at render; the two assertions below used to pin that throw.
    // compileSfc now hangs the map off the component (compileScript's `genDefaultAs`, the same
    // thing @vitejs/plugin-vue does), so both routes to the map work.
    expect(code).toContain('const $style = {');
    expect(code).toContain('_ctx.$style.card');
    expect(code).toContain('__sfc__.__cssModules = { "$style": $style };');

    mount(ROOT_TAG, evaluateCompiledSfc(code));
    await waitUntil(
      () => fabric.counts.completeRoot > 0,
      'the Vue commit for Module.vue to reach Fabric',
    );
    expect(committedStyleOf('single')).toEqual({ padding: 10 });
  });

  it('resolves a named `module="classes"` binding from the template', async () => {
    const code = await compileSfc(
      NAMED_MODULE_VIA_TEMPLATE_SFC,
      'NamedModule.vue',
    );
    // A non-`$` binding takes a different branch of Vue's public-instance proxy (it is checked
    // against setupState/props/ctx first), so it is proven separately rather than assumed.
    expect(code).toContain('const classes = {');
    expect(code).toContain('_ctx.classes.card');
    expect(code).toContain('__sfc__.__cssModules = { "classes": classes };');

    mount(ROOT_TAG, evaluateCompiledSfc(code));
    await waitUntil(
      () => fabric.counts.completeRoot > 0,
      'the Vue commit for NamedModule.vue to reach Fabric',
    );
    expect(committedStyleOf('single')).toEqual({ padding: 10 });
  });

  it("resolves the map through Vue's own useCssModule()", async () => {
    await renderSfc(MODULE_VIA_USE_CSS_MODULE_SFC, 'UseCssModule.vue');
    expect(committedStyleOf('single')).toEqual({ padding: 10 });
  });

  it('exposes a name->scopedName map carrying every class the author declared', async () => {
    const code = await compileSfc(
      MODULE_VIA_SETUP_BINDING_SFC,
      'ModuleBinding.vue',
    );
    const binding = moduleBindingOf(code, '$style');

    expect(Object.keys(binding).sort()).toEqual([
      'big',
      'card',
      'legacy',
      'reset',
    ]);
    // The map is lightningcss's `exports` (plus our `:global()` backfill), so it carries the
    // AUTHORED classes and nothing else — `.card.big` contributes `card` and `big`, never a
    // synthesized `cardBig`. Identical to the standalone `.module.css` path, which is the point:
    // code written against one now ports to the other.
    expect(binding.cardBig).toBeUndefined();
    expect(binding.cardLegacy).toBeUndefined();
  });

  it('resolves each map entry end to end when routed through a setup binding', async () => {
    await renderSfc(MODULE_VIA_SETUP_BINDING_SFC, 'ModuleBinding.vue');

    // `#00f`, not `blue`: lightningcss normalizes a colour keyword, and every form goes through
    // it now, so this is no longer the one shape that differs. Same colour to Fabric.
    expect(committedStyleOf('single')).toEqual({
      padding: 10,
      backgroundColor: '#00f',
    });
    // Two tokens, so the compound rule LAYERS over `.card` instead of replacing it — the same
    // cascade every other form gets, which the old collapsed-key spelling could not express.
    expect(committedStyleOf('compound')).toEqual({
      padding: 20,
      backgroundColor: '#00f',
    });
    expect(committedStyleOf('globalWhole')).toEqual({ margin: 0 });
    expect(committedStyleOf('globalPartial')).toEqual({
      padding: 10,
      backgroundColor: '#00f',
      opacity: 1,
    });
  });
});
