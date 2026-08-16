// Pure unit coverage for the framework-agnostic pub/sub emitter - zero React, so no fabric/mount
// scaffolding needed (mirrors navigator-state.test.ts's plain reducer coverage, once that lands).

import { describe, expect, it, vi } from 'vitest';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createNavigationEmitter,
  diffFocusedRoute,
} from './index';

describe('createNavigationEmitter', () => {
  it('calls a listener registered for the emitted event', () => {
    const emitter = createNavigationEmitter();
    const listener = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_FOCUS, listener);

    emitter.emit(NAVIGATION_EVENT_FOCUS, { some: 'payload' });

    expect(listener).toHaveBeenCalledWith({ some: 'payload' });
  });

  it('does not call a listener registered for a different event', () => {
    const emitter = createNavigationEmitter();
    const listener = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_BLUR, listener);

    emitter.emit(NAVIGATION_EVENT_FOCUS);

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple listeners on the same event', () => {
    const emitter = createNavigationEmitter();
    const first = vi.fn();
    const second = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_FOCUS, first);
    emitter.addListener(NAVIGATION_EVENT_FOCUS, second);

    emitter.emit(NAVIGATION_EVENT_FOCUS);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops calling a listener after its unsubscribe is invoked', () => {
    const emitter = createNavigationEmitter();
    const listener = vi.fn();
    const unsubscribe = emitter.addListener(NAVIGATION_EVENT_FOCUS, listener);

    unsubscribe();
    emitter.emit(NAVIGATION_EVENT_FOCUS);

    expect(listener).not.toHaveBeenCalled();
  });

  it('emitting an event with no listeners is a no-op', () => {
    const emitter = createNavigationEmitter();
    expect(() => emitter.emit(NAVIGATION_EVENT_FOCUS)).not.toThrow();
  });
});

// diffFocusedRoute: the pure focus/blur decision every adapter's lifecycle trigger (stack/tabs/
// drawer) delegates to, per this file's header comment's 4-shape contract. No Negative group -
// the function is total over `string | undefined` pairs, never throws.
describe('diffFocusedRoute', () => {
  // why: first mount - nothing was previously focused, so there is nothing to blur, only the
  // newly-focused route should fire.
  it('on first mount (no previous key), focuses only - no blur', () => {
    expect(diffFocusedRoute(undefined, 'route-a')).toEqual({ focusKey: 'route-a' });
  });

  // why: unmount / no-longer-focused (e.g. popped off the stack) - the route that had focus must
  // still be blurred even though nothing new gained focus in its place.
  it('on losing focus with nothing new focused, blurs only - no focus', () => {
    expect(diffFocusedRoute('route-a', undefined)).toEqual({ blurKey: 'route-a' });
  });

  // why: an ordinary focus change (e.g. push/pop between two live routes) - the old route must
  // blur AND the new one must focus, not just one or the other.
  it('on an ordinary focus change, blurs the old route and focuses the new one', () => {
    expect(diffFocusedRoute('route-a', 'route-b')).toEqual({
      blurKey: 'route-a',
      focusKey: 'route-b',
    });
  });

  // why: a re-run that leaves the focused key untouched (e.g. a setParams-only change) must fire
  // NEITHER event - re-emitting focus/blur for the same route would flicker the screen the
  // header comment's own "flicker-on-focus bug" investigation log exists to catch.
  it('re-running with the same key fires neither blur nor focus', () => {
    expect(diffFocusedRoute('route-a', 'route-a')).toEqual({});
  });

  it('a render with no route ever focused (both keys undefined) fires neither blur nor focus', () => {
    expect(diffFocusedRoute(undefined, undefined)).toEqual({});
  });
});
