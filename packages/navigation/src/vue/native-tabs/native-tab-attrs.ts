// The Vue NativeTab's untyped `attrs`, narrowed at the one edge they enter

import { isRecord } from '../../core';
import type {
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
} from '../../core';

export type INativeTabAttrs = {
  initialRouteName: string | undefined;
  screenOptions: INativeTabsViewScreenOptions | undefined;
  host: INativeTabsViewHostOptions;
};

// Attrs are untyped, so a record is taken as the option type: the one place the types are on trust
function isRecordOf<T extends object>(value: unknown): value is T {
  return isRecord(value);
}

// Every other attribute is a host option or an event handler, `onTabSelected` and the like
export function readNativeTabAttrs(
  attrs: Record<string, unknown>,
): INativeTabAttrs {
  const { initialRouteName, screenOptions, ...rest } = attrs;
  return {
    initialRouteName:
      typeof initialRouteName === 'string' ? initialRouteName : undefined,
    screenOptions: isRecordOf<INativeTabsViewScreenOptions>(screenOptions)
      ? screenOptions
      : undefined,
    host: isRecordOf<INativeTabsViewHostOptions>(rest) ? rest : {},
  };
}
