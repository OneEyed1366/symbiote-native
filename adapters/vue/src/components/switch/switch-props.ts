// The `<switch>` tag's prop surface. The wrapper is gone: its `lastNativeReport` ref, its
// post-flush snap-back watch and the platform track-color mapping all live in
// `registerSwitchBehavior` now, on the engine node — one machine, one implementation.
//
// `v-model` still works and needs no `modelValue` prop here: on an ELEMENT the compiler expands it
// to a runtime directive rather than a prop/emit pair, and `vModelText` in `../../runtime-helpers`
// is our implementation of it (it branches on the switch's component so a boolean is not
// stringified). `@value-change` is the plain listener half — the behavior calls
// `onValueChange(value, event)`.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ISwitchProps as ISwitchBaseProps } from '@symbiote-native/components';

// `class` cannot join the framework-agnostic base, so every adapter adds its own styling field
// per <prop_types_split_agnostic_vs_per_adapter>. Vue's idiom is `class`, matching View/Text.
export type ISwitchProps = ISwitchBaseProps & { class?: IClassNameValue };
export type {
  ISwitchTrackColor,
  ISwitchChangeEvent,
} from '@symbiote-native/components';
