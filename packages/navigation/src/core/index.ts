// Framework-agnostic half of the native stack navigator: a pure route-stack reducer and the prop
// folds for the screens views. The engine derives their events and color processors from the
// library's own ViewConfig, so adapters add only a lifecycle and the descriptor bridge

export * from './constants';

export {
  createInitialNavigatorState,
  navigatorReducer,
  computeActivityState,
  isTopRoute,
} from './navigator-state';
export type {
  IRoute,
  INavigatorState,
  INavigatorAction,
} from './navigator-state';

// Drops history entries whose `<Stack.Screen>` marker has unregistered - see
// stack-router-state.ts's header for why the Stack's history needs this and the Tab's projection
// does not.
export { reconcileStackRoutes } from './stack-router-state';

export type {
  IStackAnimation,
  IStackPresentation,
  IHeaderBackButtonDisplayMode,
  IHeaderUserInterfaceStyle,
  IHeaderDirection,
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
  INativeContainerStyle,
  INavigatorPlatform,
  IScreenViewProps,
  IHeaderConfigViewProps,
  IStackViewProps,
  ISearchBarViewProps,
} from './navigator-props';

export {
  resolveHeaderConfigView,
  resolveScreenView,
  resolveSearchBarView,
} from './screen-options';

export {
  resolveCustomHeaderSubviewElements,
  resolveCustomHeaderSubviews,
  resolveCustomHeaderViews,
  resolveHeaderSubviewProps,
} from './header-subviews';
export type {
  IHeaderSubviewFactory,
  IHeaderSubviewHost,
  IHeaderSubviewKind,
  IHeaderSubviewOptions,
  IHeaderViewOptions,
} from './header-subviews';

export { resolveFullWindowOverlay } from './full-window-overlay';
export type { IFullWindowOverlayProps } from './full-window-overlay';

export {
  resolveSheetFooterElements,
  resolveSheetFooterHost,
} from './screen-footer';
export type {
  ISheetFooterHost,
  ISheetFooterInput,
  ISheetFooterOptions,
} from './screen-footer';

export { resolveScreenContainerViewName } from './screen-container';
export {
  compatibilityFlags,
  enableScreens,
  executeNativeBackPress,
  featureFlags,
  isSearchBarAvailableForCurrentPlatform,
  screensEnabled,
} from './screens-config';
export type {
  IScreenContainerInput,
  IScreenContainerProps,
} from './screen-container';

export {
  readMoreTabSelected,
  resolveNativeTabsEvents,
  wireTabsEvent,
} from './native-tabs-events';
export type {
  IMoreTabSelectedEvent,
  INativeTabsEventCallbacks,
  ITabActionOrigin,
  ITabRejectionReason,
  ITabSelectedEvent,
  ITabSelectionPreventedEvent,
  ITabSelectionRejectedEvent,
} from './native-tabs-events';

export { resolveNativeTabsHost } from './native-tabs-host';
export type {
  INativeTabsHost,
  INativeTabsHostAndroid,
  INativeTabsHostIOS,
  INativeTabsHostOptions,
  ITabBarControllerMode,
  ITabBarMinimizeBehavior,
  ITabBarSidebarPlacement,
  ITabsColorScheme,
  ITabsDirection,
} from './native-tabs-host';

export { resolveNativeTabScreen } from './native-tab-screen';
export type {
  INativeTabScreen,
  INativeTabScreenAndroid,
  INativeTabScreenIOS,
  INativeTabScreenOptions,
  ITabOrientation,
  ITabRole,
  ITabSpecialEffects,
  ITabSystemItem,
  ITabUserInterfaceStyle,
} from './native-tab-screen';

export { resolveTabIconsAndroid, resolveTabIconsIOS } from './native-tab-icons';
export type {
  ITabIconAndroid,
  ITabIconImageRenderingMode,
  ITabIconIOS,
  ITabIconSymbolRenderingMode,
  ITabIconTinting,
} from './native-tab-icons';

export {
  resolveTabAppearanceAndroid,
  resolveTabAppearanceIOS,
} from './native-tab-appearance';
export type {
  ITabAppearanceAndroid,
  ITabAppearanceIOS,
  ITabBlurEffect,
  ITabItemAppearanceIOS,
  ITabItemStateAppearanceAndroid,
  ITabItemStateAppearanceIOS,
  ITabLabelVisibilityMode,
} from './native-tab-appearance';

export {
  createInitialNativeTabState,
  nativeTabReducer,
  reconcileNativeTabRoutes,
} from './native-tab-state';
export type { INativeTabAction, INativeTabState } from './native-tab-state';

export { resolveNativeTabsView } from './render-native-tabs';
export type {
  INativeTabsView,
  INativeTabsViewHostOptions,
  INativeTabsViewInput,
  INativeTabsViewScreenOptions,
} from './render-native-tabs';

export { resolveTabsBottomAccessory } from './native-tabs-bottom-accessory';
export type {
  ITabsBottomAccessory,
  ITabsBottomAccessoryContent,
  ITabsBottomAccessoryEnvironment,
  ITabsBottomAccessoryEnvironmentEvent,
  ITabsBottomAccessoryInput,
} from './native-tabs-bottom-accessory';

export { buildSearchBarHandle } from './search-bar-commands';
export type { ISearchBarCommands } from './search-bar-commands';

export {
  resolveScreenProps,
  resolveStackProps,
  renderHeaderConfig,
  resolveSearchBarProps,
  resolveScreenViewName,
  isHeaderInModal,
  resolveHeaderInModalStackStyle,
  resolveHeaderInModalScreenStyle,
  buildSearchBarPassthrough,
  resolveScreenRenderPlan,
} from './render-stack';
export type { IScreenRenderPlanInput, IScreenRenderPlan } from './render-stack';
export { createDrawerController } from './drawer-controller';
export type {
  IDrawerAnimated,
  IDrawerControllerInput,
} from './drawer-controller';
export { buildAnimatedSlotStyle } from './drawer-slot-style';
export { findFocusedEntry, planDrawer } from './drawer-render-plan';
export type {
  IDrawerPlan,
  IDrawerPlanInput,
  IDrawerSlotPlan,
} from './drawer-render-plan';
export { buildDrawerDescriptors } from './drawer-descriptors';
export {
  buildFixedRoutes,
  createFocusTracker,
  routeByKey,
} from './route-tracking';
export type { IFixedRouter } from './fixed-router';
export { buildStackHostProps, resolveStackRoutePlan } from './screen-wiring';
export type { IStackRoutePlanInput } from './screen-wiring';
export {
  createTransitionProgress,
  createTransitionProgressStore,
  requireTransitionProgress,
} from './transition-progress';
export type {
  ITransitionProgress,
  ITransitionProgressStore,
} from './transition-progress';
export type { IEdgeInsetScope, IEdgeInsetState } from './edge-insets';
export { resolveNativeContainerProps } from './stack-container';
export {
  buildInitialState,
  createEmitterStore,
  createRouteFactory,
  createStackHandle,
  mergeScreenOptions,
} from './navigator-wiring';
export type { ICreateRoute } from './navigator-wiring';
export { buildTabBarItems, resolveFocusedTabOptions } from './tab-bar-model';
export type { ITabBarInput } from './tab-bar-model';
export { createTabHandle } from './tab-handle';

export {
  serializeNavigatorState,
  deserializeNavigatorState,
} from './state-persistence';

export {
  createNavigationEmitter,
  diffFocusedRoute,
  NAVIGATION_EVENT_FOCUS,
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_STATE,
  NAVIGATION_EVENT_BEFORE_REMOVE,
} from './navigation-events';
export type {
  INavigationEmitter,
  INavigationEventListener,
  INavigationEventName,
  IFocusTransition,
} from './navigation-events';

// Runtime guards shared across core, adapters also use them to narrow vnode props, event data
// and persisted JSON
export { isRecord } from './guards';

// Bottom-tabs navigator: a FOCUSED-INDEX router (not a stack - see tab-router-state.ts) driving
// a pure-JS tab bar render, framework-agnostic and shared verbatim by every adapter.
export {
  createInitialTabState,
  tabRouterReducer,
  reconcileTabRoutes,
  isFocusedRoute,
} from './tab-router-state';
export type { ITabRouterState, ITabRouterAction } from './tab-router-state';

export type { ITabBarIcon, ITabOptions } from './tab-options';

export { renderTabBarItem, renderTabBar } from './render-tabs';
export type { ITabBarItemView, ITabBarViewProps } from './render-tabs';

// Linking config: resolves a URL to a route (and back), the piece @react-navigation's
// NavigationContainer `linking` prop provides on top of the framework-agnostic Linking module.
export { resolveRouteFromUrl, resolveUrlFromRoute } from './linking-config';
export type { ILinkingConfig, IScreenLinkingConfig } from './linking-config';

// Drawer navigator: an open or closed flag router over a fixed route list, swipe geometry math
// and a `Descriptor` render function, shared by every adapter
export {
  createInitialDrawerRouterState,
  drawerRouterReducer,
  focusedDrawerRoute,
} from './drawer-router-state';
export type {
  IDrawerRouterState,
  IDrawerRouterAction,
} from './drawer-router-state';

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
  clamp01,
  startPageXOf,
  resolveDragProgress,
  shouldClaimDrawerSwipe,
  resolveDrawerSlotInterpolation,
} from './drawer-options';
export type {
  IDrawerInterpolationRange,
  IDrawerContentSlotInterpolation,
  IDrawerOverlaySlotInterpolation,
  IDrawerPanelSlotInterpolation,
} from './drawer-options';

export { renderDrawer, drawerChildOrder } from './render-drawer';
export type { IDrawerSlot, IDrawerViewProps } from './render-drawer';

// Imperative navigator handles (Stack/Tab/Drawer): framework-agnostic, declared once here and
// re-exported verbatim by every adapter (see navigator-handles.ts's header).
export type {
  INavigatorHandle,
  ITabNavigatorHandle,
  IDrawerNavigatorHandle,
  IDrawerDescriptorMap,
  IAnyNavigatorHandle,
} from './navigator-handles';
export {
  isStackNavigatorHandle,
  isTabNavigatorHandle,
  isDrawerNavigatorHandle,
} from './navigator-handles';
