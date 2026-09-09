// RN's own processTransformOrigin, imported rather than ported.
//
// Why it is needed at all: ReactNativeStyleAttributes registers `transformOrigin` with
// `nativeCSSParsing ? true : {process: processTransformOrigin}`, and enableNativeCSSParsing()
// DEFAULTS TO FALSE - so RN's stock path parses the CSS string ('top left') into the [x, y, z]
// array native expects. Symbiote forwarded the raw string: iOS tolerated it, Android cast it to a
// ReadableArray and crashed. This restores the missing parse.
//
// Why the try/catch: upstream rejects a malformed origin through `invariant`, i.e. it THROWS, and
// a commit path must never throw. Which of its invariants survive a Release build is worth being
// precise about, because this comment said "these invariants are NOT __DEV__-gated" and that is
// only half true: `_validateTransformOrigin` IS gated (processTransformOrigin.js:115), while the
// four invariants inside the parse loop (:42, :52, :79, :91) are not. '50% left' hits an ungated
// one - a horizontal keyword in the y slot - so upstream does refuse it in Release, and the
// try/catch is load-bearing there. A malformed ARRAY, by contrast, is only caught in dev.
//
// The hand-written port this replaces kept whatever it had parsed and returned a PARTIAL origin.
// That is not the safer option it looks like: a partial origin is a real, wrong origin, applied
// silently. `undefined` is the honest answer, and it is what the payload builder drops.
import { dlog } from '../debug';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processTransformOriginUpstream from 'react-native/Libraries/StyleSheet/processTransformOrigin';

type ITransformOriginValue = string | number;

export function processTransformOrigin(
  transformOrigin: Array<ITransformOriginValue> | string | undefined,
): Array<ITransformOriginValue> | undefined {
  // Absent input means an absent prop. The port answered with the CSS default here, so
  // `transformOrigin: null` committed a real center origin - a write RN never makes.
  if (transformOrigin == null) return undefined;
  try {
    return processTransformOriginUpstream(transformOrigin);
  } catch (error) {
    dlog(
      `processTransformOrigin: dropped an invalid origin - ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
