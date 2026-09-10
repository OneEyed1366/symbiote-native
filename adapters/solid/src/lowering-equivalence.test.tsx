// Solid's arm of the equivalence oracle: mount every lowered primitive TWICE — once as the
// component, once as the bare intrinsic — and require the two committed Fabric trees to be
// identical. `core/test-utils/src/lowering-equivalence.ts` holds the canonicaliser and the
// assertions; the mounts are per-framework by construction and live here.
//
// TWO ASSERTIONS PER CASE, and the helper's header explains why neither is redundant:
//   compareLoweringEquivalence  catches a fold ONE path lost      (a transform that forgot it)
//   expectCommittedProps        catches a fold EVERYONE lost      (the layer itself broke)
// Measured on Vue: emptying PROP_ALIASES killed the `id` fold and 4 of 5 cases stayed green under
// comparison alone, because a fold living in a layer BOTH arms traverse — Solid's renderer is
// exactly that — moves both arms identically and they still agree.
//
// THE CONTROL IS NOT `assertArmsAreDistinct`, AND THAT IS MEASURED RATHER THAN PREFERRED. That
// helper's premise is "a component form allocates a wrapper the lowered form does not, so the
// retained node counts cannot be equal". False here: a Solid component is a plain function
// returning the same host node, so both arms census byte-identically —
// {"nodes":1,"anchors":0,"renderable":1} for `View` either way. Using it would redden every correct
// arm. It holds for Svelte (block anchors) and Angular (a per-component host); React measured false
// too. So each adapter owes a discriminator whose premise holds for IT, and Solid's is
// compile-time: the two spellings compile to different calls, which is the mechanism that is
// actually load-bearing here.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transformAsync } from '@babel/core';
import presetSolid from 'babel-preset-solid';
import { createRequire } from 'node:module';
import {
  assertCommittedSomething,
  compareLoweringEquivalence,
  expectCommittedProps,
  installFabric,
  type IFakeNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT, and the arm is worthless without it. `register.ts` is what calls
// `registerTextInputBehavior()` / `registerImageBehavior()`, and a behavior's `foldPayload` is the
// lowered path's ONLY source for folds that do not live in `foldHostBag`. Importing the components
// directly — as this file does, and as no app does — skips it, and the first run reported three
// "missing fold" differences that were the harness, not the product.
import './register';
import type { JSX } from './jsx-runtime';
import { mount, unmount } from './render';
import { Pressable } from './components/pressable';
import { TextInput } from './components/text-input';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);

const COMPONENT_ROOT = 9_301;
const LOWERED_ROOT = 9_302;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// SAMPLED, never a fixed count. Svelte's arm settled on a fixed number of ticks and then disagreed
// with ITSELF between runs, because a wrapper carrying an effect needs more ticks than a pure
// render — and a half-built tree is indistinguishable from a fold divergence in the diff. Solid has
// the same hazard for a different reason: `requestCommit()` is microtask-coalesced, and TextInput's
// controlled handshake and Switch's machine both commit again after their first effect runs.
//
// So the flush waits for the commit count to STOP moving rather than for a number someone chose.
// The cap is a failure, not a fallback: a tree that never settles must fail loudly here rather than
// be compared half-built.
//
// MEASURED 2026-09-01, so the comment does not overclaim: every one of the sixteen mounts settles at
// TWO ticks with ONE commit — one tick to commit, one to observe the count stop. So no case needs
// the extra waiting today and this guard is not currently load-bearing. It is kept because what it
// removes is a silent failure: under a fixed count, a tree that had not finished would be diffed
// half-built and read as a fold divergence, which is the shape Svelte's arm actually produced.
const MAX_SETTLE_TICKS = 20;

async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let i = 0; i < MAX_SETTLE_TICKS; i += 1) {
    await tick();
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error(
    `the tree never settled: completeRoot still moving after ${MAX_SETTLE_TICKS} ticks`,
  );
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(COMPONENT_ROOT);
  unmount(LOWERED_ROOT);
});

// `id` on every case on purpose: it is the one prop whose fold is known to have gone missing on a
// real adapter, and it exercises the renderer's alias path on BOTH arms. `testID` is how
// expectCommittedProps finds the node.
const PROBE = { id: 'probe-id', testID: 'probe' };
const FOLDED = { nativeID: 'probe-id', testID: 'probe' };

// Primitives with NO component spelling left, so there is nothing for the tag arm to be equal TO.
//
// NAMED, and it replaced a derivation that looked stronger and was not: this read
// `descriptorFor(intrinsic).component !== ANCHOR_COMPONENT`, which described
// `touchable-native-feedback` by ACCIDENT — that primitive is both wrapperless and nodeless, and
// the filter keyed on the second. `Button` is wrapperless and an ordinary `RCTView`, so it walked
// straight through and this file asked for a component that no longer exists. Wrapperlessness is
// not visible in the descriptor table, and no other table in the repo carries it.
//
// Safe in BOTH directions, which is what a subtraction from a derived list buys: a NEW primitive is
// not in here, joins `PAIRED`, and fails the completeness row below; a primitive whose wrapper is
// deleted without an entry here fails to compile its own `CASES` row. Each member's own coverage is
// its `src/*-tag.test.tsx` (node count + a fold) plus the behavior's suite in `core/components`.
const TAG_ONLY: readonly string[] = [
  'TouchableNativeFeedback',
  // The second anchor-backed primitive, same reason: it clones onto its single child and commits no
  // node of its own (TouchableWithoutFeedback.js:229,286). Coverage is the behavior's own suite in
  // `core/components/src/behaviors/touchable-without-feedback.test.ts`.
  'TouchableWithoutFeedback',
  'Button',
  'ImageBackground',
  // Wrapperless since 2026-09-09, same shape as `Button`: the behavior builds RN's centering View
  // plus the native spinner (ActivityIndicator.js:112), so there is no component spelling left to
  // compare against. Coverage is `src/activity-indicator-tag.test.tsx` (node count + the routing
  // split) and `core/components/src/behaviors/activity-indicator/activity-indicator.test.ts`.
  'ActivityIndicator',
  // Wrapperless since 2026-09-10: the wrapper forwarded a bag and nothing else, so deleting it
  // left one path. Coverage is `src/components/input-accessory-view.test.tsx`, which now drives
  // the tag, plus `core/components/src/behaviors/input-accessory-view.test.ts`.
  'InputAccessoryView',
  // Wrapperless since 2026-09-10 too, and its whole `renderImage` fold is the behavior's. Coverage
  // is `src/components/image.test.tsx`, which now drives the tag, plus
  // `core/components/src/behaviors/image.test.ts`.
  'Image',
  // Wrapperless since 2026-09-10: the controlled handshake moved into the tag's behavior, so the
  // `switch-managed` spelling has no author left. Coverage is `src/components/switch.test.tsx`.
  'Switch',
  // Wrapperless since 2026-09-10: the wrapper forwarded a bag, and the controlled handshake is the
  // tag's behavior. Coverage is `src/components/refresh-control.test.tsx`.
  'RefreshControl',
  // Wrapperless since 2026-09-10: the host owns the inset math and every fold the wrapper called
  // runs below the adapter, so the component held nothing. Coverage is
  // `src/components/safe-area-view.test.tsx`, which now drives the tag.
  'SafeAreaView',
];

const PAIRED = Object.keys(HOST_PRIMITIVES).filter(
  name => !TAG_ONLY.includes(name),
);

interface ICase {
  component: () => JSX.Element;
  lowered: () => JSX.Element;
  // The ABSOLUTE expectation — what the payload must contain regardless of what the other arm did.
  expected: Record<string, unknown>;
  // Differences that are REAL and open. Asserted as an exact list rather than tolerated, so the day
  // one closes this file goes red and says which entry to delete. Softening the comparison instead
  // would be the false green this whole oracle exists to prevent.
  knownDifferences?: readonly string[];
}

const CASES: Record<string, ICase> = {
  View: {
    component: () => <view {...PROBE} />,
    lowered: () => <view {...PROBE} />,
    expected: FOLDED,
  },
  Text: {
    component: () => <text {...PROBE} />,
    lowered: () => <text {...PROBE} />,
    // Text is the primitive whose defaults the renderer seeds, so its absolute expectation is the
    // one that would catch `seedTextDefaults` dying — which no arm comparison could.
    expected: { ...FOLDED, ellipsizeMode: 'tail', allowFontScaling: true },
  },
  Pressable: {
    component: () => <Pressable {...PROBE} />,
    lowered: () => <pressable {...PROBE} />,
    expected: FOLDED,
  },
  TextInput: {
    component: () => <TextInput {...PROBE} />,
    lowered: () => <text-input {...PROBE} />,
    expected: FOLDED,
  },
};

async function mountAndRead(
  root: number,
  tree: () => JSX.Element,
): Promise<readonly IFakeNode[]> {
  fabric.reset();
  mount(root, tree);
  await flushUntilSettled();
  return fabric.appRoot().children;
}

function expectEqual(result: { equal: boolean; differences: string[] }): void {
  expect(result.differences).toEqual([]);
  expect(result.equal).toBe(true);
}

describe('Solid: a lowered primitive commits what its component commits', () => {
  // UNCONDITIONAL, and it closes the hole a per-member block cannot see: every row below is
  // conditioned on its own member's spec data, so a spec that emptied itself would leave nothing to
  // disagree with and report eight green arms. Measured on Svelte — emptying ONE alias map flips a
  // row correctly, emptying EVERY map turns the whole block green by agreement.
  it('the spec still declares primitives and still declares a fold', () => {
    const names = Object.keys(HOST_PRIMITIVES);
    expect(names.length).toBeGreaterThan(0);
    const withAlias = names.filter(
      name => Object.keys(HOST_PRIMITIVES[name].aliases ?? {}).length > 0,
    );
    expect(
      withAlias.length,
      'no primitive declares an alias — the fold these arms compare has stopped existing',
    ).toBeGreaterThan(0);
  });

  // §24: the list must GROW. Derived from the spec, so a ninth primitive fails here by name rather
  // than being silently uncovered.
  //
  // MINUS the primitives that have no SECOND spelling to compare against, and that set is derived
  // from the descriptor table rather than written down. A tag whose descriptor is the engine's
  // ANCHOR commits no node at all — `touchable-native-feedback` clones onto its single child
  // instead (TouchableNativeFeedback.js:289,339) — so there is no component wrapper, nothing for
  // the lowered arm to be equal TO, and `assertCommittedSomething` would fail on an empty tree that
  // is correct. Its own coverage is `touchable-native-feedback-tag.test.tsx` (node count + clone)
  // and `core/components/src/behaviors/touchable-native-feedback.test.ts`.
  it('declares a mount pair for every primitive that HAS two spellings', () => {
    expect(Object.keys(CASES).sort()).toEqual(PAIRED.sort());
  });

  // Without this the exclusion could swallow the whole list and every row below would vanish.
  it('control: the exclusion left something to compare', () => {
    expect(PAIRED.length).toBeGreaterThan(0);
    // A `TAG_ONLY` member the spec no longer names excludes nothing and reads as a live exclusion.
    expect(
      TAG_ONLY.filter(name => HOST_PRIMITIVES[name] === undefined),
      'a tag-only entry names no primitive — the exclusion is stale',
    ).toEqual([]);
  });

  describe.each(Object.keys(CASES))('%s', name => {
    it('commits the same tree from both spellings, and the fold is present', async () => {
      const caseData = CASES[name];
      const componentTree = await mountAndRead(
        COMPONENT_ROOT,
        caseData.component,
      );
      const componentSnapshot = componentTree.map(node => node);
      expectEqual(assertCommittedSomething(componentSnapshot, 'component'));
      expectEqual(
        expectCommittedProps(componentSnapshot, 'probe', caseData.expected),
      );

      const loweredTree = await mountAndRead(LOWERED_ROOT, caseData.lowered);
      const loweredSnapshot = loweredTree.map(node => node);
      expectEqual(assertCommittedSomething(loweredSnapshot, 'lowered'));
      expectEqual(
        expectCommittedProps(loweredSnapshot, 'probe', caseData.expected),
      );

      const equivalence = compareLoweringEquivalence(
        componentSnapshot,
        loweredSnapshot,
      );
      expect(equivalence.differences).toEqual([
        ...(caseData.knownDifferences ?? []),
      ]);
    });
  });
});

// SOLID'S OWN CONTROL, in place of assertArmsAreDistinct — see the header. It proves the two arms
// are two PATHS rather than one path written twice, which is the only thing the node-count control
// was ever for.
describe('the two spellings are two compiler paths', () => {
  it.each(Object.keys(CASES))('%s', async name => {
    const intrinsic: string = HOST_PRIMITIVES[name].intrinsic;
    const compiled = await transformAsync(
      // The import is load-bearing: with nothing bound, `<Switch />` resolves to SOLID'S OWN
      // built-in `Switch` (babel-preset-solid's `builtIns` list auto-imports For/Show/Switch/Match/
      // … from the renderer), so the control would be compiling a different component entirely. A
      // real collision between one of our primitive names and a framework control-flow name.
      `import { ${name} } from '@symbiote-native/solid';\n` +
        `const a = <${name} />;\nconst b = <${intrinsic} />;`,
      {
        filename: 'control.jsx',
        babelrc: false,
        configFile: false,
        presets: [
          [presetSolid, { generate: 'universal', moduleName: '../renderer' }],
        ],
      },
    );
    const code = compiled?.code ?? '';
    expect(code, `${name} did not compile to a component call`).toContain(
      `_$createComponent(${name}`,
    );
    expect(code, `${intrinsic} did not compile to an element call`).toContain(
      `_$createElement("${intrinsic}")`,
    );
  });
});
