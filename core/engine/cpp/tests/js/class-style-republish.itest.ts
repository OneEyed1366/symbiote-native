// pushClassStyle republishes a FRESH [classStyle, explicitStyle] array on every class/style write,
// so setProp's Object.is guard can never turn one away by itself: without a deeper guard,
// re-writing an UNCHANGED class would still land as a write and mark the node dirty.
//
// Costs React / Vue / Svelte nothing — each diffs props before calling the engine — but Solid has
// no diff: a fine-grained effect re-runs whenever any signal it reads changes. Measured on device
// 2026-08-23 (examples/solid, once its primitives were tags): selecting one row of 1 000 read
// WRITES 1001 and a 10.3 ms reconcile window against Fabric's unmoved 0/0/10 — a thousand-node
// dirty walk for two nodes' worth of change.
//
// AGAINST THE REAL DIFFERENTIATOR, not a stand-in — `core/engine/src/node.ts`'s own `setProp`
// comment settles what to measure: "THE Object.is DEDUPE IS NOT HERE ANY MORE... The guard lives
// in the host's OP_SET_PROP instead, where the previous value is a local field: same comparison,
// same Object.is reasoning." So a write that the guard turns away never reaches Fabric at all —
// `hasChangedSinceCommit()` stays false, no `OP_COMMIT` is even emitted, and
// `mountingCoordinator_->pullTransaction()` (harness.ts's `mounted()`) drains nothing. A write that
// gets through shows up as a real `ShadowViewMutation::Update`, in React Native's own mounting-log
// wording (`mountingLogs()`, new this round — `symbiote-host.h`'s `Host::mountingLogs()` was
// already computed from the real Differentiator's mutation list, just never plumbed to JS before).
// This is the direct native-side equivalent of the retired mirror's `fabric.counts.clone`, without
// needing a clone protocol only a stand-in ever spoke — an "Update" line names the node the real
// differ decided to actually re-mount, nothing invented.

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  propOf,
  registerRules,
  routeProp,
  setNativeProps,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, mountingLogs, report } from './harness';

// Must be 1: the C++ harness's ShadowTreeRegistry watches one fixed `kSurfaceId` (symbiote-host.h),
// not whatever tag JS passes to `createSurface` — a mismatch here is why the first attempt at this
// file saw `mountingLogs()` read back empty on every commit, including the very first mount.
const ROOT_TAG = 1;
const surface = createSurface(ROOT_TAG);
const PROBE_ID = 'probe';

// Every case mounts its own node and commits it, so "nothing left to update" is measured against a
// SETTLED tree rather than against the initial mount, which always produces Create/Insert lines.
//
// The node gets a CHILD so the subject is a node the differ can update in place: a childless node
// directly under the container still updates the same way, this just keeps the fixture closer to a
// real row (one view, one piece of content) rather than an isolated leaf.
function mountSettled(): ISymbioteNode {
  const node = createElement('RCTView');
  const child = createElement('RCTView');
  appendChild(node, child);
  surface.appendChild(node);
  surface.commit();
  mounted();
  mountingLogs(); // discard the mount's own Create/Insert lines — irrelevant to what follows
  routeProp(node, 'nativeID', PROBE_ID);
  surface.commit();
  mounted();
  mountingLogs(); // discard the nativeID write's own Create/Insert — that write is setup, not the case
  return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// True when the real Differentiator decided the probe view's props actually changed enough to
// re-mount it — the one signal `writes` (propStats) is blind to on its own, since a write that
// reaches the wire and a write the host's own Object.is guard turns away both increment nothing
// visible from JS except this.
function probeWasUpdated(action: () => void): boolean {
  action();
  surface.commit();
  mounted();
  return mountingLogs().some(
    line => line.startsWith('Update ') && line.includes(`"${PROBE_ID}"`),
  );
}

describe('republishing an unchanged class or style, against the real differ', () => {
  it('does not re-mount the view when the class string is unchanged', () => {
    registerRules([
      {
        tokens: ['row'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
    ]);
    const node = mountSettled();
    routeProp(node, 'class', 'row');
    surface.commit();
    mounted();
    mountingLogs(); // discard the FIRST class assignment's own Update line

    expect(probeWasUpdated(() => routeProp(node, 'class', 'row'))).toBe(false);
    clearGlobalStyles();
  });

  it('re-mounts the view when the class string changes', () => {
    registerRules([
      {
        tokens: ['row'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
      {
        tokens: ['row', 'sel'],
        specificity: [0, 2, 0],
        order: 1,
        style: { padding: 8 },
      },
    ]);
    const node = mountSettled();
    routeProp(node, 'class', 'row');
    surface.commit();
    mounted();
    mountingLogs();

    expect(probeWasUpdated(() => routeProp(node, 'class', 'row sel'))).toBe(
      true,
    );
    clearGlobalStyles();
  });

  // The identity case an adapter hits constantly: a hoisted style constant (StyleSheet.create, a
  // module-level literal) handed back unchanged on every render.
  it('does not re-mount the view when the explicit style is the same reference', () => {
    const hoisted = { margin: 2 };
    const node = mountSettled();
    routeProp(node, 'style', hoisted);
    surface.commit();
    mounted();
    mountingLogs();

    expect(probeWasUpdated(() => routeProp(node, 'style', hoisted))).toBe(
      false,
    );
  });

  // The restore path, and the whole reason the guard keys on the published ARRAY rather than on
  // the parts alone. setNativeProps writes the style slot past the parts as a flattened OBJECT,
  // clobbering the declarative style; the next declarative write is what puts it back. A
  // parts-only guard would skip that write and leave the imperative value on screen forever.
  //
  // Driven through setNativeProps rather than by writing the slot by hand: it is the one caller of
  // the restore path, so a hand-written slot would test a bypass nothing performs.
  it('re-mounts the view after setNativeProps overwrote the style slot', () => {
    const hoisted = { margin: 2 };
    const node = mountSettled();
    routeProp(node, 'style', hoisted);
    surface.commit();
    mounted();
    mountingLogs();

    setNativeProps(node, { style: { opacity: 0.5 } });
    // Commit the clobber ON ITS OWN before restoring — `setNativeProps` only QUEUES a commit
    // (`requestCommitForRoot`, a microtask this synchronous test never lets fire), so without this
    // the clobber and the restore below would land in the SAME commit and cancel out: Fabric would
    // never see the imperative `opacity` on screen at all, and the restore would look like a no-op
    // because the flattened payload never actually changed from Fabric's point of view.
    surface.commit();
    mounted();
    mountingLogs();
    // Field by field, not a whole-object `toEqual` — the flattened object's own key order is not
    // stable across runs (measured: the same code produced `{margin,opacity}` on some runs and
    // `{opacity,margin}` on others), and harness.ts's `toEqual` is plain JSON.stringify equality
    // with no notion of key order being insignificant.
    const clobbered = propOf(node, 'style');
    if (!isRecord(clobbered))
      throw new Error('style prop is not an object after setNativeProps');
    expect(clobbered.margin).toBe(2);
    expect(clobbered.opacity).toBe(0.5);

    expect(probeWasUpdated(() => routeProp(node, 'style', hoisted))).toBe(true);
    expect(propOf(node, 'style')).toEqual([undefined, hoisted]);
  });
});

report();
