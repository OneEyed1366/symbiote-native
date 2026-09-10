// The prop surface of `<text-input>` / `<text-input-multiline>`, for Solid.
//
// No component left to type — the element IS the tag. The whole lifecycle the wrapper ran (the
// acknowledged event count, the `setTextAndSelection` controlled write, the focus/blur mirror,
// mount `autoFocus`) lives on the engine node as `core/components/src/behaviors/text-input.ts`,
// wired by `../register`. The two tags are chosen by the app, not resolved from a prop —
// `resolveIntrinsicTag` rejects a `multiline` prop that CONTRADICTS the tag rather than picking
// one for you (`bare-tag-intrinsic-choice.test.tsx`), matching a raw host intrinsic's other
// discriminator (Text's ancestor-context RCTText/RCTVirtualText choice being the one true
// exception, made by the engine's own commit walk rather than by the app).
//
// The imperative API is reached the way every adapter reaches it — `buildTextInputHandle` over the
// host instance a `ref` hands back — rather than through a bespoke handle the tag has no body to
// build.
//
// The base is fully agnostic, so it lives ONCE in @symbiote-native/components
// (<prop_types_split_agnostic_vs_per_adapter>). `class` and `ref` are per-adapter: `ref` is typed
// over solid-js's Ref union, matching View's own `ref?: Ref<IHostInstance>`.
import type { Ref } from 'solid-js';
import type { ITextInputProps as ITextInputBaseProps } from '@symbiote-native/components';
import type { IClassNameValue } from '@symbiote-native/engine';
import type { IHostInstance } from '../host-instance';

export type ITextInputProps = ITextInputBaseProps & {
  class?: IClassNameValue;
  ref?: Ref<IHostInstance>;
};
