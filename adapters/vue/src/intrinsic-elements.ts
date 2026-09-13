// The tag alphabet, declared to vue-tsc and Volar.
//
// An app writes `<view>` / `<scroll-view>` directly. Vue's template checker resolves a tag it
// does not know as a component and reports it missing; declaring the tags here is what makes the
// bare spelling first-class.
//
// CORRECTION, measured 2026-09-13: `GlobalComponents owns none of our names, no merge conflict`
// (this file's own claim for months) is true only for a tag Vue's compiler does NOT already treat
// as a native element. `@vue/compiler-core`'s `transformElement` sends a lowercase tag through the
// COMPONENT path (which is what reads `GlobalComponents`) only when `!isNativeTag(tag)` — and
// `view`/`text`/`image`/`switch` collide with real SVG element names, exactly like Svelte's four
// (`adapters/svelte/src/intrinsic-elements.ts`). For those four, Volar's generated virtual code
// checks props against `__VLS_intrinsicElements[tag]`, typed as
// `import('${vueCompilerOptions.lib}/jsx-runtime').JSX.IntrinsicElements[tag]` — literally
// `vue/jsx-runtime`'s OWN `IntrinsicElements`, never this file's `GlobalComponents` augmentation.
// `GlobalComponents` genuinely works for every OTHER tag here (`pressable`, `scroll-view`, …,
// none of which is a native HTML/SVG name), which is why most of this file was never wrong.
//
// The mechanism for the tags this DOES cover is Vue's documented one for custom elements
// (vuejs.org/guide/extras/web-components, "Non-Vue Web Components and TypeScript"): the checker
// reads a component's props off the `$props` TYPE of a constructor, never off the value. Hence
// `new () => { $props: … }` — the docs' own warning is that what you hand `GlobalComponents` must
// be that component-ish type and not the element class.
//
// Two deliberate narrowings of the docs' helper. It takes `ElementType extends HTMLElement` and
// intersects `HTMLAttributes`: both are DOM, there is no DOM here, and admitting every HTML
// attribute would defeat the declaration. And it carries a `$emit` half, which we do not need —
// our events reach a node as `on*` PROPS (Vue's compiler turns `@press` into `onPress`, and
// `routeProp` decides prop-vs-event from the ViewConfig), so the props type already covers them.
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
