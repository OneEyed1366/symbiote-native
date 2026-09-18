// The correctness backing for `babel-jsx.cjs`'s `optimize: true` default (`@vue/babel-plugin-jsx`'s
// PatchFlags/SlotFlags for JSX — see the plugin's own README: "the optimized code may skip certain
// re-renders... we strongly recommend thorough testing").
//
// WHY THIS MATTERS FOR PERFORMANCE. `vue-row-component-shape-cost.itest.ts` (core/engine/cpp/tests
// /js/) measured that a stateful Vue component pays for `hasPropsChanged`'s full
// `Object.keys(nextProps)` walk on every patch, even when nothing changed. PatchFlags let Vue skip
// straight to the flagged dynamic keys instead — the same lever `.vue` SFCs already get for free
// from `@vue/compiler-sfc`'s template compiler (unconditional, default ON). TSX apps compiled
// through `@vue/babel-plugin-jsx` did NOT get it before `babel-jsx.cjs` passed `optimize: true`.
//
// WHY THIS IS A CORRECTNESS TEST, NOT A PERF TEST. Flipping this default without verifying it can
// silently make a real app under-render — the failure mode is a stale screen, not a crash. This
// reuses `fold-parity.test.ts`'s own harness (compile through the real `symbioteVueJsx()` config,
// mount through the real renderer, read back the committed payload) with `optimize` toggled per
// case, and drives the update patterns the plugin's docs single out as risky: conditional branches
// and keyed list reordering, neither of which `fold-parity.test.ts` exercises (it only ever writes
// one changing prop on one static element) — plus the shape that actually motivated the default, a
// stateful child COMPONENT whose prop is a nested field of a freshly-allocated object.
//
// NOT VERIFIED: on-device, under Hermes, or against the SFC's own compiled output (a `.vue` file
// never goes through this plugin at all). If a real TSX app under-renders after this default
// landed, that combination is the first thing to add a case for here, and `optimize: false` in the
// app's own `symbioteVueJsx()` call is the immediate mitigation while it is investigated.

import { describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import ts from 'typescript';
import type { Component, Ref } from '@vue/runtime-core';
import * as engine from '@symbiote-native/engine';
import { clearGlobalStyles } from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import { mount, unmount } from '@symbiote-native/vue';
import './src/register';
import {
  createLiveTree,
  installRecordingFabric,
  waitUntil,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import * as runtimeHelpers from './src/runtime-helpers';
import { nextTick, ref } from './src/runtime-helpers';
import symbioteVueJsx from './babel-jsx.cjs';

const ROOT_TAG = 9922;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const flag: Ref<boolean> = ref(true);
const count: Ref<number> = ref(0);
const items: Ref<{ id: number; label: string }[]> = ref([
  { id: 1, label: 'a' },
  { id: 2, label: 'b' },
  { id: 3, label: 'c' },
]);

const moduleRequire = (specifier: string): unknown => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  if (specifier === 'vue') return runtimeHelpers;
  if (specifier === '#fixture') return { flag, count, items };
  throw new Error(
    `compiled arm required an unexpected specifier: ${specifier}`,
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
  const component = evaluated.exports.default;
  if (typeof component !== 'object' || component === null) {
    throw new Error('the compiled arm has no default-exported component');
  }
  return component as Component;
}

/** Compiles `body` through the REAL babel-jsx config, with `optimize` toggled. */
async function jsxArm(body: string, optimize: boolean): Promise<Component> {
  const result = await transformAsync(
    `import { flag, count, items } from '#fixture';
import { defineComponent } from '@symbiote-native/vue/runtime-helpers';
export default defineComponent({ setup() { return () => ${body}; } });`,
    {
      filename: 'optimize-flag-safety.jsx',
      babelrc: false,
      configFile: false,
      plugins: symbioteVueJsx({ optimize }),
    },
  );
  return evaluate(result?.code ?? '');
}

function committedPayloads(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (node: ILiveNode): void => {
    out.push(node.payload);
    for (const child of node.children) walk(child);
  };
  for (const child of live.nodeOf(live.appRoot()).children) walk(child);
  return out;
}

async function mountAndSettle(component: Component): Promise<void> {
  fabric.reset();
  clearGlobalStyles();
  mount(ROOT_TAG, component);
  await waitUntil(() => fabric.commits > 0, 'the Vue commit');
}

async function settleAfter(action: () => void): Promise<void> {
  action();
  await nextTick();
  // A settle with no oracle would pass on a stale tree too — give the (possibly skipped) commit a
  // real turn, then read whatever landed.
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('optimize: true — a prop write after mount still recommits', () => {
  it.each([false, true])('optimize=%s', async optimize => {
    count.value = 0;
    const component = await jsxArm(
      '<text id={String(count.value)} />',
      optimize,
    );
    await mountAndSettle(component);
    expect(committedPayloads()).toEqual([{ nativeID: '0' }]);

    await settleAfter(() => {
      count.value = 1;
    });
    expect(
      committedPayloads(),
      `optimize=${String(optimize)}: a changed prop must recommit`,
    ).toEqual([{ nativeID: '1' }]);
    unmount(ROOT_TAG);
  });
});

describe('optimize: true — a conditional branch still switches', () => {
  it.each([false, true])('optimize=%s', async optimize => {
    flag.value = true;
    const component = await jsxArm(
      'flag.value ? <text id="on" /> : <text id="off" />',
      optimize,
    );
    await mountAndSettle(component);
    expect(committedPayloads()).toEqual([{ nativeID: 'on' }]);

    await settleAfter(() => {
      flag.value = false;
    });
    expect(
      committedPayloads(),
      `optimize=${String(optimize)}: the branch must flip`,
    ).toEqual([{ nativeID: 'off' }]);
    unmount(ROOT_TAG);
  });
});

describe('optimize: true — a child COMPONENT still re-renders on a changed prop', () => {
  // The scenario `vue-row-component-shape-cost.itest.ts` actually measures: a stateful CHILD
  // COMPONENT (not a bare intrinsic tag), whose props include a nested object read only partway
  // (`row.label`, not `row` itself). PatchFlags on a component vnode take a different branch
  // (`shouldUpdateComponent`'s `patchFlag & 16` / `& 8`) than on an element, and that branch is
  // exactly what a stateful "Row" component goes through — the case `fold-parity.test.ts` and the
  // two describes above never touch, since neither drives a JSX COMPONENT child.
  it.each([false, true])('optimize=%s', async optimize => {
    items.value = [{ id: 1, label: 'first' }];
    // Row must be declared INSIDE the compiled module so the JSX transform sees it as a component
    // identifier, not an intrinsic tag — `jsxArm`'s fixed setup-only template can't express that.
    const result = await transformAsync(
      `import { items } from '#fixture';
import { defineComponent } from '@symbiote-native/vue/runtime-helpers';
const Row = defineComponent({
  props: { row: { type: Object } },
  render() { return <text id={this.row.label} />; },
});
export default defineComponent({ setup() { return () => (
  <view>{items.value.map(item => <Row key={item.id} row={item} />)}</view>
); } });`,
      {
        filename: 'optimize-flag-safety-component.jsx',
        babelrc: false,
        configFile: false,
        plugins: symbioteVueJsx({ optimize }),
      },
    );
    const component = evaluate(result?.code ?? '');

    await mountAndSettle(component);
    expect(committedPayloads().map(p => p.nativeID)).toEqual([
      undefined,
      'first',
    ]);

    // Same row id/key, a NEW row object, a changed nested field — precisely what the benchmark's
    // "partial" step does, and precisely the case a patchFlag pointed at the wrong dynamic key
    // would miss.
    await settleAfter(() => {
      items.value = [{ id: 1, label: 'second' }];
    });
    expect(
      committedPayloads().map(p => p.nativeID),
      `optimize=${String(optimize)}: the child component must re-render on the new row`,
    ).toEqual([undefined, 'second']);
    unmount(ROOT_TAG);
  });
});

describe('optimize: true — a keyed list still reorders', () => {
  it.each([false, true])('optimize=%s', async optimize => {
    items.value = [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ];
    const component = await jsxArm(
      '<view>{items.value.map(item => <text key={item.id} id={item.label} />)}</view>',
      optimize,
    );
    await mountAndSettle(component);
    expect(committedPayloads().map(p => p.nativeID)).toEqual([
      undefined,
      'a',
      'b',
      'c',
    ]);

    await settleAfter(() => {
      items.value = [items.value[2], items.value[0], items.value[1]];
    });
    expect(
      committedPayloads().map(p => p.nativeID),
      `optimize=${String(optimize)}: the reorder must land`,
    ).toEqual([undefined, 'c', 'a', 'b']);
    unmount(ROOT_TAG);
  });
});
