// RN's own processFilter, imported rather than ported.
//
// Why it is needed at all: RN registers `filter` with `nativeCSSParsing ? true : {process:
// processFilter}`, and enableNativeCSSParsing() defaults to false - so the stock path parses the
// CSS string / structured array in JS and native never sees the raw string.
//
// Why the try/catch, unlike processBoxShadow's wrapper: upstream throws exactly once
// (processFilter.js:120, a TypeError for an input that is neither string nor array), and a commit
// path must never throw. fabric-props narrows before calling, but `processFilter` is on the public
// barrel, so the guard is reachable rather than ceremonial.
//
// What changed by importing: a drop-shadow's colour now goes through RN's own `processColor`
// (upstream imports it directly at processFilter.js:16) instead of our injected
// `setColorProcessor` seam. On a real host those are the same function - bootstrapHost injects
// exactly `processColor` - so the seam simply no longer governs the colour inside a filter.
//
// Platform caveat worth keeping in view when demoing this: on iOS RN paints only `brightness` and
// `opacity` unless enableSwiftUIBasedFilters is on, so grayscale/blur/saturate/contrast/hueRotate
// parse correctly here and still do nothing on screen.
import { dlog } from './debug';

// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processFilterUpstream from 'react-native/Libraries/StyleSheet/processFilter';

// Mirrors upstream's ParsedDropShadow (processFilter.js:38). `color` is whatever processColor
// returns - a platform int on a real host - so it stays `unknown` rather than claiming a number.
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
