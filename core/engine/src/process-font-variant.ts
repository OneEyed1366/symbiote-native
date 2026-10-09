// RN's own `processFontVariant`, the caller narrows the input so `.split` never gets a non-string
// @ts-expect-error - untyped Flow source
import processFontVariantUpstream from 'react-native/Libraries/StyleSheet/processFontVariant';

export function processFontVariant(
  fontVariant: ReadonlyArray<string> | string,
): ReadonlyArray<string> {
  return processFontVariantUpstream(fontVariant);
}
