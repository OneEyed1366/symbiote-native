// @symbiote-native/react: a react-reconciler host config (mutation mode) over
// @symbiote-native/engine. React is a known-good driver: it proves the native pipe
// and the shared clone-on-write engine before any non-React adapter has to.

// Bare side-effect import, deliberately NOT a re-export and deliberately not beside one of the
// same specifier: it installs the engine's host behaviors, which is what makes a bare
// `<pressable>` / `<text-input>` / `<switch>` carry its machine. Any other shape is dropped by
// Metro's inlineRequires in a release build — see register.ts.
import './register';

// The intrinsic-element table now reaches an app through `jsxImportSource`, not through this
// barrel: TypeScript resolves the JSX namespace from `@symbiote-native/react/jsx-runtime` and
// NOTHING else, so an app sets that one tsconfig line and gets the tags. What is re-exported here
// is only the tag-name type, for code that wants to name it.
export type { ISymbioteIntrinsicTag } from './jsx-runtime';
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
// `Image` is a TAG — `<image>` — and the name now carries only RN's STATICS
// (`Image.getSize(...)`), an imperative API with no view. The wrapper's whole source/style
// translation runs on the tag as the engine's `registerImageBehavior`.
export { Image } from './modules/image';
export { setImageSourceResolver } from '@symbiote-native/components';
export type { IImageProps } from './components/image/image-props';
export type {
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/components';
// `ImageBackground` is a TAG — `<image-background>` — and there is nothing to import in its place.
// The prop type stays, for a component forwarding a bag.
export type { IImageBackgroundProps } from './components/image-background-props';
// `ScrollView` is a TAG — `<scroll-view>`, and `horizontal` is the SEPARATE tag
// `<horizontal-scroll-view>` because Android scrolls the two axes with different ViewManagers.
// The engine builds the content node, routes `contentContainerStyle` onto it, places a
// `<refresh-control>` CHILD per platform, and pins `<sticky-header>` children. The imperative
// scroll API needs nothing from this barrel: a `ref` hands back the engine node, and
// `scrollTo` / `scrollToEnd` / `flashScrollIndicators` are methods ON it — which is all
// `buildScrollViewHandle` ever delegated to.
export type {
  IScrollViewProps,
  IScrollViewHandle,
} from './components/scroll-view/scroll-view-props';
// `TextInput` is a TAG — `<text-input>`, and `multiline` picks `text-input-multiline` underneath —
// so there is nothing to import in its place. The controlled handshake, the focus mirror and
// `autoFocus` all live on the engine node now; the imperative API comes from
// `buildTextInputHandle` — imported from `@symbiote-native/components`, not re-exported here: four
// adapters reach it that way and `tests/adapter-barrel-parity.test.ts` compares the sets.
export type { ITextInputProps } from './components/text-input/text-input-props';
export type {
  ITextInputHandle,
  ITextInputChangeEvent,
} from '@symbiote-native/components';
// `InputAccessoryView` is a TAG — `<input-accessory-view>` — and there is nothing to import in its
// place. The wrapper's body was the shared host-node assembly, which the engine behavior now runs
// on the tag itself. The prop type stays, for a component forwarding a bag.
export type { IInputAccessoryViewProps } from './components/input-accessory-view-props';
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './components/keyboard-avoiding-view';
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';

// `Switch` is a TAG — `<switch>` — and there is nothing to import in its place. The controlled
// lifecycle its wrapper ran (the lastNativeReport mirror, the snap-back view command) lives on the
// engine node now; the prop type stays, for a component forwarding a bag.
export type { ISwitchProps } from './components/switch/switch-props';
export type {
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from '@symbiote-native/components';
// `ActivityIndicator` is a TAG — `<activity-indicator>` — and there is nothing to import in its
// place. RN's ActivityIndicator has no statics, so the name exports nothing at all now; the prop
// type stays, for a component forwarding a bag.
export type { IActivityIndicatorProps } from './components/activity-indicator-props';
// `SafeAreaView` is a TAG — `<safe-area-view>` — and there is nothing to import in its place. The
// wrapper was a passthrough: RN does the inset math natively, and its two folds moved down (aria to
// the engine's `fabricProps`, `id -> nativeID` to `foldHostBag`). The prop type stays, for a
// component forwarding a bag.
export type { ISafeAreaViewProps } from './components/safe-area-view-props';
// `RefreshControl` is a TAG — `<refresh-control>` — and there is nothing to import in its place.
// Its wrapper was a passthrough; the controlled-spinner handshake lives on the engine node
// (`registerRefreshControlBehavior`). The prop type stays, for a component forwarding a bag.
export type { IRefreshControlProps } from './components/refresh-control-props';
export { Modal } from './components/modal';
export type {
  IModalProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
} from './components/modal';

// `Pressable` is a TAG — `<pressable>` — and there is nothing to import in its place. Its press
// machine lives on the engine node (`registerPressableBehavior`), which is also what let the
// wrapper's `android_ripple` child go: RN paints the ripple on the responder itself
// (Pressable.js:251), never on an inner view. The prop types stay, for a component forwarding a
// bag.
export type {
  IPressableProps,
  IPressState,
} from './components/pressable/pressable-props';
// `TouchableOpacity` and `TouchableHighlight` are TAGS too — `<touchable-opacity>` and
// `<touchable-highlight>`. Each holds its own press machine PLUS its own feedback (the opacity
// fade, the underlay swap), which is why they carry their own tags rather than sharing
// `pressable`: one node may hold exactly one press machine.
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
} from './components/touchable/touchable-props';
// `TouchableWithoutFeedback` is a TAG — `<touchable-without-feedback>` — and RN gives it no statics,
// so like `Button` the name exports nothing now; only the prop type stays, for a component
// forwarding a bag.
export type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback/touchable-without-feedback-props';
// `Button` is a TAG — `<button>` — and there is nothing to import in its place. RN's Button has no
// statics (unlike `TouchableNativeFeedback`), so the name exports nothing at all now; the
// prop type stays, for a component forwarding a bag.
export type { IButtonProps } from './components/button-props';

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
// `TouchableNativeFeedback` is now RN's STATIC NAMESPACE, not a component: the element is the tag
// `<touchable-native-feedback>`, which commits no node of its own and clones onto its single child.
// `TouchableNativeFeedback.Ripple(…)` / `.SelectableBackground(…)` are unchanged.
export { TouchableNativeFeedback } from '@symbiote-native/components';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote-native/components';
export type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback/touchable-native-feedback-props';
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
