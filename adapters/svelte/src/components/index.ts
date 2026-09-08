// `View`, `Text`, `SafeAreaView`, `Pressable`, `Switch`, `TextInput`, `Image` and
// `InputAccessoryView` are NOT here, and there is nothing to import in their place: each is an
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

export { default as ActivityIndicator } from './activity-indicator/index.svelte';
export type { IActivityIndicatorProps } from './activity-indicator/activity-indicator-props';

// `Image` is the STATICS namespace now (`Image.getSize`/`prefetch`/…), not a component — the
// primitive is the `<image>` tag. See ./image/index.ts.
export { Image } from './image';
export type { IImageProps, IImageStatics } from './image';

export { default as ImageBackground } from './image-background/index.svelte';
export type { IImageBackgroundProps } from './image-background/image-background-props';

export type { IInputAccessoryViewProps } from './input-accessory-view/input-accessory-view-props';

export { default as KeyboardAvoidingView } from './keyboard-avoiding-view/index.svelte';
export type {
  IKeyboardAvoidingViewProps,
  IKeyboardAvoidingBehavior,
} from './keyboard-avoiding-view/keyboard-avoiding-view-props';

export type { ISwitchProps } from './switch/switch-props';

export type { ITextInputProps } from './text-input/text-input-props';
export type { ITextInputHandle } from '@symbiote-native/components';

export { default as Modal } from './modal/index.svelte';
export type { IModalProps } from './modal/modal-props';

export type { ISafeAreaViewProps } from './safe-area-view-props';

export { default as RefreshControl } from './RefreshControl.svelte';
export type { IRefreshControlProps } from './refresh-control-props';

export type { IPressableProps } from './pressable/pressable-props';

export { default as TouchableOpacity } from './touchable-opacity/index.svelte';
export type { ITouchableOpacityProps } from './touchable-opacity/touchable-opacity-props';

export { default as TouchableHighlight } from './touchable-highlight/index.svelte';
export type { ITouchableHighlightProps } from './touchable-highlight/touchable-highlight-props';

export { default as TouchableWithoutFeedback } from './touchable-without-feedback/index.svelte';
export type { ITouchableWithoutFeedbackProps } from './touchable-without-feedback/touchable-without-feedback-props';

export { TouchableNativeFeedback } from './touchable-native-feedback';
export type { ITouchableNativeFeedbackProps } from './touchable-native-feedback';

export { default as Button } from './button.svelte';
export type { IButtonProps } from './button-props';

export { default as ScrollView } from './scroll-view/index.svelte';
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
