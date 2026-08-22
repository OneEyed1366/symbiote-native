import type { ITouchableBaseProps } from '../touchable-base-props';

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
  // RN's own underlay notifications (TouchableHighlight.js), fired on a real transition only —
  // ordinary callback props, this adapter's convention for every event (Vue declares the same two
  // as emits, Angular as @Output()). `delayPressOut`, which times the post-press hold, already
  // arrives through ITouchableBaseProps' IPressTimingProps.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}
