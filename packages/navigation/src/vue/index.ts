// `@symbiote-native/navigation/vue`: the Vue native-stack navigator over the screens views
// Importing this barrel first registers their ViewConfigs through `../register`
// It then exposes `Stack` with `Stack.Screen` attached and the navigator handle

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle, IStackProps } from './stack';
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
export { Screen } from './screen';
export type {
  IScreenOptionsArgs,
  IScreenOptionsResolver,
  IScreenProps,
  IVueScreenOptions,
  IVueSearchBarOptions,
} from './screen';
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
  useIsFocused,
  useFocusEffect,
  useNavigationState,
  useTransitionProgress,
} from './composables';
export type { ITransitionProgress } from '../core';
export type {
  INavigationHandle,
  IStackNavigationHandle,
  ITabNavigationHandle,
  IDrawerNavigationHandle,
} from './composables';
export type {
  INavigationScopeValue,
  IAnyNavigatorHandle,
} from './navigation-context';

export { useLinkingIntegration } from './linking';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, pure JS with no screens views, so nothing more to register
export { Tab } from './tabs';
export type { ITabNavigatorHandle, ITabProps } from './tabs';
export { TabScreen } from './tab-screen';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
  ITabScreenProps,
} from './tab-screen';
export type { ITabOptions, ITabBarIcon } from '../core';

// NativeTab: the native tab bar host, every route mounted in its own native screen
export { NativeTab } from './native-tabs';
export type { INativeTabNavigatorHandle, INativeTabProps } from './native-tabs';
export { NativeTabScreen } from './native-tab-screen';
export type {
  INativeTabScreenOptionsArgs,
  INativeTabScreenOptionsResolver,
  INativeTabScreenProps,
} from './native-tab-screen';
export type {
  INativeTabsViewHostOptions,
  INativeTabsViewScreenOptions,
} from '../core';

// Drawer: the swipeable drawer navigator, pure JS over `PanResponder` and `Animated`
// The header of `drawer.ts` notes the gesture handler and reanimated parity gaps
export { Drawer } from './drawer';
export type {
  IDrawerContentSlotProps,
  IDrawerNavigatorHandle,
  IDrawerProps,
  IDrawerDescriptorMap,
} from './drawer';
export { DrawerScreen } from './drawer-screen';
export type {
  IDrawerScreenOptionsArgs,
  IDrawerScreenOptionsResolver,
  IDrawerScreenProps,
} from './drawer-screen';
export type {
  IDrawerOptions,
  IDrawerScreenOptions,
  IDrawerType,
  IDrawerPosition,
} from '../core';
