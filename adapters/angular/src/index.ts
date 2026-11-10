// @symbiote-native/angular: a thin Angular reconciler over @symbiote-native/engine. A custom Renderer2 +
// RendererFactory2 map each node op onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote-native/angular.
//
// SEAM SCAFFOLD: mount/unmount + the renderer seam + host intrinsic selectors. Full RN-like
// composed components still flow through the shared @symbiote-native/components bridge.
//
// `View` AND `Text` ARE NOT WORTH IMPORTING — a tag covers the same selectors via
// `SYMBIOTE_ELEMENTS`. They stay as `@Component`s only because a real Angular `style` input stops
// Angular's CSS engine decomposing RN `StyleProp` arrays; a tag takes it as `[styleProp]` instead.
//
// An app loses nothing it cannot spell better: `@ViewChild('ref')` on a template reference returns
// Angular's own `ElementRef<IHostInstance>`, whose `nativeElement` IS the engine host node — the same
// property the component exposed, reached without a component instance per element.
//
// They stay EXPORTED because the composed components render them and ngtsc resolves a component's
// template dependencies to importable names (NG3004, the same rule that put the element directives
// back below). Retiring them means retiring them from those nine components first.

import './finalization-registry';
import './register';

export {
  anchorHostStyle,
  FlatList,
  HorizontalScrollContentView,
  HorizontalScrollView,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollContentView,
  SectionList,
  stableAnchorStyle,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
  Text,
  TouchableNativeFeedback,
  View,
  VirtualizedList,
  VirtualizedSectionList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './components';
export { Animated } from './modules/animated';
// Also exported by name, as ngtsc cannot trace a component class through `Animated.View`
// A template needs `import { AnimatedView }`, which plain tsc and vitest do not check
export {
  AnimatedFlatList,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedSectionList,
  AnimatedText,
  AnimatedView,
} from './modules/animated';
// Maps only View, Text, Image and ScrollView onto the wrappers above, and throws on anything else
// It ships so portable `createAnimatedComponent(View)` code runs on all five adapters
export { createAnimatedComponent } from './modules/animated';
export type {
  IActivityIndicatorProps,
  IAngularPressableInputs,
  IAngularImageBackgroundProps,
  IAngularInputAccessoryViewProps,
  IAngularKeyboardAvoidingViewProps,
  IAngularModalProps,
  IAngularPressableProps,
  IAngularRefreshControlProps,
  IAngularSafeAreaViewProps,
  IAngularScrollViewProps,
  IAngularTextInputProps,
  IAngularTouchableHighlightProps,
  IAngularTouchableNativeFeedbackProps,
  IAngularTouchableOpacityProps,
  IAngularTouchableWithoutFeedbackProps,
  IButtonProps,
  ICheckboxProps,
  ICellLayout,
  IFlatListHandle,
  IFlatListProps,
  IEnterKeyHint,
  IImageCacheStatus,
  IImageProps,
  IImageSize,
  IImageSource,
  IImageSourceProp,
  IInputMode,
  IKeyboardAvoidingBehavior,
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
  INativeFeedbackBackground,
  IResizeMode,
  IRippleBackground,
  IScrollViewHandle,
  ISectionListHandle,
  ISectionListProps,
  ISeparatorProps,
  ISeparators,
  ISubmitBehavior,
  IThemeAttrBackground,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
  IViewToken,
  IVirtualizedListHandle,
  IVirtualizedListProps,
  IVirtualizedSectionListHandle,
  IVirtualizedSectionListProps,
  IVListItemContext,
  IVListSeparatorContext,
  IVSectionContext,
  IVSectionItemContext,
  ISection,
  ISwitchProps,
  ISwitchTrackColor,
  ISwitchChangeEvent,
  ITextInputHandle,
  ITextInputSelection,
  ITextInputChangeEvent,
} from './components';
export { setImageSourceResolver } from './components';
// Element directives for a hand-written intrinsic tag (`<view>`, `<text-input>`, ...); see
// `elements.ts` for why a directive rather than a schema. `imports: [SYMBIOTE_ELEMENTS]` is the
// only supported spelling — a narrower array type-checks but fails AOT's NG3004 on-device.
export {
  SYMBIOTE_ELEMENTS,
  SymbioteElement,
  ActivityIndicatorElement,
  ActivityIndicatorSpinnerElement,
  ButtonElement,
  CheckboxElement,
  HorizontalScrollContentElement,
  HorizontalScrollViewElement,
  ImageBackgroundElement,
  ImageElement,
  InputAccessoryViewElement,
  ModalElement,
  MultilineTextInputElement,
  PressableElement,
  RefreshControlElement,
  SafeAreaViewElement,
  ScrollContentElement,
  ScrollViewElement,
  StickyHeaderElement,
  SwitchElement,
  SwitchValueAccessor,
  TextElement,
  TextInputElement,
  TextInputValueAccessor,
  TouchableHighlightElement,
  TouchableNativeFeedbackElement,
  TouchableOpacityElement,
  TouchableWithoutFeedbackElement,
  ViewElement,
} from './elements';
// `CALLBACK_ATTRIBUTE_SELECTOR` is exported so a MEASUREMENT can carry the real string rather than a
// copy of it — the ladder in `core/engine/cpp/tests/js/angular-directive-cost.itest.ts` prices what
// this selector costs to match, and a second copy there would price a different one the day either
// drifts. The two host classes are exported for the same reason the array is: they are part of it.
export {
  CALLBACK_ATTRIBUTE_SELECTOR,
  SymbioteCallbackHost,
} from './callback-host';
export type {
  IElementProps,
  IStickyHeaderElementProps,
  ITextElementProps,
} from './element-props';
export { mount, unmount } from './render';
// The generic Descriptor→Angular bridge, the twin of descriptorToReact/descriptorToVue.
// Exported so a component defined OUTSIDE this package (e.g.
// @symbiote-native/slider) can render a shared @symbiote-native/components/@symbiote-native/slider Descriptor tree
// without hand-writing its own Renderer2 walker.
export { DescriptorOutlet } from './descriptor-to-angular';
export { DescriptorHost } from './descriptor-to-angular/descriptor-host';
// The portal (same-surface) and `createTunnel` (cross-surface) are the twins of React and Vue
// Both are static structural directives (`*portal`, `*tunnelIn`), as Angular has no JIT here
export { PortalDirective, PortalOutletDirective } from './create-portal';
export {
  createTunnel,
  TunnelInDirective,
  TunnelOut,
  type ITunnelStore,
} from './create-tunnel';
export { SymbioteRenderer, SymbioteRendererFactory } from './renderer';
// registerComposedComponent lives in the dependency-free leaf ./anchor-host-registry, NOT in the
// require-cyclic ./renderer — see the leaf header. The babel-register-composed plugin injects the
// import straight from that subpath so app-screen registration never routes through this cyclic
// barrel.
export { registerComposedComponent } from './anchor-host-registry';
export { findNodeHandle, hostNodeOf } from './host-instance';
export type { IHostInstance } from './host-instance';
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';
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
export {
  ColorSchemeService,
  WindowDimensionsService,
  createResourceHook,
  createEventValueHook,
  injectEvent,
  injectEventListener,
  connectWatchedSignal,
  PermissionsServiceBase,
} from './services';
export { AccessibilityInputsBase } from './accessibility-inputs';
export { NativeViewBase } from './native-view-base';
export { anchorStyleProp } from './primitives/shared';

// Framework-agnostic runtime modules from @symbiote-native/engine. Every adapter re-exports them so
// app code names only @symbiote-native/angular.
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
  matchMedia,
  MediaQueryList,
  MediaQueryListEvent,
  setVariable,
  getComputedVariable,
  registerProperty,
  AppState,
  Keyboard,
  KEYBOARD_EVENT,
  BackHandler,
  PermissionsAndroid,
  PERMISSIONS,
  RESULTS,
  AccessibilityInfo,
  LayoutAnimation,
  InteractionManager,
  PanResponder,
  PixelRatio,
  PlatformColor,
  DynamicColorIOS,
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
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
  IPixelRatioStatic,
  IColorValue,
  IOpaqueColorValue,
  IDynamicColorIOSTuple,
} from '@symbiote-native/engine';
export {
  dlog,
  isDebug,
  Platform,
  processColor,
  setColorProcessor,
  setDeviceEventSource,
  setNativeViewConfigSource,
  StyleSheet,
} from '@symbiote-native/engine';
export type {
  IRootTag,
  ISymbioteEvent,
  ISymbioteNode,
} from '@symbiote-native/engine';
// The agnostic style / platform / view-config types behind the values above. Angular takes its
// component props as @Input()s and exports no per-component prop type, but an app still needs
// these to type a style object or a Platform.select spec.
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
  INativeViewConfig,
  INativeViewConfigSource,
} from '@symbiote-native/engine';
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
  IResponderProps,
  IPressState,
  IPressableAndroidRippleConfig,
  IImageStatics,
} from '@symbiote-native/components';

// Diagnostics: per-window Angular-side counters (change-detection passes, renderer writes, list
// recomputes, cell views). The engine's readCommitProfile() prices the commit; these say how many
// times anything ran at all - the number that exposes a change-detection free-run.
export {
  readAngularProfile,
  readAngularProfileDetail,
  setAngularProfileDetail,
} from './diagnostics';
export type { IAngularProfile, IAngularProfileDetail } from './diagnostics';
