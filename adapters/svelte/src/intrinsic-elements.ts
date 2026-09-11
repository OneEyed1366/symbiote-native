// The tag alphabet, declared to svelte-check and the language server.
//
// Without it an app writing `<view p={…}>` is checked against svelte/elements' SVG `<view>` —
// four of our names (view, text, image, switch) are real SVG elements — so every bare tag reports
// `'"p"' does not exist in type 'HTMLProps<"view", SVGAttributes<any>>'`. Not untyped: MISTYPED.
//
// WHY THE GLOBAL NAMESPACE AND NOT `svelte/elements`. Augmenting `SvelteHTMLElements` is TS2717
// on exactly those four ("subsequent property declarations must have the same type"); a name it
// does not already own, such as `sticky-header`, merges fine. `svelteHTML.IntrinsicElements` is
// the interface svelte2tsx actually reads for ATTRIBUTES (`createElement`'s `attrs: Elements[Key]`
// in svelte-jsx-v4.d.ts), and it takes precedence there.
//
// WHAT THIS DOES NOT FIX, and do not spend an afternoon on it: `bind:this`. The same
// `createElement` bakes its RETURN type as
// `Key extends keyof ElementTagNameMap ? … : Key extends keyof SVGElementTagNameMap ? … : any`,
// both maps come from `lib.dom`, and line 1 of that file force-includes it with
// `/// <reference lib="dom" />` — unsuppressable from a consumer's tsconfig, and both maps refuse
// augmentation for the same TS2717 reason. So the four SVG-named tags hand back an SVG element
// type instead of `ShimElement`, and the other 17 fall through to `any`. Svelte's custom-renderer
// API (sveltejs/svelte#18042) is the real fix and is not in 5.56.8. Known wart, owner's call.
import type { ISymbioteIntrinsic } from '@symbiote-native/components';
import type { IShimPropBag } from './dom-shim/element';

// Open by construction, not by laziness: the shim hands every key to the engine's `routeProp`,
// which decides prop-vs-event per the node's ViewConfig at RUNTIME. There is no statically-known
// attribute set to enumerate, and a closed one would have to carry both spellings of every name
// (`accessibilityLabel` and the `accessibility-label` an author may write). `unknown` rather than
// `any` keeps the openness from leaking an escape hatch into the rest of the file.
export interface ISymbioteHostAttributes {
  // The one attribute with a definite type, and the one the miss-typing above actually breaks:
  // our own components emit `<view p={bag}>`, and `ShimElement`'s `p` setter is the single seam
  // every prop reaches the engine through.
  p?: IShimPropBag;
  [attribute: string]: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace svelteHTML {
    // DERIVED from the intrinsic union, so a new host tag becomes valid markup in the commit that
    // registers its Fabric name. A hand-written twin cannot report a name missing from itself.
    //
    // This reaches the 17 tags svelte2tsx does not already name. It CANNOT reach the other four:
    // an own member of a merged interface beats an inherited one, so svelte2tsx's explicit
    // `view: HTMLProps<'view', SVGAttributes>` wins over this base and the augmentation is
    // silently inert on exactly the names that need it. Measured — svelte-check stayed at 5
    // errors with only this half in place, while the file count moved 635 -> 636, which is what
    // said the declaration was LOADED and merely outranked rather than unreachable.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends Record<
      ISymbioteIntrinsic,
      ISymbioteHostAttributes
    > {}

    // The other four — `view`, `text`, `image`, `switch` are real SVG element names, so they ARE
    // own members above and have to be reached through the seam svelte2tsx leaves open for it:
    // its entries are `HTMLProps<'view', SVGAttributes>`, i.e.
    // `Omit<SvelteHTMLElements['view'], keyof SVGAttributes> & SVGAttributes`, and `SVGAttributes`
    // is declared there as an empty interface with the comment "in case someone enhanced the
    // typings". Enhancing it is what this is.
    //
    // The index signature is load-bearing rather than lazy: it makes `keyof SVGAttributes`
    // `string | number`, so the `Omit` erases the SVG surface completely and the tag is left with
    // OURS instead of ours-plus-SVG's. Blunt in that it reaches every SVG tag, which is the price
    // and is free here — an RN app has no SVG elements, and svelte2tsx names this interface in no
    // other position.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface SVGAttributes extends ISymbioteHostAttributes {}

    // And the HTML half, for the same reason and through the same seam. `button` is a real HTML
    // element name, so svelte2tsx owns it as `HTMLProps<'button', HTMLAttributes>` and the derived
    // base above is outranked exactly as it is for the four SVG names. `HTMLAttributes` is the
    // second empty interface its own comment offers for enhancement, one line above `SVGAttributes`
    // in `svelte-jsx-v4.d.ts` — so the tag alphabet was never limited to SVG-named and hyphenated
    // members; nobody had needed the other half yet.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface HTMLAttributes extends ISymbioteHostAttributes {}
  }
}

// Re-exported from the barrel so the declaration above is LOADED by a consumer. A `.d.ts` that
// nothing imports applies inside this package only — the failure React's `src/jsx.d.ts` shipped
// with for months (symbiote-primitive-tags, "The React arm was BUILT").
export type ISymbioteIntrinsicTag = ISymbioteIntrinsic;
