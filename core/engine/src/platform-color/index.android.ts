// Android constructors. Twin of RN's PlatformColorValueTypes.android.js and the non-iOS
// PlatformColorValueTypesIOS.js: native ColorPropConverter reads only { resource_paths } and
// throws on any other map, and DynamicColorIOS has no Android meaning.
import type { IDynamicColorIOSTuple, IOpaqueColorValue } from './shared';

export * from './shared';

export function PlatformColor(...names: string[]): IOpaqueColorValue {
  return { resource_paths: names };
}

export function DynamicColorIOS(
  _tuple: IDynamicColorIOSTuple,
): IOpaqueColorValue {
  throw new Error('DynamicColorIOS is not available on this platform.');
}
