// Unit test for forkEvent / unforkEvent (RN AnimatedImplementation.js ~519-538): combining an
// existing event handler with an extra listener, and undoing that. Pure JS, no Fabric slot.
//
// No Negative group: forkEvent/unforkEvent have no guard clause of their own — every input
// shape (undefined, an AnimatedEvent handler, a plain function) is a valid case with its own
// documented branch. The "must not throw" tests below cover the one branch that COULD have been
// a crash (unforking a fork that has no removable seam) and prove it is a deliberate no-op
// instead.

import { describe, expect, it } from 'vitest';
import {
  AnimatedValue,
  event,
  forkEvent,
  unforkEvent,
} from '@symbiote-native/engine';

describe('forkEvent / unforkEvent — Positive', () => {
  // why: with no existing handler, the new listener simply BECOMES the handler — the degenerate
  // case of "fork onto nothing" must not wrap in an unnecessary combinator.
  it('returns the new listener as the handler when existing is undefined', () => {
    let solo = 0;
    const fromNothing = forkEvent(undefined, () => {
      solo += 1;
    });
    fromNothing({ nativeEvent: {} });
    expect(solo).toBe(1);
  });

  // why: forking onto an AnimatedEvent (built via `event(...)`) must APPEND the listener to the
  // SAME AnimatedEvent rather than wrapping it — this is what lets the value-driving mapping
  // keep working after the fork (a wrapping wouldn't preserve __getEvent for a later native
  // attach).
  it('appends to an AnimatedEvent, returns the SAME handler, and still drives the value', () => {
    const scrollY = new AnimatedValue(0);
    const calls: string[] = [];
    const handler = event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        listener: () => calls.push('config'),
      },
    );
    const extra = (): void => {
      calls.push('forked');
    };
    const forked = forkEvent(handler, extra);
    expect(forked).toBe(handler);

    forked({ nativeEvent: { contentOffset: { y: 25 } } });
    expect(scrollY.__getValue()).toBe(25);
    expect(calls).toEqual(['config', 'forked']);
  });

  // why: unforking a listener that was appended to an AnimatedEvent must remove ONLY that
  // listener — the config listener and the value-driving mapping must keep working afterward.
  it('unforkEvent removes a forked listener from an AnimatedEvent while the value still drives', () => {
    const scrollY = new AnimatedValue(0);
    const calls: string[] = [];
    const handler = event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      {
        listener: () => calls.push('config'),
      },
    );
    const extra = (): void => {
      calls.push('forked');
    };
    const forked = forkEvent(handler, extra);
    forked({ nativeEvent: { contentOffset: { y: 25 } } });

    calls.length = 0;
    unforkEvent(forked, extra);
    forked({ nativeEvent: { contentOffset: { y: 30 } } });
    expect(scrollY.__getValue()).toBe(30);
    expect(calls).toEqual(['config']);
  });

  // why: forking onto a PLAIN function (not built via `event(...)`) has no AnimatedEvent to
  // append to, so it must produce a NEW function calling both in registration order — the
  // original function is left untouched (still usable standalone elsewhere).
  it('combines a plain-function existing into a NEW function calling both in order', () => {
    const order: string[] = [];
    const base = (): void => {
      order.push('base');
    };
    const combined = forkEvent(base, () => order.push('added'));
    expect(combined).not.toBe(base);
    combined({ nativeEvent: {} });
    expect(order).toEqual(['base', 'added']);
  });

  // why: forkEvent can be called more than once onto the same AnimatedEvent (e.g. two different
  // consumers each fork their own listener onto one scroll handler) — every listener must fire,
  // in registration order.
  it('forking twice onto the same AnimatedEvent registers both listeners in order', () => {
    const order: string[] = [];
    const handler = event([{ nativeEvent: {} }]);
    forkEvent(handler, () => order.push('first'));
    const twiceForked = forkEvent(handler, () => order.push('second'));
    expect(twiceForked).toBe(handler);

    twiceForked({ nativeEvent: {} });
    expect(order).toEqual(['first', 'second']);
  });
});

describe('forkEvent / unforkEvent — no removable seam (must not throw)', () => {
  // why: RN's unforkEventImpl only removes from an AnimatedEvent — a plain-function fork has no
  // listener list to remove from, so this must be a silent no-op, not a crash, matching RN
  // exactly (documented on unforkEvent).
  it('unforkEvent on a plain-function fork is a no-op', () => {
    const base = (): void => {};
    const combined = forkEvent(base, () => {});
    expect(() => unforkEvent(combined, base)).not.toThrow();
  });

  // why: calling unforkEvent with no existing handler at all (nothing was ever forked) is a
  // legitimate no-op call site — a cleanup effect that runs before its corresponding fork ever
  // happened must not crash.
  it('unforkEvent with existing:undefined is a no-op', () => {
    expect(() => unforkEvent(undefined, () => {})).not.toThrow();
  });
});
