// The prop surface of `<switch>`, for React.
//
// No component left to type — the element IS the tag. The whole controlled-toggle lifecycle the
// wrapper ran (the `lastNativeReport` mirror and the snap-back view command that un-sticks native
// when the parent rejects a toggle) now lives on the engine node as
// `core/components/src/behaviors/switch.ts`, wired by `../../register`; the colour/value fold runs
// there too. The `switch-managed` twin that kept the two apart is dead with the wrapper.
//
// The base is fully agnostic — no children, no ref, no render callback — so it lives ONCE in
// @symbiote-native/components (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling
// field is per-adapter, and React spells it `className`.
import type { ISwitchProps as ISwitchBaseProps } from '@symbiote-native/components';

export type ISwitchProps = ISwitchBaseProps & { className?: string };
