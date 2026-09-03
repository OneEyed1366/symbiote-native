// @symbiote-native/navigation/solid: the Solid native-stack navigator over react-native-screens'
// native view primitives. Importing this barrel first registers the native views' ViewConfigs
// (../register, a side-effect import of the codegen specs - never react-native-screens' own React
// components), then exposes Stack (with Stack.Screen attached) and the navigator handle. Mirrors
// vue/index.ts's and svelte/index.ts's barrel shape.
//
// The lifecycle helpers split by what they DO, not by a blanket prefix: `use*` for the ones that
// only consume the navigation scope already on the owner chain (useNavigation / useRoute and the
// three narrowing variants - Solid's own `useContext` sense), `create*` for the ones that own a
// signal, an effect or a subscription (createIsFocused / createFocusEffect / createNavigationState
// / createLinkingIntegration). Same rule the adapter's `createColorScheme` follows; a blanket `use`
// would read as a foreign ecosystem's convention (<adapter_src_follows_framework_idioms>).

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle, IStackProps } from './stack';
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
} from './primitives';
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

// Tab: the bottom-tabs navigator, a PURE-JS UI (no react-native-screens views involved, so no extra
// ViewConfig registration is needed beyond the ../register import above).
export { Tab } from './tabs';
export type { ITabNavigatorHandle, ITabProps } from './tabs';
export type {
  ITabScreenOptionsArgs,
  ITabScreenOptionsResolver,
  ITabScreenProps,
} from './tab-screen-props';
export type { ITabOptions, ITabBarIcon } from '../core';

// Drawer: the swipeable drawer navigator, a PURE-JS UI (PanResponder + Animated). See
// drawer/index.ts's header for the feasibility note re: react-native-gesture-handler /
// react-native-reanimated parity gaps.
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
