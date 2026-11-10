// The Vue NativeTab view: element factories over the shared native tab renderer in core

import { h } from '@vue/runtime-core';
import type { VNodeChild } from '@vue/runtime-core';
import { Platform } from '@symbiote-native/vue';
import type { ITabsBottomAccessoryEnvironment } from '../../core';
import { createNativeTabsRenderer } from '../../core/native-tabs-renderer';
import type { INativeTabViewState } from '../../core/native-tabs-renderer';
import { NavigationScope } from '../navigation-context';
import type { INavigationScopeValue } from '../navigation-context';
import type { INativeTabScreenProps } from '../native-tab-screen';
import type { IRegistryEntry } from '../collect-registry';

export type INativeTabRegistryEntry = IRegistryEntry<
  INativeTabScreenProps['component'],
  NonNullable<INativeTabScreenProps['options']>
>;

export type INativeTabAccessoryRenderer = (
  environment: ITabsBottomAccessoryEnvironment,
) => VNodeChild;

export type INativeTabViewInput = INativeTabViewState<
  INativeTabRegistryEntry,
  INavigationScopeValue,
  INativeTabAccessoryRenderer
>;

export const renderNativeTabs = createNativeTabsRenderer<
  VNodeChild,
  INativeTabRegistryEntry,
  INavigationScopeValue,
  INativeTabAccessoryRenderer
>({
  platform: Platform,
  createView: (viewName, props, children) => h(viewName, props, children),
  createContent: (entry, value) =>
    h(NavigationScope, { value }, () => h(entry.component)),
  createAccessory: (render, environment) => render(environment),
});
