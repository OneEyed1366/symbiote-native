// Co-located unit test for Pressable's shared render half: the 3 agnostic gating predicates
// buildPressableListeners is built from, buildPressableListeners itself (the listener bag every
// non-Angular adapter spreads onto its View), and the accessibilityState/hover helpers. The 3
// predicates are also the ones the Angular Pressable calls directly (it has no listener bag to
// spread onto - see adapters/angular/src/components/pressable/index.ts), so this file is the
// single source of truth for the disabled/cancelable semantics both sides must agree on.
//
// No Negative group: every export here is total over its typed input (boolean/undefined gates,
// plain object composition) — nothing throws or rejects. All scenarios are Positive.

import { describe, expect, it } from 'vitest';
import {
  buildPressableListeners,
  isTerminationAllowed,
  noteHoverNoop,
  resolveDisabledAccessibilityState,
  shouldClaimResponder,
  shouldSuppressPress,
} from './index';
import type { IPressHandlers } from '../../state/pressable';

describe('shouldSuppressPress', () => {
  it('suppresses when disabled is true', () => {
    expect(shouldSuppressPress(true)).toBe(true);
  });

  it('does not suppress when disabled is false', () => {
    expect(shouldSuppressPress(false)).toBe(false);
  });

  it('does not suppress when disabled is undefined', () => {
    expect(shouldSuppressPress(undefined)).toBe(false);
  });
});

describe('shouldClaimResponder', () => {
  it('claims the responder when disabled is false', () => {
    expect(shouldClaimResponder(false)).toBe(true);
  });

  it('claims the responder when disabled is undefined', () => {
    expect(shouldClaimResponder(undefined)).toBe(true);
  });

  it('refuses to claim the responder when disabled is true', () => {
    expect(shouldClaimResponder(true)).toBe(false);
  });
});

describe('isTerminationAllowed', () => {
  it('allows termination when cancelable is true', () => {
    expect(isTerminationAllowed(true)).toBe(true);
  });

  it('refuses termination when cancelable is false', () => {
    expect(isTerminationAllowed(false)).toBe(false);
  });

  // This is exactly the case render-pressable.ts and the Angular Pressable used to disagree on:
  // render-pressable.ts left the whole onResponderTerminationRequest listener off the bag when
  // cancelable is unset (deferring to RN's own default), while Angular's allowTermination()
  // hardcoded `cancelable !== false` (defaulting to allowed). Both resolve to "allowed" - this
  // predicate is the single definition both sides now call, matching RN's documented default.
  it('defaults to allowed when cancelable is undefined, matching RN default-true-when-unset', () => {
    expect(isTerminationAllowed(undefined)).toBe(true);
  });
});

describe('resolveDisabledAccessibilityState', () => {
  // why: RN folds `disabled` into accessibilityState even when the caller passed none, so a
  // disabled Pressable is always reported disabled to assistive tech regardless of what
  // accessibilityState the caller wrote.
  it('merges disabled into an existing accessibilityState', () => {
    const result = resolveDisabledAccessibilityState({ selected: true }, true);
    expect(result).toEqual({ selected: true, disabled: true });
  });

  it('synthesizes an accessibilityState purely from disabled when none was given', () => {
    const result = resolveDisabledAccessibilityState(undefined, false);
    expect(result).toEqual({ disabled: false });
  });

  // why: an unset `disabled` must leave accessibilityState completely untouched (not even an
  // `undefined` disabled key added), matching Pressable.js's `disabled != null` guard — an
  // adapter that never passed `disabled` must not silently start reporting one.
  it('returns accessibilityState unchanged when disabled is unset', () => {
    const state = { selected: true };
    expect(resolveDisabledAccessibilityState(state, undefined)).toBe(state);
  });
});

function makeHandlers(calls: string[]): IPressHandlers {
  return {
    handlePress: () => calls.push('press'),
    handlePressIn: () => calls.push('pressIn'),
    handlePressOut: () => calls.push('pressOut'),
    handleResponderMove: () => calls.push('move'),
  };
}

describe('buildPressableListeners', () => {
  // why: a disabled Pressable must not fire ANY press-related listener — not "listeners that
  // no-op", the keys themselves must be absent, so a responder-negotiation check elsewhere that
  // merely tests `'onPress' in props` still sees a genuinely non-interactive view.
  it('returns no listeners at all when disabled', () => {
    const calls: string[] = [];
    const listeners = buildPressableListeners(makeHandlers(calls), { disabled: true });
    expect(listeners).toEqual({});
  });

  it('wires the full listener bag straight to the given handlers when enabled', () => {
    const calls: string[] = [];
    const handlers = makeHandlers(calls);
    const listeners = buildPressableListeners(handlers, {});
    expect(listeners.onPress).toBe(handlers.handlePress);
    expect(listeners.onPressIn).toBe(handlers.handlePressIn);
    expect(listeners.onPressOut).toBe(handlers.handlePressOut);
    expect(listeners.onResponderMove).toBe(handlers.handleResponderMove);
  });

  // why: onStartShouldSetResponder must consult the LIVE disabled value through
  // shouldClaimResponder, not a value baked in at bag-construction time — this is what lets a
  // single built bag stay correct if disabled flips without rebuilding the listeners.
  it('onStartShouldSetResponder delegates to shouldClaimResponder with the given disabled flag', () => {
    const calls: string[] = [];
    const enabled = buildPressableListeners(makeHandlers(calls), { disabled: false });
    expect(typeof enabled.onStartShouldSetResponder).toBe('function');
    const fn = enabled.onStartShouldSetResponder as () => boolean;
    expect(fn()).toBe(true);
  });

  // why: this is the exact bag-shape half of the historical Angular/render-pressable disagreement
  // documented on isTerminationAllowed above — cancelable UNSET must omit the key entirely
  // (deferring to RN's native default), not attach a listener that happens to return true.
  it('omits onResponderTerminationRequest entirely when cancelable is unset', () => {
    const calls: string[] = [];
    const listeners = buildPressableListeners(makeHandlers(calls), {});
    expect('onResponderTerminationRequest' in listeners).toBe(false);
  });

  it('attaches onResponderTerminationRequest, delegating to isTerminationAllowed, when cancelable is set', () => {
    const calls: string[] = [];
    const listeners = buildPressableListeners(makeHandlers(calls), { cancelable: false });
    expect(typeof listeners.onResponderTerminationRequest).toBe('function');
    const fn = listeners.onResponderTerminationRequest as () => boolean;
    expect(fn()).toBe(false);
  });
});

describe('noteHoverNoop', () => {
  // why: the only externally-observable contract is "never throws" — hover truly has no event on
  // a touch host (per the module's own header comment), so this call is purely a debug-log
  // annotation; whether it logs is DEBUG-gated dlog behavior owned by @symbiote-native/engine, not
  // a product outcome this predicate-level module should assert on.
  it('is a safe no-op regardless of whether hover callbacks are provided', () => {
    expect(() => noteHoverNoop(undefined, undefined)).not.toThrow();
    expect(() => noteHoverNoop(() => {}, () => {})).not.toThrow();
  });
});
