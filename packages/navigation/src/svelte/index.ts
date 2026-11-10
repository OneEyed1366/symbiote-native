// `@symbiote-native/navigation/svelte`: the Svelte native-stack navigator over the screens views
// Importing this barrel first registers their ViewConfigs through `../register`
// It then exposes `Stack` with `Stack.Screen` attached and the navigator handle

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle, IStackProps } from './stack';
export { default as FullWindowOverlay } from './full-window-overlay.svelte';
export type { IFullWindowOverlayProps } from '../core';
export { default as ScreenFooter } from './screen-footer.svelte';
export { default as ScreenContainer } from './screen-container.svelte';
export type { IScreenContainerProps } from '../core';
export {
  compatibilityFlags,
  enableScreens,
  executeNativeBackPress,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
} from '../core';
export { default as Screen } from './screen.svelte';
export type {
  IScreenOptionsArgs,
  IScreenOptionsResolver,
  IScreenProps,
  ISvelteScreenOptions,
  ISvelteSearchBarOptions,
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
  useIsFocused,
  useFocusEffect,
  useNavigationState,
  useTransitionProgress,
} from './runes';
export type { ITransitionProgress } from '../core';
export type {
  INavigationHandle,
  IStackNavigationHandle,
  ITabNavigationHandle,
  IDrawerNavigationHandle,
} from './runes';
export type {
  INavigationScopeValue,
  IAnyNavigatorHandle,
} from './navigation-context';

export { useLinkingIntegration } from './linking.svelte';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, pure JS with no screens views, so nothing more to register
export { Tab } from './tabs';
export type { ITabNavigatorHandle, ITabProps } from './tabs';
export { default as TabScreen } from './tab-screen.svelte';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
  ITabScreenProps,
} from './tab-screen-props';
export type { ITabOptions, ITabBarIcon } from '../core';

// NativeTab: the native tab bar host, every route mounted in its own native screen
export { NativeTab } from './native-tabs';
export type { INativeTabNavigatorHandle, INativeTabProps } from './native-tabs';
export { default as NativeTabScreen } from './native-tab-screen.svelte';
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
// The header of `drawer/index.svelte` notes the gesture handler and reanimated parity gaps
export { Drawer } from './drawer';
export type {
  IDrawerContentSlotProps,
  IDrawerNavigatorHandle,
  IDrawerProps,
  IDrawerDescriptorMap,
} from './drawer';
export { default as DrawerScreen } from './drawer-screen.svelte';
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
