// A bare intrinsic tag WRITTEN BY HAND, with no lowering transform in the picture. This is the
// authoring shape the adapter is moving to: the app writes `<view>` / `<pressable>` itself and no
// build step rewrites anything, so nothing here compiles a wrapper component and nothing imports
// one. That is also what makes the arms honest — the lowering transform keys on an
// `@symbiote-native/vue` import, and these sources have none, so it provably cannot fire.
//
// Both Vue paths, separately. `@vue/compiler-sfc` and `@vue/babel-plugin-jsx` decide
// element-vs-component in two different places, so one rule reaching two mechanisms is the drift
// shape this repo treats as P0 and neither path's answer predicts the other's.
//
// THE HAZARD THE TAG ALPHABET CREATES. Since the `symbiote-` prefix was dropped, `view` / `text` /
// `image` / `switch` are the names of real SVG elements, which both Vue compilers already resolve
// as elements with no configuration at all. `pressable` / `text-input` / `safe-area-view` have no
// such entry, so the two families take different compiler paths and a suite written on the short
// tags alone reports a working `isCustomElement` that is not wired to anything.

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import * as babel from '@babel/core';
import { defineComponent, h, type Component } from '@vue/runtime-core';
import * as vueRuntime from '@vue/runtime-core';
import * as engine from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import { mount, unmount } from '@symbiote-native/vue';
import {
  installFabric,
  waitForQuiet,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import { descriptorFor } from '@symbiote-native/components';
import * as runtimeHelpers from './src/runtime-helpers';
import metroVueTransformer from './metro-vue-transformer.cjs';
import symbioteVueJsx from './babel-jsx.cjs';
import INTRINSIC_TAGS from './intrinsic-tags.cjs';

const ROOT_TAG = 9411;
const TEST_ID = 'hand-written';
const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;
const fabric = installFabric();

// Derived from the shared tag set, never enumerated: a primitive that joins the spec joins this
// suite by existing, which is the repair `.claude/rules/adapter-parity-audit.md` records for every
// hand-written list in this repo.
const TAGS: readonly string[] = [...INTRINSIC_TAGS].sort();

// A tag shaped exactly like one of ours and belonging to an app. `isCustomElement` must be a CLOSED
// list — an over-broad "anything hyphenated is ours" answer would silently stop resolving an app's
// own kebab-case component, and every row above would still be green.
const FOREIGN_TAG = 'app-counter-card';

const moduleRequire = (specifier: string): unknown => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  // The JSX path emits `from "vue"` untouched; only the SFC path has its imports retargeted at the
  // runtime-helpers shim.
  if (specifier === 'vue' || specifier === '@vue/runtime-core')
    return vueRuntime;
  throw new Error(
    `compiled arm required an unexpected specifier: ${specifier}`,
  );
};

function isComponent(value: unknown): value is Component {
  return typeof value === 'object' && value !== null;
}

function evaluate(code: string): Component {
  const { outputText } = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const evaluated: { exports: Record<string, unknown> } = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    moduleRequire,
    evaluated,
    evaluated.exports,
  );
  const component = evaluated.exports.default;
  if (!isComponent(component))
    throw new Error('the compiled arm exported no default component');
  return component;
}

// `defineOptions` rather than nothing: `@vue/compiler-sfc` reports an EMPTY `<script setup>` as no
// script block at all, and compileSfc refuses a descriptor with neither.
const sfcSource = (template: string, setup = 'defineOptions({});\n'): string =>
  `<script setup lang="ts">\n${setup}</script>\n<template>${template}</template>`;

const jsxSource = (jsx: string, setup = ''): string =>
  `import { defineComponent } from 'vue';\n` +
  `export default defineComponent(() => { ${setup} return () => (${jsx}); });`;

async function compileJsx(source: string): Promise<string> {
  const result = await babel.transformAsync(source, {
    filename: 'probe.jsx',
    babelrc: false,
    configFile: false,
    // The plugin list an app puts in its own babel.config.js, whole. Compiling with a hand-picked
    // subset would test a configuration nobody ships.
    plugins: symbioteVueJsx(),
  });
  if (result?.code == null) throw new Error('babel produced no output');
  return result.code;
}

// Matched WITH ITS QUOTES. `text-input` is a prefix of `text-input-multiline` and of both `-managed`
// spellings, so a bare `includes(tag)` reads any of the four as this one and a compiler emitting a
// sibling would report correct.
const namesElement = (code: string, tag: string): boolean =>
  code.includes(`"${tag}"`) && !code.includes(`_resolveComponent("${tag}")`);

function deepCount(nodes: readonly IFakeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + deepCount(node.children), 0);
}

async function mountArm(component: Component): Promise<readonly IFakeNode[]> {
  fabric.reset();
  mount(ROOT_TAG, defineComponent({ setup: () => () => h(component) }));
  await waitForQuiet(
    () => deepCount(fabric.committed),
    'the mount to stop committing',
  );
  const flat: IFakeNode[] = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  unmount(ROOT_TAG);
  return flat;
}

function subject(nodes: readonly IFakeNode[]): IFakeNode {
  const found = nodes.find(node => node.props.testID === TEST_ID);
  if (found === undefined)
    throw new Error(
      `no committed node carries testID "${TEST_ID}" — the tag resolved to a component that ` +
        `renders nothing, or the mount never flushed`,
    );
  return found;
}

describe('the tag set this suite runs on', () => {
  // Without this every row below is satisfiable by the DATA going quiet: the list is derived, so an
  // empty one produces zero rows and a green suite.
  it('carries both a short tag and a hyphenated one', () => {
    expect(TAGS.length).toBeGreaterThan(0);
    expect(TAGS.filter(tag => tag.includes('-')).length).toBeGreaterThan(0);
    expect(TAGS.filter(tag => !tag.includes('-')).length).toBeGreaterThan(0);
  });
});

describe.each(TAGS)('<%s> written by hand', tag => {
  it('compiles to an element on the SFC path', async () => {
    const code = await compileSfc(
      sfcSource(`<${tag} testID="${TEST_ID}" />`),
      `/sfc-${tag}.vue`,
    );
    expect(namesElement(code, tag)).toBe(true);
  });

  it('compiles to an element on the TSX path', async () => {
    const code = await compileJsx(jsxSource(`<${tag} testID="${TEST_ID}" />`));
    expect(namesElement(code, tag)).toBe(true);
  });
});

describe('a tag that is not ours still resolves as a component', () => {
  it('on the SFC path', async () => {
    const code = await compileSfc(
      sfcSource(`<${FOREIGN_TAG} />`),
      '/sfc-foreign.vue',
    );
    expect(code).toContain(`_resolveComponent("${FOREIGN_TAG}")`);
  });

  it('on the TSX path', async () => {
    const code = await compileJsx(jsxSource(`<${FOREIGN_TAG} />`));
    expect(code).toContain(`_resolveComponent("${FOREIGN_TAG}")`);
  });
});

// The payload, not the compiled text. A tag can be an element and still never reach Fabric, and
// `id` -> `nativeID` is applied in Vue's RENDERER rather than by a transform — so a hand-written
// call site must get the fold with nothing having rewritten it.
//
// `onLayout` is the listener probe because it is one of the six events Fabric's C++ gates on a
// BOOLEAN prop (`.claude/rules/fabric-boolean-event-gates.md`): a listener that reaches the engine
// leaves `onLayout: true` in the COMMITTED payload, so the oracle is the payload and not the
// adapter's own listener map.
describe('a hand-written element reaches the engine', () => {
  const SETUP = 'const onLayout = () => {};\n';

  it.each([
    [
      'SFC',
      async (): Promise<string> =>
        compileSfc(
          sfcSource(
            `<view testID="${TEST_ID}" id="pane" @layout="onLayout" />`,
            SETUP,
          ),
          '/sfc-reach.vue',
        ),
    ],
    [
      'TSX',
      async (): Promise<string> =>
        compileJsx(
          jsxSource(
            `<view testID="${TEST_ID}" id="pane" onLayout={onLayout} />`,
            SETUP,
          ),
        ),
    ],
  ])('props, the id fold and a listener all land (%s)', async (_path, arm) => {
    const node = subject(await mountArm(evaluate(await arm())));

    expect(node.viewName).toBe(descriptorFor('view').component);
    expect(node.props.nativeID).toBe('pane');
    expect(node.props.id).toBeUndefined();
    expect(node.props.onLayout).toBe(true);
  });

  // The multiline pair is TWO native views, and with no transform left there is nothing to read a
  // `multiline` prop and pick between them — the author picks by writing the tag. Pinned so the
  // choice stays the author's and a later "helpful" runtime selector is a deliberate decision
  // rather than a silent one.
  it.each(['text-input', 'text-input-multiline'])(
    '<%s> commits its own native view',
    async tag => {
      const code = await compileSfc(
        sfcSource(`<${tag} testID="${TEST_ID}" />`),
        `/sfc-native-${tag}.vue`,
      );
      const node = subject(await mountArm(evaluate(code)));
      expect(node.viewName).toBe(descriptorFor(tag).component);
    },
  );
});

// `v-model` is the one attribute whose COMPILED SHAPE depends on element-vs-component, so it cannot
// be inferred from the rows above. On a component Vue emits the `modelValue` + `onUpdate:modelValue`
// prop pair; on an element it emits a runtime DIRECTIVE, `vModelText`, which lives in
// @vue/runtime-dom and is supplied here by src/runtime-helpers.
//
// And `@vue/compiler-dom`'s own `transformModel` REFUSES v-model outright on an element that is
// neither input/textarea/select nor a custom element — so on the short tags, which Vue already
// treats as SVG elements, a missing `isCustomElement` is not a silent degrade but a hard compile
// error. Both failure shapes are in this block on purpose.
describe('v-model on a hand-written element', () => {
  const SETUP = "import { ref } from 'vue';\nconst m = ref('a');\n";

  it.each(['text-input', 'switch'])(
    'compiles to the vModelText directive on the SFC path (%s)',
    async tag => {
      const code = await compileSfc(
        sfcSource(`<${tag} testID="${TEST_ID}" v-model="m" />`, SETUP),
        `/sfc-model-${tag}.vue`,
      );
      expect(namesElement(code, tag)).toBe(true);
      // Both expansions emit `onUpdate:modelValue`, so its presence discriminates nothing. Only
      // the element form reaches for the directive, and only `withDirectives` APPLIES it — Vue
      // skips a falsy directive silently, so importing it and never applying it looks identical
      // to working.
      expect(code).toContain('vModelText');
      expect(code).toContain('withDirectives');
    },
  );

  it.each(['text-input', 'switch'])(
    'compiles to the vModelText directive on the TSX path (%s)',
    async tag => {
      const code = await compileJsx(
        jsxSource(
          `<${tag} testID="${TEST_ID}" v-model={m.value} />`,
          "const m = { value: 'a' };\n",
        ),
      );
      expect(namesElement(code, tag)).toBe(true);
      expect(code).toContain('vModelText');
    },
  );

  it('carries the modelled value into the committed payload', async () => {
    const code = await compileSfc(
      sfcSource(`<text-input testID="${TEST_ID}" v-model="m" />`, SETUP),
      '/sfc-model-payload.vue',
    );
    const node = subject(await mountArm(evaluate(code)));
    expect(node.props.text).toBe('a');
  });
});
