// @symbiote-native/navigation/angular: the Angular native-stack navigator over
// react-native-screens' native view primitives. Importing this barrel first registers the native
// views' ViewConfigs (../register, a side-effect import of the three codegen specs — never
// react-native-screens' own React components), then exposes Stack/Tab/Drawer with their Screen
// directives and navigator handles. Mirrors react/index.ts's barrel shape.

import '../register';

export { Stack } from './stack';
export type { INavigatorHandle } from './stack';
export { ScreenDirective } from './screen.directive';
export type {
  IAngularScreenOptions,
  IAngularSearchBarOptions,
  IScreenComponentProps,
  IScreenOptionsResolver,
} from './screen.directive';
export type { IScreenOptions, IStackAnimation, IStackPresentation } from '../core';

export { useNavigation, useRoute, useIsFocused, useFocusEffect, useNavigationState } from './hooks';
export type { INavigationHandle, IFocusEffectCallback } from './hooks';
export { NavigationContextService } from './navigation-context.service';
export type { IAnyNavigatorHandle } from './navigation-context.service';
export { NavigationScopeDirective } from './navigation-scope.directive';

export { useLinkingIntegration } from './linking';
export type { ILinkingConfig, IScreenLinkingConfig } from '../core';

// Tab: the bottom-tabs navigator, a PURE-JS UI (no react-native-screens views involved, so no
// extra ViewConfig registration is needed beyond the ../register import above).
export { Tab } from './tabs';
export type { ITabNavigatorHandle } from './tabs';
export { TabScreenDirective } from './tab-screen.directive';
export type { ITabScreenComponentProps, ITabScreenOptionsResolver } from './tab-screen.directive';
export type { ITabOptions, ITabBarIcon } from '../core';

// Drawer: the swipeable drawer navigator, a PURE-JS UI (PanResponder + Animated, no
// react-native-screens views involved, so no extra ViewConfig registration is needed beyond the
// ../register import above). See drawer.ts's header for the feasibility note re:
// react-native-gesture-handler / react-native-reanimated parity gaps.
export { Drawer } from './drawer';
export type { IDrawerNavigatorHandle, IDrawerDescriptorMap, IDrawerContentContext } from './drawer';
export { DrawerScreenDirective } from './drawer-screen.directive';
export type {
  IDrawerScreenComponentProps,
  IDrawerScreenOptionsResolver,
} from './drawer-screen.directive';
export type { IDrawerOptions, IDrawerScreenOptions, IDrawerType, IDrawerPosition } from '../core';
