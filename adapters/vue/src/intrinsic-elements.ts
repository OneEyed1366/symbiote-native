// The tag alphabet, declared to vue-tsc and Volar. Vue's template checker resolves an unknown
// lowercase tag as a component, so declaring it here makes the bare spelling first-class.

// `view`/`text`/`image`/`switch` collide with real SVG element names, so Vue routes them through
// `isNativeTag`'s branch instead — Volar checks those four against `vue/jsx-runtime`'s own
// `IntrinsicElements`. Every other tag here resolves through `GlobalComponents`.

// Vue's documented custom-element mechanism: the checker reads props off a component's `$props`
// TYPE, never off the value — hence `new () => { $props: … }`, narrowed here to drop the docs'
// `HTMLElement`/`$emit` halves (no DOM here; our events reach a node as `on*` props).
import type { PublicProps } from '@vue/runtime-core';
import type {
  ISymbioteIntrinsic,
  ICrossTypedIntrinsics,
} from '@symbiote-native/components';
import type { ICrossedPrimitiveProps } from './jsx-runtime';

// Open by construction, not by laziness. Two independent reasons, either one sufficient:
// `routeProp` decides prop-vs-event per the node's ViewConfig at RUNTIME, and `normalizeVueAttrs`
// folds kebab to camel one key at a time — so a template may legally spell every prop either way
// and a closed list would have to carry both. `unknown` rather than `any` keeps the openness from
// leaking an escape hatch into the rest of the file.
export interface ISymbioteHostAttributes {
  [attribute: string]: unknown;
}

// `PublicProps` is what supplies `key` / `ref` / `class` / `style` the way Vue's own elements get
// them; without it a `ref` on a bare tag reports as an unknown prop.
type IDefineIntrinsic<Props> = new () => {
  /** @deprecated Template prop types only — this property does not exist at runtime. */
  $props: Props & PublicProps;
};

// `ICrossedPrimitiveProps` (jsx-runtime.ts) is the ONE list of which tags have a real prop type —
// re-mapped here to the `IDefineIntrinsic` shape Volar needs, so this file and the JSX namespace
// can never drift on which tags are crossed, only on the FEW that need a per-mechanism member
// name (this file spells its map's values `IDefineIntrinsic<Props>`, jsx-runtime.ts spells them
// `Props` directly).
type IDefineIntrinsicMap<M> = { [K in keyof M]: IDefineIntrinsic<M[K]> };

declare module 'vue' {
  // DERIVED from the intrinsic union, so a new host tag becomes valid template markup in the
  // commit that registers its Fabric name. A hand-written twin cannot report a name missing from
  // itself. Crossed to the real prop types on the primitives that carry them today. This DOES
  // catch a typo'd prop on `pressable`/`scroll-view`/… (component path) — it does NOT catch one on
  // `view`/`text`/`image`/`switch` (native-element path, see the file header): those are typed
  // through `vue/jsx-runtime`'s OWN `IntrinsicElements` by Volar's codegen, unreachable from here.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GlobalComponents extends ICrossTypedIntrinsics<
    IDefineIntrinsic<ISymbioteHostAttributes>,
    IDefineIntrinsicMap<ICrossedPrimitiveProps>
  > {}
}

// Re-exported from the barrel so the augmentation above is LOADED by a consumer. A declaration
// nothing imports applies inside this package only — the failure React's `src/jsx.d.ts` shipped
// with for months (symbiote-primitive-tags, "The React arm was BUILT").
export type ISymbioteIntrinsicTag = ISymbioteIntrinsic;
