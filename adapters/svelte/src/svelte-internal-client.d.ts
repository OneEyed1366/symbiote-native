// `svelte/internal/client` ships no type declarations of its own — its package.json export map
// has a `default` entry and nothing else, and svelte's `types/index.d.ts` does not cover it. This
// adapter is already, by design, coupled to Svelte's private internals (the whole DOM shim is —
// svelte-adapter-dom-shim skill §0), so the declaration is hand-maintained here, narrowed to the
// functions actually imported. Re-check it on every `svelte` bump, alongside §8's checklist.
//
// Two callers. `runes/attachments.ts` takes `attach`. `modules/animated/create-animated-component.ts`
// takes the rest: it is a component body written by hand rather than compiled from a `.svelte`
// file (see its header for why), so it calls the same primitives the compiler emits for the
// equivalent source — verified against real `svelte/compiler` output, not guessed.
declare module 'svelte/internal/client' {
  // internal/client/dom/elements/attachments.js. `getFn` is re-read inside a managed effect, and
  // the returned attachment is invoked inside a branch effect so a reactive read in its body
  // re-runs it with the previous teardown fired first.
  export function attach(node: unknown, getFn: () => unknown): void;

  // internal/client/reactivity/{sources,deriveds}.js. Opaque by design: a signal is only ever
  // produced by state()/derived() and consumed by get()/set(), never inspected.
  export type ISignal<T> = { readonly __signal: (value: T) => void };
  // `$state.raw(v)` — the plain source, with no deep proxy around the value.
  export function state<T>(value: T): ISignal<T>;
  // `$derived.by(fn)` — memoized, recomputed when a tracked read changes.
  export function derived<T>(fn: () => T): ISignal<T>;
  export function get<T>(signal: ISignal<T>): T;
  export function set<T>(signal: ISignal<T>, value: T): T;

  // internal/client/reactivity/effects.js. `$effect(fn)`: deferred to mount while a component
  // context is open (see push/pop below), which is why the wrapper opens one.
  export function user_effect(fn: () => void | (() => void)): void;

  // internal/client/context.js. The `<script>` scope of a compiled component: push on entry,
  // pop on exit returning the component's exports.
  export function push(props: object, runes: boolean): void;
  export function pop<T>(component: T): T;

  // internal/client/dom/blocks/snippet.js. `{@render children()}` compiles to EXACTLY this call —
  // probed against 5.56.8: `$.snippet(node, () => $$props.children)`. create-portal/index.ts makes
  // the same call and substitutes one argument, the anchor, which is the whole portal mechanism.
  // Args are omitted from the declaration because a portal never passes snippet parameters.
  export function snippet(
    node: unknown,
    getSnippet: () => import('svelte').Snippet | undefined,
  ): void;

  // internal/client/reactivity/props.js. The `{...spread}` target: a Proxy merging its sources,
  // each function source re-read per property access so the child stays reactive. The generic
  // return type is what lets a caller hand it to a base whose prop type is only known there,
  // without an `as` cast — the object really is assembled at runtime.
  export function spread_props<TProps>(...sources: unknown[]): TProps;
}
