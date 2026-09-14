// The two names Angular's `[(value)]` sugar rides on, in a dependency-free LEAF so `elements.ts`
// can name the event without importing the require-cyclic `renderer/index.ts` (same reasoning as
// `anchor-host-registry.ts`).
//
// `[(value)]` desugars to a `(valueChange)` binding, which is no Fabric event — the renderer
// translates it to the `onValueChange` PROP both behaviors already call.
export const VALUE_CHANGE_EVENT = 'valueChange';
export const VALUE_CHANGE_PROP = 'onValueChange';
