// A style value holding a `calc()` or a math function is evaluated while the payload is built

import {
  committedPayloadOf,
  createElement,
  createSurface,
  setNativeDebug,
  setProp,
  takeNativeDebugLog,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function payloadOf(style: Record<string, unknown>) {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

describe('a calc() or math function in a style value, with no var()', () => {
  it('evaluates a math function over lengths', () => {
    expect(payloadOf({ width: 'min(10px, 2rem)' }).width).toBe(10);
    expect(payloadOf({ width: 'max(10px, 2rem)' }).width).toBe(32);
    expect(payloadOf({ height: 'clamp(4px, 10px, 6px)' }).height).toBe(6);
  });

  it('evaluates a product of lengths divided back to a length', () => {
    expect(payloadOf({ width: 'calc(5px * 3px / 6px)' }).width).toBe(2.5);
  });

  it('evaluates a math function nested in a sum', () => {
    expect(payloadOf({ marginLeft: 'calc(1px + min(1rem, 2px))' }).marginLeft).toBe(3);
  });

  it('leaves the property unset for a length mixed with a percentage', () => {
    expect('width' in payloadOf({ width: 'min(100px, 50%)' })).toBe(false);
  });

  it('leaves the property unset for a math function of mixed dimensions', () => {
    expect('width' in payloadOf({ width: 'min(1px, 1s)' })).toBe(false);
  });

  it('clamps an infinite result to the largest length and NaN to zero', () => {
    expect(payloadOf({ width: 'calc(100px / 0)' }).width).toBe(33_554_428);
    expect(payloadOf({ height: 'calc(0px / 0)' }).height).toBe(0);
  });
});

describe('a dropped calc() or math function', () => {
  function drainedFor(style: Record<string, unknown>): readonly string[] {
    takeNativeDebugLog();
    payloadOf(style);
    return takeNativeDebugLog();
  }

  it('names the property and the authored text when debug is on', () => {
    setNativeDebug(true);
    const lines = drainedFor({ width: 'min(100px, 50%)' });
    setNativeDebug(false);

    const dropped = lines.filter(line => line.includes('min(100px, 50%)'));
    expect(dropped.length).toBe(1);
    expect(dropped[0]?.includes('width')).toBe(true);
  });

  it('says nothing when debug is off', () => {
    setNativeDebug(false);

    expect(drainedFor({ width: 'min(100px, 50%)' }).length).toBe(0);
  });

  it('says nothing for a value that evaluates', () => {
    setNativeDebug(true);
    const lines = drainedFor({ width: 'min(10px, 2rem)' });
    setNativeDebug(false);

    expect(lines.length).toBe(0);
  });
});

report();
