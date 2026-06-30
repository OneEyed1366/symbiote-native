// Generic-component typing helpers for the Vue adapter.
//
// Vue's `defineComponent` has no overload for a GENERIC setup function with separate runtime
// options, so a component generic over an item type (the list family) cannot type its emit payloads
// off that generic the normal way. The escape hatch (the symbiote port of pd-web-kit's pattern): a
// generic setup FUNCTION `<T,>(props: IProps<T>, ctx: ICtx<IEmits<T>>) => render`, plus the runtime
// options passed as a second arg cast through `as unknown as undefined` (the cast is sanctioned ONLY
// here — it is the only way to express a generic component in plain TS; see CLAUDE.md no-`as` rule).
//
// `ICtx` is a thin wrapper over Vue's SetupContext that lets the generic emits type E flow through,
// so `emit('viewableItemsChanged', info)` types `info` as `IViewableItemsChangedInfo<T>` and the
// consumer's `@viewable-items-changed` payload is `T`, never `unknown`.

import type { ObjectEmitsOptions, SetupContext, SlotsType } from '@vue/runtime-core';

// Verbatim port of pd-web-kit's `Ctx`. The `E | {}` and `Record<string, any>` slot default are
// load-bearing: they make the generic ctx assignable to defineComponent's generic-setup overload
// (a stricter slot shape trips a slots-incompatibility error). This is framework-typing glue, so
// the `any` mirrors Vue's own SlotsType default and stays confined to this helper.
export type ICtx<
  E extends ObjectEmitsOptions = ObjectEmitsOptions,
  S extends Record<string, any> = Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  SS = SetupContext<E | {}, SlotsType<S>>,
> = SS;
