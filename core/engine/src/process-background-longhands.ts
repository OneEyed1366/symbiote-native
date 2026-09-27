// RN's own processBackgroundSize / processBackgroundPosition / processBackgroundRepeat, imported
// rather than ported.

// Needed because enableNativeCSSParsing() defaults to false, so RN's stock JS path parses the CSS
// string into the per-axis structure Fabric's C++ expects. Without it a string for any of these
// three reached native unparsed: dropped on iOS, cast to the wrong ReadableMap type on Android.

// Importing is free here: all three upstream files contain only `import type` lines, so their
// value-import closure is empty — no processColor, no Platform, no TurboModule floor, no renderer.

// No try/catch, unlike the other upstream wrappers: these three don't validate through invariant,
// they answer `[]` for anything unparseable — so refusal is a return here, not a throw.
import { dlog } from './debug';

// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundSizeUpstream from 'react-native/Libraries/StyleSheet/processBackgroundSize';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundPositionUpstream from 'react-native/Libraries/StyleSheet/processBackgroundPosition';
// @ts-expect-error - untyped Flow source. Metro compiles it; vitest.config.ts strips the types.
import processBackgroundRepeatUpstream from 'react-native/Libraries/StyleSheet/processBackgroundRepeat';

export type IBackgroundLonghandInput =
  string | ReadonlyArray<unknown> | undefined;

// An empty result means upstream parsed nothing usable. The payload builder's rule is that a
// refused processor leaves the key absent — `[]` is a real value, committing it would ask native
// to apply "no background size" rather than leave the declaration unset.
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
