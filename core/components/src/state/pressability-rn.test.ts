// Port of RN's Pressability-test.js onto the shared press machine, minus the web-only hover cases
// grant = `handlePressIn`, release = `handlePress` + `handlePressOut`, terminate = `handlePressOut`
import { describe, expect, it } from 'vitest';
import { DEFAULT_MIN_PRESS_DURATION_MS } from './pressable';
import { eventAt, makeHarness, type IMeasuredFrame } from './pressable-harness';

const REGION: IMeasuredFrame = { width: 50, height: 50, pageX: 0, pageY: 0 };
const SLOP = { top: 10, left: 10, bottom: 10, right: 10 };
// RN passes `pressRectOffset: null` there, i.e. the built-in default offsets
const RN_DEFAULTS = { pressRetentionOffset: undefined };

const countOf = (log: string[], entry: string): number =>
  log.filter(one => one === entry).length;

describe('RN Pressability: onLongPress', () => {
  it('is not called if released before the delay', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(499);
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());
    clock.advance(1);

    expect(log).not.toContain('long');
  });

  it('is called if the touch moves within 10dp', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt(0, 0));
    handlers.handleResponderMove(eventAt(0, 0));
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    handlers.handleResponderMove(eventAt(7, 7)); // delta ~9.9 < 10
    clock.advance(370);

    expect(log).toContain('long');
  });

  it('is not called if the touch moves beyond 10dp', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt(0, 0));
    handlers.handleResponderMove(eventAt(0, 0));
    clock.advance(130);
    handlers.handleResponderMove(eventAt(7, 8)); // delta ~10.6 > 10
    clock.advance(370);

    expect(log).not.toContain('long');
  });

  it('is called independent of a preceding long touch gesture', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt(0, 0));
    handlers.handleResponderMove(eventAt(0, 0));
    clock.advance(500);
    expect(countOf(log, 'long')).toBe(1);
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    // delta from (0, 0) is ~10.6 > 10, but a new gesture must not carry the old origin over
    handlers.handlePressIn(eventAt(7, 8));
    handlers.handleResponderMove(eventAt(7, 8));
    clock.advance(500);

    expect(countOf(log, 'long')).toBe(2);
  });
});

describe('RN Pressability: onPress', () => {
  it('is called even when measure does not finish', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS, {
      ...REGION,
      delay: 'never',
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    expect(log).toContain('in');

    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());
    expect(log).toContain('press');

    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });
});

describe('RN Pressability: onPressIn / onPressOut timing', () => {
  it('delays onPressIn by a configured delay', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 500,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(499);
    expect(log).not.toContain('in');

    clock.advance(1);
    expect(log).toContain('in');
  });

  it('calls onPressOut only after the 130ms floor when released after a configured delay', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 500,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(500);
    expect(log).toContain('in');
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).not.toContain('out');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });

  it('still calls onPressOut after a terminate that came after the press delay', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 100,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(100);
    expect(log).toContain('in');
    handlers.handlePressOut(eventAt());

    expect(log).not.toContain('out');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });

  it('calls onPressOut 130ms after activation by default, not after the release', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(1);
    expect(log).toContain('in');
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    clock.advance(120);
    expect(log).not.toContain('out');
    clock.advance(10);
    expect(log).toContain('out');
  });

  it('calls onPressOut after only the remaining minimum press duration', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    expect(log).toContain('in');
    clock.advance(120);
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).not.toContain('out');
    clock.advance(10);
    expect(log).toContain('out');
  });
});

describe('RN Pressability: movement within the hit rect', () => {
  const insideSlop = eventAt(
    REGION.width + SLOP.right / 2,
    REGION.height + SLOP.bottom / 2,
  );

  it('calls onPress* when there is no delay', () => {
    const { clock, handlers, log } = makeHarness(
      { ...RN_DEFAULTS, hitSlop: SLOP },
      REGION,
    );

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(insideSlop);
    handlers.handlePress(insideSlop);
    handlers.handlePressOut(insideSlop);

    expect(log).toContain('in');
    expect(log).toContain('press');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });

  it('calls onPress* after a delay', () => {
    const { clock, handlers, log } = makeHarness(
      { ...RN_DEFAULTS, hitSlop: SLOP, unstable_pressDelay: 500 },
      REGION,
    );

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(insideSlop);
    clock.advance(499);
    expect(log).not.toContain('in');

    clock.advance(1);
    expect(log).toContain('in');
    handlers.handlePress(insideSlop);
    handlers.handlePressOut(insideSlop);

    expect(log).toContain('press');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });
});

// `getTouchFromPressEvent`: the first ACTIVE touch wins, then the first changed one, then the event
describe('RN Pressability: which touch a move is judged by', () => {
  const moveWith = (
    nativeEvent: Record<string, unknown>,
  ): ReturnType<typeof eventAt> => ({ ...eventAt(), nativeEvent });

  it('uses touches[0] over the event coordinates', () => {
    const { handlers, log, clock } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt());
    // the changed touch (the event itself) is far away, the first active one is still on the view
    handlers.handleResponderMove(
      moveWith({ pageX: 500, pageY: 500, touches: [{ pageX: 10, pageY: 10 }] }),
    );
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);

    expect(log).toContain('press');
  });

  it('falls back to changedTouches[0] when no touch is active', () => {
    const { handlers, log, clock } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(
      moveWith({
        pageX: 500,
        pageY: 500,
        touches: [],
        changedTouches: [{ pageX: 10, pageY: 10 }],
      }),
    );
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);

    expect(log).toContain('press');
  });
});

describe('RN Pressability: movement beyond the hit rect', () => {
  const beyond = eventAt(REGION.width * 2, REGION.height * 2);

  it('keeps onPress away but still calls onPressIn and onPressOut when there is no delay', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS, REGION);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(beyond);
    expect(log).toContain('in');

    handlers.handlePress(beyond);
    handlers.handlePressOut(beyond);
    expect(log).not.toContain('press');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });

  it('calls none of onPress* after a delay', () => {
    const { clock, handlers, log } = makeHarness(
      { ...RN_DEFAULTS, unstable_pressDelay: 500 },
      REGION,
    );

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(beyond);
    clock.advance(500);
    expect(log).not.toContain('in');

    handlers.handlePress(beyond);
    handlers.handlePressOut(beyond);
    expect(log).not.toContain('press');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).not.toContain('out');
  });
});

describe('RN Pressability: a frame that has not arrived yet', () => {
  // `onResponderMove` returns early until measured, so nothing drifts and the release still presses
  it('calls onPress* when the press is released before measure completes', () => {
    const { clock, handlers, log } = makeHarness(
      { ...RN_DEFAULTS, unstable_pressDelay: 500 },
      { ...REGION, delay: 1_000 },
    );
    const beyond = eventAt(REGION.width * 2, REGION.height * 2);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(beyond);
    clock.advance(499);
    expect(log).not.toContain('in');

    clock.advance(1);
    expect(log).toContain('in');
    handlers.handlePress(beyond);
    handlers.handlePressOut(beyond);

    expect(log).toContain('press');
    clock.advance(630); // 1000 - 500 (already advanced) + DEFAULT_MIN_PRESS_DURATION
    expect(log).toContain('out');
  });

  it('never drifts when the host cannot measure at all', () => {
    const { handlers, log } = makeHarness(RN_DEFAULTS, null);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt(500, 500));
    handlers.handlePress(eventAt(500, 500));

    expect(log).toContain('press');
  });
});

describe('RN Pressability: the long press delay', () => {
  it('is called if pressed for 500ms', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS);

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(499);
    expect(log).not.toContain('long');

    clock.advance(1);
    expect(log).toContain('long');
  });

  // The behavior hands the machine `500 - delayPressIn`, so the sum stays 500
  it('counts from the touch, not from the delayed press in', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 100,
      delayLongPress: 400,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(499);
    expect(log).not.toContain('long');

    clock.advance(1);
    expect(log).toContain('long');
  });
});

describe('RN Pressability: onPressIn', () => {
  it('is called after the grant', () => {
    const { clock, handlers, log } = makeHarness(RN_DEFAULTS);

    handlers.handlePressIn(eventAt());
    clock.advance(0);

    expect(log).toContain('in');
  });

  it('is called synchronously if the delay is 0ms', () => {
    const { handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 0,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());

    expect(log).toContain('in');
  });
});

describe('RN Pressability: onPressOut around the press delay', () => {
  it('is called 130ms after a release that came before the delay', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 1,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    expect(log).not.toContain('in');
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).not.toContain('out');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).toContain('out');
  });

  it('is never called after a terminate that came before the delay', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      unstable_pressDelay: 1,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).not.toContain('out');
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(log).not.toContain('out');
  });

  it('is called synchronously if the minimum press duration is 0ms', () => {
    const { clock, handlers, log } = makeHarness({
      ...RN_DEFAULTS,
      minPressDuration: 0,
    });

    handlers.handlePressIn(eventAt());
    handlers.handleResponderMove(eventAt());
    clock.advance(0);
    expect(log).toContain('in');
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).toContain('out');
  });
});
