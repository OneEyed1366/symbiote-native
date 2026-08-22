// Co-located unit test for the shared TouchableOpacity press-feedback machine. The three adapters
// (React/Vue/Angular) used to re-implement this scheduling line-for-line; it now lives here once and
// each adapter supplies only its native activate/deactivate (the Animated opacity fade + the
// framework emit). This drives the machine with a dependency-injected fake clock + scheduler — no
// real time — proving: the delayPressIn defer timer, the early-release flush, the min-press-duration
// hold, and the activate/deactivate ordering.

import { describe, expect, it } from 'vitest';
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import {
  computePressOutWait,
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  createHighlightUnderlayHandlers,
  createHighlightUnderlayRuntime,
  hasTouchablePressHandler,
  restingOpacityFromStyle,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_UNDERLAY_COLOR,
  RESTING_OPACITY,
  type IHighlightUnderlayConfig,
  type ITouchableFeedbackConfig,
} from './touchable';

// An arbitrary non-zero floor to exercise the hold; the value itself is not under test.
const HOLD_MS = 130;
import { resolveHighlightExtraStyles } from '../view/render-touchable-highlight';

// No Negative group: every symbol here is a total function over its input (scheduling math,
// object construction, timer bookkeeping) with no guard clause and nothing that can throw or
// reject. The scenarios below are all Positive — the machine's only two failure modes (a leaked
// timer, an out-of-order activate/deactivate) show up as a WRONG value/order, not a throw, so
// they are asserted as such rather than invented as a "should throw" case.

// A deterministic clock + one-shot scheduler: time only moves when the test calls advance(); a
// scheduled callback fires once when the clock reaches its due time, and its returned canceller
// removes it (the flush-on-early-release path). No real setTimeout, so the hold is exact.
interface IScheduled {
  due: number;
  callback: () => void;
  cancelled: boolean;
}

function makeClock(): {
  schedule: ITouchableFeedbackConfig['schedule'];
  now: () => number;
  advance: (ms: number) => void;
  pending: () => number;
} {
  let clock = 0;
  const scheduled: IScheduled[] = [];

  return {
    schedule(callback: () => void, ms: number): () => void {
      const entry: IScheduled = { due: clock + ms, callback, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    now: () => clock,
    advance(ms: number): void {
      const target = clock + ms;
      for (;;) {
        const due = scheduled
          .filter(entry => !entry.cancelled && entry.due <= target)
          .sort((a, b) => a.due - b.due)[0];
        if (due === undefined) break;
        clock = due.due;
        due.cancelled = true;
        due.callback();
      }
      clock = target;
    },
    pending(): number {
      return scheduled.filter(entry => !entry.cancelled).length;
    },
  };
}

function makeEvent(): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'topTouchStart',
    target,
    currentTarget: target,
    nativeEvent: {},
    stopPropagation: () => {},
  };
}

// A recorder for the injected native seam. `log` is the ordered activate/deactivate trace.
function makeCallbacks(): {
  activate: (e: ISymbioteEvent) => void;
  deactivate: (e: ISymbioteEvent) => void;
  log: string[];
} {
  const log: string[] = [];
  return {
    activate: () => log.push('activate'),
    deactivate: () => log.push('deactivate'),
    log,
  };
}

function baseConfig(
  clock: ReturnType<typeof makeClock>,
  over: Partial<ITouchableFeedbackConfig> = {},
): ITouchableFeedbackConfig {
  return {
    delayPressIn: 0,
    delayPressOut: 0,
    minPressDuration: 0,
    schedule: clock.schedule,
    now: clock.now,
    ...over,
  };
}

describe('computePressOutWait (Positive — the RN _deactivate floor)', () => {
  // why: RN holds the active visual for at least minPressDuration past activation, so a very fast
  // tap still flashes it — heldFor already covers most of the floor, so little wait remains.
  it('waits the remaining min-press-duration when it exceeds delayPressOut', () => {
    expect(computePressOutWait(50, 130, 0)).toBe(80);
  });

  // why: a tap held longer than minPressDuration must not wait NEGATIVE time — delayPressOut (here
  // 0) is the other floor, so the wait clamps at 0 rather than going negative.
  it('never returns a negative wait when the press was already held past the minimum', () => {
    expect(computePressOutWait(200, 130, 0)).toBe(0);
  });

  // why: delayPressOut is an independent floor RN applies regardless of activation timing — it
  // wins even when minPressDuration alone would already be satisfied.
  it('floors on delayPressOut when it exceeds the remaining min-press-duration hold', () => {
    expect(computePressOutWait(130, 130, 40)).toBe(40);
  });
});

describe('createTouchableFeedbackRuntime (Positive)', () => {
  // why: a fresh runtime must start with no in-flight timer and no activation stamp, or the very
  // first pressOut would compute a bogus heldFor against a stale activatedAt.
  it('starts with no pending timer and no activation stamp', () => {
    const runtime = createTouchableFeedbackRuntime();
    expect(runtime.pressInTimerCancel).toBeUndefined();
    expect(runtime.activatedAt).toBeUndefined();
  });
});

describe('createTouchableFeedbackHandlers (Positive)', () => {
  it('activates synchronously on pressIn when no delay, deactivates on pressOut', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    expect(cb.log).toEqual(['activate']);
    expect(clock.pending()).toBe(0);

    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('defers activation behind delayPressIn until the timer fires', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn } = createTouchableFeedbackHandlers(
      baseConfig(clock, { delayPressIn: 30 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    // The active visual is deferred: nothing yet, one pending timer.
    expect(cb.log).toEqual([]);
    expect(clock.pending()).toBe(1);

    clock.advance(30);
    expect(cb.log).toEqual(['activate']);
  });

  it('flushes a still-pending delayPressIn timer on an early release, then holds min-press-duration', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, {
        delayPressIn: 30,
        minPressDuration: HOLD_MS,
      }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    expect(cb.log).toEqual([]);

    // Release before the 30ms defer elapses: it flushes (synchronous activate), then the deactivate
    // is held minPressDuration past that activation so a fast tap still flashes the visual.
    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate']);
    // The original defer timer was cancelled; only the deactivate hold is pending.
    expect(clock.pending()).toBe(1);

    clock.advance(HOLD_MS);
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('holds the deactivate for minPressDuration minus the time already held', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { minPressDuration: 130 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    expect(cb.log).toEqual(['activate']);

    // Held 50ms already, so the remaining hold is 130 - 50 = 80ms.
    clock.advance(50);
    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate']);

    clock.advance(79);
    expect(cb.log).toEqual(['activate']);
    clock.advance(1);
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('waits at least delayPressOut when it exceeds the remaining min-press-duration hold', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { minPressDuration: 0, delayPressOut: 40 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    handlePressOut(makeEvent());
    // minPressDuration is 0 but delayPressOut floors the wait at 40ms.
    expect(cb.log).toEqual(['activate']);
    clock.advance(39);
    expect(cb.log).toEqual(['activate']);
    clock.advance(1);
    expect(cb.log).toEqual(['activate', 'deactivate']);
  });

  it('deactivates synchronously when neither hold applies', () => {
    const clock = makeClock();
    const cb = makeCallbacks();
    const runtime = createTouchableFeedbackRuntime();
    const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
      baseConfig(clock, { minPressDuration: 0, delayPressOut: 0 }),
      runtime,
      cb,
    );

    handlePressIn(makeEvent());
    handlePressOut(makeEvent());
    expect(cb.log).toEqual(['activate', 'deactivate']);
    expect(clock.pending()).toBe(0);
  });
});

// ---- the RN-audited additions (2026-08-19) ----------------------------------------------------
//
// Everything below covers the API added after measuring the port against RN's own sources. It is
// what the React/Vue/Svelte/Angular Touchables migrate onto, so the contract is pinned here rather
// than re-discovered in each adapter.

describe('restingOpacityFromStyle', () => {
  // why: RN's fade settles at the CALLER's opacity, not at 1. Getting this wrong is invisible until
  // someone styles a Touchable faded, and then every release jumps it to fully opaque.
  it('reads opacity out of a style, including a nested array', () => {
    expect(restingOpacityFromStyle({ opacity: 0.6 })).toBe(0.6);
    expect(restingOpacityFromStyle([{ width: 1 }, [{ opacity: 0.25 }]])).toBe(
      0.25,
    );
  });

  // why: the fallback IS the common case (no opacity in the style at all), and a non-numeric
  // opacity must not leak into an Animated.Value where it would produce NaN frames.
  it('falls back to 1 when the style carries no numeric opacity', () => {
    expect(restingOpacityFromStyle(undefined)).toBe(RESTING_OPACITY);
    expect(restingOpacityFromStyle({ width: 1 })).toBe(RESTING_OPACITY);
    expect(restingOpacityFromStyle({ opacity: 'half' })).toBe(RESTING_OPACITY);
  });
});

describe('hasTouchablePressHandler', () => {
  // why: RN's _hasPressHandler gate. Any ONE of the four counts — a Touchable with only
  // onLongPress is still interactive and must still flash its underlay.
  it('is true when any single press callback is supplied', () => {
    expect(hasTouchablePressHandler({ onLongPress: () => {} })).toBe(true);
    expect(hasTouchablePressHandler({ onPressIn: () => {} })).toBe(true);
    expect(hasTouchablePressHandler({})).toBe(false);
  });
});

describe('resolveHighlightExtraStyles', () => {
  // why: THE bug this API replaces. RN puts the backgroundColor on the container and the lowered
  // opacity on the CHILD; folding both onto one node fades the underlay it is meant to reveal.
  // Asserting they come back as two separate objects is what keeps a caller from re-merging them
  // by accident.
  it('returns the underlay and child styles separately', () => {
    const styles = resolveHighlightExtraStyles({
      shown: true,
      hasPressHandler: true,
      underlayColor: '#abc',
      activeOpacity: 0.5,
    });
    expect(styles).toEqual({
      underlay: { backgroundColor: '#abc' },
      child: { opacity: 0.5 },
    });
  });

  it('defaults to RN black / 0.85', () => {
    expect(
      resolveHighlightExtraStyles({ shown: true, hasPressHandler: true }),
    ).toEqual({
      underlay: { backgroundColor: DEFAULT_UNDERLAY_COLOR },
      child: { opacity: DEFAULT_HIGHLIGHT_CHILD_OPACITY },
    });
  });

  // why: RN's `extraStyles: null` state, reachable two ways — not shown, or shown on a Touchable
  // that handles no press at all.
  it('paints nothing when not shown or when no press handler exists', () => {
    expect(
      resolveHighlightExtraStyles({ shown: false, hasPressHandler: true }),
    ).toBeUndefined();
    expect(
      resolveHighlightExtraStyles({ shown: true, hasPressHandler: false }),
    ).toBeUndefined();
  });
});

describe('the TouchableHighlight underlay machine', () => {
  function makeUnderlay(
    clock: ReturnType<typeof makeClock>,
    over: Partial<IHighlightUnderlayConfig> = {},
  ): {
    handlers: ReturnType<typeof createHighlightUnderlayHandlers>;
    log: string[];
  } {
    const log: string[] = [];
    const handlers = createHighlightUnderlayHandlers(
      {
        delayPressOut: 0,
        hasPressHandler: true,
        schedule: clock.schedule,
        ...over,
      },
      createHighlightUnderlayRuntime(),
      {
        setShown: shown => log.push(shown ? 'show' : 'hide'),
        onShowUnderlay: () => log.push('onShow'),
        onHideUnderlay: () => log.push('onHide'),
      },
    );
    return { handlers, log };
  }

  // why: the reason this is a machine and not a `pressed`-derived style. The engine emits press
  // BEFORE pressOut, so onPress arms the hide timer and onPressOut must then decline to hide —
  // that is what keeps a too-fast-to-see tap flashing for delayPressOut.
  it('holds the underlay for delayPressOut past the tap', () => {
    const clock = makeClock();
    const { handlers, log } = makeUnderlay(clock, { delayPressOut: 40 });

    handlers.handlePressIn(makeEvent());
    handlers.handlePress(makeEvent());
    handlers.handlePressOut(makeEvent());
    expect(log, 'pressOut must not hide while the timer is armed').toEqual([
      'show',
      'onShow',
      'show',
      'onShow',
    ]);

    clock.advance(40);
    expect(log.slice(-2)).toEqual(['hide', 'onHide']);
  });

  // why: a cancelled gesture never gets onPress, so nothing arms the timer and the underlay has to
  // come off at once — otherwise a drift off the button leaves it stuck highlighted.
  it('hides at once on a press-out with no preceding press', () => {
    const clock = makeClock();
    const { handlers, log } = makeUnderlay(clock);

    handlers.handlePressIn(makeEvent());
    handlers.handlePressOut(makeEvent());
    expect(log).toEqual(['show', 'onShow', 'hide', 'onHide']);
    expect(clock.pending()).toBe(0);
  });

  // why: RN's _hasPressHandler gate lives INSIDE show/hide, not at the call site — a decorative
  // TouchableHighlight must stay inert even though the touch still reaches its handlers.
  it('paints nothing at all without a press handler', () => {
    const clock = makeClock();
    const { handlers, log } = makeUnderlay(clock, { hasPressHandler: false });

    handlers.handlePressIn(makeEvent());
    handlers.handlePress(makeEvent());
    clock.advance(1);
    handlers.handlePressOut(makeEvent());
    expect(log).toEqual([]);
  });

  // why: a second press-in arriving while a post-press hide is pending must cancel it, or the
  // underlay blinks off in the middle of the next press.
  it('cancels a pending hide when a new press begins', () => {
    const clock = makeClock();
    const { handlers, log } = makeUnderlay(clock, { delayPressOut: 40 });

    handlers.handlePress(makeEvent());
    handlers.handlePressIn(makeEvent());
    expect(clock.pending(), 'the pending hide must be cancelled').toBe(0);

    clock.advance(100);
    expect(log.includes('hide'), 'no hide may land').toBe(false);
  });
});
