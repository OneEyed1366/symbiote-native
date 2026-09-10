// RN's own processBackgroundSize / processBackgroundPosition / processBackgroundRepeat, imported
// rather than ported.
//
// Why they are needed at all: ReactNativeStyleAttributes registers all three with
// `nativeCSSParsing ? true : {process: processX}` (:50, :54, :58), and enableNativeCSSParsing()
// defaults to false - so RN's stock path parses the CSS string into the per-axis structure
// Fabric's C++ expects. We registered `experimental_backgroundImage` and not its three siblings,
// so a string for any of them reached native unparsed: dropped on iOS, cast to the wrong
// ReadableMap type on Android. Same shape as the process-transform incident.
//
// Why importing is free here even by this repo's strictest reading: all three upstream files
// contain ONLY `import type` lines. Their value-import closure is empty - no processColor, no
// Platform, no TurboModule floor, no renderer. There is nothing to weigh.
//
// Why no try/catch, unlike the other upstream wrappers: these three do not validate through
// `invariant`. They answer `[]` for anything they cannot parse, which upstream's own comment calls
// "do not apply any background" - so refusal is a RETURN here, not a throw.
import { dlog } from './debug';

// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundSizeUpstream from 'react-native/Libraries/StyleSheet/processBackgroundSize';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundPositionUpstream from 'react-native/Libraries/StyleSheet/processBackgroundPosition';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundRepeatUpstream from 'react-native/Libraries/StyleSheet/processBackgroundRepeat';

export type IBackgroundLonghandInput =
  string | ReadonlyArray<unknown> | undefined;

// An empty result is upstream's way of saying it parsed nothing usable. The payload builder's
// rule is that a refused processor leaves the key ABSENT, so it must not become `[]` - an empty
// array is a real value, and committing one asks native to apply "no background size" rather than
// leaving the declaration unset.
function orAbsent(
  parsed: unknown,
  key: string,
  value: IBackgroundLonghandInput,
): ReadonlyArray<unknown> | undefined {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    dlog(`${key}: RN parsed nothing usable from ${JSON.stringify(value)}`);
    return undefined;
  }
  return parsed;
}

export function processBackgroundSize(
  value: IBackgroundLonghandInput,
): ReadonlyArray<unknown> | undefined {
  return orAbsent(
    processBackgroundSizeUpstream(value),
    'experimental_backgroundSize',
    value,
  );
}

export function processBackgroundPosition(
  value: IBackgroundLonghandInput,
): ReadonlyArray<unknown> | undefined {
  return orAbsent(
    processBackgroundPositionUpstream(value),
    'experimental_backgroundPosition',
    value,
  );
}

export function processBackgroundRepeat(
  value: IBackgroundLonghandInput,
): ReadonlyArray<unknown> | undefined {
  return orAbsent(
    processBackgroundRepeatUpstream(value),
    'experimental_backgroundRepeat',
    value,
  );
}
