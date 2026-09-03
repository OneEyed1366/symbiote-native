// @symbiote-native/solid: a Solid adapter over @symbiote-native/engine, built on Solid's own
// universal custom-renderer API (solid-js/universal). Compiled Solid JSX drives real native
// iOS/Android views; underneath, every call routes into the same mutation API every other adapter
// uses. All Fabric clone-on-write lives in the engine, shared cross-adapter. App code imports
// @symbiote-native/solid, never react-native.
//
// Layer status (symbiote-new-adapter §7): L4 in progress. The primitives, the stateful touch
// components, the Touchable family, Button / ImageBackground / InputAccessoryView, StatusBar and
// the list family are done at full parity with the React reference, and the engine-owned runtime
// modules are re-exported below. Content relocation is in too: `Portal` (same-surface, React's
// createPortal twin) and `createTunnel` (cross-surface), both written over the universal renderer
// — solid-js/web's DOM-bound Portal was never the route to either. This barrel grows a layer at a
// time on purpose, so a break localizes to the layer that introduced it.
//
// The two lifecycle primitives are spelled `createColorScheme` / `createWindowDimensions`, not
// `use*`: in Solid `use*` means consuming something that already exists (useContext,
// useTransition) while a function that creates its own state and owns a subscription is `createX`.
// Angular spells the same pair as services for the same idiom reason — this is a naming
// divergence <adapter_src_follows_framework_idioms> asks for, not a parity gap.

// No JSX augmentation is imported here. The host tags live in this package's own JSX namespace at
// ./jsx-runtime, which an app reaches by config rather than by import:
// `"jsxImportSource": "@symbiote-native/solid"` (see that file). The earlier
// `declare module 'solid-js'` shim is gone with it — one mechanism, not two.

// Bare, side-effect only, and deliberately NOT `export * from './register'` — see that file.
import './register';

export { mount, unmount } from './render';
export { findNodeHandle } from './host-instance';
export type { IHostInstance } from './host-instance';

export * from './components';

// Agnostic detail types the components above take but do not own: declared once in
// @symbiote-native/components and re-exported verbatim by every adapter, never redeclared
// (<prop_types_split_agnostic_vs_per_adapter>).
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
  IResponderProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
} from '@symbiote-native/components';
// The app-entry seam that hands Image RN's own source resolver; grouped with the Image types it
// serves rather than with the engine seams below, matching React's and Svelte's barrels.
export { setImageSourceResolver } from '@symbiote-native/components';

// descriptorToSolid: the @symbiote-native/components Descriptor → engine-node bridge. Exported for
// the same reason React exports descriptorToReact — an external wrapper package over a third-party
// native view maps its shared render fn's Descriptor through the SAME bridge the adapter uses.
export { descriptorToSolid } from './descriptor-to-solid';

// Safe in the barrel (unlike ./bootstrap, which imports react-native): the registry seam itself
// only reaches the engine and solid-js.
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

// Animated: the six animated components RN exposes, over the engine's framework-agnostic value
// graph. Solid's JSX takes the dotted form directly — `<Animated.View/>` compiles to
// createComponent(Animated.View, …) — so no local alias is needed, unlike Angular, whose AOT
// compiler cannot trace a class through property access (.claude/rules/dotted-component-tags.md).
export { StatusBar } from './modules/status-bar';
export type { IStatusBarProps, IStatusBarStyle } from './modules/status-bar';

// Portal: same-surface content relocation, the twin of React's createPortal and Angular's
// PortalDirective/PortalOutletDirective. `mount` takes an already-mounted host node in THIS
// surface (a ref off a rendered component) or the surface itself; reaching a second, separately
// mounted surface is a different mechanism by design — see ./create-portal's header.
export { Portal } from './create-portal';
export type { IPortalProps, IPortalTarget } from './create-portal';
// createTunnel: cross-surface content sharing, the case Portal deliberately does not cover. A
// shared store, never a reach into a foreign surface's tree — `Out` paints from whichever surface
// renders it. Same name and same In/Out shape as the React, Vue, Svelte and Angular versions.
export { createTunnel } from './create-tunnel';
export type { ITunnel, ITunnelInProps } from './create-tunnel';

// Reactive wrappers over the engine's own Appearance / Dimensions event sources. The engine keeps
// the subscription logic; these add only the Solid lifecycle (signal + onCleanup).
export { createColorScheme } from './primitives/create-color-scheme';
export { createWindowDimensions } from './primitives/create-window-dimensions';

export { Animated, createAnimatedComponent } from './modules/animated';
export type { IAnimatedComponentProps } from './modules/animated';

// Everything below is re-exported VERBATIM from the shared packages — no Solid half exists or is
// wanted, so a passthrough stub file would only add a hop (.claude/rules/barrel-passthrough.md).
// The app names @symbiote-native/solid and gets RN's single import root.

// Pure utilities and the color surface: no native event, no lifecycle, so they live in the engine
// per <runtime_modules_layering>.
export {
  Platform,
  StyleSheet,
  PixelRatio,
  PlatformColor,
  DynamicColorIOS,
  processColor,
} from '@symbiote-native/engine';
// The three app-entry seams, wired once on a real host. setNativeViewConfigSource is how a
// third-party Fabric view auto-derives its metadata:
//   setNativeViewConfigSource(name => ReactNativeViewConfigRegistry.get(name))
export {
  setNativeViewConfigSource,
  setColorProcessor,
  setDeviceEventSource,
} from '@symbiote-native/engine';
// Diagnostics gated by DEBUG (<keep_logs_gate_behind_DEBUG>): app code logs through the same seam
// the engine does, never a bare console.log.
export { dlog, isDebug } from '@symbiote-native/engine';
export type {
  IViewStyle,
  ITextStyle,
  IFlexAlign,
  IFlexJustify,
  ISymbioteEvent,
  ISymbioteNode,
  IRootTag,
  INativeViewConfig,
  INativeViewConfigSource,
  IColorValue,
  IOpaqueColorValue,
  IDynamicColorIOSTuple,
  IPixelRatioStatic,
  IPlatformStatic,
  IPlatformOSType,
  IPlatformConstantsIOS,
  IPlatformConstantsAndroid,
  IPlatformSelectSpec,
} from '@symbiote-native/engine';

// Imperative runtime modules: thin JS over getNativeModule + device events, no Fabric component
// of their own, so there is nothing per-framework to write.
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

// PanResponder: the gesture recognizer over the engine's responder events, shared by every adapter.
export { PanResponder } from '@symbiote-native/engine';
export type {
  IPanResponderGestureState,
  IPanResponderCallbacks,
  IGestureResponderHandlers,
  IPanResponderInstance,
} from '@symbiote-native/engine';

// AccessibilityInfo comes STRAIGHT from the engine, which owns the iOS/Android split
// (core/engine/src/accessibility-info/). React routes it through an adapter folder of the same
// name, but that folder is a pure passthrough of these exact names — matching it means matching
// the engine module, not growing a second one here.
export { AccessibilityInfo } from '@symbiote-native/engine';
export type {
  IAccessibilityChangeEvent,
  IAccessibilityChangeEventName,
  IAccessibilityChangeEventHandler,
  IAccessibilityAnnouncementFinishedEvent,
  IAnnounceForAccessibilityOptions,
  IAccessibilityEventType,
} from '@symbiote-native/engine';

// Solid's control flow is pure reactivity with no DOM dependency, so it works verbatim over the
// universal renderer and is re-exported here to keep an app on one import. solid-js/web's own
// `Portal` is NOT among them and cannot be — it allocates its container with
// `document.createElement` — but the CAPABILITY is not missing: this package ships its own
// `Portal` over the universal renderer (./create-portal, exported above), at the same
// same-surface scope React and Angular chose for theirs. `Dynamic` is the one member of that DOM-bound pair still absent.
// It is absent on its own terms, not as fallout from Portal: nothing here needed it (a tunnel
// renders stored content by calling a thunk inside <For>, no dynamic component involved), and no
// other adapter ships a twin of it for parity to require one.
//
// Solid's own control-flow `Switch`/`Match` pair is ABSENT for a different reason: `Switch` collides
// head-on with RN's Switch component, which every other adapter exports under exactly that name and
// which P0 parity (<adapters_reach_full_feature_parity>) pins here too. The RN component wins the
// name; the control-flow pair keeps its canonical home, `import { Switch, Match } from 'solid-js'`
// (alias it there if both are needed in one file). `Match` is withheld ALONGSIDE it deliberately —
// re-exporting a lone `Match` while `Switch` means something else would compile fine and then fail
// at runtime, which is worse than a missing export.
export {
  For,
  Index,
  Show,
  ErrorBoundary,
  Suspense,
  SuspenseList,
} from 'solid-js';
