// Angular's arm of the equivalence oracle: mount every lowerable primitive TWICE — once as the
// component, once as the bare intrinsic — and require the two committed Fabric trees to be
// identical. `core/test-utils/src/lowering-equivalence.ts` holds the canonicaliser and the
// assertions; the mounts are per-framework by construction and live here.
//
// This adapter was the LAST to get an arm and the first to turn lowering on app-wide: seven
// primitives at once (`babel-lower-host-primitives.cjs`, `LOWERABLE_NAMES`). Every other adapter
// had the oracle before it lowered.
//
// TWO ASSERTIONS PER CASE, and neither is redundant:
//   compareLoweringEquivalence  catches a fold ONE path lost   (the wrapper had it, the tag does not)
//   expectCommittedProps        catches a fold EVERYONE lost   (the layer itself broke)
// The second matters more here than anywhere: Angular applies its folds in the RENDERER, which BOTH
// arms traverse, so a fold dying there moves both arms identically and they still agree.
//
// THE DUAL SELECTOR IS WHY THE LOWERED FIXTURE IMPORTS NOTHING. `ViewHost` declares
// `selector: 'symbiote-view, View'` (primitives/index.ts), and Angular resolves directives per
// TEMPLATE — so writing `<symbiote-view>` in a template whose `imports` still lists the primitive
// resolves straight back to the component and lowers NOTHING, silently. A lowered fixture that
// imported its primitive would compare the component against itself and pass every case.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  assertArmsAreDistinct,
  assertCommittedSomething,
  compareLoweringEquivalence,
  expectCommittedProps,
  installFabric,
  type IFakeNode,
} from '@symbiote-native/test-utils';
import {
  censusRetainedTree,
  isSymbioteNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
// SIDE-EFFECT IMPORT, and the arm is worthless without it: `register.ts` is what calls
// `registerPressableBehavior()` / `registerTextInputBehavior()` / `registerSwitchBehavior()` /
// `registerImageBehavior()`, and a behavior's `foldPayload` is the lowered path's ONLY source for
// folds that do not live in `foldHostBag`. An app reaches it through the package barrel; a test
// importing components directly does not.
import './register';
import { mount, unmount } from './render';
import { ViewHost, TextHost } from './primitives';
import { Image } from './components/image';
import { InputAccessoryView } from './components/input-accessory-view';
import { Pressable } from './components/pressable';
import { Switch } from './components/switch';
import { TextInput } from './components/text-input';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);

const COMPONENT_ROOT = 9_401;
const LOWERED_ROOT = 9_402;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Sampled, never a fixed count — a wrapper carrying an effect needs more ticks than a pure render,
// and a half-built tree is indistinguishable from a fold divergence in the diff. Svelte's arm
// settled on a fixed number and then disagreed with ITSELF between runs. The cap is a failure, not
// a fallback.
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

// `id` on every case on purpose: it is the one prop whose fold is known to have gone missing on a
// real adapter — Angular folded it NOWHERE until 2026-08-31, on either path — and it exercises the
// renderer's alias route on both arms. `testID` is how `expectCommittedProps` finds the node.
const PROBE = `[id]="'probe-id'" [testID]="'probe'"`;
const FOLDED = { nativeID: 'probe-id', testID: 'probe' };

// A fixture per arm, built at run time. JIT compiles the template string, so the two arms differ by
// exactly what must differ — the tag, and whether the primitive is in scope — instead of by two
// hand-written classes that can drift apart.
function fixture(
  template: string,
  imports: readonly Type<unknown>[],
): Type<unknown> {
  @Component({
    selector: 'equivalence-fixture',
    standalone: true,
    imports: [...imports],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template,
  })
  class EquivalenceFixture {}
  return EquivalenceFixture;
}

interface ICase {
  // The component spelling's TAG and the primitive that must be in scope for it.
  tag: string;
  imports: readonly Type<unknown>[];
  // Extra attributes, for a primitive whose intrinsic depends on a prop.
  extra?: string;
  // The ABSOLUTE expectation — what the payload must carry regardless of what the other arm did.
  expected: Record<string, unknown>;
  // Whether the RETAINED node count can tell the two arms apart. MEASURED, not assumed: a COMPOSED
  // component allocates its own non-painting anchor, so its arms differ — but `View` and `Text` are
  // `SymbiotePrimitiveHost`s whose component IS the node, so both arms census 1 and the control
  // would redden a correct pair. Third adapter where this premise fails, and the first where it
  // fails for only SOME of its primitives.
  discriminates: boolean;
  // Differences that are REAL and open. Asserted as an exact list rather than tolerated, so the day
  // one closes this file goes red and says which entry to delete.
  knownDifferences?: readonly string[];
}

// Angular's component path DROPS `id`: of the seven, only `Pressable` declares an `@Input() id`
// (the other four carry `nativeID` only), so the binding lands on the anchor and never reaches the
// node. The LOWERED path is the correct one — the renderer's alias fold covers it — which makes
// this a lowering that ADDS a capability, and this repo treats a surface moving in either direction
// as a bug.
//
// DELETE AN ENTRY when its component declares `id` and passes it into its host bag; the renderer
// folds it from there, so that is the whole fix.
const missingIdFold = (view: string): readonly string[] => [
  `RCTView[0] > ${view}[0]: lowered has EXTRA "nativeID" = "probe-id"`,
];

const CASES: Record<string, ICase> = {
  View: {
    tag: 'View',
    imports: [ViewHost],
    expected: FOLDED,
    discriminates: false,
  },
  Text: {
    tag: 'Text',
    imports: [TextHost],
    // The primitive whose DEFAULTS the adapter seeds, so its absolute expectation is the one that
    // would catch the seeding dying — which no arm comparison could, since both arms traverse the
    // renderer that seeds it.
    expected: { ...FOLDED, ellipsizeMode: 'tail', allowFontScaling: true },
    discriminates: false,
  },
  Pressable: {
    tag: 'Pressable',
    imports: [Pressable],
    expected: FOLDED,
    discriminates: true,
  },
  TextInput: {
    tag: 'TextInput',
    imports: [TextInput],
    expected: FOLDED,
    discriminates: true,
    knownDifferences: missingIdFold('RCTSinglelineTextInputView'),
  },
  Image: {
    tag: 'Image',
    imports: [Image],
    extra: `[source]="{ uri: 'x' }"`,
    // The array shape `normalizeSource` guarantees — the fold that lives in the BEHAVIOR rather
    // than in `foldHostBag`, and is therefore reachable only through `register.ts`.
    expected: { ...FOLDED, source: [{ uri: 'x' }] },
    discriminates: true,
    knownDifferences: missingIdFold('RCTImageView'),
  },
  InputAccessoryView: {
    tag: 'InputAccessoryView',
    imports: [InputAccessoryView],
    expected: FOLDED,
    discriminates: true,
    knownDifferences: missingIdFold('RCTInputAccessoryView'),
  },
  Switch: {
    tag: 'Switch',
    imports: [Switch],
    expected: FOLDED,
    discriminates: true,
    knownDifferences: missingIdFold('Switch'),
  },
};

const NAMES = Object.keys(CASES);

function intrinsicOf(name: string): string {
  const entry = HOST_PRIMITIVES[name];
  if (entry === undefined)
    throw new Error(
      `no HOST_PRIMITIVES entry for ${name} — this case cannot distinguish a refusal from an absent primitive`,
    );
  return entry.intrinsic;
}

// The retained root reached through the probe's OWN node, so the count belongs to this arm.
function retainedNodeCount(): number {
  const seed = fabric.created.find(node => node.props.testID === 'probe');
  if (seed === undefined) return 0;
  const handle: unknown = seed.instanceHandle;
  if (!isSymbioteNode(handle)) return 0;
  let current: ISymbioteNode = handle;
  while (current.parent !== undefined) current = current.parent;
  return censusRetainedTree([current]).nodes;
}

interface IArm {
  committed: IFakeNode[];
  retainedNodes: number;
}

// Fully ISOLATED per arm — reset before, copy out, unmount after. `fabric.committed` is live, so
// holding a reference across the second mount would hand both arms the SAME array and every
// comparison would pass by identity. Same reason the census is taken here: `fabric.created` is
// cumulative, and a `find` by testID after the second mount returns the FIRST arm's node.
async function armFor(
  root: number,
  template: string,
  imports: readonly Type<unknown>[],
): Promise<IArm> {
  fabric.reset();
  mount(root, fixture(template, imports));
  await flushUntilSettled();
  const committed = fabric.committed.map(node => node);
  const retainedNodes = retainedNodeCount();
  unmount(root);
  return { committed, retainedNodes };
}

beforeEach(() => fabric.reset());

describe('the two spellings of a primitive commit one tree', () => {
  // why: the whole file iterates `NAMES`, and an empty list makes every row below vacuous. Also
  // pins that the shared spec still carries what this adapter claims to lower.
  it('control: every case names a primitive the spec carries', () => {
    expect(NAMES.length).toBeGreaterThan(0);
    for (const name of NAMES) expect(intrinsicOf(name)).toMatch(/^symbiote-/);
  });

  // why: `discriminates: false` disables the one control that catches an arm which never lowered,
  // so the flag is a hole by construction. Pin that it is not set everywhere — the state in which
  // this whole file would pass against two identical arms.
  it('control: the arms-are-distinct check is still applied somewhere', () => {
    expect(
      NAMES.filter(name => CASES[name].discriminates).length,
    ).toBeGreaterThan(0);
  });

  describe.each(NAMES)('%s', name => {
    const testCase = CASES[name];
    const extra = testCase.extra === undefined ? '' : ` ${testCase.extra}`;
    const componentTemplate = `<${testCase.tag} ${PROBE}${extra}></${testCase.tag}>`;
    const loweredTag = intrinsicOf(name);
    const loweredTemplate = `<${loweredTag} ${PROBE}${extra}></${loweredTag}>`;

    it('commits the same tree either way, and both folded', async () => {
      const component = await armFor(
        COMPONENT_ROOT,
        componentTemplate,
        testCase.imports,
      );
      // NO imports: the dual selector would otherwise resolve the intrinsic straight back to the
      // component and both arms would be the same path. See this file's header.
      const lowered = await armFor(LOWERED_ROOT, loweredTemplate, []);

      // The control, before either comparison: two EMPTY trees compare equal, and an arm that
      // silently mounted nothing is the false green this oracle exists to prevent.
      expect(
        assertCommittedSomething(component.committed, `${name} component`)
          .differences,
      ).toEqual([]);
      expect(
        assertCommittedSomething(lowered.committed, `${name} lowered`)
          .differences,
      ).toEqual([]);

      // THE UNIVERSAL CONTROL, and it is textual because no runtime counter can serve here. For
      // `View`/`Text` the two arms census identically and commit identically — which is correct,
      // the component IS the node — so nothing observable separates "lowered" from "resolved back
      // to the component". And those two are exactly the primitives carrying the DUAL selector, so
      // the retained-count control is disabled precisely where its trap lives. Found by breaking
      // it: handing the lowered arm the imports left all nine rows green.
      //
      // What remains catchable is the realistic mistake — both arms spelling the same tag — and
      // that is what this pins.
      expect(loweredTemplate).toContain(`<${loweredTag} `);
      expect(componentTemplate).not.toContain(`<${loweredTag} `);
      expect(loweredTemplate).not.toContain(`<${testCase.tag} `);

      // Angular's discriminator, applied only where its premise HOLDS — see `ICase.discriminates`.
      if (testCase.discriminates)
        expect(
          assertArmsAreDistinct(component.retainedNodes, lowered.retainedNodes)
            .differences,
        ).toEqual([]);

      expect(
        compareLoweringEquivalence(component.committed, lowered.committed)
          .differences,
      ).toEqual(testCase.knownDifferences ?? []);
      expect(
        expectCommittedProps(lowered.committed, 'probe', testCase.expected)
          .differences,
      ).toEqual([]);
    });
  });
});
