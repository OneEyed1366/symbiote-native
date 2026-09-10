// RN's own Easing, imported rather than ported.
//
// The port this replaces was 109 lines beside a 142-line `bezier.ts`, and it reproduced upstream
// formula for formula. Swept at 20 001 points per function before the swap: 15 of the 17 agree to
// the bit, and the two bezier-backed ones (`ease`, `bezier`) differ by 2.9e-10, because upstream
// samples its spline into a Float32Array where the port used a plain (float64) array. That is
// below a sub-pixel on any animation this drives.
//
// The TYPE is ours and stays ours. `Easing` is on the engine barrel and re-exported by all five
// adapters, and the upstream module ships no types - so importing it untyped would hand every
// consumer `any`. Twenty lines of interface in exchange for 251 lines of implementation.
import EasingUpstream from 'react-native/Libraries/Animated/Easing';

export type IEasingFunction = (t: number) => number;

export interface IEasing {
  step0(n: number): number;
  step1(n: number): number;
  linear(t: number): number;
  ease(t: number): number;
  quad(t: number): number;
  cubic(t: number): number;
  poly(n: number): IEasingFunction;
  sin(t: number): number;
  circle(t: number): number;
  exp(t: number): number;
  elastic(bounciness?: number): IEasingFunction;
  back(s?: number): IEasingFunction;
  bounce(t: number): number;
  bezier(x1: number, y1: number, x2: number, y2: number): IEasingFunction;
  in(easing: IEasingFunction): IEasingFunction;
  out(easing: IEasingFunction): IEasingFunction;
  inOut(easing: IEasingFunction): IEasingFunction;
}

// tsc resolves this deep path but reads the Flow source through allowJs, so the default export
// arrives shapeless rather than untyped - the mismatch is the only thing the suppression covers,
// and IEasing above is what every consumer actually sees.
// @ts-expect-error - upstream ships no usable types for this path.
export const Easing: IEasing = EasingUpstream;
