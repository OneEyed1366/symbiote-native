// @symbiote-native/navigation/svelte: the Svelte native-stack navigator over
// react-native-screens' native view primitives. Importing this barrel first registers the native
// views' ViewConfigs (../register, a side-effect import of the codegen specs - never
// react-native-screens' own React components), then exposes Stack (with Stack.Screen attached)
// and the navigator handle. Mirrors vue/index.ts's barrel shape.

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle, IStackProps } from './stack';
export { default as Screen } from './screen.svelte';
export type {
  IScreenOptionsArgs,
  IScreenOptionsResolver,
  IScreenProps,
  ISvelteScreenOptions,
  ISvelteSearchBarOptions,
} from './screen-props';
export type { IScreenOptions, IStackAnimation, IStackPresentation } from '../core';

export {
  useNavigation,
  useStackNavigation,
  useTabNavigation,
  useDrawerNavigation,
  useRoute,
  useIsFocused,
  useFocusEffect,
  useNavigationState,
} from './runes';
export type {
  INavigationHandle,
  IStackNavigationHandle,
  ITabNavigationHandle,
  IDrawerNavigationHandle,
} from './runes';
export type { INavigationScopeValue, IAnyNavigatorHandle } from './navigation-context';

export { useLinkingIntegration } from './linking.svelte';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, a PURE-JS UI (no react-native-screens views involved, so no
// extra ViewConfig registration is needed beyond the ../register import above).
export { Tab } from './tabs';
export type { ITabNavigatorHandle, ITabProps } from './tabs';
export { default as TabScreen } from './tab-screen.svelte';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
  ITabScreenProps,
} from './tab-screen-props';
export type { ITabOptions, ITabBarIcon } from '../core';

// Drawer: the swipeable drawer navigator, a PURE-JS UI (PanResponder + Animated, no
// react-native-screens views involved, so no extra ViewConfig registration is needed beyond the
// ../register import above). See drawer/index.svelte's header for the feasibility note re:
// react-native-gesture-handler / react-native-reanimated parity gaps.
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
export type { IDrawerOptions, IDrawerScreenOptions, IDrawerType, IDrawerPosition } from '../core';
