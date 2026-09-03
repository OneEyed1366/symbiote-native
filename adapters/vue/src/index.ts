// @symbiote-native/vue: a thin Vue 3 reconciler over @symbiote-native/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote-native/vue.

// Side-effect import, FIRST and deliberately not a re-export: it installs the engine-side press
// machine that a lowered `<symbiote-pressable>` needs. `export * from './register'` or a bare
// import sitting beside a re-export of the same specifier both go lazy under Metro's production
// `inlineRequires` and the registration silently never runs in a release build. See register.ts.

import './register';

export { mount, unmount, setAppConfigurator } from './render';
export type { IAppConfigurator } from './render';
// The portal: Vue's own <Teleport>, guarded so `to` must be a node/surface this renderer actually
// mounted (there is no querySelector). It MOVES host nodes, so it reaches any already-mounted
// target in the SAME surface — including one you only hold a ref to — and keeps the content's
// reactive owner at the call site (provide/inject resolve from where it was written). Reaching a
// second, independently mount()ed surface is a different mechanism: createTunnel, which copies
// into an <Out/> the destination has to render. See create-portal/index.ts.
export { Teleport, type ITeleportTarget } from './create-portal';
export { createTunnel, type ITunnel } from './create-tunnel';
export { View, Text } from './components';
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
  IResponderProps,
} from '@symbiote-native/components';
// IHostInstance is the raw engine node (Vue host refs fall through to it; imperative methods
// live on each component's expose() handle).
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';
export { Image, setImageSourceResolver } from './components/image';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './components/image';
export { ActivityIndicator } from './components/activity-indicator';
export type { IActivityIndicatorProps } from './components/activity-indicator';
export { Switch } from './components/switch';
export type { ISwitchProps, ISwitchTrackColor } from './components/switch';
export { ScrollView } from './components/scroll-view';
export type {
  IScrollViewProps,
  IScrollViewEmits,
  IScrollViewHandle,
} from './components/scroll-view';
export { Pressable } from './components/pressable';
export type {
  IPressableProps,
  IPressableSlots,
  IPressState,
  IPressableAndroidRippleConfig,
} from './components/pressable';
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
export { TouchableNativeFeedback } from './components/touchable-native-feedback';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
  ITouchableNativeFeedbackProps,
} from './components/touchable-native-feedback';
export { Button } from './components/button';
export type { IButtonProps } from './components/button';
export { TextInput } from './components/text-input';
export type {
  ITextInputProps,
  ITextInputHandle,
} from './components/text-input';
export { VirtualizedList } from './components/virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListSlots,
  IVirtualizedListEmits,
  IVirtualizedListHandle,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  ICellLayout,
} from './components/virtualized-list';
export { FlatList } from './components/flat-list';
export type {
  IFlatListProps,
  IFlatListSlots,
  IFlatListEmits,
  IFlatListHandle,
} from './components/flat-list';
export { VirtualizedSectionList } from './components/virtualized-section-list';
export type {
  IVirtualizedSectionListProps,
  IVirtualizedSectionListSlots,
  IVirtualizedSectionListEmits,
  IVirtualizedSectionListHandle,
} from './components/virtualized-section-list';
export { SectionList } from './components/section-list';
export type {
  ISection,
  ISectionListProps,
  ISectionListSlots,
  ISectionListEmits,
  ISectionListHandle,
} from './components/section-list';
// RefreshControl hosts the wrapped scroll view via its default slot.
export { SafeAreaView } from './components/safe-area-view';
export type { ISafeAreaViewProps } from './components/safe-area-view';
export { RefreshControl } from './components/refresh-control';
export type {
  IRefreshControlProps,
  IRefreshControlEmits,
} from './components/refresh-control';
export { descriptorToVue } from './descriptor-to-vue';
// Exported so an external wrapper package (e.g. @symbiote-native/slider/vue over a third-party
// native view) can fold its incoming attrs/v-model through the SAME transform rather than
// reimplementing it.
export { normalizeVueAttrs } from './utils/normalize-attrs';
export { resolveModelValue, emitModelUpdate } from './utils/model-binding';
export { createSymbioteRenderer } from './renderer';
export { Animated, createAnimatedComponent } from './modules/animated';

export { ImageBackground } from './components/image-background';
export type { IImageBackgroundProps } from './components/image-background';
export { InputAccessoryView } from './components/input-accessory-view';
export type { IInputAccessoryViewProps } from './components/input-accessory-view';
export { Modal } from './components/modal';
export type {
  IModalProps,
  IModalEmits,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from './components/modal';
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IKeyboardAvoidingBehavior,
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingViewEmits,
} from './components/keyboard-avoiding-view';
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';
// RN's app entry point over `mount`. setHostRegistrar wires RN's own registrar so the native
// Fabric host finds our runnable by app key.
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
// Vue composables over the core device-state modules.
export { useColorScheme } from './composables/use-color-scheme';
export { useWindowDimensions } from './composables/use-window-dimensions';

// Imperative runtime modules: the SAME module both adapters share, re-exported from @symbiote-native/engine.
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
  AccessibilityInfo,
  LayoutAnimation,
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
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
  ILayoutAnimationType,
  ILayoutAnimationProperty,
  ILayoutAnimationConfig,
  ILayoutAnimationAnim,
} from '@symbiote-native/engine';

// Re-export the framework-agnostic engine surface (pure utilities + diagnostics).
export {
  Platform,
  StyleSheet,
  processColor,
  setColorProcessor,
  dlog,
  isDebug,
} from '@symbiote-native/engine';
export type {
  ISymbioteEvent,
  ISymbioteNode,
  IRootTag,
} from '@symbiote-native/engine';
// Style + Platform value types and the native-view-config seam: pure / seam-backed, so
// they live in the engine and both adapters re-export them (parity with the React adapter).
export type {
  IViewStyle,
  ITextStyle,
  IFlexAlign,
  IFlexJustify,
  IPlatformStatic,
  IPlatformOSType,
  IPlatformConstantsIOS,
  IPlatformConstantsAndroid,
  IPlatformSelectSpec,
} from '@symbiote-native/engine';
// Wired once by the app entry on a real host (like setColorProcessor): hands the engine
// RN's ViewConfig registry so third-party Fabric views auto-derive their metadata.
// setDeviceEventSource is the third seam of the same set and travels with them.
export {
  setNativeViewConfigSource,
  setDeviceEventSource,
} from '@symbiote-native/engine';
export type {
  INativeViewConfig,
  INativeViewConfigSource,
} from '@symbiote-native/engine';
// Component-detail types carrying no framework element or ref, so they are defined once in
// @symbiote-native/components and every adapter re-exports the SAME type.
export type {
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
  ITextInputSelection,
  IImageStatics,
} from '@symbiote-native/components';
// Pure utilities that moved to the engine (single source, both adapters re-export):
// PixelRatio + PanResponder, plus the color builders and the interaction scheduler.
export {
  PixelRatio,
  PanResponder,
  PlatformColor,
  DynamicColorIOS,
  InteractionManager,
} from '@symbiote-native/engine';
export type { IPixelRatioStatic } from '@symbiote-native/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiote-native/engine';
export type {
  IColorValue,
  IOpaqueColorValue,
  IDynamicColorIOSTuple,
} from '@symbiote-native/engine';
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
} from '@symbiote-native/engine';
