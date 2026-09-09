// RN's own processTransform, imported rather than ported.
//
// Why it is needed at all: RN parses `transform` in JS only when nativeCSSParsing is off (the
// default), and only for a STRING - an ARRAY comes back unchanged. Symbiote forwarded a raw
// string once with no JS parse, and Android cast it to a ReadableArray and crashed
// (`String cannot be cast to ReadableArray`). This restores the missing parse.
//
// Why the try/catch: upstream validates through `invariant`, i.e. it THROWS, and a commit path
// must never throw - a malformed transform is the app's bug, not a frame to abort. Catching keeps
// that guarantee while inheriting every one of upstream's ~12 checks. The hand-written port this
// replaces implemented two of them, so an Animated.Value handed to a non-animated component
// reached Fabric as an opaque object where RN redboxes, and `{perspective: 0}`, a matrix of the
// wrong length and an unknown key all forwarded silently.
//
// The dev/release split is upstream's, not ours: `_validateTransforms` runs under `__DEV__`, so a
// Release bundle skips it exactly as RN's does, and the array comes back BY IDENTITY - which the
// animated / sticky-header hot path depends on, since it produces a transform array every commit.
import { dlog } from '../debug';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processTransformUpstream from 'react-native/Libraries/StyleSheet/processTransform';

// One transform step, e.g. `{ translateX: 4 }` or `{ matrix: [...] }`.
type ITransformValue = number | string | Array<number | string> | undefined;
type ITransformEntry = Record<string, ITransformValue>;

// What a caller may hand us: entries whose values are not yet known to be well-formed.
type IRawTransform = Record<string, unknown>;

export function processTransform(
  transform: ReadonlyArray<IRawTransform> | string | undefined,
): ReadonlyArray<IRawTransform> {
  if (transform == null) return [];
  try {
    return processTransformUpstream(transform);
  } catch (error) {
    // Upstream's message names the offending key and value, so it is worth more than ours was.
    dlog(
      `processTransform: dropped an invalid transform - ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export type { ITransformEntry, IRawTransform };
