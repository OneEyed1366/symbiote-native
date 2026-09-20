// Pure RGBA parsing — no graph node, no AnimatedValue, no imports from this package at all.
//
// It is split out of color.ts DELIBERATELY, and must stay dependency-free. `interpolation.ts`
// needs `normalizeColor` for its color output ranges, and `graph.ts` needs `interpolation.ts`
// (AnimatedInterpolation lives there). color.ts also defines `AnimatedColor extends
// AnimatedWithChildren`, so leaving the parser there closes a cycle
//   graph -> interpolation -> color -> graph
// which surfaces at load time as `TypeError: Class extends value undefined is not a
// constructor` — AnimatedWithChildren is still uninitialized when color.ts evaluates. Keeping
// the pure half in its own leaf module breaks it structurally rather than by import ordering.

// No types are published for this package, and an ambient .d.ts is not picked up by another
// package's separate TS program (see symbiote-rn-import-testability) - so the suppression is
// local, at the import site.
// @ts-expect-error - untyped, @noflow plain JS that every toolchain here parses as-is.
import normalizeColorUpstream from '@react-native/normalize-colors';

export interface IRgbaValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const DEFAULT_COLOR: IRgbaValue = { r: 0, g: 0, b: 0, a: 1 };

// Decompose any color RN itself accepts into channels: #hex, rgb()/rgba(), hsl()/hsla(), hwb(),
// the 150 CSS names, `transparent`, and a 0xRRGGBBAA number. undefined when unparseable, so the
// caller falls back to the default rather than throwing inside a render. Exported so
// interpolation's color path decodes through this one decoder rather than duplicating it.
//
// The parsing is upstream's. A hand-rolled version lived here and knew hex and rgb() only, so
// `new AnimatedColor('red')` animated from BLACK - the fallback, not an error, and nothing was
// red anywhere. Its packed output is rrggbbaa, which is the order the shifts below assume.
export function normalizeColor(color: string | number): IRgbaValue | undefined {
  const packed = normalizeColorUpstream(color);
  if (typeof packed !== 'number') return undefined;
  const c = packed >>> 0;
  return {
    r: (c >>> 24) & 255,
    g: (c >>> 16) & 255,
    b: (c >>> 8) & 255,
    a: (c & 255) / 255,
  };
}
