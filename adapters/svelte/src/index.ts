// @symbiote-native/svelte: drives @symbiote-native/engine through Svelte's OFFICIAL
// custom-renderer API (`svelte/renderer`, sveltejs/svelte#18042 — svelte-adapter-custom-renderer
// skill), which replaced this adapter's original DOM-shim strategy. Every node operation the
// compiler emits dispatches straight to `renderer.ts`'s Renderer object, which drives the same
// mutation API every other adapter drives. All Fabric clone-on-write lives in the engine, shared
// cross-adapter. App code names only @symbiote-native/svelte.
//
// Full component parity with React/Vue/Angular: every `core/components` render function has a
// fixed tree shape, so each component below is hand-authored Svelte markup mirroring its
// render-*.ts, reusing only the pure state/render logic — see the skill for what's verified and
// what's still open.

export { mount, unmount } from './render';
export { AppRegistry, setHostRegistrar } from './modules/app-registry';
export type {
  IComponentProvider,
  IWrapperComponentProvider,
  IAppParameters,
  IRunnable,
  IHostRegistrar,
  IRegistry,
  IHeadlessTask,
  ITaskProvider,
  ITaskCanceller,
  ITaskCancelProvider,
} from './modules/app-registry';

export {
  View,
  Text,
  ActivityIndicator,
  Image,
  ImageBackground,
  InputAccessoryView,
  KeyboardAvoidingView,
  Switch,
  TextInput,
  Modal,
  SafeAreaView,
  RefreshControl,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TouchableNativeFeedback,
  Button,
  ScrollView,
  ScrollViewStickyHeader,
  VirtualizedList,
  FlatList,
  VirtualizedSectionList,
  SectionList,
} from './components';
export type {
  IViewProps,
  ITextProps,
  IActivityIndicatorProps,
  IImageProps,
  IImageStatics,
  IImageBackgroundProps,
  IInputAccessoryViewProps,
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
  ISwitchProps,
  ITextInputProps,
  ITextInputHandle,
  IModalProps,
  ISafeAreaViewProps,
  IRefreshControlProps,
  IPressableProps,
  ITouchableOpacityProps,
  ITouchableHighlightProps,
  ITouchableWithoutFeedbackProps,
  ITouchableNativeFeedbackProps,
  IButtonProps,
  IScrollViewProps,
  IScrollViewHandle,
  IStickyHeaderComponentProps,
  IVirtualizedListProps,
  IVirtualizedListHandle,
  IFlatListProps,
  IFlatListHandle,
  IVirtualizedSectionListProps,
  ISectionListProps,
  ISection,
} from './components';

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

// Component-scoped agnostic types that live in @symbiote-native/components but weren't yet
// threaded through this barrel (parity fix, see React's index.ts lines 55-58, 89, 245-250).
export { setImageSourceResolver } from '@symbiote-native/components';
export type {
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IPressState,
  ISwitchTrackColor,
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
  IVirtualizedSectionListHandle,
  IVirtualizedSectionListHandle as ISectionListHandle,
  ICellLayout,
  ISeparatorProps,
  ISeparators,
  IModalOrientationChangeEvent,
  IPressableAndroidRippleConfig,
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
  ITextInputSelection,
} from '@symbiote-native/components';

// Pure, framework-agnostic runtime modules — same re-export every other adapter does per
// CLAUDE.md's <runtime_modules_layering>. PanResponder was missing here (present on
// React/Vue's own barrels) until 2026-08-12 — a pure engine re-export, no framework glue, so
// adding it is a one-line parity fix, not new adapter work.
export {
  Platform,
  StyleSheet,
  PlatformColor,
  DynamicColorIOS,
  processColor,
  setNativeViewConfigSource,
  setColorProcessor,
  setDeviceEventSource,
  PixelRatio,
  PanResponder,
  dlog,
  isDebug,
} from '@symbiote-native/engine';
export type {
  INativeViewConfig,
  INativeViewConfigSource,
  IPixelRatioStatic,
  ISymbioteEvent,
  ISymbioteNode,
  IRootTag,
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
  IViewStyle,
  ITextStyle,
  IFlexAlign,
  IFlexJustify,
  IPlatformStatic,
  IPlatformOSType,
  IPlatformConstantsIOS,
  IPlatformConstantsAndroid,
  IPlatformSelectSpec,
  IColorValue,
  IOpaqueColorValue,
  IDynamicColorIOSTuple,
} from '@symbiote-native/engine';

// Imperative runtime modules: the SAME module every adapter shares, re-exported straight from
// @symbiote-native/engine so app code names only @symbiote-native/svelte (RN's single import
// root). Nothing here has a visual or a lifecycle, so there is no Svelte half to write.
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
  InteractionManager,
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
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
} from '@symbiote-native/engine';

// StatusBar is the one imperative-looking module with a real declarative half: it renders
// nothing but applies its props via an `$effect` (modules/status-bar/index.svelte).
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';
export { AccessibilityInfo } from './modules/accessibility-info';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from './modules/accessibility-info';

// findNodeHandle: RN's ref -> native reactTag lookup, the Svelte twin of the React/Vue
// adapters' own (host-instance.ts / host-instance/index.ts). hostInstance: the typed
// measure/setNativeProps/focus/blur accessor off a `{@attach}` host ref (see host-instance.ts's
// header — React/Vue get this for free off a plain ref value; Svelte's own attach machinery
// hands back the real engine node directly since the custom-renderer rewrite, so this is now a
// thin typed passthrough rather than a shim-to-engine-node translation).
export { findNodeHandle, hostInstance } from './host-instance';
export type { IHostInstance } from './host-instance';

// The generic Descriptor -> shim-tree bridge (svelte-adapter-dom-shim skill §19) — the Svelte
// twin of Vue's `descriptorToVue` / React's `descriptorToReact`, which a downstream package
// wrapping a THIRD-PARTY native view (@symbiote-native/slider, packages/slider/src/svelte) needs
// to mount a Descriptor whose `type` is a raw, non-`symbiote-`-prefixed Fabric name (e.g.
// 'RNCSlider'). Deliberately NOT re-exported from THIS barrel: `./index.ts` also re-exports
// `./components`, real `.svelte` sources, so importing even one unrelated name from here forces
// the whole `.svelte` module graph to load — fatal under vitest's plain (svelte-plugin-free)
// transform. Import `@symbiote-native/svelte/native-view-bridge` instead — see that file's
// header for the full reasoning and native-view-bridge.ts for what else it carries
// (mount/unmount, for a downstream package's own tests).

// createTunnel: the Svelte twin of adapters/vue/src/create-tunnel (see create-tunnel/tunnel.ts's
// header for why the API shape — an explicit `tunnel` prop on TunnelIn/TunnelOut, rather than
// `tunnel.In`/`tunnel.Out` — deliberately differs from React/Vue). NOTE: React's createPortal has
// no Svelte (or even Vue) twin — it is react-reconciler's own Fiber-level HostPortal primitive,
// with no equivalent in a framework with no reconciler; createTunnel is the achievable analog,
// same scope Vue itself settled on.
export { createTunnel, TunnelIn, TunnelOut, type ITunnel } from './create-tunnel';

// useWindowDimensions / useColorScheme: the Svelte twins of React's hooks / Vue's composables —
// see runes/use-window-dimensions.svelte.ts's header for why this adapter's lifecycle-helper
// bucket is named `runes/`, not `hooks/`/`composables/`.
export { useWindowDimensions } from './runes/use-window-dimensions.svelte';
export { useColorScheme } from './runes/use-color-scheme.svelte';

// The React Native twins of `svelte/reactivity/window`, which is browser-only and would read
// `undefined` forever here. Same names, same `.current` shape, engine Dimensions/PixelRatio
// underneath — see runes/window.ts's header for the two deliberate differences from upstream, and
// for why `scrollX`/`scrollY`/`screenLeft`/`screenTop` are absent rather than faked.
export { innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio } from './runes/window';
// What replaces `MediaQuery` from `svelte/reactivity`: named exports for the media features RN can
// actually answer, instead of a class taking a CSS query string it would mostly have to answer
// `false` to. `(prefers-color-scheme)`'s twin is `useColorScheme()` above. See
// runes/media-query.ts's header for the argument.
export { orientation, createWidthQuery } from './runes/media-query';
export type { IOrientation, IWidthQueryBounds } from './runes/media-query';
export type { IReactiveValue } from './runes/dimensions-value';

// The `class` prop's Svelte-flavoured union — a clsx map / array on top of the engine's
// IClassNameValue — plus the normalizer, for a consumer building a class value in its own
// helper. See class-value.ts's header for the object-is-a-style vs object-is-a-clsx-map rule.
export {
  normalizeSvelteClass,
  resolveSvelteClass,
  type ISvelteClassValue,
  type IClassMap,
  type IClassEntry,
} from './class-value';

// Animated: the Svelte twin of adapters/vue/src/modules/animated (see modules/animated/index.ts's
// header for why Animated.View/Text/Image/ScrollView are each their own hand-authored .svelte
// file rather than a generic createAnimatedComponent() wrap — Svelte has no runtime h()/
// createElement equivalent a factory could target).
export { Animated } from './modules/animated';
