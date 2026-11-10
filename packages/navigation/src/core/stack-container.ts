// Container color of the `RNSScreenStack` host, kept apart from the stack host props fold
// so each adapter adds it per render from its own `nativeContainerStyle` prop

import { isRecord } from './guards';

// Takes `unknown` because template adapters read the style from an untyped attribute bag
export function resolveNativeContainerProps(
  style: unknown,
): Record<string, unknown> {
  if (!isRecord(style) || style.backgroundColor === undefined) return {};
  return { nativeContainerBackgroundColor: style.backgroundColor };
}
