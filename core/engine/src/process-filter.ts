// RN's own processFilter, imported rather than ported: enableNativeCSSParsing() defaults to
// false, so the stock path parses the CSS string / structured array in JS and native never sees
// the raw string.

// try/catch because upstream throws once (a TypeError for a non-string/array input) and a commit
// path must never throw; fabric-props narrows first, but processFilter is on the public barrel
// too, so the guard here stays reachable, not ceremonial.

// A drop-shadow's color goes through RN's own processColor here, not our injected
// setColorProcessor seam — the same function on a real host, since bootstrapHost injects exactly
// processColor, so the seam simply doesn't govern a filter's color.

// iOS caveat: RN paints only brightness/opacity unless enableSwiftUIBasedFilters is on, so
// grayscale/blur/saturate/contrast/hueRotate parse fine here and still paint nothing on screen.
import { dlog } from './debug';

// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processFilterUpstream from 'react-native/Libraries/StyleSheet/processFilter';

// Mirrors upstream's ParsedDropShadow. `color` is whatever processColor returns — a platform int
// on a real host — so it stays `unknown` rather than claiming a number.
export interface IParsedDropShadow {
  offsetX: number;
  offsetY: number;
  standardDeviation?: number;
  color?: unknown;
}

export type IParsedFilter =
  | { brightness: number }
  | { blur: number }
  | { contrast: number }
  | { grayscale: number }
  | { hueRotate: number }
  | { invert: number }
  | { opacity: number }
  | { saturate: number }
  | { sepia: number }
  | { dropShadow: IParsedDropShadow };

// The structured input shapes. Read loosely on purpose: callers pass plain records, and upstream
// narrows each field itself.
type IRawDropShadow = Record<string, unknown>;
type IRawFilterFunction = Record<string, unknown>;

export function processFilter(
  filter: ReadonlyArray<IRawFilterFunction> | string | undefined,
): IParsedFilter[] {
  try {
    const parsed: unknown = processFilterUpstream(filter);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    dlog(
      `processFilter: dropped an invalid filter - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

export type { IRawDropShadow, IRawFilterFunction };
