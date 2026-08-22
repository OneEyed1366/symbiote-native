// `IKeyboardAvoidingViewProps`'s canonical home. Wraps arbitrary user children (a Svelte Snippet)
// and forwards its own `onLayout` callback prop — both framework-specific — so per CLAUDE.md's
// <prop_types_split_agnostic_vs_per_adapter> this type is declared per-adapter over the shared
// agnostic pieces core/components already exports (IKeyboardAvoidingBehavior, IAccessibilityProps,
// IAriaProps). `onLayout` is a plain callback prop (mirrors React's shape, an idiomatic Svelte 5
// callback prop — object-bag handlers ride the bag per svelte-adapter-dom-shim skill §3g(c)), not
// a Vue-style typed emit.
import type { Snippet } from 'svelte';
import type {
  ISymbioteEvent,
  IClassNameValue,
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

export interface IKeyboardAvoidingViewProps
  extends IAccessibilityProps, IAriaProps {
  behavior?: IKeyboardAvoidingBehavior;
  // When false, the view passes through untouched; no inset is applied in any behavior mode.
  enabled?: boolean;
  // Distance from the top of the screen to this view; subtracted from the inset so a view that
  // doesn't start at y=0 still clears the keyboard exactly.
  keyboardVerticalOffset?: number;
  // Style of the inner content container, used only when behavior is 'position'.
  contentContainerStyle?: IStyleProp<IViewStyle>;
  style?: IStyleProp<IViewStyle>;
  class?: ISvelteClassValue;
  children?: Snippet;
  onLayout?: (event: ISymbioteEvent) => void;
}
