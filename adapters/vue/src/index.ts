// @symbiote-native/vue: a thin Vue 3 reconciler over @symbiote-native/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote-native/vue.

// Side-effect import, FIRST and deliberately not a re-export: it installs the engine-side press
// machine that a lowered `<pressable>` needs. `export * from './register'` or a bare
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
// `View` and `Text` are TAGS — `<view>` and `<text>` — and there is nothing to import in their
// place. Both wrappers were `h(tag, normalizeVueAttrs(attrs))`, and both folds now run in the
// renderer: kebab->camel plus `id -> nativeID` in `patchProp`, RN's Text defaults in
// `createElement`'s `seedTextDefaults`. A renderer fold covers all four Vue paths to a node; a
// wrapper covered only the two that named it.
export type { IViewProps } from './components/view-props';
export type { ITextProps } from './components/text-props';
// Type-only, and the re-export is the POINT rather than the names: it is what makes the checker
// load `intrinsic-elements.ts`, whose `declare module 'vue'` is the tag alphabet vue-tsc reads.
// A declaration nothing imports applies inside this package only.
export type {
  ISymbioteIntrinsicTag,
  ISymbioteHostAttributes,
} from './intrinsic-elements';
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
// `Image` is a TAG — `<image>`. What survives the name is the STATICS namespace, and it lives in
// `modules/` beside Alert/Share because it carries no view; the prop type stays, for a component
// forwarding a bag.
export { Image } from './modules/image';
export { setImageSourceResolver } from '@symbiote-native/components';
export type { IImageProps } from './components/image-props';
export type {
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/components';
// `ActivityIndicator` is a TAG — `<activity-indicator>` — and there is nothing to import in its
// place. RN's ActivityIndicator has no statics, so the name exports nothing at all now; the prop
// type stays, for a component forwarding a bag.
export type { IActivityIndicatorProps } from './components/activity-indicator-props';
// `Switch` is a TAG — `<switch>` — and there is nothing to import in its place. The
// `lastNativeReport` mirror, the snap-back command and the platform track-color mapping all live on
// the engine node (`registerSwitchBehavior`), so the `switch-managed` twin that kept the wrapper's
// machine apart from it is dead too. `v-model` still works: on an element it compiles to a runtime
// directive, and `vModelText` in `./runtime-helpers` is ours.
export type {
  ISwitchProps,
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from './components/switch/switch-props';
export { ScrollView } from './components/scroll-view';
export type {
  IScrollViewProps,
  IScrollViewEmits,
  IScrollViewHandle,
} from './components/scroll-view';
// `Pressable` is a TAG — `<pressable>` — and there is nothing to import in its place. The press
// machine runs on the engine node (`registerPressableBehavior`).
//
// `IPressableSlots` is GONE with the wrapper and nothing replaces it: press state lives on the
// engine node and never reaches Vue's reactivity, so `#default="{ pressed }"` has no channel. A
// functional `style` still works (the engine resolves it at both values of `pressed`), and a child
// that needs the state takes it from a ref the screen mirrors off `@press-in`/`@press-out`.
export type {
  IPressableProps,
  IPressState,
  IPressableAndroidRippleConfig,
} from './components/pressable-props';
export { TouchableOpacity, TouchableHighlight } from './components/touchable';
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
} from './components/touchable';
// `TouchableWithoutFeedback` is a TAG — `<touchable-without-feedback>` — and RN gives it no statics,
// so like `Button` the name exports nothing now; only the prop type stays, for a component
// forwarding a bag.
export type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback-props';
// `TouchableNativeFeedback` is now RN's STATIC NAMESPACE, not a component: the element is the tag
// `<touchable-native-feedback>`, which commits no node of its own and clones onto its single child.
// `TouchableNativeFeedback.Ripple(…)` / `.SelectableBackground(…)` are unchanged.
export { TouchableNativeFeedback } from '@symbiote-native/components';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote-native/components';
export type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback-props';
// `Button` is a TAG — `<button>` — and there is nothing to import in its place. RN's Button has no
// statics (unlike `TouchableNativeFeedback` next to it), so the name exports nothing at all now;
// the prop type stays, for a component forwarding a bag.
export type { IButtonProps } from './components/button-props';
// `TextInput` is a TAG — `<text-input>`, and `multiline` picks `text-input-multiline` underneath —
// so there is nothing to import in its place. The controlled handshake, the focus mirror and
// `autoFocus` live on the engine node now; the imperative API comes from `buildTextInputHandle`,
// imported from `@symbiote-native/components` over the node a template `ref` hands back, not
// re-exported here — four adapters reach it that way and `tests/adapter-barrel-parity.test.ts`
// compares the sets.
export type { ITextInputProps } from './components/text-input/text-input-props';
export type {
  ITextInputHandle,
  ITextInputChangeEvent,
} from '@symbiote-native/components';
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
// `SafeAreaView` is a TAG — `<safe-area-view>` — and there is nothing to import in its place: the
// wrapper only normalized attrs and folded aria, and both now run below every path.
export type { ISafeAreaViewProps } from './components/safe-area-view-props';
// `RefreshControl` is a TAG — `<refresh-control>` — carrying its own engine behavior
// (`registerRefreshControlBehavior`, the controlled-spinner handshake). `@refresh` reaches native
// as an ordinary `onRefresh` prop, so the wrapper's `refresh` emit had nothing left to add.
export type { IRefreshControlProps } from './components/refresh-control-props';
export { descriptorToVue } from './descriptor-to-vue';
// Exported so an external wrapper package (e.g. @symbiote-native/slider/vue over a third-party
// native view) can fold its incoming attrs/v-model through the SAME transform rather than
// reimplementing it.
export { normalizeVueAttrs } from './utils/normalize-attrs';
export { resolveModelValue, emitModelUpdate } from './utils/model-binding';
export { createSymbioteRenderer } from './renderer';
export { Animated, createAnimatedComponent } from './modules/animated';

// `ImageBackground` is a TAG — `<image-background>` — and there is nothing to import in its place.
// The prop type stays, for a component forwarding a bag.
export type { IImageBackgroundProps } from './components/image-background-props';
// `InputAccessoryView` is a TAG — `<input-accessory-view>` — and there is nothing to import in its
// place. Its whole body was the fold `registerInputAccessoryViewBehavior` now runs on the tag.
export type { IInputAccessoryViewProps } from './components/input-accessory-view-props';
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
