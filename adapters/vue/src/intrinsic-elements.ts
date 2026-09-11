// The tag alphabet, declared to vue-tsc and Volar.
//
// An app writes `<view>` / `<scroll-view>` directly. Vue's template checker resolves a tag it
// does not know as a component and reports it missing; declaring the tags here is what makes the
// bare spelling first-class. `GlobalComponents` owns none of our names, so unlike Svelte's
// `svelteHTML.IntrinsicElements` there is no merge conflict to work around.
//
// The mechanism is Vue's documented one for custom elements (vuejs.org/guide/extras/web-components,
// "Non-Vue Web Components and TypeScript"): the checker reads a component's props off the `$props`
// TYPE of a constructor, never off the value. Hence `new () => { $props: … }` — the docs' own
// warning is that what you hand `GlobalComponents` must be that component-ish type and not the
// element class.
//
// Two deliberate narrowings of the docs' helper. It takes `ElementType extends HTMLElement` and
// intersects `HTMLAttributes`: both are DOM, there is no DOM here, and admitting every HTML
// attribute would defeat the declaration. And it carries a `$emit` half, which we do not need —
// our events reach a node as `on*` PROPS (Vue's compiler turns `@press` into `onPress`, and
// `routeProp` decides prop-vs-event from the ViewConfig), so the props type already covers them.
import type { PublicProps } from '@vue/runtime-core';
import type { ISymbioteIntrinsic } from '@symbiote-native/components';

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

declare module 'vue' {
  // DERIVED from the intrinsic union, so a new host tag becomes valid template markup in the
  // commit that registers its Fabric name. A hand-written twin cannot report a name missing from
  // itself.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GlobalComponents extends Record<
    ISymbioteIntrinsic,
    IDefineIntrinsic<ISymbioteHostAttributes>
  > {}
}

// Re-exported from the barrel so the augmentation above is LOADED by a consumer. A declaration
// nothing imports applies inside this package only — the failure React's `src/jsx.d.ts` shipped
// with for months (symbiote-primitive-tags, "The React arm was BUILT").
export type ISymbioteIntrinsicTag = ISymbioteIntrinsic;
