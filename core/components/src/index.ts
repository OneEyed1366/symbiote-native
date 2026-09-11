// @symbiote-native/components: the framework-agnostic component layer. Pure state machines
// (`state/`) and render functions (`view/`) that paint `Descriptor` trees; every adapter
// wires state→render with ITS lifecycle (React hooks / Vue reactivity) and maps the
// Descriptor onto its own element.

export { el, txt } from './descriptor';
export type {
  IDescriptor,
  IDescriptorType,
  IDescriptorProps,
  IDescriptorChild,
} from './descriptor';

// The shape-stability guard a fine-grained adapter's Descriptor bridge builds on. Internal to
// adapter bridges (Svelte's and Solid's), NOT part of an app's surface — so it stays out of the
// adapter barrels, unlike the passthrough names in tests/adapter-barrel-parity.test.ts.
export { createDescriptorShapeGuard } from './descriptor';
export type { IDescriptorShapeGuard } from './descriptor';

// Accessibility folding: the web-alias (aria-*/role) → canonical accessibility* transform
// and its types. Framework-agnostic, so React, Vue, and the next adapter all fold
// identically; moved here from @symbiote-native/react. RefreshControl/SafeAreaView/ScrollView consume it.
export { resolveAccessibilityProps } from './accessibility-props';
export { resolveTextProps } from './text-props';
export type { IEllipsizeMode, ITextDefaultableProps } from './text-props';
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
} from './accessibility-props';

// Intrinsic (`symbiote-*`) → Fabric view-name resolution. Shared by every adapter so the
// names CANNOT drift between them (one engine, one Fabric). The name tables are
// Metro-split (.ios/.android, filename selects, no Platform.OS read); the base
// re-exports iOS for headless. descriptorFor is the per-platform-bound resolver.
export { descriptorFor, COMPONENT_DESCRIPTORS } from './component-names';
export { buildDescriptors, makeDescriptorFor } from './component-names/shared';
export type {
  ISymbioteIntrinsic,
  IComponentDescriptor,
} from './component-names/shared';

export { renderSwitch } from './view/render-switch';
export type {
  ISwitchProps,
  ISwitchViewProps,
  ISwitchPlatform,
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from './view/render-switch';

// Gesture-responder props, the framework-agnostic base of every adapter's View props.
export type { IResponderProps } from './responder-props';

// Switch is the first STATE machine off this layer (ActivityIndicator was render-only):
// the reducer + the two pure predicates are the logic half, the adapter supplies the hook.
export {
  switchReducer,
  createInitialSwitchState,
  shouldSnapBack,
  valueFromChange,
} from './state/switch';
export type { ISwitchState, ISwitchAction } from './state/switch';

// ScrollView: pure render/command helpers (no state machine, no 3-layer split). The adapter
// owns the refs/effects/element assembly and the sticky-header component; these supply the
// platform-invariant math and plumbing every adapter shares.
export {
  resolveDecelerationRate,
  selectScrollIntrinsics,
  readLayoutDimension,
  didContentSizeChange,
  resolveScrollForwarding,
  SCROLL_VIEW_BASE_HORIZONTAL,
  SCROLL_VIEW_BASE_VERTICAL,
} from './view/render-scroll-view';
export type {
  IScrollIntrinsics,
  IContentSize,
  IScrollForwarding,
  IScrollForwardingInputs,
  IScrollForwardMode,
} from './view/render-scroll-view';

export {
  buildScrollViewHandle,
  splitLayoutProps,
  splitScrollViewStyle,
  attachStickyScroll,
  isSymbioteEvent,
  forwardScrollEvent,
} from './scroll-view-commands';
export type { IScrollViewHandle } from './scroll-view-commands';

export {
  computeStickyInterpolation,
  nextStickyHeaderY,
  stickyDebounceMs,
  readLayoutNumber,
  STICKY_HEADER_Z_INDEX,
} from './view/render-scroll-sticky';
export type {
  IStickyHeaderProps,
  IStickyInterpolationParams,
} from './view/render-scroll-sticky';

// The per-header sticky effect machine: the one pure state machine every sticky-header consumer drives
// (React/Vue header component, Angular header component, Angular projection wrapper), folding the
// zero-swallow gate + debounce-delay pick + rebuild-on-input-change decision out of each adapter's
// reactive glue. The adapter maps events to actions and executes the effects with its own primitives.
export {
  reduceSticky,
  createInitialStickyState,
  stickyEffectSignature,
} from './state/sticky-header-reducer';
export type {
  IStickyHeaderState,
  IStickyReducerInputs,
  IStickyAction,
  IStickyEffect,
  IStickyReduceResult,
} from './state/sticky-header-reducer';

export type {
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageProps,
  IImageViewProps,
} from './view/render-image';
export { renderImage } from './view/render-image';
// Image statics (getSize/prefetch/queryCache/etc) and the source-resolver registration live in
// @symbiote-native/engine (image-loader.ts / image-source-resolver.ts), the same imperative,
// native-bridge-touching shape as Alert/Share, kept out of the pure view layer. Re-exported here
// so the public `Image.*` surface is unchanged.
export type {
  IImageStatics,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/engine';
export { imageStatics, setImageSourceResolver } from '@symbiote-native/engine';

// ImageBackground: render-only composition (absolute-fill image behind, children on top).
// No render fn: the only composition this primitive had is the two nodes the behavior builds, so
// `view/render-image-background.ts` went with the wrappers — same as ActivityIndicator's.

// InputAccessoryView: render-only host assembly (nativeID/backgroundColor).
export { renderInputAccessoryView } from './view/render-input-accessory-view';
export type { IInputAccessoryViewViewProps } from './view/render-input-accessory-view';

// Modal: full 3-layer split (state machine gates the iOS keep-alive frame).
export { renderModal } from './view/render-modal';
export type {
  IModalViewProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from './view/render-modal';
export {
  modalReducer,
  createInitialModalState,
  shouldRenderModal,
} from './state/modal';
export type { IModalState, IModalAction } from './state/modal';

// KeyboardAvoidingView: pure inset/behavior math; the adapter owns the Keyboard subscription.
export {
  computeInset,
  keyboardAvoidingEventNamesFor,
  readPrefersCrossFadeTransitions,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
  DEFAULT_VERTICAL_OFFSET,
} from './view/render-keyboard-avoiding-view';
export type {
  IComputeInsetOptions,
  IKeyboardAvoidingBehavior,
  IKeyboardAvoidingEventNames,
  IMeasuredFrame,
  IKeyboardFrame,
  IKeyboardAvoidingLayout,
  IResolveKeyboardAvoidingLayoutParams,
} from './view/render-keyboard-avoiding-view';

// Pressable: the press state machine (logic) + render decisions. The pure lifecycle (timers,
// geometry, drift test, suppression flags) lives in state/pressable; the responder-listener +
// accessibilityState + ripple render decisions in view/render-pressable. Every adapter supplies
// only its reactive `pressed` cell + the View's measure handle (see the 3-layer split).
export {
  createPressHandlers,
  createPressRuntime,
  disposePressRuntime,
  normalizeRect,
  maxEdge,
  isTouchWithinRegion,
  readPoint,
  computeRegion,
  rippleProps,
  DEFAULT_DELAY_LONG_PRESS_MS,
  DEFAULT_MIN_PRESS_DURATION_MS,
  DEFAULT_PRESS_RECT_OFFSETS,
} from './state/pressable';
export type {
  IPressState,
  IPressHandler,
  IPressHandlers,
  IPressHost,
  IPressRuntime,
  IPressMachineConfig,
  IFrameCallback,
  IRectOffset,
  IEdgeInsets,
  IResponderRegion,
  IPressableAndroidRippleConfig,
  IRippleBackground as IPressableRippleBackground,
} from './state/pressable';
export {
  buildPressableListeners,
  resolveDisabledAccessibilityState,
  noteHoverNoop,
  shouldSuppressPress,
  shouldClaimResponder,
  isTerminationAllowed,
  resolvePressableFocusable,
  resolveTouchableFocusable,
} from './view/render-pressable';

// Touchable*: shared press-timing constants + the deactivation-floor math (the Animated feedback
// itself stays per-adapter), and TouchableNativeFeedback's pure static factories + background map.
export {
  computePressOutWait,
  createTouchableFeedbackRuntime,
  createTouchableFeedbackHandlers,
  DEFAULT_ACTIVE_OPACITY,
  OPACITY_ACTIVE_GRANT_DURATION_MS,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_UNDERLAY_COLOR,
  TOUCHABLE_MIN_PRESS_DURATION_MS,
  restingOpacityFromStyle,
  hasTouchablePressHandler,
  createHighlightUnderlayRuntime,
  createHighlightUnderlayHandlers,
} from './state/touchable';
export type {
  IPressTimingProps,
  ITouchableHandler,
  ITouchableFeedbackRuntime,
  ITouchableFeedbackConfig,
  ITouchableFeedbackCallbacks,
  ITouchableFeedbackHandlers,
  ITouchablePressHandlerProps,
  IHighlightUnderlayRuntime,
  IHighlightUnderlayConfig,
  IHighlightUnderlayCallbacks,
  IHighlightUnderlayHandlers,
} from './state/touchable';
export { resolveHighlightExtraStyles } from './view/render-touchable-highlight';
export type {
  ITouchableHighlightExtraStyles,
  ITouchableHighlightUnderlayView,
} from './view/render-touchable-highlight';
export {
  backgroundProps,
  canUseNativeForeground,
  selectableBackground,
  selectableBackgroundBorderless,
  rippleBackground,
  // RN's own static namespace, the only part of the deleted wrappers with nowhere else to go: the
  // element is a tag now, and a tag is a string that cannot carry `.Ripple`.
  TouchableNativeFeedback,
} from './view/render-touchable-native-feedback';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './view/render-touchable-native-feedback';

// Button: the role constant plus every platform fold RN's Button.js performs (the adapter composes
// its own touchable + view + text around them). The VIEW style is the half that was missing until
// 2026-09-09 and it is the whole Android look.
export {
  BUTTON_ACCESSIBILITY_ROLE,
  buttonTextStyle,
  buttonViewStyle,
  resolveButtonDisabled,
  resolveButtonImportantForAccessibility,
  resolveButtonTextStyle,
  resolveButtonTitle,
  resolveButtonViewStyle,
} from './view/render-button';
export type { IButtonProps } from './view/render-button';

// TextInput: the controlled-value / event-count handshake. The logic half is the pure
// folds/maps + the controlled-write predicate (not a single reducer: count must re-render the
// imperative handle, lastNativeText must not); the view half picks the intrinsic and maps the
// resolved native props. Both shared verbatim across React and Vue; the adapter owns only the
// hooks/reactivity + the imperative handle.
export {
  resolveTextInputProps,
  foldText,
  foldAutoComplete,
  foldSubmitBehavior,
  mapAutoComplete,
  textFromChange,
  eventCountFromChange,
  shouldCommandText,
  INITIAL_EVENT_COUNT,
  SELECTION_NONE,
} from './state/text-input';
export type {
  ITextInputProps,
  ITextInputHandle,
  ITextInputSelection,
  ITextInputEventHandler,
  ITextInputFoldInput,
  IFoldedTextInputProps,
  IInputMode,
  IEnterKeyHint,
  ISubmitBehavior,
  ITextInputChangeEvent,
} from './state/text-input';
export { keyboardTypeForInputMode } from './state/text-input';
export { renderTextInput } from './view/render-text-input';
export type { ITextInputViewProps } from './view/render-text-input';

// VirtualizedList family: the framework-agnostic windowing engine + data shapes. Lists
// have NO view/render-*.ts (the cell content is the framework's own children, so there is
// no Descriptor render fn) — the shared layer for lists is this STATE/logic, reused
// verbatim by React and Vue.
export {
  DEFAULT_WINDOW_SIZE,
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_END_REACHED_THRESHOLD,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD,
  DEFAULT_START_REACHED_THRESHOLD,
  FIRST_INDEX,
  EMPTY_OFFSET,
  NO_INDEX,
  NO_CONTENT_LENGTH_SENT,
  INVERTED_Y_STYLE,
  INVERTED_X_STYLE,
  readScrollOffset,
  readLayoutLength,
  readLayoutOffset,
  buildOffsets,
  computeWindow,
  throttleWindow,
  visiblePercent,
  isCellViewable,
  offsetForIndex,
  averageMeasuredLength,
  averageMeasuredStride,
  highestMeasuredIndex,
  computeEndReached,
  computeStartReached,
  buildViewabilityPairs,
  computeViewableSet,
  diffViewable,
  maxMinimumViewTime,
  buildListPlan,
  computeMvcpAdjustment,
  resolveItemKey,
  indexOfItem,
  offsetForEnd,
  isSeparatorGapInRange,
  decideEdgeReached,
  resolveStickySectionHeaders,
  wrapFixedLayout,
  resolveAverageLength,
} from './state/virtualized-list';
export type {
  IMvcpAction,
  IMvcpAdjustmentParams,
  IMvcpAdjustmentResult,
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
  IViewableSetParams,
  IListCellPlan,
  IListPlan,
  IListPlanParams,
} from './state/virtualized-list';

// The orchestration reducer: the one pure state machine every list adapter drives, folding the
// after-commit effect skeleton (window recompute -> edge -> viewability -> initial-scroll -> MVCP)
// out of each adapter's reactive glue. The adapter maps events to actions and runs the effects.
export {
  reduceList,
  createInitialListState,
  listEffectSignature,
} from './state/virtualized-list-reducer';
export type {
  IListState,
  IListMetrics,
  IListReducerInputs,
  IListAction,
  IListEffect,
  IListReduceResult,
} from './state/virtualized-list-reducer';

export { subscribeListDiagnostics } from './state/virtualized-list-diagnostics';
export type {
  IListDiagnosticFrame,
  IListDiagnosticMove,
} from './state/virtualized-list-diagnostics';

export {
  SINGLE_COLUMN,
  chunkIntoRows,
  rowKeyExtractor,
  expandRowToken,
  expandRowViewability,
  lastItemOfRow,
  firstItemOfRow,
} from './state/flat-list';
export type { IRow } from './state/flat-list';

export {
  flattenSections,
  unwrapEntryItem,
  sectionEntryKey,
  scrollLocationToFlatIndex,
} from './state/section-list';
export type {
  ISection,
  ISectionEntry,
  IVirtualizedSectionListHandle,
} from './state/section-list';
export {
  registerPressableBehavior,
  PRESSABLE_TAG,
} from './behaviors/pressable';
export {
  registerTouchableOpacityBehavior,
  TOUCHABLE_OPACITY_TAG,
} from './behaviors/touchable-opacity';
export {
  registerTouchableHighlightBehavior,
  TOUCHABLE_HIGHLIGHT_TAG,
} from './behaviors/touchable-highlight';
export { registerButtonBehavior, BUTTON_TAG } from './behaviors/button';

// Registered by ALL FIVE adapters since 2026-09-09, in the same commit that deleted the five
// wrappers — which is what makes it safe. While those wrappers still rendered a `Pressable` around
// a feedback `View`, registering would have put a second responder on every existing
// TouchableNativeFeedback. The ActivityIndicator and ScrollView blocks below are still in the
// withheld state this one just left.
export {
  registerTouchableNativeFeedbackBehavior,
  TOUCHABLE_NATIVE_FEEDBACK_TAG,
} from './behaviors/touchable-native-feedback';

// The second tag that commits no node, and registered by all five adapters in the same commit that
// deleted their five wrappers — while those wrappers still rendered a `Pressable` around the app's
// children, registering would have put a second responder on every TouchableWithoutFeedback.
export {
  registerTouchableWithoutFeedbackBehavior,
  TOUCHABLE_WITHOUT_FEEDBACK_TAG,
} from './behaviors/touchable-without-feedback';

// Registered by all five adapters since 2026-09-09, in the same commit that deleted the five
// wrappers — the tag builds its own spinner, so a surviving wrapper would have painted a second one.
// The prop type rides along: there is no `view/render-activity-indicator.ts` any more, because the
// only render this primitive had was the two nodes the behavior now builds.
export {
  ACTIVITY_INDICATOR_SPINNER_TAG,
  ACTIVITY_INDICATOR_TAG,
  registerActivityIndicatorBehavior,
} from './behaviors/activity-indicator';
export type {
  IActivityIndicatorProps,
  IActivityIndicatorSize,
} from './behaviors/activity-indicator';
export {
  foldImagePayload,
  IMAGE_TAG,
  registerImageBehavior,
} from './behaviors/image';

// Registered by all five adapters since 2026-09-09, in the same commit that deleted the five
// wrappers — the tag builds the background image itself, so a surviving wrapper would have
// committed a second one under it.
export {
  IMAGE_BACKGROUND_TAG,
  registerImageBackgroundBehavior,
} from './behaviors/image-background';

export {
  foldInputAccessoryViewPayload,
  INPUT_ACCESSORY_VIEW_TAG,
  registerInputAccessoryViewBehavior,
} from './behaviors/input-accessory-view';

export {
  registerTextInputBehavior,
  buildTextInputHandle,
  TEXT_INPUT_TAG,
  TEXT_INPUT_MULTILINE_TAG,
} from './behaviors/text-input';

export { registerSwitchBehavior, SWITCH_TAG } from './behaviors/switch';

export {
  registerRefreshControlBehavior,
  REFRESH_CONTROL_TAG,
} from './behaviors/refresh-control';

// Exported as a FUNCTION, not as a side-effect module, which is what keeps it safe on a barrel:
// Metro's inlineRequires only defers a re-export until its binding is named as a VALUE, and a
// caller of `registerScrollViewBehavior()` names it. The shape CLAUDE.md forbids is a module whose
// evaluation alone registers.
//
// EVERY ADAPTER CALLS IT since 2026-09-11, through `@symbiote-native/components/register`. It was
// withheld while the wrappers built their own content node — registering then would have
// double-nested every ScrollView. They are gone; the engine is the single owner.
export {
  HORIZONTAL_SCROLL_VIEW_TAG,
  registerScrollViewBehavior,
  SCROLL_VIEW_TAG,
} from './behaviors/scroll-view';
