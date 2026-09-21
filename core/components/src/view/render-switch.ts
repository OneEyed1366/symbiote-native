// Switch: the framework-agnostic prop surface. The painting moved to the `switch` tag's own
// behavior (`behaviors/switch.ts`) when the wrapper path was retired; what stays here is the
// public prop type every adapter re-exports and the event shape it fires with.

import type {
  IStyleProp,
  IViewStyle,
  ISymbioteEvent,
} from '@symbiote-native/engine';
import type { IAccessibilityProps, IAriaProps } from '../accessibility-props';

export type ISwitchTrackColor = { false?: string; true?: string };

// The event `onValueChange` fires with. Svelte's compiler treats any individual `on*`-prefixed
// attribute as a native listener attachment and always calls it with exactly one argument, a real
// object — a two-argument `(value, event)` callback silently drops `event` there and crashes when
// `value` is passed as that sole argument (Svelte's own bookkeeping mutates it, which throws on a
// primitive). So the value rides as a field on the event object itself, never as a second argument.
export type ISwitchChangeEvent = ISymbioteEvent & { value: boolean };

// Author-facing props: the framework-agnostic public surface every adapter exposes (the
// controlled value/onValueChange contract, track/thumb colors, style). Identical across
// adapters; each supplies only its hook + bridge.
export interface ISwitchProps extends IAccessibilityProps, IAriaProps {
  value?: boolean;
  // Fires once per native toggle with the event, `value` carried on it — one argument, always a
  // real object; see `ISwitchChangeEvent`.
  onValueChange?: (event: ISwitchChangeEvent) => void;
  disabled?: boolean;
  trackColor?: ISwitchTrackColor;
  thumbColor?: string;
  ios_backgroundColor?: string;
  style?: IStyleProp<IViewStyle>;
}
