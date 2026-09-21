import type { ITouchableBaseProps } from '../touchable-base-props';

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
  // TouchableHighlight.js:205 — forwarded to Pressability as `android_disableSound`. Named
  // differently from Pressable's own `android_disableSound`, matching vendor.
  touchSoundDisabled?: boolean;
  // RN's snapshot affordance (`Pressable.js:151`, `TouchableHighlight.js:61`): render the control in
  // its pressed state with no gesture, so a test can capture it. Consumed by the engine and stripped
  // before the payload — no ViewConfig declares it.
  testOnly_pressed?: boolean;
  // RN's own underlay notifications (TouchableHighlight.js), fired on a real transition only —
  // ordinary callback props, this adapter's convention for every event (Vue declares the same two
  // as emits, Angular as @Output()). `delayPressOut`, which times the post-press hold, already
  // arrives through ITouchableBaseProps' IPressTimingProps.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}
