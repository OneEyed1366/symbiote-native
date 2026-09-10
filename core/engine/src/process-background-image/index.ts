// RN's own processBackgroundImage, imported rather than ported.
//
// Why it is needed at all: RN registers `experimental_backgroundImage` with
// `nativeCSSParsing ? true : {process: processBackgroundImage}`, and enableNativeCSSParsing()
// defaults to false - so the stock path parses the CSS string / structured array in JS and native
// never sees the raw string.
//
// Why the try/catch: upstream has no `throw` statement, but it reads `bgImage.colorStops.length`
// unguarded (processBackgroundImage.js:205), so a gradient object without colorStops raises a
// TypeError - and a commit path must never throw. Reachable rather than ceremonial: the input is
// a plain record from app code, and nothing upstream of here checks that field exists.
//
// What changed by importing, beyond deleting 600 lines:
//
//   - Colour stops go through RN's own `processColor` (upstream imports it directly) instead of
//     our injected `setColorProcessor` seam. On a real host those are the same function.
//   - A half-specified radial position is now FORWARDED rather than replaced by centre. Our port
//     required one vertical and one horizontal edge and fell back to centre otherwise; upstream
//     takes any non-null position as-is (`:178`). Both type systems forbid the half-specified
//     shape - ours in IRadialGradientPosition, Flow in RadialGradientPosition - so this is only
//     reachable from untyped JS, and inheriting upstream's answer is the point of the exercise.
//     The `dlog` our guard carried goes with it.
import { dlog } from '../debug';

// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundImageUpstream from 'react-native/Libraries/StyleSheet/processBackgroundImage';

import type {
  IRadialGradientPosition,
  IRadialGradientShape,
  IRadialGradientSize,
} from '../styles';

// Local, as it was in the port: upstream's LinearGradientDirection is a Flow type inside
// processBackgroundImage.js, and `styles.ts` never carried a public twin for it.
type ILinearGradientDirection =
  { type: 'angle'; value: number } | { type: 'keyword'; value: string };

// Mirrors upstream's parsed shapes (processBackgroundImage.js:63-81). `color` is whatever
// processColor returns - a platform int on a real host - and is null for the transition-hint
// syntax (`red, 20%, blue`), which is why it is not narrowed to a number.
export type IParsedColorStop = {
  color: unknown;
  position: number | string | null;
};

export type IParsedLinearGradient = {
  type: 'linear-gradient';
  direction: ILinearGradientDirection;
  colorStops: ReadonlyArray<IParsedColorStop>;
};

export type IParsedRadialGradient = {
  type: 'radial-gradient';
  shape: IRadialGradientShape;
  size: IRadialGradientSize;
  position: IRadialGradientPosition;
  colorStops: ReadonlyArray<IParsedColorStop>;
};

export type IParsedBackgroundImage =
  IParsedLinearGradient | IParsedRadialGradient;

// The structured input shape. Read loosely on purpose: callers pass plain records, and upstream
// narrows each field itself.
type IRawBackgroundImage = Record<string, unknown>;

export function processBackgroundImage(
  backgroundImage: ReadonlyArray<IRawBackgroundImage> | string | undefined,
): IParsedBackgroundImage[] {
  try {
    const parsed: unknown = processBackgroundImageUpstream(backgroundImage);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    dlog(
      `processBackgroundImage: dropped an invalid background image - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [];
  }
}

export type { IRawBackgroundImage };
