// The component re-export barrel, flat at the package root like every other adapter's. Grouping
// under components/ is internal; this file plus src/index.ts is the whole public surface.

export { View } from './components/view';
export type { IViewProps } from './components/view';

export { Text } from './components/text';
export type { ITextProps } from './components/text';

export { SafeAreaView } from './components/safe-area-view';
export type { ISafeAreaViewProps } from './components/safe-area-view';

export { Image } from './components/image';
export type { IImageProps } from './components/image';

export { Pressable } from './components/pressable';
export type { IPressableProps } from './components/pressable';

export { ActivityIndicator } from './components/activity-indicator';
export type { IActivityIndicatorProps } from './components/activity-indicator';

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

export { Switch } from './components/switch';
export type { ISwitchProps, ISwitchTrackColor } from './components/switch';

export { TextInput } from './components/text-input';
export type {
  ITextInputProps,
  ITextInputHandle,
  ITextInputSelection,
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

export { RefreshControl } from './components/refresh-control';
export type { IRefreshControlProps } from './components/refresh-control';

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
export {
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from './components/touchable';
export type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
  ITouchableWithoutFeedbackProps,
} from './components/touchable';

// Android's native ripple/theme-attr feedback. The background factories are the SHARED functions
// hung on the component value, not adapter wrappers, so every adapter offers the identical set.
export { TouchableNativeFeedback } from './components/touchable-native-feedback';
export type {
  ITouchableNativeFeedbackProps,
  INativeFeedbackBackground,
  IThemeAttrBackground,
  IRippleBackground,
} from './components/touchable-native-feedback';

// IButtonProps is agnostic and lives in @symbiote-native/components; this re-exports it rather
// than redeclaring it, matching react/vue/svelte/angular (CLAUDE.md prop-type split).
export { Button } from './components/button';
export type { IButtonProps } from './components/button';

// Both take `children`, a framework value, so their public prop types are declared per-adapter
// over the shared agnostic field base — never imported from another adapter.
export { ImageBackground } from './components/image-background';
export type { IImageBackgroundProps } from './components/image-background';

export { InputAccessoryView } from './components/input-accessory-view';
export type { IInputAccessoryViewProps } from './components/input-accessory-view';
