// `@symbiote-native/navigation/solid`: the Solid native-stack navigator over the screens views
// Importing this barrel first registers their ViewConfigs through `../register`
// It then exposes `Stack` with `Stack.Screen` attached and the navigator handle

// Lifecycle helpers are named by what they do. `use*` only reads the navigation scope on the chain
// `create*` owns a signal, an effect or a subscription, as `createColorScheme` of the adapter does

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle, IStackProps } from './stack';
export { FullWindowOverlay } from './full-window-overlay';
export type { ISolidFullWindowOverlayProps } from './full-window-overlay';
export { ScreenFooter } from './screen-footer';
export type { ISolidScreenFooterProps } from './screen-footer';
export { ScreenContainer } from './screen-container';
export type { ISolidScreenContainerProps } from './screen-container';
export {
  compatibilityFlags,
  enableScreens,
  executeNativeBackPress,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
} from '../core';
export { Screen, TabScreen, DrawerScreen } from './screen';
export type {
  IScreenOptionsArgs,
  IScreenOptionsResolver,
  IScreenProps,
  ISolidScreenOptions,
  ISolidSearchBarOptions,
} from './screen-props';
export type {
  IScreenOptions,
  IStackAnimation,
  IStackPresentation,
} from '../core';

export {
  useNavigation,
  useStackNavigation,
  useTabNavigation,
  useDrawerNavigation,
  useRoute,
  createIsFocused,
  createFocusEffect,
  createNavigationState,
  useTransitionProgress,
} from './primitives';
export type { ITransitionProgress } from '../core';
export type {
  INavigationHandle,
  IStackNavigationHandle,
  ITabNavigationHandle,
  IDrawerNavigationHandle,
} from './primitives';
export type {
  INavigationScopeValue,
  IAnyNavigatorHandle,
} from './navigation-context';

export { createLinkingIntegration } from './linking';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, pure JS with no screens views, so nothing more to register
export { Tab } from './tabs';
export type { ITabNavigatorHandle, ITabProps } from './tabs';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
  ITabScreenProps,
} from './tab-screen-props';
export type { ITabOptions, ITabBarIcon } from '../core';

// NativeTab: the native tab bar host, every route mounted in its own native screen
export { NativeTab } from './native-tabs';
export type { INativeTabNavigatorHandle, INativeTabProps } from './native-tabs';
export { NativeTabScreen } from './screen';
export type {
  INativeTabScreenOptionsArgs,
  INativeTabScreenOptionsResolver,
  INativeTabScreenProps,
} from './native-tab-screen-props';
export type {
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
} from '../core';

// Drawer: the swipeable drawer navigator, pure JS over `PanResponder` and `Animated`
// The header of `drawer/index.ts` notes the gesture handler and reanimated parity gaps
export { Drawer } from './drawer';
export type {
  IDrawerContentSlotProps,
  IDrawerNavigatorHandle,
  IDrawerProps,
  IDrawerDescriptorMap,
} from './drawer';
export type {
  IDrawerScreenOptionsArgs,
  IDrawerScreenOptionsResolver,
  IDrawerScreenProps,
} from './drawer-screen-props';
export type {
  IDrawerOptions,
  IDrawerScreenOptions,
  IDrawerType,
  IDrawerPosition,
} from '../core';
