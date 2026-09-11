// `View`, `Text`, `SafeAreaView`, `Pressable`, `Switch`, `TextInput`, `Image`,
// `InputAccessoryView` and `ActivityIndicator` are NOT here, and there is nothing to import in their place: each is an
// intrinsic tag an app writes directly (`<view>`, `<text>`, `<pressable>`, …). Their prop types
// stay — they are what a component forwarding a bag types itself against — and the tag alphabet is
// declared to svelte-check in `../intrinsic-elements.ts`.
//
// What used to live in each wrapper body now lives one layer down: the `id -> nativeID` alias and
// Text's RN defaults in `foldHostBag` (the shim's `p` setter and `setAttribute` both cross it), the
// aria/role fold in the engine's `fabricProps`, and the press / controlled-value / switch machines
// in `core/components/src/behaviors/*`, wired by `../register`.
export type { IViewProps } from './view-props';
export type { ITextProps } from './text-props';

export type { IActivityIndicatorProps } from './activity-indicator-props';

// The `<image>` tag's prop surface. The `Image` STATICS moved to `modules/image` (2026-09-10) — an
// imperative API with no view, which living here made read as a component. Same split as
// `scroll-view`: the prop type stays with the tag, the runtime does not.
export type { IImageProps } from './image/image-props';

// `ImageBackground` is a TAG — `<image-background>` — and there is nothing to import in its place.
// The prop type stays, for a component forwarding a bag.
export type { IImageBackgroundProps } from './image-background-props';

export type { IInputAccessoryViewProps } from './input-accessory-view/input-accessory-view-props';

export { default as KeyboardAvoidingView } from './keyboard-avoiding-view/index.svelte';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './keyboard-avoiding-view/keyboard-avoiding-view-props';

export type { ISwitchProps } from './switch/switch-props';
export type { ISwitchChangeEvent } from '@symbiote-native/components';

export type { ITextInputProps } from './text-input/text-input-props';
export type {
  ITextInputHandle,
  ITextInputChangeEvent,
} from '@symbiote-native/components';

export { default as Modal } from './modal/index.svelte';
export type { IModalProps } from './modal/modal-props';

export type { ISafeAreaViewProps } from './safe-area-view-props';

// `RefreshControl` is a TAG — `<refresh-control>` — carrying its own engine behavior
// (`registerRefreshControlBehavior`). Its wrapper was a pure passthrough (the accessibility fold
// it called already runs in `fabricProps` on every path) with zero consumers left in this repo
// once ScrollView's own `<RefreshControl>` usage moved to the tag; deleted 2026-09-10.
export type { IRefreshControlProps } from './refresh-control-props';

export type { IPressableProps } from './pressable/pressable-props';

// `TouchableOpacity` is a TAG — `<touchable-opacity>` — like `View` and `Pressable` before it, and
// there is nothing to import in its place. RN builds one `Animated.View` here
// (TouchableOpacity.js:302), so the wrapper's second node was ours; the press machine and the
// opacity fade both live on the engine node (`core/components/src/behaviors/touchable-opacity.ts`),
// wired by `../register`. The prop type stays — it is what a component forwarding a bag types
// itself against.
export type { ITouchableOpacityProps } from './touchable-opacity/touchable-opacity-props';

// `TouchableHighlight` is a TAG — `<touchable-highlight>` — same shape as
// `TouchableWithoutFeedback` above: the underlay show/hide machine lives on the engine node
// (`registerTouchableHighlightBehavior`), and there is nothing left to import in its place.
export type { ITouchableHighlightProps } from './touchable-highlight/touchable-highlight-props';

// `TouchableWithoutFeedback` is a TAG — `<touchable-without-feedback>` — which commits no node of
// its own and clones onto its single child. RN gives it no statics, so like `Button` below the name
// exports nothing now; the prop type stays, for a component forwarding a bag.
export type { ITouchableWithoutFeedbackProps } from './touchable-without-feedback/touchable-without-feedback-props';

// The `<touchable-native-feedback>` tag's prop surface — the tag commits no node of its own and
// clones onto its single child. Its `.Ripple`/`.SelectableBackground` STATICS are re-exported from
// `src/index.ts` beside Alert/Share/Linking, not from here: they are a namespace with no view.
export type { ITouchableNativeFeedbackProps } from './touchable-native-feedback/touchable-native-feedback-props';

// `Button` is a TAG — `<button>` — and there is nothing to import in its place. RN's Button has no
// statics (unlike `TouchableNativeFeedback` next to it), so the name exports nothing at all now;
// the prop type stays, for a component forwarding a bag.
export type { IButtonProps } from './button-props';

// `ScrollView` is a TAG — `<scroll-view>` / `<horizontal-scroll-view>`, the axis picked by which
// one you write. The wrapper was deleted 2026-09-10: both reasons its header gave had expired (the
// engine binds an AnimatedNode and a native `Animated.event` on any host node, and the scroll
// commands live on `ISymbioteNode`'s prototype, which `IHostInstance` IS). The imperative surface
// comes from `hostInstance(bind:this)`.
export type { IScrollViewProps } from './scroll-view/scroll-view-props';
export type { IScrollViewHandle } from '@symbiote-native/components';

export { default as VirtualizedList } from './virtualized-list/index.svelte';
export type {
  IVirtualizedListProps,
  IVirtualizedListHandle,
} from './virtualized-list/virtualized-list-props';

export { default as FlatList } from './flat-list/index.svelte';
export type {
  IFlatListProps,
  IFlatListHandle,
} from './flat-list/flat-list-props';

export { default as VirtualizedSectionList } from './virtualized-section-list/index.svelte';
export type { IVirtualizedSectionListProps } from './virtualized-section-list/virtualized-section-list-props';

export { default as SectionList } from './section-list/index.svelte';
export type {
  ISectionListProps,
  ISection,
} from './section-list/section-list-props';
