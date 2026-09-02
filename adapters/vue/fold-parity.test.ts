// The runtime folds (`id` -> `nativeID`, RN's two Text defaults) asserted on EVERY Vue path that
// can reach a host node: the component wrapper, the SFC transformer's lowered output, and the
// JSX/TSX plugin's lowered output.
//
// WHY THIS FILE EXISTS. A lowered element inherits nothing the wrapper used to do — defaults,
// aliases, bug folds. Angular lost both Text defaults AND `id` -> `nativeID` exactly that way:
// silently, on every app, visible only on a device. Vue applies both folds in the RENDERER
// (`PROP_ALIASES` and `TEXT_DEFAULTS` in src/renderer/index.ts) rather than in a transform,
// specifically because that layer sits under all four Vue paths at once. This file is the proof of
// that claim rather than a restatement of it — the placement argument is sound and would stay
// sound while a fold quietly stopped running.
//
// WHY THE ORACLE IS THE COMMITTED PAYLOAD, KEY BY KEY. A count agrees for the wrong reasons: two
// payloads of equal size can differ in which keys they carry, and a whole day was lost to a
// cross-adapter comparison made on totals. Every arm is compared as a full `{key: value}` record
// of what reached Fabric — a rename that produces the right key with the wrong value fails too.
//
// AND WHY COMPARING THE ARMS IS NOT ENOUGH ON ITS OWN. Both folds live in the RENDERER, which sits
// under all three arms — so deleting one moves every arm the same way and a three-way agreement
// check stays green on a completely broken fold. Break-tested: emptying `PROP_ALIASES` left four of
// five cases passing. So each case also pins the payload it must produce, ABSOLUTELY. The two
// assertions catch different things and neither is redundant: cross-arm catches a fold that a
// transform breaks for one path only, absolute catches a fold that stops running for everyone.
//
// WHY BOTH TRANSFORMS, RUN SEPARATELY. Vue is the only adapter with two lowering paths, and they
// cannot share plumbing: `@vue/compiler-sfc` hands a transform an expression as SOURCE TEXT while
// the JSX path holds a Babel AST. `lowering-parity.test.ts` covers whether they agree on WHAT to
// lower; this file covers whether a lowered element still carries what the wrapper did.

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { transformAsync } from '@babel/core';
import type { Component, Ref } from '@vue/runtime-core';
import * as engine from '@symbiote-native/engine';
import { clearGlobalStyles } from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import {
  mount,
  unmount,
  Pressable as PressableComponent,
  Text as TextComponent,
  View as ViewComponent,
} from '@symbiote-native/vue';
import {
  installFabric,
  waitUntil,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import * as runtimeHelpers from './src/runtime-helpers';
import { defineComponent, h, nextTick, ref } from './src/runtime-helpers';
import metroVueTransformer from './metro-vue-transformer.cjs';
import symbioteVueJsx from './babel-jsx.cjs';

const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;

const ROOT_TAG = 9911;
const fabric = installFabric();

// The mutable prop the post-mount case drives. A module-level ref rather than a component-local
// one so all three arms read the SAME source and the test can write it from outside.
const liveId: Ref<string> = ref('before');

// `#fixture` is how the two compiled arms reach that ref: an SFC's `<script setup>` and the JSX
// source both import it by specifier, and the shim below hands back this module's own object.
const moduleRequire = (specifier: string): unknown => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  // The JSX plugin emits `from "vue"`; Metro rewrites that specifier to the adapter's shim.
  if (specifier === 'vue') return runtimeHelpers;
  if (specifier === '#fixture')
    return {
      liveId,
      makeId: () => 'computed',
      bag: { id: 'x', class: 'k', testID: 't' },
    };
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

const FIXTURE_IMPORTS = `import { View, Text, Pressable } from '@symbiote-native/vue';
import { liveId, makeId, bag } from '#fixture';`;

async function sfcArm(template: string): Promise<Component> {
  const source = `<script setup lang="ts">
${FIXTURE_IMPORTS}
</script>
<template>${template}</template>`;
  return evaluate(await compileSfc(source, '/fold-parity/Arm.vue'));
}

async function jsxArm(body: string): Promise<Component> {
  const result = await transformAsync(
    `${FIXTURE_IMPORTS}
import { defineComponent } from '@symbiote-native/vue/runtime-helpers';
export default defineComponent({ setup() { return () => ${body}; } });`,
    {
      filename: 'fold-parity.jsx',
      babelrc: false,
      configFile: false,
      plugins: symbioteVueJsx(),
    },
  );
  return evaluate(result?.code ?? '');
}

/** Every committed node's payload, in tree order, minus RN's synthetic AppContainer. */
function committedPayloads(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      out.push(node.props);
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return out.slice(1);
}

async function render(
  component: Component,
): Promise<Array<Record<string, unknown>>> {
  fabric.reset();
  clearGlobalStyles();
  mount(ROOT_TAG, component);
  await waitUntil(() => fabric.counts.completeRoot > 0, 'the Vue commit');
  const payloads = committedPayloads();
  unmount(ROOT_TAG);
  return payloads;
}

// The three arms of one case. `component` is written with h() against the real wrapper, which is
// the reference: it is the path that has always folded correctly.
type IFoldCase = {
  what: string;
  sfc: string;
  jsx: string;
  component: () => unknown;
  // What must reach Fabric, per committed node in tree order. The half of the oracle that survives
  // a fold being deleted from the layer all three arms share.
  expected: ReadonlyArray<Record<string, unknown>>;
};

const CASES: readonly IFoldCase[] = [
  {
    what: 'a static id on a View',
    sfc: '<View id="x" />',
    jsx: '<View id="x" />',
    component: () => h(ViewComponent, { id: 'x' }),
    expected: [{ nativeID: 'x' }],
  },
  {
    // A bound value the transform cannot read as a literal — the shape that would break a
    // compile-time rename reading the attribute's text.
    what: 'a computed id the transform cannot read literally',
    sfc: '<View :id="makeId()" />',
    jsx: '<View id={makeId()} />',
    component: () => h(ViewComponent, { id: 'computed' }),
    expected: [{ nativeID: 'computed' }],
  },
  {
    // Pressable's only fold is the same alias, and it reaches the node through the same patchProp
    // line as View's. Pinned anyway rather than argued from placement — that argument is exactly
    // what this file exists to stop trusting.
    what: 'a static id on a lowered Pressable',
    sfc: '<Pressable id="p" />',
    jsx: '<Pressable id="p" />',
    component: () => h(PressableComponent, { id: 'p' }),
    expected: [{ nativeID: 'p' }],
  },
  {
    // The aria/role fold, which the engine now applies in `fabricProps` — the one point that sees
    // the whole bag on both commit paths. Native reads only the `accessibility*` names, so the
    // proof is that the aliases are CONSUMED, not merely accompanied: a payload carrying both is
    // the failure this case exists to catch, and full-payload equality states that without a
    // separate "not.toHaveProperty" per alias.
    what: 'role and aria-label fold into accessibility* and leave no alias behind',
    sfc: '<View role="button" aria-label="x" />',
    jsx: '<View role="button" aria-label="x" />',
    component: () => h(ViewComponent, { role: 'button', 'aria-label': 'x' }),
    expected: [{ accessibilityRole: 'button', accessibilityLabel: 'x' }],
  },
  {
    // RULE ONE — for a scalar, the explicit prop WINS and the alias only fills a hole.
    //
    // This is also the double-fold case. `resolveAccessibilityProps` (the wrapper's fold) now
    // delegates to the same `foldAriaProps` the engine runs in `fabricProps`, so the component arm
    // passes through it TWICE. That must be a no-op: pass 1 blanks every alias, so pass 2 finds
    // nothing and hands the bag back. A second pass that re-derived from the aliases would
    // overwrite 'explicit' with 'alias' here — and only on the wrapper arm, which is why the arms
    // are compared to each other and not just to `expected`.
    what: 'an explicit accessibilityLabel beats aria-label, and survives a second fold',
    sfc: '<View accessibility-label="explicit" aria-label="alias" />',
    jsx: '<View accessibilityLabel="explicit" aria-label="alias" />',
    component: () =>
      h(ViewComponent, {
        accessibilityLabel: 'explicit',
        'aria-label': 'alias',
      }),
    expected: [{ accessibilityLabel: 'explicit' }],
  },
  {
    // RULE TWO — inside a composite the polarity INVERTS: the alias wins PER FIELD, and the
    // composite is rebuilt as a fresh literal rather than merged. `checked` comes from the alias
    // even though an explicit `accessibilityState` set it, while `busy` survives from the explicit
    // object. An adapter that copied rule one "by analogy" collapses the two into one rule and
    // yields `checked: false` — with every component-level test still green, because the wrapper
    // path happens to agree.
    what: 'aria-checked wins per field inside an explicit accessibilityState',
    sfc: '<View :accessibility-state="{ checked: false, busy: true }" :aria-checked="true" />',
    // Hyphenated in JSX too, deliberately: RN's public prop IS `aria-checked` and the camelCase
    // spelling is only View.js's own destructuring alias, so `ariaChecked={true}` would be a key
    // nothing folds. Writing it that way here failed this case once — correctly.
    jsx: '<View accessibilityState={{ checked: false, busy: true }} aria-checked={true} />',
    component: () =>
      h(ViewComponent, {
        accessibilityState: { checked: false, busy: true },
        'aria-checked': true,
      }),
    expected: [
      {
        accessibilityState: {
          busy: true,
          checked: true,
          disabled: undefined,
          expanded: undefined,
          selected: undefined,
        },
      },
    ],
  },
  {
    // A spread LOWERS on `View`, and this pins that it is correct to. The reason is narrower than
    // "Vue folds at runtime, so a spread is harmless" — that holds for `id -> nativeID` and NOT in
    // general: Vue takes two decisions from the attribute list that no runtime write can replay
    // (which intrinsic tag, and specialising a functional style), and a spread must refuse both.
    // `View` takes neither, which is why refusing here would cost a common pattern for a hazard it
    // cannot have. The two that must refuse are pinned in spread-hazard.test.ts, with controls.
    what: 'a spread-carried bag lands the same payload as the wrapper',
    sfc: '<View v-bind="bag" />',
    jsx: '<View {...bag} />',
    component: () => h(ViewComponent, { id: 'x', class: 'k', testID: 't' }),
    expected: [{ nativeID: 'x', testID: 't' }],
  },
  {
    what: "RN's two Text defaults on a bare Text",
    sfc: '<Text>hi</Text>',
    jsx: '<Text>hi</Text>',
    component: () => h(TextComponent, null, () => 'hi'),
    expected: [
      { ellipsizeMode: 'tail', allowFontScaling: true },
      { text: 'hi' },
    ],
  },
  {
    // `notFalse`, not `nullish`: only a literal false opts out, and the key is emitted either way.
    what: 'an explicit allowFontScaling=false beside an id',
    sfc: '<Text id="t" :allow-font-scaling="false">hi</Text>',
    jsx: '<Text id="t" allowFontScaling={false}>hi</Text>',
    component: () =>
      h(TextComponent, { id: 't', allowFontScaling: false }, () => 'hi'),
    expected: [
      { ellipsizeMode: 'tail', allowFontScaling: false, nativeID: 't' },
      { text: 'hi' },
    ],
  },
];

describe('every Vue path folds id and the Text defaults identically', () => {
  it.each(CASES)('$what', async testCase => {
    const [component, sfc, jsx] = [
      await render(
        defineComponent({ setup: () => () => testCase.component() }),
      ),
      await render(await sfcArm(testCase.sfc)),
      await render(await jsxArm(testCase.jsx)),
    ];

    expect(sfc, 'the SFC-lowered payload must match the wrapper').toEqual(
      component,
    );
    expect(jsx, 'the JSX-lowered payload must match the wrapper').toEqual(
      component,
    );
    // Absolute, so a fold deleted from the renderer — under all three arms at once — cannot pass
    // by moving them together.
    expect(component, 'the wrapper must fold what RN folds').toEqual(
      testCase.expected,
    );
  });

  // The update path, not the mount path: `patchProp` is where both folds actually live, and a
  // transform that folded at compile time would cover the first write and not this one.
  it('folds a prop written after mount, on both lowered paths', async () => {
    const arms: ReadonlyArray<readonly [string, Component]> = [
      [
        'component',
        defineComponent({
          setup: () => () => h(ViewComponent, { id: liveId.value }),
        }),
      ],
      ['sfc', await sfcArm('<View :id="liveId" />')],
      ['jsx', await jsxArm('<View id={liveId.value} />')],
    ];

    for (const [label, component] of arms) {
      liveId.value = 'before';
      fabric.reset();
      clearGlobalStyles();
      mount(ROOT_TAG, component);
      await waitUntil(() => fabric.counts.completeRoot > 0, `${label} mount`);
      expect(committedPayloads(), `${label} on mount`).toEqual([
        { nativeID: 'before' },
      ]);

      liveId.value = 'after';
      await nextTick();
      await waitUntil(
        () => committedPayloads()[0]?.nativeID === 'after',
        `${label} to recommit`,
      );
      expect(committedPayloads(), `${label} after the write`).toEqual([
        { nativeID: 'after' },
      ]);
      unmount(ROOT_TAG);
    }
  });
});
