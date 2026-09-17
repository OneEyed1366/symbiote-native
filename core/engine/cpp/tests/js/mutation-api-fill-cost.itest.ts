// What does recording ONE mutation cost, per kind, in JS?
//
// why: after the value interning and the shared style array, a 10 001-node create on `build-release`
// reads fill 23 / apply 15 / commit 32. `apply` and `commit` are named from the inside by
// `readSurfaceTelemetry`; `fill` is JS and had nothing. It is now the second-largest item in the
// path and the largest one that is entirely ours.
//
// BULK PASSES, one kind per pass, deliberately. The alternative is timing inside the row builder,
// which interleaves four kinds — and the clock only became fine-grained enough to consider that
// today (`__symbioteTester.now`, a real `steady_clock`; the prelude's old `performance.now` was
// whole milliseconds off `Date.now`). Even with a good clock, a per-call timer around a ~1 us call
// measures the timer. A pass of ten thousand does not.
//
// What a pass does NOT model: the buffer's array growth is amortized across the whole batch, and a
// pass that runs first pays more of it. So the passes are warmed once and the ORDER is fixed, and
// only same-kind comparisons across runs are read.
//
// RUN ON `build-release` (`pnpm run bench:itest`). The assert build's shape is wrong — see
// `raw-fabric-vs-engine.itest.ts` for how much.

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import { describe, expect, it, print, report } from './harness';

const ROOT_TAG = 1;
const OPS = 10_000;

/** The benchmark row's style, shared by every node that uses it — the case the engine optimizes. */
const SHARED_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };

function since(startedAt: number): number {
  return performance.now() - startedAt;
}

function timed(act: () => void): number {
  const startedAt = performance.now();
  act();
  return since(startedAt);
}

describe('what one recorded mutation costs', () => {
  // why: the fill phase is ours end to end, so every microsecond in it is one we can argue with —
  // unlike `createNode`, which is React Native's. Knowing WHICH op holds it is the whole question.
  it('splits the fill phase by operation kind', () => {
    createSurface(ROOT_TAG);

    // Warm the buffer's op array to its full size first, so no pass below pays for the doubling.
    const warm: ISymbioteNode[] = [];
    for (let at = 0; at < OPS; at += 1) warm.push(createElement('RCTView'));
    for (const node of warm) routeProp(node, 'style', SHARED_STYLE);
    flushOps();

    const nodes: ISymbioteNode[] = [];
    const createElementMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) nodes.push(createElement('RCTView'));
    });

    const rawTexts: ISymbioteNode[] = [];
    const createRawTextMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) rawTexts.push(createRawText('row'));
    });

    // The shared object — one value-table entry for all ten thousand writes.
    const sharedStyleMs = timed(() => {
      for (const node of nodes) routeProp(node, 'style', SHARED_STYLE);
    });

    // A FRESH object per write, which is what a component building its style inline hands over. The
    // pair below is the honest bracket on what an app pays for styling.
    const freshStyleMs = timed(() => {
      for (const node of nodes) routeProp(node, 'style', { flex: 1 });
    });

    const scalarPropMs = timed(() => {
      for (const node of nodes) routeProp(node, 'allowFontScaling', true);
    });

    const stringPropMs = timed(() => {
      for (let at = 0; at < OPS; at += 1)
        routeProp(nodes[at], 'testID', `row-${at}`);
    });

    const parent = createElement('RCTView');
    const appendChildMs = timed(() => {
      for (const node of nodes) appendChild(parent, node);
    });

    // ── WHAT THE INTERNING COSTS THE CASE IT CANNOT HELP ───────────────────────────────────────────
    //
    // A style object rebuilt per render never hits either cache, and it still pays a `WeakMap`
    // miss + insert (the shared-pair cache) and a `Map` miss + insert (the buffer's value table).
    // That is work the old code did not do, on the path an app written without `StyleSheet.create`
    // takes — which is most of them. Priced directly rather than argued about, because the engine
    // cannot be A/B'd from JS and this is the exact pair of operations that was added.
    const freshKeys: object[] = [];
    for (let at = 0; at < OPS; at += 1) freshKeys.push({ flex: at });
    const weak = new WeakMap<object, unknown>();
    const weakMissMs = timed(() => {
      for (const key of freshKeys) {
        weak.get(key);
        weak.set(key, key);
      }
    });
    const strong = new Map<unknown, number>();
    const mapMissMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) {
        strong.get(freshKeys[at]);
        strong.set(freshKeys[at], at);
      }
    });

    // ── THE PER-WRITE CHECKS, PRICED SEPARATELY ────────────────────────────────────────────────────
    //
    // A plain prop write runs a fixed sequence of cheap-looking guards before it records anything:
    // two `Set.has`, a `startsWith`, a regex, several field loads. At 0.87 us per write and eight
    // plain writes per benchmark row they are half the fill phase, so "cheap-looking" is worth
    // checking rather than assuming — and a regex is the one of them that is not obviously cheap.
    const KEY = 'allowFontScaling';
    const onPrefix = /^on[A-Z]/;
    const regexMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) onPrefix.test(KEY);
    });
    const charCodeMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) {
        // What `/^on[A-Z]/` means, spelled out: 'o', 'n', then an upper-case letter.
        const third = KEY.charCodeAt(2);
        void (
          KEY.charCodeAt(0) === 111 &&
          KEY.charCodeAt(1) === 110 &&
          third >= 65 &&
          third <= 90
        );
      }
    });
    const keySet = new Set(['__self', '__source']);
    const setHasMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) keySet.has(KEY);
    });
    const startsWithMs = timed(() => {
      for (let at = 0; at < OPS; at += 1) KEY.startsWith('aria-');
    });

    const each = (total: number): string => ((total * 1000) / OPS).toFixed(2);
    print(
      `DEBUG GUARDS x${OPS} (ms · us each)  ` +
        `regex=${regexMs.toFixed(1)}·${each(regexMs)} ` +
        `charCode=${charCodeMs.toFixed(1)}·${each(charCodeMs)} ` +
        `Set.has=${setHasMs.toFixed(1)}·${each(setHasMs)} ` +
        `startsWith=${startsWithMs.toFixed(1)}·${each(startsWithMs)}`,
    );
    print(
      `DEBUG CACHE MISS x${OPS} (ms · us each)  ` +
        `weakMap get+set=${weakMissMs.toFixed(1)}·${each(weakMissMs)} ` +
        `map get+set=${mapMissMs.toFixed(1)}·${each(mapMissMs)} ` +
        `added per unshared style=${each(weakMissMs + mapMissMs)}`,
    );
    print(
      `DEBUG FILL x${OPS} (ms · us each)  ` +
        `createElement=${createElementMs.toFixed(1)}·${each(createElementMs)} ` +
        `createRawText=${createRawTextMs.toFixed(1)}·${each(createRawTextMs)} ` +
        `appendChild=${appendChildMs.toFixed(1)}·${each(appendChildMs)}`,
    );
    print(
      `DEBUG PROPS x${OPS} (ms · us each)  ` +
        `style(shared)=${sharedStyleMs.toFixed(1)}·${each(sharedStyleMs)} ` +
        `style(fresh)=${freshStyleMs.toFixed(1)}·${each(freshStyleMs)} ` +
        `boolean=${scalarPropMs.toFixed(1)}·${each(scalarPropMs)} ` +
        `string=${stringPropMs.toFixed(1)}·${each(stringPropMs)}`,
    );

    // why: a pass that recorded nothing would print a convincing zero. The buffer is drained here
    // rather than asserted on directly because `flushOps` is what a commit would do next, and a
    // throw from it is the loudest possible evidence that the ops above were malformed.
    flushOps();
    expect(createElementMs > 0).toBe(true);
    expect(appendChildMs > 0).toBe(true);
  });
});

report();
