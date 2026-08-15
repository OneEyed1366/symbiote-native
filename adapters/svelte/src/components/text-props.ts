// `ITextProps`'s canonical home — see `view-props.ts`'s header comment for why this type
// lives in a plain `.ts` file rather than being re-exported straight out of `Text.svelte`.
import type { Snippet } from 'svelte';
import type {
  ISymbioteEvent,
  IClassNameValue,
  IStyleProp,
  ITextStyle,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '@symbiote-native/components';
import type { ISvelteClassValue } from '../class-value';

export interface ITextProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<ITextStyle>;
  class?: ISvelteClassValue;
  onPress?: (event: ISymbioteEvent) => void;
  onLongPress?: (event: ISymbioteEvent) => void;
  onPressIn?: (event: ISymbioteEvent) => void;
  onPressOut?: (event: ISymbioteEvent) => void;
  onLayout?: (event: ISymbioteEvent) => void;
  onTextLayout?: (event: ISymbioteEvent) => void;
  numberOfLines?: number;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number | null;
  selectionColor?: string;
  children?: Snippet;
}
