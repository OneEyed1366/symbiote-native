// `@symbiote-native/navigation/angular`: the Angular navigators over the screens views
// Importing this barrel first registers their ViewConfigs through `../register`
// It then exposes `Stack`, `Tab` and `Drawer` with their screen directives and navigator handles

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle } from './stack';
export { FullWindowOverlay } from './full-window-overlay';
export { ScreenFooter } from './screen-footer';
export { ScreenContainer } from './screen-container';
export type { IScreenContainerProps } from '../core';
export {
  compatibilityFlags,
  enableScreens,
  executeNativeBackPress,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
} from '../core';
export { ScreenDirective } from './screen.directive';
export type {
  IAngularScreenOptions,
  IAngularSearchBarOptions,
  IScreenOptionsArgs,
  IScreenOptionsResolver,
} from './screen.directive';
export type {
  IScreenOptions,
  IStackAnimation,
  IStackPresentation,
} from '../core';

export {
  injectNavigation,
  injectStackNavigation,
  injectTabNavigation,
  injectDrawerNavigation,
  injectRoute,
  injectIsFocused,
  injectFocusEffect,
  injectNavigationState,
  injectTransitionProgress,
} from './injectors';
export type { ITransitionProgress } from '../core';
export type {
  INavigationHandle,
  IStackNavigationHandle,
  ITabNavigationHandle,
  IDrawerNavigationHandle,
  IFocusEffectCallback,
} from './injectors';
export { NavigationContextService } from './navigation-context.service';
export type { IAnyNavigatorHandle } from './navigation-context.service';
export { NavigationScopeDirective } from './navigation-scope.directive';

export { injectLinkingIntegration } from './linking';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, pure JS with no screens views, so nothing more to register
export { Tab } from './tabs';
export type { ITabNavigatorHandle } from './tabs';
export { TabScreenDirective } from './tab-screen.directive';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
} from './tab-screen.directive';
export type { ITabOptions, ITabBarIcon } from '../core';

// NativeTab: the native tab bar host, every route mounted in its own native screen
export { NativeTab } from './native-tabs';
export type {
  INativeTabNavigatorHandle,
  INativeTabBottomAccessory,
} from './native-tabs';
export { NativeTabScreenDirective } from './native-tab-screen.directive';
export type {
  INativeTabScreenOptionsArgs,
  INativeTabScreenOptionsResolver,
} from './native-tab-screen.directive';
export type {
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
} from '../core';

// Drawer: the swipeable drawer navigator, pure JS over `PanResponder` and `Animated`
// The header of `drawer.ts` notes the gesture handler and reanimated parity gaps
export { Drawer } from './drawer';
export type {
  IDrawerNavigatorHandle,
  IDrawerDescriptorMap,
  IDrawerContentContext,
} from './drawer';
export { DrawerScreenDirective } from './drawer-screen.directive';
export type {
  IDrawerScreenOptionsArgs,
  IDrawerScreenOptionsResolver,
} from './drawer-screen.directive';
export type {
  IDrawerOptions,
  IDrawerScreenOptions,
  IDrawerType,
  IDrawerPosition,
} from '../core';
