// Easing is upstream's object now, and it is on the engine barrel and re-exported by all five
// adapters. The IEasing interface pins the shape at COMPILE time against our own source; nothing
// pins it against the module that actually arrives, so an RN bump that renames or drops a function
// would type-check here and fail on device.
//
// This is the whole standing cost of importing upstream instead of porting it, in one test.

import { describe, expect, it } from 'vitest';
import { Easing } from './easing';

const NAMES = [
  'step0',
  'step1',
  'linear',
  'ease',
  'quad',
  'cubic',
  'poly',
  'sin',
  'circle',
  'exp',
  'elastic',
  'back',
  'bounce',
  'bezier',
  'in',
  'out',
  'inOut',
] as const;

describe('the Easing surface every adapter re-exports', () => {
  it.each(NAMES)('ships %s', name => {
    expect(typeof Easing[name]).toBe('function');
  });

  // why: a name check alone passes on an object of stubs. These are the two shapes the surface
  // has - a curve read directly, and a factory that returns one - and both must still compute.
  it('a curve and a factory both still return a number', () => {
    expect(Easing.linear(0.25)).toBe(0.25);
    expect(Easing.poly(2)(0.5)).toBeCloseTo(0.25, 10);
  });
});
