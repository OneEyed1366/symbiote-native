// The one plumbing piece behind every reactive screen-metric value in this bucket: a `{ get
// current() }` box whose read is re-run whenever the engine's Dimensions module emits 'change'.
//
// `createSubscriber` (svelte/reactivity) rather than hand-rolled bookkeeping: it is pure — no DOM
// anywhere in its implementation — and is the integration point Svelte itself documents for an
// external event source (its own `MediaQuery` is built on it). What it buys us over a `$state` +
// `$effect` pair is the reason every value here is a module-level singleton rather than a
// `useX()` call:
//   - `start` runs lazily, on the FIRST reactive read, and the teardown runs when the LAST
//     reading effect is destroyed. So importing this module attaches no Dimensions listener, and
//     N components reading `innerWidth.current` share exactly one.
//   - `.current` is legal OUTSIDE a component too (it just reads through, untracked), whereas
//     `$effect` throws `effect_orphan` anywhere but a component.
// That is also why these files are plain `.ts`, not `.svelte.ts`: they contain no rune syntax, so
// there is nothing for svelte/compiler's compileModule step to do (same as runes/attachments.ts).
import { createSubscriber } from 'svelte/reactivity';
import { Dimensions, type IEventSubscription } from '@symbiote-native/engine';

// The read side of a reactive value. Structurally identical to the boxed getter the `use*` runes
// in this bucket return, and to `.current` on Svelte's own `svelte/reactivity/window` values.
export interface IReactiveValue<TValue> {
  readonly current: TValue;
}

export function createDimensionsValue<TValue>(read: () => TValue): IReactiveValue<TValue> {
  const subscribe = createSubscriber(update => {
    const subscription: IEventSubscription = Dimensions.addEventListener('change', update);
    return () => subscription.remove();
  });

  return {
    get current(): TValue {
      // Registers the dependency when read inside an effect; a no-op read outside one.
      subscribe();
      return read();
    },
  };
}
