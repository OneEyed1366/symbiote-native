// The React NativeTab view: element factories over the shared native tab renderer in core

import { createElement } from 'react';
import type { ReactNode } from 'react';
import { Platform } from '@symbiote-native/engine';
import type { ITabsBottomAccessoryEnvironment } from '../../core';
import { createNativeTabsRenderer } from '../../core/native-tabs-renderer';
import type { INativeTabViewState } from '../../core/native-tabs-renderer';
import { NavigationContext } from '../navigation-context';
import type { INavigationContextValue } from '../navigation-context';
import type { INativeTabScreenProps } from '../native-tab-screen';

export type INativeTabRegistryEntry = Omit<INativeTabScreenProps, 'name'>;

export type INativeTabAccessoryFactory = (
  environment: ITabsBottomAccessoryEnvironment,
) => ReactNode;

export type INativeTabViewInput = INativeTabViewState<
  INativeTabRegistryEntry,
  INavigationContextValue,
  INativeTabAccessoryFactory
>;

export const renderNativeTabs = createNativeTabsRenderer<
  ReactNode,
  INativeTabRegistryEntry,
  INavigationContextValue,
  INativeTabAccessoryFactory
>({
  platform: Platform,
  createView: (viewName, props, children) =>
    createElement(viewName, props, ...children),
  createContent: (entry, value) =>
    createElement(
      NavigationContext.Provider,
      { value },
      createElement(entry.component),
    ),
  createAccessory: (factory, environment) => factory(environment),
});
