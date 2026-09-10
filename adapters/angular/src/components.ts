// Angular component surface over Symbiote intrinsics. Public tags (`View`, `Text`) are
// ergonomic aliases of the primitive hosts in `../primitives`; engine intrinsics (`symbiote-*`)
// are the actual Angular primitive host components. Every primitive host declares `style` as a
// real Angular input so RN `StyleProp` arrays/objects are flattened and forwarded through the
// custom renderer, instead of being misinterpreted by Angular's CSS style engine.

// `ActivityIndicator` is a TAG — `<activity-indicator>`, matched by `ActivityIndicatorElement` — and there is nothing to import in its
// place. RN's ActivityIndicator has no statics, so the name exports nothing at all now; the prop
// type stays, for a component forwarding a bag.
export type { IActivityIndicatorProps } from './components/activity-indicator-props';
// `Image` is a TAG — `<image>`, matched by `ImageElement` — and the name now exports RN's Image
// STATICS namespace (`Image.getSize` / `.prefetch` / `.queryCache`), which is what an app still
// calls it for. `Animated.Image` keeps the component spelling; it is not a primitive.
export { Image } from './modules/image';
export type { IImageStatics } from './modules/image';
export { setImageSourceResolver } from '@symbiote-native/components';
// `InputAccessoryView` is a TAG — `<input-accessory-view>`, matched by
// `InputAccessoryViewElement` — and there is nothing to import in its place. RN gives it no
// statics, so the name exports nothing at all now; an app's `imports: [InputAccessoryView]` becomes
// `imports: [InputAccessoryViewElement]`. Only the prop type stays.
export type { IAngularInputAccessoryViewProps } from './components/input-accessory-view-props';
export { Modal } from './components/modal';
export type {
  IAngularModalProps,
  IModalAnimationType,
  IModalOrientation,
  IModalOrientationChangeEvent,
  IModalPresentationStyle,
} from './components/modal';
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from '@symbiote-native/components';
// `Pressable` is a TAG — `<pressable>`, matched by `PressableElement` — and there is nothing to
// import in its place. RN gives it no statics, so the name exports nothing at all now; the press
// machine is an engine behavior on the node (`registerPressableBehavior`). An app's
// `imports: [Pressable]` becomes `imports: [PressableElement]`. Only the prop types stay.
export type {
  IAngularPressableProps,
  IAngularPressableInputs,
} from './components/pressable-props';
// `SafeAreaView` is a TAG — `<safe-area-view>`, matched by `SafeAreaViewElement` — and there is
// nothing to import in its place. RN gives it no statics, so the name exports nothing at all now;
// an app's `imports: [SafeAreaView]` becomes `imports: [SafeAreaViewElement]`. Only the prop type
// stays.
export type { IAngularSafeAreaViewProps } from './components/safe-area-view-props';
// `Switch` is a TAG — `<switch>`, matched by `SwitchElement` — and there is nothing to import in
// its place. RN gives it no statics, so the name exports nothing at all now; `[(value)]` is handled
// by the renderer and `[(ngModel)]` by `SwitchValueAccessor` (`../elements`), which is where the
// wrapper's `NG_VALUE_ACCESSOR` went. Only the prop types stay.
export type {
  ISwitchProps,
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from '@symbiote-native/components';
// `ImageBackground` is a TAG — `<image-background>`, matched by `ImageBackgroundElement` in
// `elements.ts` — and there is nothing to import in its place. The prop type stays, for a
// component forwarding a bag and for that directive's own input types.
export type { IAngularImageBackgroundProps } from './components/image-background-props';
export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IAngularKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './components/keyboard-avoiding-view';
export { RefreshControl } from './components/refresh-control';
export type { IAngularRefreshControlProps } from './components/refresh-control';
// `TextInput` is a TAG — `<text-input>` / `<text-input-multiline>`, matched by `TextInputElement`
// and `MultilineTextInputElement` — and there is nothing to import in its place. RN gives it no
// statics, so the name exports nothing at all now; `[(value)]` is handled by the renderer,
// `[(ngModel)]` by `TextInputValueAccessor` (`../elements`), and the imperative handle by
// `buildTextInputHandle` from `@symbiote-native/components` over the node a template ref hands back.
export type { IAngularTextInputProps } from './components/text-input-props';
export type {
  IEnterKeyHint,
  IInputMode,
  ISubmitBehavior,
  ITextInputHandle,
  ITextInputSelection,
  ITextInputChangeEvent,
} from '@symbiote-native/components';
// `TouchableNativeFeedback` is now RN's STATIC NAMESPACE, not a component: the element is the tag
// `<touchable-native-feedback>`, matched by `TouchableNativeFeedbackElement` (../elements), which
// commits no node of its own and clones onto its single child. `.Ripple(…)` /
// `.SelectableBackground(…)` are unchanged; an app's `imports: [TouchableNativeFeedback]` becomes
// `imports: [TouchableNativeFeedbackElement]`.
export { TouchableNativeFeedback } from '@symbiote-native/components';
export type {
  INativeFeedbackBackground,
  IRippleBackground,
  IThemeAttrBackground,
} from '@symbiote-native/components';
export type { IAngularTouchableNativeFeedbackProps } from './components/touchable-native-feedback/touchable-native-feedback-props';
// `TouchableOpacity` and `TouchableHighlight` are TAGS — `<touchable-opacity>` and
// `<touchable-highlight>`, matched by their element directives — and RN gives neither any statics,
// so the names export nothing at all now. Both machines run on the engine node
// (`registerTouchableOpacityBehavior` / `registerTouchableHighlightBehavior`). Only the prop types
// stay.
export type {
  IAngularTouchableHighlightProps,
  IAngularTouchableOpacityProps,
} from './components/touchable-props';
// `TouchableWithoutFeedback` is a TAG — `<touchable-without-feedback>`, matched by
// `TouchableWithoutFeedbackElement` (../elements) — and RN gives it no statics, so like `Button` the
// name exports nothing now; an app's `imports: [TouchableWithoutFeedback]` becomes
// `imports: [TouchableWithoutFeedbackElement]`. Only the prop type stays.
export type { IAngularTouchableWithoutFeedbackProps } from './components/touchable-without-feedback/touchable-without-feedback-props';
export { ScrollView, ScrollViewStickyHeader } from './components/scroll-view';
export type {
  IAngularScrollViewProps,
  IScrollViewHandle,
  IStickyHeaderComponentType,
} from './components/scroll-view';
// `Button` is a TAG — `<button>`, matched by `ButtonElement` — and there is nothing to import in
// its place. RN's Button has no statics, so the name exports nothing at all now; the prop type
// stays, for a component forwarding a bag.
export type { IButtonProps } from './components/button-props';
export {
  VirtualizedList,
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from './components/virtualized-list';
export type {
  ICellLayout,
  ISeparatorProps,
  ISeparators,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IViewableItemsChangedInfo,
  IViewToken,
  IVirtualizedListHandle,
  IVirtualizedListProps,
  IVListItemContext,
  IVListSeparatorContext,
} from './components/virtualized-list';
export { FlatList } from './components/flat-list';
export type { IFlatListHandle, IFlatListProps } from './components/flat-list';
export {
  VirtualizedSectionList,
  VSectionFooterDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  VSectionSeparatorDirective,
} from './components/virtualized-section-list';
export type {
  ISection,
  IVirtualizedSectionListHandle,
  IVirtualizedSectionListProps,
  IVSectionContext,
  IVSectionItemContext,
} from './components/virtualized-section-list';
export { SectionList } from './components/section-list';
export type {
  ISectionListHandle,
  ISectionListProps,
} from './components/section-list';

// Re-export primitive hosts so composed components can import them from the public barrel too.
export {
  ViewHost,
  ViewHost as View,
  TextHost,
  TextHost as Text,
  ImageHost,
  ScrollViewHost,
  ScrollContentView,
  HorizontalScrollView,
  HorizontalScrollContentView,
  TextInputHost,
  MultilineTextInputHost,
  ManagedTextInputHost,
  ManagedMultilineTextInputHost,
  SwitchHost,
  ActivityIndicatorHost,
  SafeAreaViewHost,
  ModalHost,
  RefreshControlHost,
  InputAccessoryViewHost,
  SymbioteHostPropsDirective,
  // Public even though no app names it: it rides `hostDirectives` on every component declaring a
  // `style` input, so ngtsc writes it into their public type metadata and a consuming app's AOT
  // build fails with NG3004 without it. Invisible to tsc and vitest; only a consumer's ngc catches
  // it.
  SymbioteStyleInputDirective,
  // Exported so an OUT-OF-PACKAGE composed component (e.g. @symbiote-native/slider's Angular wrapper,
  // itself listed in ANCHOR_HOST_COMPONENTS) can merge its own anchor host's class-derived style
  // the same way every in-package composed component does — see anchorHostStyle's doc comment.
  anchorHostStyle,
  // Same reasoning, for a component whose merged style is reassigned unconditionally every CD
  // tick (rather than read once inside a props-object getter) — see stableAnchorStyle's doc
  // comment for the free-running-CD-loop it prevents.
  stableAnchorStyle,
} from './primitives/index';

// Public ergonomic aliases: <View> and <Text> resolve directly to the primitive hosts
// (no extra Angular bookkeeping anchor), while the internal symbiote-* selectors remain
// available for composed adapter templates.
