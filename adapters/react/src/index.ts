// @symbiote-native/react: a react-reconciler host config (mutation mode) over
// @symbiote-native/engine. React is a known-good driver: it proves the native pipe
// and the shared clone-on-write engine before any non-React adapter has to.

export { View, Text } from './components';
export type { IViewProps, ITextProps } from './components';
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
} from '@symbiote-native/components';
export type { IResponderProps } from './utils/responder-props';
export { Image, setImageSourceResolver } from './components/image';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './components/image';
export { ImageBackground } from './components/image-background';
export type { IImageBackgroundProps } from './components/image-background';
export { ScrollView } from './components/scroll-view';
export type {
  IScrollViewProps,
  IScrollViewHandle,
} from './components/scroll-view';
export { TextInput } from './components/text-input';
export type {
  ITextInputProps,
  ITextInputHandle,
} from './components/text-input';
export { InputAccessoryView } from './components/input-accessory-view';
export type { IInputAccessoryViewProps } from './components/input-accessory-view';
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './components/keyboard-avoiding-view';
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';

export { Switch } from './components/switch';
export type { ISwitchProps, ISwitchTrackColor } from './components/switch';
export { ActivityIndicator } from './components/activity-indicator';
export type { IActivityIndicatorProps } from './components/activity-indicator';
export { SafeAreaView } from './components/safe-area-view';
export type { ISafeAreaViewProps } from './components/safe-area-view';
export { RefreshControl } from './components/refresh-control';
export type { IRefreshControlProps } from './components/refresh-control';
export { Modal } from './components/modal';
export type {
  IModalProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
} from './components/modal';

export { Pressable } from './components/pressable';
export type { IPressableProps, IPressState } from './components/pressable';
export {
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from './components/touchable';
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
  ITouchableWithoutFeedbackProps,
} from './components/touchable';
export { Button } from './components/button';
export type { IButtonProps } from './components/button';

export { FlatList } from './components/flat-list';
export type { IFlatListProps, IFlatListHandle } from './components/flat-list';
export { SectionList } from './components/section-list';
export type {
  ISectionListProps,
  ISectionListHandle,
  ISection,
} from './components/section-list';
export { VirtualizedSectionList } from './components/virtualized-section-list';
export type {
  IVirtualizedSectionListProps,
  IVirtualizedSectionListHandle,
} from './components/virtualized-section-list';
export { VirtualizedList } from './components/virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListHandle,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
} from './components/virtualized-list';

export type {
  IViewStyle,
  ITextStyle,
  IFlexAlign,
  IFlexJustify,
} from './utils/styles';
export { mount, unmount } from './render';
// createPortal: react-reconciler's Fiber-level portal, working here because @symbiote-native/react is
// mutation-mode (unlike stock RN's persistent-mode Fabric renderer, which doesn't support it —
// see create-portal.ts). v1 scope: target must be an already-mounted node in the SAME surface.
export { createPortal, type IPortalContainer } from './create-portal';
// createTunnel: cross-surface content sharing. createPortal/Teleport stay same-surface-only
// by design — a real React portal can't reach across two separate reconciler roots either
// (see github.com/facebook/react/issues/17147), so reaching a different surface means letting
// that surface commit its own content by reading from a shared store instead.
export { createTunnel, type ITunnel } from './create-tunnel';
// descriptorToReact: the @symbiote-native/components Descriptor → React.createElement bridge. Exported so
// an external wrapper package (e.g. @symbiote-native/slider/react over a third-party native view) can map
// a shared render fn's Descriptor onto React elements through the SAME bridge the adapter uses.
export { descriptorToReact } from './descriptor-to-react';
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
// AppRegistry: RN's app entry point over `mount`. setHostRegistrar wires RN's own
// registrar so the native Fabric host finds our runnable by app key.
export { AppRegistry, setHostRegistrar } from './modules/app-registry';
export type {
  IComponentProvider,
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IWrapperComponentProvider,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from './modules/app-registry';

// Animated bridge: createAnimatedComponent + Animated.View/Text/Image, driving the
// shared JS Animated engine. Imperative timing/spring drivers merge into this
// namespace once they land in shared.
export { Animated, createAnimatedComponent } from './modules/animated';

// Framework-agnostic runtime utilities live in shared; the adapter re-exports them
// so app code names only @symbiote-native/react (RN's surface, one import root).
export { Platform, StyleSheet } from '@symbiote-native/engine';
// Color utilities: PlatformColor / DynamicColorIOS build opaque platform colors;
// processColor runs a color through the injected platform processor. All pure /
// seam-backed, so they live in shared and the adapter re-exports them.
export {
  PlatformColor,
  DynamicColorIOS,
  processColor,
} from '@symbiote-native/engine';
export type {
  IColorValue,
  IOpaqueColorValue,
  IDynamicColorIOSTuple,
} from '@symbiote-native/engine';
// The three app-entry seams, wired once on a real host, so the barrel exposes them together.
// setNativeViewConfigSource hands the engine RN's ViewConfig registry, which is how third-party
// Fabric views auto-derive their metadata:
//   setNativeViewConfigSource(name => ReactNativeViewConfigRegistry.get(name))
export {
  setNativeViewConfigSource,
  setColorProcessor,
  setDeviceEventSource,
} from '@symbiote-native/engine';
// Diagnostics, gated by DEBUG (<keep_logs_gate_behind_DEBUG>): app code logs through the same
// seam the engine does instead of a bare console.log.
export { dlog, isDebug } from '@symbiote-native/engine';
export type {
  INativeViewConfig,
  INativeViewConfigSource,
} from '@symbiote-native/engine';
export type {
  IPlatformStatic,
  IPlatformOSType,
  IPlatformConstantsIOS,
  IPlatformConstantsAndroid,
  IPlatformSelectSpec,
} from '@symbiote-native/engine';

// Imperative runtime modules: the SAME module every adapter shares, re-exported straight from
// @symbiote-native/engine so app code names only @symbiote-native/react (RN's single import
// root). Thin JS over getNativeModule + device events, no Fabric component of their own.
export {
  Alert,
  Share,
  ActionSheetIOS,
  Linking,
  Vibration,
  ToastAndroid,
  Settings,
  I18nManager,
  Dimensions,
  Appearance,
  AppState,
  Keyboard,
  KEYBOARD_EVENT,
  BackHandler,
  PermissionsAndroid,
  PERMISSIONS,
  RESULTS,
  LayoutAnimation,
  PixelRatio,
} from '@symbiote-native/engine';
export type {
  IAlertType,
  IAlertButtonStyle,
  IAlertButton,
  IAlertButtons,
  IAlertOptions,
  IShareContent,
  IShareOptions,
  IShareAction,
  IActionSheetIOSOptions,
  IShareActionSheetIOSOptions,
  IShareActionSheetError,
  IUrlEvent,
  II18nManagerConstants,
  IDisplayMetrics,
  IDisplayMetricsAndroid,
  IDimensionsPayload,
  IDimensionsSet,
  IDimensionsKey,
  IDimensionsChangeListener,
  IDimensionsStatic,
  IColorSchemeName,
  IColorSchemePreference,
  IAppStateStatus,
  IAppStateEvent,
  IKeyboardEventName,
  IKeyboardEvent,
  IKeyboardMetrics,
  IBackPressEventName,
  IBackPressHandler,
  IPermission,
  IPermissionStatus,
  IRationale,
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
  IPixelRatioStatic,
} from '@symbiote-native/engine';

// React lifecycle over those core device-state modules.
export { useWindowDimensions } from './hooks/use-window-dimensions';
export { useColorScheme } from './hooks/use-color-scheme';

export { AccessibilityInfo } from './modules/accessibility-info';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from './modules/accessibility-info';

// Interaction subsystems: gestures, deferred work, and layout transitions.
export { PanResponder } from '@symbiote-native/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiote-native/engine';
// InteractionManager is pure JS, so it lives in shared; re-exported here so app code
// names only @symbiote-native/react (RN's single import root).
export { InteractionManager } from '@symbiote-native/engine';
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
} from '@symbiote-native/engine';

// Android-only surface (the second-platform pass): a thin JS shim over an Android Fabric view,
// inert on iOS (no native view -> degrades to a plain container). The Android-only MODULES
// (ToastAndroid, PermissionsAndroid, BackHandler) sit in the engine block above.
export { TouchableNativeFeedback } from './components/touchable-native-feedback';
export type {
  ITouchableNativeFeedbackProps,
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './components/touchable-native-feedback';
export type {
  ISymbioteEvent,
  ISymbioteNode,
  IRootTag,
} from '@symbiote-native/engine';
// Component-detail types carrying no framework element or ref, so they are defined once in
// @symbiote-native/components and every adapter re-exports the SAME type
// (<prop_types_split_agnostic_vs_per_adapter>).
export type {
  ICellLayout,
  ISeparatorProps,
  ISeparators,
  IModalOrientationChangeEvent,
  IPressableAndroidRippleConfig,
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
  ITextInputSelection,
  IImageStatics,
} from '@symbiote-native/components';
