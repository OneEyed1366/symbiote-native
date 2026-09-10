// The `<text-input>` tag's prop surface, for Vue — and `multiline` picks `text-input-multiline`
// underneath. The wrapper is gone: the acknowledged event count, the `setTextAndSelection`
// controlled write, the focus/blur mirror and mount `autoFocus` all live on the engine node as
// `core/components/src/behaviors/text-input.ts`, wired by `../../register`. The
// `text-input-managed` twin that kept the two machines apart is dead with it.
//
// The imperative API is reached the way every adapter reaches it — `buildTextInputHandle` over the
// host instance a template `ref` hands back — rather than through an `expose()` the tag has no body
// to run. On an ELEMENT a Vue ref resolves to the raw `ISymbioteNode`, which is exactly the input
// that builder takes.
//
// `v-model` needs no `modelValue` prop here: on an element the compiler expands it to a runtime
// directive, and `vModelText` in `../../runtime-helpers` is our implementation. The plain listener
// half stays the shared base's `onValueChange` / `onFocus` / `onBlur` — the wrapper Omit-ed those
// three for an emit-based surface, and a tag has no emits, so the base is reused as-is.
//
// The base is fully agnostic, so it lives ONCE in @symbiote-native/components
// (<prop_types_split_agnostic_vs_per_adapter>). Only the class-styling field is per-adapter.
import type { IClassNameValue } from '@symbiote-native/engine';
import type { ITextInputProps as ITextInputBaseProps } from '@symbiote-native/components';

export type ITextInputProps = ITextInputBaseProps & {
  class?: IClassNameValue;
};
