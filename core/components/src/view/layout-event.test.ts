// Co-located unit test: readLayoutField pulls a numeric field out of an onLayout event's
// nativeEvent.layout without a cast. Shared by render-scroll-view's dimension read (width/height)
// and render-scroll-sticky's position read (y/height) - one guard, tested once.
//
// No Negative group: readLayoutField is total over ISymbioteEvent — a malformed/missing layout
// yields `undefined`, per its own header comment ("no-op"), never a throw. Every scenario below is
// Positive: either a genuine successful read, or the documented safe-fallback outcome.

import { createElement, type ISymbioteEvent } from '@symbiote-native/engine';
import { describe, expect, it } from 'vitest';
import { readLayoutField } from './layout-event';

function makeEvent(nativeEvent: Record<string, unknown>): ISymbioteEvent {
  const target = createElement('RCTView');
  return {
    type: 'topLayout',
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  };
}

describe('readLayoutField', () => {
  it('reads width out of a well-formed layout event', () => {
    const event = makeEvent({ layout: { x: 0, y: 0, width: 320, height: 480 } });
    expect(readLayoutField(event, 'width')).toBe(320);
  });

  it('reads height out of a well-formed layout event', () => {
    const event = makeEvent({ layout: { x: 0, y: 0, width: 320, height: 480 } });
    expect(readLayoutField(event, 'height')).toBe(480);
  });

  it('reads y out of a well-formed layout event', () => {
    const event = makeEvent({ layout: { x: 0, y: 42, width: 320, height: 480 } });
    expect(readLayoutField(event, 'y')).toBe(42);
  });

  // why: nativeEvent is Record<string, unknown> by contract (no compile-time guarantee it ever
  // carries `layout`) — an event that predates layout, or one from an unrelated event type, must
  // degrade to undefined rather than crash the caller's render/effect.
  it('returns undefined when nativeEvent.layout is missing', () => {
    const event = makeEvent({});
    expect(readLayoutField(event, 'width')).toBeUndefined();
  });

  it('returns undefined when nativeEvent.layout is null', () => {
    const event = makeEvent({ layout: null });
    expect(readLayoutField(event, 'height')).toBeUndefined();
  });

  it('returns undefined when nativeEvent.layout is not an object', () => {
    const event = makeEvent({ layout: 'not-an-object' });
    expect(readLayoutField(event, 'y')).toBeUndefined();
  });

  // why: this is the narrowing the header comment promises in place of a cast — a `layout` object
  // with the right key but the wrong runtime type must still be rejected, not coerced or returned
  // as-is (which would hand a caller doing arithmetic a string instead of a number).
  it('returns undefined when the requested key is not a number', () => {
    const event = makeEvent({ layout: { width: 'oops' } });
    expect(readLayoutField(event, 'width')).toBeUndefined();
  });

  it('returns undefined when the requested key is absent from layout', () => {
    const event = makeEvent({ layout: { width: 320 } });
    expect(readLayoutField(event, 'height')).toBeUndefined();
  });
});
