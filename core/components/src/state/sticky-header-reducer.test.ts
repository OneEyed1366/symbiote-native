import { describe, it, expect } from 'vitest';
import {
  reduceSticky,
  createInitialStickyState,
  stickyEffectSignature,
  type IStickyReducerInputs,
} from './sticky-header-reducer';

// The reducer holds NO timer: the debounce is a `schedule-debounce` EFFECT the adapter executes with
// its own setTimeout, so the reducer only ever emits the delay as data — there is no real (or fake)
// time to inject here. Every assertion is over the pure transition + emitted effects.
//
// why: reduceSticky has no throwing path (no `throw` in sticky-header-reducer.ts) — every action
// kind resolves to a state, so there is no Negative (toThrow) group below. Groups are instead named
// after the mechanic each guards (redundant-geometry, zero-swallow gate, cross-talk...), which is
// the contract-accurate split for a total, non-throwing reducer.

const IOS_DEBOUNCE_MS = 64;
const ANDROID_DEBOUNCE_MS = 15;

function topInputs(
  over: Partial<IStickyReducerInputs> = {},
): IStickyReducerInputs {
  return {
    os: 'ios',
    inverted: undefined,
    scrollViewHeight: undefined,
    nextHeaderLayoutY: undefined,
    ...over,
  };
}

describe('createInitialStickyState', () => {
  it('starts un-measured with the identity interpolation and the swallow gate armed', () => {
    const state = createInitialStickyState();
    expect(state.measured).toBe(false);
    expect(state.translateY).toBeNull();
    expect(state.haveReceivedInitialZeroTranslateY).toBe(true);
    expect(state.inputRange).toEqual([-1, 0]);
    expect(state.outputRange).toEqual([0, 0]);
  });
});

describe('reduceSticky layout — rebuild-interpolation ranges', () => {
  it('the top branch pins at layoutY and tracks 1:1 past it', () => {
    const state = createInitialStickyState();
    const result = reduceSticky(
      state,
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    );
    expect(result.changed).toBe(true);
    expect(result.state.measured).toBe(true);
    expect(result.state.layoutY).toBe(100);
    const rebuild = result.effects.find(
      effect => effect.kind === 'rebuild-interpolation',
    );
    if (rebuild?.kind !== 'rebuild-interpolation')
      throw new Error('expected rebuild-interpolation');
    // No next header: identity [-1,0] then the top pin at layoutY, tracking 1:1 past it.
    expect(rebuild.inputRange).toEqual([-1, 0, 100, 101]);
    expect(rebuild.outputRange).toEqual([0, 0, 0, 1]);
  });

  it('the inverted branch pins at the viewport bottom (a different range than top)', () => {
    const state = createInitialStickyState();
    const inputs = topInputs({ inverted: true, scrollViewHeight: 200 });
    const result = reduceSticky(
      state,
      { kind: 'layout', y: 300, height: 40 },
      inputs,
    );
    const rebuild = result.effects.find(
      effect => effect.kind === 'rebuild-interpolation',
    );
    if (rebuild?.kind !== 'rebuild-interpolation')
      throw new Error('expected rebuild-interpolation');
    // stickStartPoint = 300 + 40 - 200 = 140 > 0, so it sticks from there.
    expect(rebuild.inputRange).toEqual([-1, 0, 140, 141]);
    expect(rebuild.outputRange).toEqual([0, 0, 0, 1]);
    // Same layout, top branch, resolves to a DIFFERENT range — proving inverted is honored.
    const top = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 300, height: 40 },
      topInputs(),
    );
    const topRebuild = top.effects.find(
      effect => effect.kind === 'rebuild-interpolation',
    );
    if (topRebuild?.kind !== 'rebuild-interpolation')
      throw new Error('expected rebuild-interpolation');
    expect(topRebuild.inputRange).not.toEqual(rebuild.inputRange);
  });

  it('rebuilds on an inputs-changed recompute but NOT on an animated tick or debounce fire', () => {
    const measured = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    ).state;

    const changed = reduceSticky(
      measured,
      { kind: 'inputs-changed' },
      topInputs({ nextHeaderLayoutY: 300 }),
    );
    expect(
      changed.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(true);
    // The next header at 300 sets the collision point (300 - 40 = 260), so the range now tracks to it.
    expect(changed.state.inputRange).toEqual([-1, 0, 100, 260, 261]);

    const tick = reduceSticky(
      changed.state,
      { kind: 'animated-tick', value: 5 },
      topInputs(),
    );
    expect(
      tick.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(false);
    const settle = reduceSticky(
      tick.state,
      { kind: 'debounce-fired', value: 5 },
      topInputs(),
    );
    expect(
      settle.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(false);
  });

  it('does NOT rebuild when inputs-changed re-fires with inputs that resolve to the SAME ranges', () => {
    const measured = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    ).state;

    const first = reduceSticky(
      measured,
      { kind: 'inputs-changed' },
      topInputs({ nextHeaderLayoutY: 300 }),
    );
    expect(
      first.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(true);

    // A parent re-render can re-dispatch 'inputs-changed' off a freshly-recomputed
    // nextHeaderLayoutY (e.g. VirtualizedList re-deriving it from its cross-talk Map on every
    // reactive pass) even when the VALUE is identical — this must NOT rebuild again, or a
    // native-driven header would reconnect on every unrelated parent update (device-confirmed
    // 2026-08-13: this was a second, independent source of the effect_update_depth_exceeded loop
    // the 'layout' guard alone didn't cover).
    const redundant = reduceSticky(
      first.state,
      { kind: 'inputs-changed' },
      topInputs({ nextHeaderLayoutY: 300 }),
    );
    expect(redundant.effects).toEqual([]);
    expect(redundant.changed).toBe(false);
  });

  // REGRESSION (2026-08-14). The redundant-ranges guard above compares freshly derived ranges
  // against the ones already in state — and the INITIAL state holds the identity ranges, which is
  // exactly what an unmeasured header derives. So the guard, as first written, swallowed the very
  // FIRST dispatch: Angular's ScrollViewStickyHeader sends `inputs-changed` from ngOnInit before
  // any layout has happened, got `changed: false` with no effects, never ran change detection, and
  // never committed its wrapper at all — `scroll-view-projection.test.ts` went red looking for a
  // `collapsable: false` node that was never created. "Derives the same values as the initial
  // placeholder" is not the same as "has already been emitted", and only the latter may skip.
  it('DOES emit the first rebuild even though an unmeasured header derives the identity ranges', () => {
    const initial = createInitialStickyState();
    const first = reduceSticky(
      initial,
      { kind: 'inputs-changed' },
      topInputs(),
    );

    expect(
      first.effects,
      'the first inputs-changed must still emit a rebuild',
    ).toEqual([
      {
        kind: 'rebuild-interpolation',
        inputRange: initial.inputRange,
        outputRange: initial.outputRange,
      },
    ]);
    expect(first.changed).toBe(true);

    // ...and only the SECOND identical dispatch is the one the guard exists to swallow.
    const second = reduceSticky(
      first.state,
      { kind: 'inputs-changed' },
      topInputs(),
    );
    expect(second.effects).toEqual([]);
    expect(second.changed).toBe(false);
  });

  it('still rebuilds when inputs-changed re-fires with a genuinely different nextHeaderLayoutY', () => {
    const measured = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    ).state;

    const first = reduceSticky(
      measured,
      { kind: 'inputs-changed' },
      topInputs({ nextHeaderLayoutY: 300 }),
    );
    // reduceSticky mutates `state` in place and returns the SAME object — snapshot the range
    // before the next call overwrites it, or this comparison would read the same live reference
    // twice.
    const firstInputRange = [...first.state.inputRange];
    const moved = reduceSticky(
      first.state,
      { kind: 'inputs-changed' },
      topInputs({ nextHeaderLayoutY: 400 }),
    );
    expect(
      moved.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(true);
    expect(moved.state.inputRange).not.toEqual(firstInputRange);
  });
});

describe('reduceSticky layout — redundant-geometry guard', () => {
  it('does not rebuild the interpolation when a second layout reports the SAME y/height', () => {
    const first = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    );
    expect(
      first.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(true);

    // Yoga legitimately re-fires onLayout with identical geometry (relayout passes, sibling
    // changes, a native-driven prop commit) — a redundant rebuild here is what let a native-driven
    // AnimatedView commit provoke another relayout, an unbounded same-tick ping-pong that crashed
    // with Svelte's effect_update_depth_exceeded (device-confirmed 2026-08-13).
    const redundant = reduceSticky(
      first.state,
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    );
    expect(
      redundant.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(false);
    expect(redundant.changed).toBe(false);
  });

  it('still rebuilds when a second layout reports DIFFERENT geometry', () => {
    const first = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    );
    const moved = reduceSticky(
      first.state,
      { kind: 'layout', y: 120, height: 40 },
      topInputs(),
    );
    expect(
      moved.effects.some(effect => effect.kind === 'rebuild-interpolation'),
    ).toBe(true);
    expect(moved.state.layoutY).toBe(120);
  });

  it('still records cross-talk on a redundant layout even though it skips the rebuild', () => {
    const first = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs({ index: 2 }),
    );
    const redundant = reduceSticky(
      first.state,
      { kind: 'layout', y: 100, height: 40 },
      topInputs({ index: 2 }),
    );
    expect(redundant.effects).toEqual([
      { kind: 'record-header-y', index: 2, y: 100 },
    ]);
  });
});

describe('reduceSticky debounce scheduling', () => {
  it('an animated tick schedules a host-tuned debounce carrying the value', () => {
    const state = createInitialStickyState();
    const ios = reduceSticky(
      state,
      { kind: 'animated-tick', value: 12 },
      topInputs({ os: 'ios' }),
    );
    expect(ios.changed).toBe(false);
    expect(ios.effects).toEqual([
      { kind: 'schedule-debounce', delay: IOS_DEBOUNCE_MS, value: 12 },
    ]);

    const android = reduceSticky(
      state,
      { kind: 'animated-tick', value: 12 },
      topInputs({ os: 'android' }),
    );
    expect(android.effects).toEqual([
      { kind: 'schedule-debounce', delay: ANDROID_DEBOUNCE_MS, value: 12 },
    ]);
  });

  it('debounce-fired commits the translateY and asks for a passthrough', () => {
    const state = createInitialStickyState();
    const result = reduceSticky(
      state,
      { kind: 'debounce-fired', value: 7 },
      topInputs(),
    );
    expect(result.changed).toBe(true);
    expect(result.state.translateY).toBe(7);
    expect(result.effects).toEqual([
      { kind: 'apply-passthrough', translateY: 7 },
    ]);
  });
});

describe('reduceSticky zero-swallow gate', () => {
  it('lets the first zero through (gate armed), but swallows a zero re-emitted after a real value', () => {
    let state = createInitialStickyState();

    // Gate armed on init: the very first zero is a genuine settle, not a rebuild artifact — scheduled.
    const firstZero = reduceSticky(
      state,
      { kind: 'animated-tick', value: 0 },
      topInputs(),
    );
    expect(firstZero.effects).toEqual([
      { kind: 'schedule-debounce', delay: IOS_DEBOUNCE_MS, value: 0 },
    ]);
    state = firstZero.state;

    // A real non-zero value commits, which re-arms the gate (flag -> false).
    state = reduceSticky(
      state,
      { kind: 'animated-tick', value: 9 },
      topInputs(),
    ).state;
    state = reduceSticky(
      state,
      { kind: 'debounce-fired', value: 9 },
      topInputs(),
    ).state;
    expect(state.haveReceivedInitialZeroTranslateY).toBe(false);

    // Now a rebuild re-emits 0: SWALLOWED (no effect), and swallowing re-arms the gate.
    const swallowed = reduceSticky(
      state,
      { kind: 'animated-tick', value: 0 },
      topInputs(),
    );
    expect(swallowed.changed).toBe(false);
    expect(swallowed.effects).toEqual([]);
    expect(swallowed.state.haveReceivedInitialZeroTranslateY).toBe(true);

    // The next zero is a genuine settle again — no longer swallowed.
    const throughAgain = reduceSticky(
      swallowed.state,
      { kind: 'animated-tick', value: 0 },
      topInputs(),
    );
    expect(throughAgain.effects).toEqual([
      { kind: 'schedule-debounce', delay: IOS_DEBOUNCE_MS, value: 0 },
    ]);
  });

  it('a zero-valued debounce fire does NOT re-arm the gate', () => {
    const state = reduceSticky(
      createInitialStickyState(),
      { kind: 'debounce-fired', value: 0 },
      topInputs(),
    ).state;
    expect(state.haveReceivedInitialZeroTranslateY).toBe(true);
  });
});

describe('reduceSticky cross-talk record-header-y', () => {
  it('emits record-header-y on layout ONLY when the reducer owns the child index', () => {
    const withIndex = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 120, height: 40 },
      topInputs({ index: 2 }),
    );
    expect(withIndex.effects).toContainEqual({
      kind: 'record-header-y',
      index: 2,
      y: 120,
    });

    const withoutIndex = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 120, height: 40 },
      topInputs(),
    );
    expect(
      withoutIndex.effects.some(effect => effect.kind === 'record-header-y'),
    ).toBe(false);
  });
});

describe('stickyEffectSignature', () => {
  it('changes when the committed translateY moves and stays put otherwise', () => {
    const state = reduceSticky(
      createInitialStickyState(),
      { kind: 'layout', y: 100, height: 40 },
      topInputs(),
    ).state;
    const before = stickyEffectSignature(state);
    const settled = reduceSticky(
      state,
      { kind: 'debounce-fired', value: 5 },
      topInputs(),
    ).state;
    expect(stickyEffectSignature(settled)).not.toBe(before);
    const idle = reduceSticky(
      settled,
      { kind: 'animated-tick', value: 5 },
      topInputs(),
    ).state;
    expect(stickyEffectSignature(idle)).toBe(stickyEffectSignature(settled));
  });
});
