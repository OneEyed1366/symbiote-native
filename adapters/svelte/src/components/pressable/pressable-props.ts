// `IPressableProps`'s canonical home — same plain-`.ts`-file requirement as view-props.ts/
// switch-props.ts (a `.svelte` file's named `<script module>` export is invisible to plain
// `tsc`; see view-props.ts's header comment for the full reason). Mirrors React's
// (adapters/react/src/components/pressable/index.ts) and Vue's
// (adapters/vue/src/components/pressable.ts) IPressableProps, minus each framework's own
// children shape: React takes `ReactNode | ((state) => ReactNode)`, Vue takes a scoped default
// slot `(state) => VNode[]`. Svelte's native mechanism for the same "children as a function of
// press state" shape is a PARAMETERIZED Snippet, `Snippet<[IPressState]>` — a snippet is free to
// ignore parameters it doesn't need, so a plain `{#snippet children()}` block (never reading
// `pressed`) satisfies this type exactly as well as one that does.
import type { Snippet } from 'svelte';
import type { IClassNameValue, IStyleProp, IViewStyle } from '@symbiote-native/engine';
import type {
  IAccessibilityProps,
  IAriaProps,
  IPressHandler,
  IPressState,
  IRectOffset,
  IPressableAndroidRippleConfig,
} from '@symbiote-native/components';
import type { ISvelteClassValue } from '../../class-value';

export type { IPressState, IPressableAndroidRippleConfig } from '@symbiote-native/components';

export interface IPressableProps extends IAccessibilityProps, IAriaProps {
  onPress?: IPressHandler;
  onPressIn?: IPressHandler;
  onPressOut?: IPressHandler;
  // Fires on every responder move while the press is live (RN Pressable.js onPressMove).
  // Distinct from the retention drift bookkeeping the machine also runs on the same stream.
  onPressMove?: IPressHandler;
  onLongPress?: IPressHandler;
  delayLongPress?: number;
  disabled?: boolean;
  // false refuses to yield the responder when another view (e.g. a parent ScrollView) asks to
  // take over. RN forwards this to onResponderTerminationRequest, default true.
  cancelable?: boolean;
  hitSlop?: IRectOffset;
  // Extra distance outside the visual bounds in which a drifting press stays active before
  // pressOut fires (RN Pressable.js). A scalar applies to every edge.
  pressRetentionOffset?: IRectOffset;
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate.
  unstable_pressDelay?: number;
  // Android-only ripple feedback; inert on iOS.
  android_ripple?: IPressableAndroidRippleConfig;
  // Suppress the Android system tap sound.
  android_disableSound?: boolean;
  // Pointer-hover callbacks (RN onHoverIn/onHoverOut). This host has no pointer-enter/leave
  // event, so they are accepted, typed, and forwarded but inert (noteHoverNoop dlogs the no-op).
  onHoverIn?: IPressHandler;
  onHoverOut?: IPressHandler;
  delayHoverIn?: number;
  delayHoverOut?: number;
  style?: IStyleProp<IViewStyle> | ((state: IPressState) => IStyleProp<IViewStyle>);
  // Unlike `style`, never a function of press state — a CSS class is compiled statically, so
  // only the truly static half of a Pressable's look can move here; a press-state-dependent
  // look still needs `style`'s function form.
  class?: ISvelteClassValue;
  children?: Snippet<[IPressState]>;
}
