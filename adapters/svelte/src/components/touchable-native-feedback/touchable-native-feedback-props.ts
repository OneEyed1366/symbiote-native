import type { Snippet } from 'svelte';
import type { INativeFeedbackBackground } from '@symbiote-native/components';
import type { IPressableProps } from '../pressable/pressable-props';

// A single child, mirroring RN (TouchableNativeFeedback accepts only one View child) and
// React's/Vue's own ITouchableNativeFeedbackProps.
export type ITouchableNativeFeedbackProps = Omit<IPressableProps, 'style' | 'children'> & {
  background?: INativeFeedbackBackground;
  useForeground?: boolean;
  children?: Snippet;
};
