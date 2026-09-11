// The prop surface of `<text-input>`, for React.
//
// No component left to type — the element IS the tag, and `multiline` picks `text-input-multiline`
// underneath. The whole lifecycle the wrapper ran — the acknowledged event count, the
// `setTextAndSelection` controlled write, the focus/blur mirror, mount `autoFocus` — lives on the
// engine node as `core/components/src/behaviors/text-input.ts`, wired by `../../register`. The
// `text-input-managed` twin that kept the two machines apart is dead with the wrapper.
//
// The imperative API is reached the way every adapter reaches it — `buildTextInputHandle` over the
// host instance a `ref` hands back — rather than through a `useImperativeHandle` the tag has no
// body to run.
//
// The base is fully agnostic, so it lives ONCE in @symbiote-native/components
// (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling field is per-adapter, and
// React spells it `className`.
import type { ITextInputProps as ITextInputBaseProps } from '@symbiote-native/components';

export type ITextInputProps = ITextInputBaseProps & { className?: string };
