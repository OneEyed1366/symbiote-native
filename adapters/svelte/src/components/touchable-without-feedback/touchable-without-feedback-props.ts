import type { ITouchableBaseProps } from '../touchable-base-props';

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps & {
  // TouchableWithoutFeedback.js:199 — forwarded to Pressability as `android_disableSound`. Named
  // differently from Pressable's own `android_disableSound`, matching vendor.
  touchSoundDisabled?: boolean;
};
