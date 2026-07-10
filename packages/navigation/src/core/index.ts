// @symbiote-native/navigation (core): the framework-agnostic half of the native stack navigator —
// a pure route-stack reducer plus the react-native-screens prop folds and native-leaf prop
// resolvers. symbiote ships zero runtime metadata for RNSScreen/RNSScreenStack/
// RNSScreenStackHeaderConfig — the engine derives their events and color processors from
// react-native-screens' own ViewConfig — so this layer is the pure JS every adapter reuses
// verbatim, supplying only its lifecycle (route-key generation, useReducer/reactive state) and
// the descriptor bridge.

export * from './constants';

export {
  createInitialNavigatorState,
  navigatorReducer,
  computeActivityState,
  isTopRoute,
} from './navigator-state';
export type { IRoute, INavigatorState, INavigatorAction } from './navigator-state';

export type {
  IStackAnimation,
  IStackPresentation,
  IHeaderBackButtonDisplayMode,
  IHeaderUserInterfaceStyle,
  IOptionalBooleanNativeProp,
  ISheetAllowedDetents,
  ISheetLargestUndimmedDetent,
  ISheetInitialDetent,
  IHeaderBarButtonIcon,
  IHeaderBarButtonItemBadge,
  IHeaderBarButtonItemAction,
  IHeaderBarButtonMenuAction,
  IHeaderBarButtonSubmenu,
  IHeaderBarButtonItemMenu,
  IHeaderBarButtonItemSpacing,
  IHeaderBarButtonItem,
  ISearchBarAutoCapitalize,
  ISearchBarPlacement,
  ISearchBarOptions,
  IScreenOrientation,
  IScreenOptions,
  INavigatorPlatform,
  IScreenViewProps,
  IHeaderConfigViewProps,
  IStackViewProps,
  ISearchBarViewProps,
} from './navigator-props';

export { resolveHeaderConfigView, resolveScreenView, resolveSearchBarView } from './screen-options';

export { buildSearchBarHandle } from './search-bar-commands';
export type { ISearchBarCommands } from './search-bar-commands';

export {
  resolveScreenProps,
  resolveStackProps,
  renderHeaderConfig,
  resolveSearchBarProps,
  resolveScreenContentWrapperStyle,
  resolveScreenViewName,
  isHeaderInModal,
  resolveHeaderInModalStackStyle,
  resolveHeaderInModalScreenStyle,
} from './render-stack';

export { serializeNavigatorState, deserializeNavigatorState } from './state-persistence';

export {
  createNavigationEmitter,
  NAVIGATION_EVENT_FOCUS,
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_STATE,
  NAVIGATION_EVENT_BEFORE_REMOVE,
} from './navigation-events';
export type {
  INavigationEmitter,
  INavigationEventListener,
  INavigationEventName,
} from './navigation-events';

// Bottom-tabs navigator: a FOCUSED-INDEX router (not a stack — see tab-router-state.ts) driving
// a pure-JS tab bar render, framework-agnostic and shared verbatim by every adapter.
export { createInitialTabState, tabRouterReducer, isFocusedRoute } from './tab-router-state';
export type { ITabRouterState, ITabRouterAction } from './tab-router-state';

export type { ITabBarIcon, ITabOptions } from './tab-options';

export { renderTabBarItem, renderTabBar } from './render-tabs';
export type { ITabBarItemView, ITabBarViewProps } from './render-tabs';

// Linking config: resolves a URL to a route (and back), the piece @react-navigation's
// NavigationContainer `linking` prop provides on top of the framework-agnostic Linking module.
export { resolveRouteFromUrl, resolveUrlFromRoute } from './linking-config';
export type { ILinkingConfig, IScreenLinkingConfig } from './linking-config';

// Drawer navigator: an OPEN/CLOSED-flag router over a fixed route list (see
// drawer-router-state.ts's header for why it isn't a push/pop stack), a pure swipe/geometry math
// module, and a Descriptor render fn — all framework-agnostic, shared verbatim by every adapter.
export {
  createInitialDrawerRouterState,
  drawerRouterReducer,
  focusedDrawerRoute,
} from './drawer-router-state';
export type { IDrawerRouterState, IDrawerRouterAction } from './drawer-router-state';

export type {
  IDrawerType,
  IDrawerPosition,
  IDrawerOptions,
  IDrawerScreenOptions,
  IDrawerGeometry,
  ISwipeIntent,
} from './drawer-options';
export {
  DRAWER_DEFAULT_TYPE,
  DRAWER_DEFAULT_POSITION,
  DRAWER_DEFAULT_WIDTH,
  DRAWER_DEFAULT_OVERLAY_COLOR,
  DRAWER_DEFAULT_SWIPE_ENABLED,
  DRAWER_DEFAULT_SWIPE_EDGE_WIDTH,
  DRAWER_DEFAULT_SWIPE_MIN_DISTANCE,
  DRAWER_DEFAULT_SWIPE_MIN_VELOCITY,
  resolveDrawerType,
  resolveDrawerPosition,
  resolveDrawerWidth,
  isDrawerAnimated,
  isDrawerOverlayVisible,
  resolveDrawerGeometry,
  isSwipeStartInEdge,
  isHorizontalDrag,
  resolveSwipeIntent,
} from './drawer-options';

export { renderDrawer, drawerChildOrder } from './render-drawer';
export type { IDrawerSlot, IDrawerViewProps } from './render-drawer';
