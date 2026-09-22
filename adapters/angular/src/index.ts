// @symbiote-native/angular: a thin Angular reconciler over @symbiote-native/engine. A custom Renderer2 +
// RendererFactory2 map each node op onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote-native/angular.
//
// SEAM SCAFFOLD: mount/unmount + the renderer seam + host intrinsic selectors. Full RN-like
// composed components still flow through the shared @symbiote-native/components bridge.
//
// `View` AND `Text` ARE NO LONGER WORTH IMPORTING, and on 2026-09-18 the examples stopped. They are
// `@Component`s on the `view` and `text` SELECTORS — a second mechanism on the same tags
// `SYMBIOTE_ELEMENTS` covers, kept for one stated reason their own header gives: "Declaring `style`
// as a real Angular input prevents Angular's CSS style engine from decomposing RN `StyleProp`
// arrays". A tag takes an array or press-state callback as `[styleProp]`, a plain property binding
// with no instance behind it.
//
// An app loses nothing it cannot spell better: `@ViewChild('ref')` on a template reference returns
// Angular's own `ElementRef<IHostInstance>`, whose `nativeElement` IS the engine host node — the same
// property the component exposed, reached without a component instance per element.
//
// They stay EXPORTED because the composed components render them and ngtsc resolves a component's
// template dependencies to importable names (NG3004, the same rule that put the element directives
// back below). Retiring them means retiring them from those nine components first.

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
// Also exposed as named top-level symbols (not just Animated.View/.Text/...): ngtsc's partial-mode
// static evaluator can't trace a component class through property access on an external
// namespace object, only through a direct named import binding —
// so `<AnimatedView>` in a template requires `import { AnimatedView } from '@symbiote-native/angular'`,
// not `const AnimatedView = Animated.View`. Plain tsc/vitest don't catch this; only a real ngc run does.
export {
  AnimatedFlatList,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedSectionList,
  AnimatedText,
  AnimatedView,
} from './modules/animated';
// Exported even though Angular's version maps only the four primitives (View/Text/Image/
// ScrollView) onto the pre-authored wrappers above and THROWS on anything else — there is no JIT
// under AOT/Metro, so it cannot synthesize a wrapper at runtime the way the other four adapters
// do. It ships anyway because portable code (`createAnimatedComponent(View)`) then compiles and
// runs identically on all five adapters, and the one case Angular cannot serve fails with a
// message naming the fix (author a standalone @Component over AnimatedComponentBase) instead of
// failing as a missing export, which names nothing. Found by the barrel audit in
// `.claude/rules/adapter-parity-audit.md`: it was implemented and tested here all along and simply
// never reached this file, so `@symbiote-native/angular` consumers could not reach it at all.
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
// The element directives that make a HAND-WRITTEN intrinsic tag (`<view>`, `<text-input>`, ...)
// compile under ngtsc with no schema, and with a real type on every declared prop. See `elements.ts`
// for why a directive rather than `CUSTOM_ELEMENTS_SCHEMA`/`NO_ERRORS_SCHEMA`.
//
// `imports: [SYMBIOTE_ELEMENTS]` IS THE ONLY SUPPORTED SPELLING — and the individual classes are
// exported anyway, because ngtsc requires it and a build proves it.
//
// They were removed on 2026-09-18 and put back the same hour. The reason to remove them is real: a
// withheld tag directive (`./runtime-matching`) is a compile-time declaration and nothing else, so
// what makes `<view [onPress]="fn">` work at all is `SymbioteCallbackHost` claiming the name before
// `setDomProperty` throws NG0306. It rides this array, so a narrow `imports: [ViewElement]`
// type-checks and then fails on a device the first time the app binds an `on*` prop.
//
// WHAT PUTS THEM BACK is NG3004: `Unable to import directive ViewElement — the symbol is not
// exported from index.d.ts`. ngtsc resolves every directive reachable through an imported array to an
// IMPORTABLE NAME in the package's public types, so a class inside `SYMBIOTE_ELEMENTS` that the
// barrel does not name breaks AOT for every screen that uses the array. The removal passed its own
// vitest guard and every headless suite, and failed on the first real `ngc` run — the same
// wrong-harness green this repo keeps finding.
//
// So the narrow spelling is DISCOURAGED and not prevented, and `elements-are-exported-for-aot.test.ts`
// now asserts the opposite invariant: every member of the array is named here.
export {
  SYMBIOTE_ELEMENTS,
  SymbioteElement,
  ActivityIndicatorElement,
  ActivityIndicatorSpinnerElement,
  ButtonElement,
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
// createPortal (same-surface only — see the file header) and createTunnel (cross-surface,
// see its file header) are the Angular twins of the React/Vue portal/tunnel primitives.
// Angular can't synthesize components at runtime (no JIT under Metro/Hermes), so both are
// static, pre-authored structural directives (`*portal`/`*tunnelIn`, the `*ngIf`/`*ngFor`
// idiom) parameterized by an `@Input()`, rather than a factory returning fresh components per
// call.
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
export { findNodeHandle } from './host-instance';
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
export { ColorSchemeService, WindowDimensionsService } from './services';

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
