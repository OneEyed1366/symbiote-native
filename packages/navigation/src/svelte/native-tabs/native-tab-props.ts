// NativeTab's own public prop surface, plain `.ts` for the reason ../screen-props.ts documents

import type { Snippet } from 'svelte';
import type {
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
  ITabsBottomAccessoryEnvironment,
} from '../../core';

// React's `ios.bottomAccessory(environment)` becomes a snippet taking the environment
export type INativeTabProps = INativeTabsViewHostOptions & {
  initialRouteName?: string;
  screenOptions?: INativeTabsViewScreenOptions;
  bottomAccessory?: Snippet<[ITabsBottomAccessoryEnvironment]>;
  children?: Snippet;
};
