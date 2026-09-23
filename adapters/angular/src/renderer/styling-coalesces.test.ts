// What ONE `[style]` or `[class]` binding COSTS in prop writes.
//
// Angular has no whole-value styling call. `ɵɵstyleMap` / `ɵɵclassMap` walk the key-value array and
// call `renderer.setStyle` / `addClass` once PER KEY, all for the same node, back to back
// (`@angular/core` 22.0.8, `updateStyling` -> `applyStyling`). RN wants the whole style as one prop,
// so this renderer rebuilt it on every one of those calls: read the standing value, spread it into a
// FRESH object, write the lot. An N-key style is then N writes, the k-th carrying k keys — O(N^2) in
// allocation, and N distinct values where the app authored one.
//
// It is the whole of Angular's apply deficit. Measured on the headless bench arm, same ten-node row
// as every other adapter, `build-release`:
//
//   walk 25.6 against vue's 25.9 and fabric/layout identical — the engine and the platform do the
//   SAME work — while apply is 75.2 against 44.6, of which `convert` is 30.0 against 0.6, on
//   `values` 10 001 against 3 004.
//
// Ten thousand distinct values for a tree whose styles are four module-level constants: nothing
// interns, because every write allocates its own object.
//
// THE RUN IS CONTIGUOUS, which is what makes coalescing safe rather than a gamble: `updateStyling`
// resolves `rNode` from `getSelectedIndex()` and the loop never changes element mid-way, so the
// calls for one node arrive with nothing between them. The accumulator publishes the moment anything
// else happens — a different node, any other renderer call — so the window is never wider than one
// uninterrupted run.
//
// `class` IS THE SAME MECHANISM AND IT IS THE ONE THE DEVICE USES (`examples/angular/src/screens/
// BenchmarkScreen.ts` binds `[class]`, never `[style]`), so both entry points are pinned here.
//
// ON WHY BOTH ARE COUNTED AS WRITES OF `style`, which is not what it looks like: `routeProp`'s class
// branch resolves the token list through the class registry and publishes the result into the STYLE
// slot as `[classStyle, explicitStyle]` (`core/engine/src/node.ts`). So `class` is never a prop name
// on the wire, from any adapter, and counting writes named `class` counts zero however broken the
// renderer is. The two bindings therefore get a node each, so each count is unambiguous.

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import {
  clearGlobalStyles,
  createElement,
  getExplicitStyle,
  registerRules,
  setTreeHost,
  treeHost,
} from '@symbiote-native/engine';
import {
  OP_SET_PROP,
  OP_STRIDE,
} from '@symbiote-native/engine/mutation-buffer';

import { mount, unmount } from '../render';

const ROOT_TAG = 938;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Writes PER NODE, keyed by the node's own handle.
//
// PER NODE AND NOT PER KEY NAME, which cost a round to learn: the app root carries a `style` of its
// own (`{flex: 1}`, plus `pointerEvents`), so a tally by key name reports two writes for a perfectly
// coalesced probe and cannot say which node they came from.
let writes = new Map<object, Record<string, number>>();
let testIds = new Map<object, string>();

// INSTALLED ONCE, at module load. Wrapping inside a test wraps the wrapper the previous test left
// standing, and the tally then counts every batch once per case that ran before it — which is a
// counter that grows with the file and agrees with nothing. Cost this a round too.
{
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    applyOps: batch => {
      for (let at = 0; at + OP_STRIDE <= batch.ops.length; at += OP_STRIDE) {
        if (batch.ops[at] !== OP_SET_PROP) continue;
        const node = batch.handles[batch.ops[at + 1]];
        if (node === undefined) continue;
        const key = batch.strings[batch.ops[at + 2]] ?? '?';
        const value = batch.values[batch.ops[at + 3]];
        if (key === 'testID' && typeof value === 'string')
          testIds.set(node, value);
        const tally = writes.get(node) ?? {};
        tally[key] = (tally[key] ?? 0) + 1;
        writes.set(node, tally);
      }
      base.applyOps(batch);
    },
  });
}

/** How many times `key` was written on the node carrying this `testID`. */
function writesOn(testID: string, key: string): number {
  for (const [node, id] of testIds)
    if (id === testID) return writes.get(node)?.[key] ?? 0;
  throw new Error(`no node was ever given testID="${testID}"`);
}

let styleHost: StyleHost | undefined;

// NO `imports` on either host, deliberately: a matched `SymbioteElement` DECLARES `style` as an
// `@Input()` and the binding then arrives whole at `setProperty`, which is the path
// `style-input.test.ts` covers. The bare tag is what routes through Angular's own styling engine.
@Component({
  selector: 'style-cost-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view testID="probe" [style]="style()"></view>
    <view testID="sibling"></view>
  `,
})
class StyleHost {
  readonly style = signal<Record<string, unknown>>({
    height: 44,
    flexDirection: 'row',
    paddingLeft: 10,
  });
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    styleHost = this;
  }
}

@Component({
  selector: 'class-cost-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view testID="probe" [class]="cls"></view>`,
})
class ClassHost {
  readonly cls = 'alpha beta gamma';
}

let twinHost: TwinHost | undefined;

// Two rows asking for the SAME style through two independent bindings — a list, minus the list.
// Separate signal objects on purpose: sharing one would make the identity claim trivially true for
// the wrong reason.
@Component({
  selector: 'twin-cost-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view testID="twin-a" [style]="aStyle()"></view>
    <view testID="twin-b" [style]="bStyle()"></view>
  `,
})
class TwinHost {
  readonly aStyle = signal<Record<string, unknown>>({
    height: 44,
    paddingLeft: 10,
  });
  readonly bStyle = signal<Record<string, unknown>>({
    height: 44,
    paddingLeft: 10,
  });
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    twinHost = this;
  }
}

// `findLive` answers `undefined` for a miss and the assertions above say so before this is reached;
// this keeps the style read total without an `as`.
const NO_NODE = createElement('RCTView');

function drive(): StyleHost {
  if (styleHost === undefined) throw new Error('the host was never mounted');
  return styleHost;
}

function probeNode(): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === 'probe',
  );
  if (hit === undefined)
    throw new Error('no committed node carrying testID="probe"');
  return hit;
}

beforeEach(() => {
  fabric.reset();
  writes = new Map();
  testIds = new Map();
  styleHost = undefined;
  twinHost = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('a styling binding', () => {
  // why: THE COST CLAIM, and the reason the bench arm reports 10 001 distinct values for four
  // authored styles. Three keys must reach the engine as ONE prop write, because that is what the
  // app wrote.
  it('writes the style once for a three-key map', async () => {
    mount(ROOT_TAG, StyleHost);
    await tick();

    expect(writesOn('probe', 'style'), 'one write, not one per key').toBe(1);
  });

  // why: THE TWO-SIDED HALF. The case above is satisfied by a renderer that drops two of the three
  // keys, which is exactly what a coalescing bug looks like — so the payload has to carry all three.
  it('still commits every key of that map', async () => {
    mount(ROOT_TAG, StyleHost);
    await tick();

    const payload = probeNode().payload;
    expect(payload.height).toBe(44);
    expect(payload.flexDirection).toBe('row');
    expect(payload.paddingLeft).toBe(10);
  });

  // why: A COALESCED WRITE MUST NOT OUTLIVE ITS RUN. The accumulator holds the style until something
  // else happens, so the danger is a run that is never closed — the node commits without the style
  // it was given. The sibling element is authored AFTER the styled one, so the renderer moves on to
  // other work while the run is open.
  it('publishes the run before the node it belongs to commits', async () => {
    mount(ROOT_TAG, StyleHost);
    await tick();

    expect(probeNode().payload.height, 'the run reached the commit').toBe(44);
  });

  // why: an UPDATE is the shape a real screen spends its life in, and it is where a stale
  // accumulator shows: the keys the new map does not mention must keep their standing values, and
  // the one it changes must move. Angular sends only the DIFF through `updateStyling`.
  it('keeps the untouched keys when one of them changes', async () => {
    mount(ROOT_TAG, StyleHost);
    await tick();

    drive().style.set({ height: 60, flexDirection: 'row', paddingLeft: 10 });
    await tick();

    const payload = probeNode().payload;
    expect(payload.height, 'the changed key moved').toBe(60);
    expect(payload.flexDirection, 'an untouched key survived').toBe('row');
    expect(payload.paddingLeft, 'and so did the other').toBe(10);
  });

  // why: THE TURN IT LANDS IN, which a payload assertion alone cannot see — every case above reads
  // the tree after the dust has settled, so a write that arrives one commit late looks identical to
  // one that arrived on time. A held run has exactly that failure mode, and on a device it is a
  // frame of the old style on every style change.
  //
  // The commit COUNT is the witness: an update that reaches its own commit needs one, and one that
  // has to be chased out by a later flush needs two.
  it('lands in the commit its own turn schedules', async () => {
    mount(ROOT_TAG, StyleHost);
    await tick();
    // The COUNT is taken as a difference rather than by resetting the recording: a reset drops the
    // tree the probe is found in, and the case then fails looking for the app root.
    const before = fabric.commits;

    drive().style.set({ height: 60, flexDirection: 'row', paddingLeft: 10 });
    await tick();

    expect(probeNode().payload.height, 'the new value is committed').toBe(60);
    expect(fabric.commits - before, 'in one commit, not two').toBe(1);
  });

  // why: A LIST OF IDENTICAL ROWS MUST NOT SEND A THOUSAND STYLE OBJECTS. The intern table keys by
  // IDENTITY, so a fresh object per node is a fresh entry per node, and the host converts every
  // entry across JSI. Measured on the bench arm: `values` 7 001 against Vue's 3 004 for the same
  // tree, and `convert` 19.5 ms against 0.6 — the gap is not the COUNT (2.3x) but the KIND, ~4 000
  // of Angular's being objects that convert recursively where Vue's are mostly scalars plus four
  // hoisted styles every row shares.
  //
  // Angular cannot share them on its own: `ɵɵstyleMap` hands over keys, so the renderer necessarily
  // builds the object. Recognising one it has already published is what puts Angular back on the
  // same footing as a framework whose author hoisted the constant.
  it('publishes one object for rows that ask for the same style', async () => {
    mount(ROOT_TAG, TwinHost);
    await tick();

    const first = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'twin-a',
    );
    const second = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'twin-b',
    );
    expect(first, 'both rows committed').toBeDefined();
    expect(second).toBeDefined();

    expect(
      getExplicitStyle(first?.handle ?? NO_NODE),
      'the same style is the same object',
    ).toBe(getExplicitStyle(second?.handle ?? NO_NODE));
  });

  // why: THE TWO-SIDED HALF, and the hazard sharing introduces. One row changing its style must not
  // drag its twin with it — a cache that handed back an object and then let it be mutated would do
  // exactly that, and the symptom is a list where styling one row styles all of them.
  it('does not drag a twin along when one of them changes', async () => {
    mount(ROOT_TAG, TwinHost);
    await tick();

    twinHost?.aStyle.set({ height: 99 });
    await tick();

    const first = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'twin-a',
    );
    const second = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'twin-b',
    );

    expect(first?.payload.height, 'the one that changed moved').toBe(99);
    expect(second?.payload.height, 'the one that did not, did not').toBe(44);
  });

  // why: REMOVAL travels the other entry point (`removeStyle`, for a key whose new value is null),
  // and a coalescing accumulator that only ever ADDS would leave the dropped key standing forever.
  it('drops a key the new map no longer carries', async () => {
    mount(ROOT_TAG, StyleHost);
    await tick();

    drive().style.set({ height: 44, flexDirection: 'row' });
    await tick();

    const payload = probeNode().payload;
    expect(payload.paddingLeft, 'the dropped key is gone').toBe(undefined);
    expect(payload.height, 'the kept keys are still here').toBe(44);
  });

  // why: the same defect on the entry point the DEVICE screen uses. Three tokens re-joined and
  // re-published the whole string three times; the app wrote one list. Counted as `style` for the
  // reason in this file's header — a class never reaches the wire under its own name.
  //
  // THE RULES HAVE TO BE REGISTERED OR THE CASE IS VACUOUS. An unknown token resolves to no
  // class-derived style at all, so every one of the three republications carries `undefined`, and
  // the engine's own `Object.is` guard collapses them — the case then passes against a renderer
  // that publishes per token, which is exactly what it exists to catch. Found by break-testing:
  // it stayed green while the style case went red.
  it('writes the class list once for a three-token binding', async () => {
    registerRules([
      {
        tokens: ['alpha'],
        specificity: [0, 1, 0],
        order: 0,
        style: { top: 1 },
      },
      {
        tokens: ['beta'],
        specificity: [0, 1, 0],
        order: 1,
        style: { left: 2 },
      },
      {
        tokens: ['gamma'],
        specificity: [0, 1, 0],
        order: 2,
        style: { right: 3 },
      },
    ]);

    mount(ROOT_TAG, ClassHost);
    await tick();

    expect(writesOn('probe', 'style'), 'one write, not one per token').toBe(1);
    // Two-sided: one write that dropped two of the three tokens would satisfy the count alone.
    const payload = probeNode().payload;
    expect(payload.top).toBe(1);
    expect(payload.left).toBe(2);
    expect(payload.right).toBe(3);
  });
});

// Rows whose styles SHARE A PREFIX with one already published, in the order Angular walks them. A
// renderer that recognises a published style key by key must not stop at the prefix. Angular hands
// the keys over SORTED, so `diverges` sits right after `base`: same keys, the last value differs.
@Component({
  selector: 'prefix-cost-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view testID="base" [style]="base"></view>
    <view testID="diverges" [style]="diverges"></view>
    <view testID="subset" [style]="subset"></view>
    <view testID="superset" [style]="superset"></view>
  `,
})
class PrefixHost {
  readonly base = { height: 44, paddingLeft: 10, flexDirection: 'row' };
  readonly subset = { height: 44, paddingLeft: 10 };
  readonly diverges = { height: 44, paddingLeft: 99, flexDirection: 'row' };
  readonly superset = {
    height: 44,
    paddingLeft: 10,
    flexDirection: 'row',
    marginTop: 5,
  };
}

function payloadOf(testID: string): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node "${testID}"`);
  return hit.payload;
}

describe('a style that shares a prefix with one already published', () => {
  beforeEach(async () => {
    mount(ROOT_TAG, PrefixHost);
    await tick();
  });

  // why: fewer keys is a different style - the published one would paint a key the row never asked for.
  it('keeps a shorter style its own', () => {
    expect(payloadOf('subset').flexDirection).toBe(undefined);
    expect(payloadOf('subset').paddingLeft).toBe(10);
  });

  // why: a match on the first keys says nothing about the rest.
  it('carries the value that diverged and every key before it', () => {
    const payload = payloadOf('diverges');
    expect(payload.paddingLeft).toBe(99);
    expect(payload.height).toBe(44);
    expect(payload.flexDirection).toBe('row');
  });

  // why: more keys is a different style - the published one would drop the extra key.
  it('keeps a longer style whole', () => {
    expect(payloadOf('superset').marginTop).toBe(5);
    expect(payloadOf('superset').flexDirection).toBe('row');
  });
});
