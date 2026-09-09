// RN's own processTransformOrigin, imported rather than ported.
//
// Why it is needed at all: ReactNativeStyleAttributes registers `transformOrigin` with
// `nativeCSSParsing ? true : {process: processTransformOrigin}`, and enableNativeCSSParsing()
// DEFAULTS TO FALSE - so RN's stock path parses the CSS string ('top left') into the [x, y, z]
// array native expects. Symbiote forwarded the raw string: iOS tolerated it, Android cast it to a
// ReadableArray and crashed. This restores the missing parse.
//
// Why the try/catch: upstream rejects a malformed origin through `invariant`, i.e. it THROWS, and
// a commit path must never throw. Note these invariants are NOT __DEV__-gated - unlike
// processTransform's array check, upstream refuses '50% left' in a Release build too.
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
