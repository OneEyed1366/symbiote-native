// Vue's arm of the equivalence oracle: mount each lowered primitive as a COMPONENT and as a LOWERED
// intrinsic with the same props, and require the two committed Fabric trees to be identical.
// `core/test-utils/src/lowering-equivalence.ts` holds the canonicaliser and the assertions and its
// header holds the why; this file supplies Vue's mounts.
//
// TWO PATHS, because Vue has two compilers and they cannot share plumbing — `@vue/compiler-sfc`
// hands the transform an expression as SOURCE TEXT while the JSX path already has the AST. One rule
// reaching two mechanisms is the drift shape this repo treats as P0, so the arms are built per path
// and then compared to EACH OTHER; that cross-path row is the one no other adapter can run.
//
// Each arm compiles a REAL SOURCE FILE per spelling — the component one and the bare-tag one — and
// mounts what the compiler produced. Mounting `h(Component)` by hand would compare two hand-built
// trees and never the compiler's, which is the half this oracle exists for.

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import * as babel from '@babel/core';
import { defineComponent, h, type Component } from '@vue/runtime-core';
import * as sfcCompiler from '@vue/compiler-sfc';
import * as vueRuntime from '@vue/runtime-core';
import * as engine from '@symbiote-native/engine';
import * as vueAdapter from '@symbiote-native/vue';
import { mount, unmount } from '@symbiote-native/vue';
import {
  compareLoweringEquivalence,
  expectCommittedProps,
  assertCommittedSomething,
  waitForQuiet,
  installFabric,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import * as runtimeHelpers from './src/runtime-helpers';
import metroVueTransformer from './metro-vue-transformer.cjs';
import vueJsx from '@vue/babel-plugin-jsx';
import symbioteVueJsx from './babel-jsx.cjs';

const ROOT_TAG = 9401;
const TEST_ID = 'probe';
const {
  compileSfc,
}: { compileSfc: (s: string, f: string) => Promise<string> } =
  metroVueTransformer;
const fabric = installFabric();
// SETTLE BY SAMPLING, never on a fixed tick count. Wrappers do not all settle in the same number
// of ticks — one whose effect syncs attachments takes more than a pure render — so a fixed count
// reads a half-built tree for some primitives and a finished one for others. A half-built tree is
// EXACTLY the shape this oracle exists to detect, which makes it the worst failure mode available
// here: measured on Svelte's arm as two runs of identical code reporting two failures and then
// four, with primitives joining and leaving the list. Counted deep rather than at the root, so a
// tree still filling in below a committed root is not mistaken for quiet.

const moduleRequire = (specifier: string): unknown => {
  if (specifier === '@symbiote-native/engine') return engine;
  if (specifier === '@symbiote-native/vue/runtime-helpers')
    return runtimeHelpers;
  if (specifier === '@symbiote-native/vue') return vueAdapter;
  // The stock SFC compiler and @vue/babel-plugin-jsx both emit `from "vue"`; only the transformed
  // arm has its imports retargeted at the runtime-helpers shim, so the component arm needs this.
  if (specifier === 'vue' || specifier === '@vue/runtime-core')
    return vueRuntime;
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
  return evaluated.exports.default as Component;
}

// Arms are taken SEQUENTIALLY and SNAPSHOT, never held as a live reference. Both share one fake
// Fabric and one root tag, so a `Promise.all` over two arms interleaves their mounts and each
// `fabric.reset()` wipes the other — measured here as "child count differs — component 1, lowered
// 0" on all eight primitives at once, which reads as a total lowering failure and is a harness bug.
function deepCount(nodes: readonly IFakeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + deepCount(node.children), 0);
}

function snapshot(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.map(node => ({
    ...node,
    props: { ...node.props },
    children: snapshot(node.children),
  }));
}

async function mountArm(component: Component): Promise<readonly IFakeNode[]> {
  fabric.reset();
  mount(ROOT_TAG, defineComponent({ setup: () => () => h(component) }));
  await waitForQuiet(
    () => deepCount(fabric.committed),
    'the mount to stop committing',
  );
  const committed = snapshot(fabric.committed);
  unmount(ROOT_TAG);
  return committed;
}

// `id` rather than a per-primitive prop: every entry in HOST_PRIMITIVES carries `ID_ALIAS`, so this
// exercises a real fold on all eight from the SPEC rather than from a hand-written table.
// The two arms differ in what the APP WROTE, not in how it was compiled. Until 2026-09-08 the tag
// arm was produced by running a lowering transform over the component source; the transform is
// retired — an app writes the tag itself — so the fixture authors both spellings and one compiler
// pipeline handles each.
const ATTRS = `id="${TEST_ID}" testID="${TEST_ID}"`;

const sfcSource = (name: string): string =>
  `<script setup lang="ts">\nimport { ${name} } from '@symbiote-native/vue';\n</script>\n` +
  `<template><${name} ${ATTRS} /></template>`;

// The block carries a statement because @vue/compiler-sfc drops an EMPTY one, and the adapter's
// transformer refuses an SFC with no script at all. A bare tag needs no import — that is the point
// of the arm — so the statement is inert.
const sfcTagSource = (tag: string): string =>
  `<script setup lang="ts">\nconst __tagArm = true;\n</script>\n` +
  `<template><${tag} ${ATTRS} /></template>`;

const tsxSource = (name: string): string =>
  `import { ${name} } from '@symbiote-native/vue';\n` +
  `import { defineComponent } from '@vue/runtime-core';\n` +
  `export default defineComponent(() => () => <${name} ${ATTRS} />);`;

const tsxTagSource = (tag: string): string =>
  `import { defineComponent } from '@vue/runtime-core';\n` +
  `export default defineComponent(() => () => <${tag} ${ATTRS} />);`;

interface IArm {
  committed: readonly IFakeNode[];
  /** The compiled TEXT, kept so distinctness can be witnessed at the source rather than guessed. */
  code: string;
}

async function sfcArm(name: string, lowered: boolean): Promise<IArm> {
  if (lowered) {
    // The adapter's own SFC pipeline, which is what an app runs: it supplies the isCustomElement
    // a hyphenated tag needs, or the compiler would emit resolveComponent and mount nothing.
    const tag = HOST_PRIMITIVES[name].intrinsic;
    const code = await compileSfc(sfcTagSource(tag), `/tag-${name}.vue`);
    return { committed: await mountArm(evaluate(code)), code };
  }
  // The stock compiler, with no nodeTransform and no isCustomElement: the component spelling,
  // which is what the tag arm has to agree with.
  const { descriptor } = sfcCompiler.parse(sfcSource(name), {
    filename: `/cmp-${name}.vue`,
  });
  const script = sfcCompiler.compileScript(descriptor, {
    id: `cmp${name}`,
    inlineTemplate: true,
  });
  const code = `${script.content.replace('export default', 'const __c =')}\nexport default __c;`;
  return { committed: await mountArm(evaluate(code)), code };
}

async function tsxArm(name: string, lowered: boolean): Promise<IArm> {
  // symbioteVueJsx pairs the plugin with the isCustomElement a hyphenated tag needs; the component
  // arm takes the bare plugin, since a capitalized name never consults that option.
  const source = lowered
    ? tsxTagSource(HOST_PRIMITIVES[name].intrinsic)
    : tsxSource(name);
  const out = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: `${name}.tsx`,
    presets: [
      ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
    ],
    plugins: lowered ? symbioteVueJsx() : [[vueJsx, {}]],
  });
  const code = out?.code ?? '';
  return { committed: await mountArm(evaluate(code)), code };
}

// Primitives with NO component spelling left, so there is nothing for the tag arm to be equal TO.
//
// NAMED, and it replaced a derivation that looked stronger and was not: the filter here read
// `descriptorFor(intrinsic).component !== ANCHOR_COMPONENT`, which described
// `touchable-native-feedback` by ACCIDENT — that primitive is both wrapperless and nodeless, and
// the filter keyed on the second. `Button` is wrapperless and an ordinary `RCTView`, so it walked
// straight through and this file asked for a component that no longer exists. Wrapperlessness is
// not visible in the descriptor table, and no other table in the repo carries it.
//
// Safe in BOTH directions, which is what a subtraction from a derived list buys: a NEW primitive is
// not in here, joins `NAMES`, and fails below for want of a mount; a primitive whose wrapper is
// deleted without an entry here fails on its component arm. Each member's own coverage is its
// `src/*-tag.test.ts` (node count + a fold) plus the behavior's own suite in `core/components`.
const TAG_ONLY: readonly string[] = [
  'TouchableNativeFeedback',
  'TouchableWithoutFeedback',
  'Button',
  'ImageBackground',
  // Wrapperless since 2026-09-09, same shape as `Button`: the behavior builds RN's centering View
  // plus the native spinner (ActivityIndicator.js:112), so there is no component spelling left to
  // compare against. Coverage is `src/activity-indicator-tag.test.ts` (node count + the routing
  // split) and `core/components/src/behaviors/activity-indicator/activity-indicator.test.ts`.
  'ActivityIndicator',
  // Wrapperless since 2026-09-10. Each was a pure passthrough over one tag — attrs normalized, aria
  // folded, one `h()` — and every one of those folds now runs below all four Vue paths: kebab->camel
  // and `id -> nativeID` in `renderer/index.ts`'s `patchProp`, aria/role in the engine's
  // `fabricProps`, and each primitive's own mapping in its `register`ed behavior. Coverage is
  // `src/<name>-tag.test.ts` (the fold, on the tag) plus the behavior's suite in `core/components`.
  'SafeAreaView',
  'InputAccessoryView',
  'RefreshControl',
  'Image',
  'View',
  'Text',
  'Pressable',
  'TextInput',
  'Switch',
  // Spec entries only since 2026-09-11 — their tags and behaviors predate them, and the entry is
  // what puts them in Vue's element set. They arrive here rather than in `NAMES` because the
  // withholding condition was "the wrappers collapse", and what happened instead is that every
  // wrapper was deleted: there has never been a component spelling for these three to be equal to.
  'TouchableOpacity',
  'TouchableHighlight',
  'ScrollView',
];

// EVERY primitive the spec declares is now tag-only on Vue, so the comparison above has no rows
// left to run and this file's remaining value is the guard below: it fails the day a name leaves
// `HOST_PRIMITIVES` or a wrapper comes back. What replaced the comparison is ABSOLUTE — the tag has
// to commit the right payload on its own, with nothing to be equal to — and lives in
// `src/fold-only-tags.test.ts`, `src/renderer/tag-fold-parity.test.ts` and `fold-parity.test.ts`.
// Keep the machinery: a sixth adapter, or a primitive that regains a component spelling, needs it.

const NAMES = Object.keys(HOST_PRIMITIVES).filter(
  name => !TAG_ONLY.includes(name),
);

// Vue's substitute for the shared `assertArmsAreDistinct`, which is NOT usable here. That control
// compares RETAINED NODE COUNTS, on the premise that a component form allocates a wrapper node the
// lowered form does not. That premise is a fact about Svelte and Angular, not about Vue: a Vue
// component — functional or stateful — allocates no host node at all, so both arms retain exactly
// one node for every primitive on both paths, and the control fails every correct row.
//
// The discriminator that does hold is at the SOURCE. The lowered arm's compiled text names the
// intrinsic as a string literal and the component arm's names an imported identifier, so the two
// are told apart by what the compiler PRINTED rather than by what the mount allocated.
//
// Matched WITH ITS QUOTES, never as a bare substring: `text-input` is a prefix of
// `text-input-multiline` and of the two `-managed` spellings, so `includes(tag)` reads any
// of the four as "lowered" and a transform emitting the wrong sibling would report correct.
function assertPathsAreDistinct(
  component: IArm,
  lowered: IArm,
  tag: string,
): string[] {
  const marker = `"${tag}"`;
  const differences: string[] = [];
  if (!lowered.code.includes(marker)) {
    differences.push(
      `the lowered arm's compiled output does not name ${marker} — it did not lower, so the ` +
        `comparison below is component-against-component and cannot fail`,
    );
  }
  if (component.code.includes(marker)) {
    differences.push(
      `the component arm's compiled output names ${marker} — the transform ran on the arm that ` +
        `must stay un-lowered, so both arms are the same path`,
    );
  }
  return differences;
}

describe('the spec still declares something worth comparing', () => {
  // The block that survives every row leaving. Without it, `describe.each([])` runs nothing and the
  // file is green whatever the spec says — the same "satisfiable by the DATA going quiet" shape as
  // an empty `HOST_PRIMITIVES`, reached from the other side now that TAG_ONLY covers all of it.
  it('names every spec primitive, and no primitive it does not', () => {
    expect(Object.keys(HOST_PRIMITIVES).length).toBeGreaterThan(0);
    // A `TAG_ONLY` member the spec no longer names excludes nothing and reads as a live exclusion.
    expect(
      TAG_ONLY.filter(name => HOST_PRIMITIVES[name] === undefined),
      'a tag-only entry names no primitive — the exclusion is stale',
    ).toEqual([]);
    // The demand this file now makes: a NEW primitive is not in TAG_ONLY, so it lands in NAMES and
    // fails below for want of a component to mount — which is the correct question to ask of it.
    // Every primitive being tag-only is today's answer, not a permanent one.
    expect(
      NAMES,
      'a primitive is outside TAG_ONLY, so it claims a component spelling — mount it or list it',
    ).toEqual([]);
  });
});

describe.each(NAMES)('%s: the two spellings commit one tree', name => {
  // The absolute expectation, derived from the entry rather than restated: `id` is what the source
  // writes, `nativeID` is what the fold PRODUCES. An expectation naming `id` would pass with the
  // fold deleted.
  //
  // Compared by KEY LOOKUP, never by substring — `id` is a substring of `nativeID`, so an oracle
  // written `includes('id')` matches the alias's own output and can never fail in the one direction
  // it exists to check.
  const folded = { [HOST_PRIMITIVES[name].aliases.id]: TEST_ID };
  const tag = HOST_PRIMITIVES[name].intrinsic;

  async function check(
    path: 'SFC' | 'TSX',
    arm: (name: string, lowered: boolean) => Promise<IArm>,
  ): Promise<void> {
    const component = await arm(name, false);
    const lowered = await arm(name, true);

    expect(assertPathsAreDistinct(component, lowered, tag)).toEqual([]);
    expect(
      assertCommittedSomething(component.committed, `${path} component`)
        .differences,
    ).toEqual([]);
    expect(
      assertCommittedSomething(lowered.committed, `${path} lowered`)
        .differences,
    ).toEqual([]);
    expect(
      compareLoweringEquivalence(component.committed, lowered.committed)
        .differences,
    ).toEqual([]);
    expect(
      expectCommittedProps(lowered.committed, TEST_ID, folded).differences,
    ).toEqual([]);
  }

  it('SFC: lowered matches component, and the fold ran', async () => {
    await check('SFC', sfcArm);
  });

  it('TSX: lowered matches component, and the fold ran', async () => {
    await check('TSX', tsxArm);
  });

  // The row no other adapter can run. Two compilers, one rule; if they commit different trees for
  // the same source the app's `.vue` and `.tsx` files disagree about the same primitive.
  it('the two Vue paths agree with each other', async () => {
    const fromSfc = await sfcArm(name, true);
    const fromTsx = await tsxArm(name, true);

    expect(
      compareLoweringEquivalence(fromSfc.committed, fromTsx.committed)
        .differences,
    ).toEqual([]);
  });
});
