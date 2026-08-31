// Deterministic unit tests for the shared Pressable state machine. Framework tests prove that each
// adapter wires this machine to its own lifecycle; this file owns the timing/transition contract
// itself: delayed activation, retention drift/re-entry, RN's 130ms active-duration floor, and
// teardown of every timer class.
import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import {
  createPressHandlers,
  createPressRuntime,
  disposePressRuntime,
  DEFAULT_MIN_PRESS_DURATION_MS,
  type IPressHost,
  type IPressMachineConfig,
} from './pressable';

interface IScheduled {
  due: number;
  callback: () => void;
  cancelled: boolean;
}

function makeClock(): {
  schedule: IPressHost['schedule'];
  now: () => number;
  advance: (ms: number) => void;
  pending: () => number;
} {
  let now = 0;
  const scheduled: IScheduled[] = [];
  return {
    schedule(callback, ms) {
      const entry: IScheduled = { due: now + ms, callback, cancelled: false };
      scheduled.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    now: () => now,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = scheduled
          .filter(entry => !entry.cancelled && entry.due <= target)
          .sort((a, b) => a.due - b.due)[0];
        if (due === undefined) break;
        now = due.due;
        due.cancelled = true;
        due.callback();
      }
      now = target;
    },
    pending: () => scheduled.filter(entry => !entry.cancelled).length,
  };
}

function eventAt(x = 0, y = 0): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'press',
    target,
    currentTarget: target,
    nativeEvent: { pageX: x, pageY: y },
    stopPropagation: () => {},
  };
}

function makeHarness(overrides: Partial<IPressMachineConfig> = {}) {
  const clock = makeClock();
  const log: string[] = [];
  const runtime = createPressRuntime();
  const config: IPressMachineConfig = {
    delayLongPress: 500,
    unstable_pressDelay: 0,
    hitSlop: 0,
    pressRetentionOffset: 30,
    onPress: () => log.push('press'),
    onPressIn: () => log.push('in'),
    onPressOut: () => log.push('out'),
    onLongPress: () => log.push('long'),
    ...overrides,
  };
  const host: IPressHost = {
    setPressed: pressed => log.push(pressed ? 'pressed:true' : 'pressed:false'),
    getMeasureFn: () => undefined,
    schedule: clock.schedule,
    now: clock.now,
  };
  return {
    clock,
    log,
    runtime,
    handlers: createPressHandlers(config, runtime, host),
  };
}

describe('Pressable delayed activation and retention', () => {
  it('never activates or emits pressOut when the touch leaves before the delay and stays out', () => {
    const { clock, handlers, log } = makeHarness({ unstable_pressDelay: 120 });

    handlers.handlePressIn(eventAt(0, 0));
    handlers.handleResponderMove(eventAt(100, 0));
    clock.advance(120);
    handlers.handlePress(eventAt(100, 0));
    handlers.handlePressOut(eventAt(100, 0));
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);

    expect(log).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  it('activates once the delay elapsed and the touch returns inside', () => {
    const { clock, handlers, log } = makeHarness({ unstable_pressDelay: 120 });

    handlers.handlePressIn(eventAt(0, 0));
    handlers.handleResponderMove(eventAt(100, 0));
    clock.advance(120);
    expect(log).toEqual([]);

    handlers.handleResponderMove(eventAt(10, 0));
    expect(log).toEqual(['pressed:true', 'in']);
  });

  it('cancels a deferred pressOut when the active touch returns inside', () => {
    const { clock, handlers, log } = makeHarness();

    handlers.handlePressIn(eventAt(0, 0));
    clock.advance(10);
    handlers.handleResponderMove(eventAt(100, 0));
    clock.advance(20);
    handlers.handleResponderMove(eventAt(10, 0));
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);

    expect(log).toEqual(['pressed:true', 'in', 'pressed:true', 'in']);
  });
});

describe('Pressable release timing', () => {
  it('flushes an early in-bounds release, fires press, then holds pressOut for 130ms', () => {
    const { clock, handlers, log } = makeHarness({ unstable_pressDelay: 120 });

    handlers.handlePressIn(eventAt());
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());
    expect(log).toEqual(['pressed:true', 'in', 'press']);

    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS - 1);
    expect(log).toEqual(['pressed:true', 'in', 'press']);
    clock.advance(1);
    expect(log).toEqual([
      'pressed:true',
      'in',
      'press',
      'pressed:false',
      'out',
    ]);
  });

  it('supports Touchable’s internal zero-duration Pressability override', () => {
    const { handlers, log, clock } = makeHarness({ minPressDuration: 0 });

    handlers.handlePressIn(eventAt());
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).toEqual([
      'pressed:true',
      'in',
      'press',
      'pressed:false',
      'out',
    ]);
    expect(clock.pending()).toBe(0);
  });

  it('deactivates immediately once the press was already active for 130ms', () => {
    const { clock, handlers, log } = makeHarness();

    handlers.handlePressIn(eventAt());
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());

    expect(log).toEqual([
      'pressed:true',
      'in',
      'press',
      'pressed:false',
      'out',
    ]);
    expect(clock.pending()).toBe(0);
  });

  it('does not synthesize activation for a cancellation before the press delay', () => {
    const { clock, handlers, log } = makeHarness({ unstable_pressDelay: 120 });

    handlers.handlePressIn(eventAt());
    handlers.handlePressOut(eventAt());
    clock.advance(500);

    expect(log).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  it('emits one deferred pressOut when a live press drifts out, never a duplicate on release', () => {
    const { clock, handlers, log } = makeHarness();

    handlers.handlePressIn(eventAt(0, 0));
    clock.advance(20);
    handlers.handleResponderMove(eventAt(100, 0));
    handlers.handlePress(eventAt(100, 0));
    handlers.handlePressOut(eventAt(100, 0));
    expect(log).toEqual(['pressed:true', 'in']);

    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS - 20);
    expect(log).toEqual(['pressed:true', 'in', 'pressed:false', 'out']);
    expect(clock.pending()).toBe(0);
  });
});

describe('disposePressRuntime', () => {
  it('cancels a pending press delay and prevents its callback after teardown', () => {
    const { clock, handlers, log, runtime } = makeHarness({
      unstable_pressDelay: 120,
    });

    handlers.handlePressIn(eventAt());
    disposePressRuntime(runtime);
    clock.advance(120);

    expect(log).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  it('cancels a pending long press after activation', () => {
    const { clock, handlers, log, runtime } = makeHarness();

    handlers.handlePressIn(eventAt());
    disposePressRuntime(runtime);
    clock.advance(500);

    expect(log).toEqual(['pressed:true', 'in']);
    expect(clock.pending()).toBe(0);
  });

  it('cancels a deferred pressOut and never writes into an unmounted adapter', () => {
    const { clock, handlers, log, runtime } = makeHarness();

    handlers.handlePressIn(eventAt());
    handlers.handlePress(eventAt());
    handlers.handlePressOut(eventAt());
    disposePressRuntime(runtime);
    clock.advance(DEFAULT_MIN_PRESS_DURATION_MS);

    expect(log).toEqual(['pressed:true', 'in', 'press']);
    expect(clock.pending()).toBe(0);
  });
});
