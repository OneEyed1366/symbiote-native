// `v-bind="obj"` carrying a FUNCTION-valued `style`, through the real SFC pipeline.
//
// The pipeline is the test. `_normalizeProps(_guardReactiveProps(bag))` is what the template
// compiler emits for a bare `v-bind`, and it is the only path that reaches the helper — a probe
// written as `h(Component, { ...bag })` skips it and reports the style arriving intact, which is
// how the defect stayed invisible. So these compile an SFC and mount it; nothing here may be
// shortened to a direct `h()` call without the assertion quietly ceasing to test anything.

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { defineComponent, h, type Component } from '@vue/runtime-core';
import * as engine from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import * as runtimeHelpers from './index';
import metroVueTransformer from '../../metro-vue-transformer.cjs';

const ROOT_TAG = 8311;
const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const moduleRequire = (specifier: string): unknown => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  throw new Error(
    `compiled SFC required an unexpected specifier: ${specifier}`,
  );
};

function evaluate(code: string): Component {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const evaluated = { exports: {} as Record<string, unknown> };
  new Function('require', 'module', 'exports', outputText)(
    moduleRequire,
    evaluated,
    evaluated.exports,
  );
  return evaluated.exports.default as Component;
}

const FUNCTION_STYLE =
  '({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.5 : 1 })';

function sfc(primitive: string, styleExpression: string): string {
  return `<script setup lang="ts">
import { ${primitive} } from '@symbiote-native/vue';
const bag = { testID: 'p', style: ${styleExpression} };
</script>
<template><${primitive} v-bind="bag" /></template>`;
}

// The SECOND spelling, and it compiles to a different helper: a bare `v-bind` beside a separate
// `:style` emits `mergeProps`, never `normalizeProps`. Measured — the first fix covered only the
// first door and this arm stayed broken behind a green suite.
function sfcMerged(primitive: string, styleExpression: string): string {
  return `<script setup lang="ts">
import { ${primitive} } from '@symbiote-native/vue';
const rest = { testID: 'p' };
const fn = ${styleExpression};
</script>
<template><${primitive} v-bind="rest" :style="fn" /></template>`;
}

// The committed payload of the primitive itself — index 0 is the surface's own container view.
async function commit(
  primitive: string,
  styleExpression: string,
  build: (p: string, e: string) => string = sfc,
): Promise<Record<string, unknown>> {
  const code = await compileSfc(
    build(primitive, styleExpression),
    `/${primitive}-${build === sfc ? 'vbind' : 'merged'}.vue`,
  );
  fabric.reset();
  mount(ROOT_TAG, defineComponent({ setup: () => () => h(evaluate(code)) }));
  await tick();
  const flat: IFakeNode[] = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  const subject = flat[1];
  if (subject === undefined)
    throw new Error('nothing committed under the container');
  const props = { ...subject.props };
  unmount(ROOT_TAG);
  return props;
}

describe('a functional style survives v-bind', () => {
  // Both, because the defect is NOT stateful-only: measured identically on View, which observes no
  // press state at all. Scoping the override to Pressable would have left this arm broken.
  it.each(['View', 'Pressable'])(
    '%s: the style resolves instead of being dropped',
    async primitive => {
      const props = await commit(primitive, FUNCTION_STYLE);

      // `opacity: 1` is the callback resolved at `pressed: false` by routeProp. Before the
      // normalizeProps override this key was absent entirely — not wrong, missing.
      expect(props).toEqual({ testID: 'p', opacity: 1 });
    },
  );

  // The mergeProps door. Same defect, different compiler helper — so this is not a duplicate of
  // the rows above: breaking either override leaves the other set green.
  it.each(['View', 'Pressable'])(
    '%s: v-bind beside a separate :style goes through mergeProps and survives',
    async primitive => {
      const props = await commit(primitive, FUNCTION_STYLE, sfcMerged);

      expect(props).toEqual({ testID: 'p', opacity: 1 });
    },
  );

  // The THIRD door, and the one that unblocked removing the state-style split from both Vue
  // transforms. A `:style` binding compiles to `_normalizeStyle(expr)` whenever the compiler cannot
  // keep it on the cheap patch-flag path — an inline arrow does, a bare identifier does not. While
  // the transforms rewrote that attribute into a resting/active pair the helper never saw a
  // callback, so this was unreachable; with the split gone it is the only thing standing between a
  // lowered `<Pressable :style="({pressed}) => …" />` and no style at all.
  it('an inline callback survives the :style path', async () => {
    const props = await commit(
      'Pressable',
      FUNCTION_STYLE,
      (primitive, expr) =>
        `<script setup lang="ts">
import { ${primitive} } from '@symbiote-native/vue';
</script>
<template><${primitive} testID="p" :style="${expr}" /></template>`,
    );

    expect(props).toEqual({ testID: 'p', opacity: 1 });
  });

  // The control. Without it, "the style is present" cannot distinguish a working override from a
  // harness that never lost it — and an object style is the shape Vue's own normalizer handles
  // correctly, so it must keep working unchanged.
  it.each(['View', 'Pressable'])(
    '%s: an object style still goes through Vue’s own normalizer',
    async primitive => {
      const props = await commit(primitive, '{ opacity: 0.3 }');

      expect(props).toEqual({ testID: 'p', opacity: 0.3 });
    },
  );
});
