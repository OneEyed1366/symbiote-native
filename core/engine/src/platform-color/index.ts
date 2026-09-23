// iOS (and headless) constructors. Twin of RN's PlatformColorValueTypes.ios.js.
import type { IDynamicColorIOSTuple, IOpaqueColorValue } from './shared';

export * from './shared';

export function PlatformColor(...names: string[]): IOpaqueColorValue {
  return { semantic: names };
}

export function DynamicColorIOS(
  tuple: IDynamicColorIOSTuple,
): IOpaqueColorValue {
  return {
    dynamic: {
      light: tuple.light,
      dark: tuple.dark,
      highContrastLight: tuple.highContrastLight,
      highContrastDark: tuple.highContrastDark,
    },
  };
}
