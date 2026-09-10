// The component re-export barrel, flat at the package root like every other adapter's. Grouping
// under components/ is internal; this file plus src/index.ts is the whole public surface.

// `View` and `Text` are TAGS — `<view>` and `<text>` — and there is nothing to import in their
// place. Both wrappers only forwarded a bag: the `id -> nativeID` alias and Text's RN defaults are
// seeded in the renderer, the aria/role fold in the engine's `fabricProps`, and the
// RCTText/RCTVirtualText choice was always the engine's commit walk. The prop types stay — they are
// what a component forwarding a bag types itself against.
export type { IViewProps } from './components/view-props';
export type { ITextProps } from './components/text-props';

// `SafeAreaView` is a TAG — `<safe-area-view>` — and there is nothing to import in its place. The
// host owns the inset math; the wrapper only forwarded a bag.
export type { ISafeAreaViewProps } from './components/safe-area-view-props';

// `Image` is a TAG — `<image>` — and there is nothing to import in its place. The whole
// `renderImage` fold runs in the tag's own behavior; the STATICS (`getSize`, `prefetch`, …) moved
// to `./modules/image`, an imperative API with no view, and are re-exported from `./index`.
export type { IImageProps } from './components/image-props';

export { Pressable } from './components/pressable';
export type { IPressableProps } from './components/pressable';

// `ActivityIndicator` is a TAG — `<activity-indicator>` — and there is nothing to import in its
// place. RN's ActivityIndicator has no statics, so the name exports nothing at all now; the prop
// type stays, for a component forwarding a bag.
export type { IActivityIndicatorProps } from './components/activity-indicator-props';

// Agnostic detail types every other adapter's barrel also carries, taken STRAIGHT from the shared
// package rather than routed through a component module: a pure passthrough belongs in a barrel,
// not behind a hop (`.claude/rules/barrel-passthrough.md`). Checked against react/vue/svelte/angular
// before adding — `IActivityIndicatorSize`, `IActivityIndicatorPlatform` and `IImageWithStatics` are
// deliberately NOT here, because no other adapter exposes them either.
export type {
  IImageStatics,
  IPressState,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';

// `Switch` is a TAG — `<switch>` — and there is nothing to import in its place. The controlled
// handshake (the lastNativeReport mirror and the platform snap-back command) is the tag's own
// behavior now.
export type {
  ISwitchProps,
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from './components/switch-props';

export { TextInput } from './components/text-input';
export type {
  ITextInputProps,
  ITextInputHandle,
  ITextInputSelection,
  ITextInputChangeEvent,
} from './components/text-input';

export { Modal } from './components/modal';
export type {
  IModalProps,
  IModalAnimationType,
  IModalPresentationStyle,
  IModalOrientation,
  IModalOrientationChangeEvent,
} from './components/modal';

export { KeyboardAvoidingView } from './components/keyboard-avoiding-view';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './components/keyboard-avoiding-view';

// `RefreshControl` is a TAG — `<refresh-control>` — and there is nothing to import in its place.
// The wrapper forwarded a bag; the controlled-spinner handshake is the tag's own behavior.
export type { IRefreshControlProps } from './components/refresh-control-props';

// ScrollViewStickyHeader is NOT exported, matching react-native itself: it lives at
// Libraries/Components/ScrollView/ScrollViewStickyHeader.js and is absent from RN's public
// index.js, so it is ScrollView's internal, not part of the public surface. React's and Vue's
// barrels agree. Svelte's and Angular's do export it, but as a WORKAROUND rather than an API
// decision — Svelte documents `stickyHeaderIndices` as a KNOWN GAP, so its apps have to compose the
// wrapper by hand. This adapter auto-wraps flagged children the way React and Vue do, so the escape
// hatch has nothing to escape. `IStickyHeaderComponentType` stays internal for the same reason even
// though `IScrollViewProps.StickyHeaderComponent` is typed by it — React has the identical shape.
export { ScrollView } from './components/scroll-view';
export type {
  IScrollViewProps,
  IScrollViewHandle,
} from './components/scroll-view';

// The shared list detail types (ISeparators, IViewToken, IViewabilityConfig…) come through the
// component module rather than straight from '@symbiote-native/components', matching React's own
// virtualized-list barrel: a consumer typing a renderItem callback or a viewability config reaches
// for the same import as the component. `IVirtualizedListComponent` stays internal — it is the
// platform factory's return type, not API, exactly as ScrollView keeps `IScrollViewHostPlatform`
// out of this barrel.
export { VirtualizedList } from './components/virtualized-list';
export type {
  IVirtualizedListProps,
  IVirtualizedListHandle,
  IVirtualizedListCellInfo,
  IVirtualizedListRenderItem,
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
} from './components/virtualized-list';

// FlatList carries no platform split of its own — the iOS/Android divergence is
// VirtualizedList's refreshControlMode, inherited by importing that folder, so Metro picks the
// right variant with nothing here to switch on. IFlatListProps is an Omit over
// IVirtualizedListProps rather than a fresh declaration, so the two cannot drift apart.
export { FlatList } from './components/flat-list';
export type { IFlatListProps, IFlatListHandle } from './components/flat-list';

// The section family. ISection rides the virtualized-section-list module here, where the type is
// declared; React re-exports it from its section-list module instead. Either way the barrel's NAME
// set is what parity is measured on — which module a type is re-exported through is internal.
export { VirtualizedSectionList } from './components/virtualized-section-list';
export type {
  IVirtualizedSectionListProps,
  IVirtualizedSectionListHandle,
  ISectionHeaderInfo,
  ISectionCellInfo,
  ISection,
} from './components/virtualized-section-list';

// SectionList declares no input of its own — it is the preset over VirtualizedSectionList, the same
// relation React's 25-line section-list has to its 262-line virtualized twin.
export { SectionList } from './components/section-list';
export type {
  ISectionListProps,
  ISectionListHandle,
} from './components/section-list';

// The Touchable family, all composed over Pressable exactly as React's and Vue's are — so the
// press machine, the aria fold and the class+style merge each happen once, in Pressable/View.
export { TouchableOpacity, TouchableHighlight } from './components/touchable';
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
} from './components/touchable';
// `TouchableWithoutFeedback` is a TAG — `<touchable-without-feedback>` — and RN gives it no statics,
// so like `Button` the name exports nothing now; only the prop type stays, for a component
// forwarding a bag.
export type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback/touchable-without-feedback-props';

// Android's native ripple/theme-attr feedback. `TouchableNativeFeedback` is now RN's STATIC
// NAMESPACE, not a component: the element is the tag `<touchable-native-feedback>`, which commits no
// node of its own and clones onto its single child. `.Ripple(…)` / `.SelectableBackground(…)` are
// unchanged, and are the SHARED functions every adapter already offered.
export { TouchableNativeFeedback } from '@symbiote-native/components';
export type {
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from '@symbiote-native/components';
export type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback/touchable-native-feedback-props';

// `Button` is a TAG — `<button>` — and there is nothing to import in its place. RN's Button has no
// statics (unlike `TouchableNativeFeedback` next to it), so the name exports nothing at all now;
// the prop type stays, for a component forwarding a bag.
export type { IButtonProps } from './components/button-props';

// Both take `children`, a framework value, so their public prop types are declared per-adapter
// over the shared agnostic field base — never imported from another adapter.
//
// `ImageBackground` is a TAG — `<image-background>` — and there is nothing to import in its place.
export type { IImageBackgroundProps } from './components/image-background-props';

// `InputAccessoryView` is a TAG — `<input-accessory-view>` — and there is nothing to import in its
// place. The wrapper only forwarded a bag: the nativeID / backgroundColor / style mapping is the
// tag's own behavior and the aria fold is the engine's, so nothing was left to host.
export type { IInputAccessoryViewProps } from './components/input-accessory-view-props';
