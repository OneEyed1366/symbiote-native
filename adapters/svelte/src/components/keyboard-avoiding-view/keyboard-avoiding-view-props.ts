// Canonical home of `IKeyboardAvoidingViewProps`
// `children` is a `Snippet` and `onLayout` a plain callback prop, so per
// <prop_types_split_agnostic_vs_per_adapter> the type is declared per adapter, not shared
import type { Snippet } from 'svelte';
import type {
  ISymbioteEvent,
  IStyleProp,
  IViewStyle,
} from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IKeyboardAvoidingBehavior,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type { IKeyboardAvoidingBehavior } from '@symbiote-native/components';

export type IKeyboardAvoidingViewProps = IAccessibilityProps &
  IAriaProps & {
    behavior?: IKeyboardAvoidingBehavior;
    // When false, the view passes through untouched; no inset is applied in any behavior mode
    enabled?: boolean;
    // Distance from the top of the screen to this view, subtracted from the inset
    keyboardVerticalOffset?: number;
    // Style of the inner content container, used only when behavior is 'position'
    contentContainerStyle?: IStyleProp<IViewStyle>;
    style?: IStyleProp<IViewStyle>;
    class?: ISvelteClassValue;
    children?: Snippet;
    onLayout?: (event: ISymbioteEvent) => void;
  };
