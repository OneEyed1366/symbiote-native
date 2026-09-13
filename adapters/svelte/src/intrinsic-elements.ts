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
import type {
  ISymbioteIntrinsic,
  ICrossTypedIntrinsics,
} from '@symbiote-native/components';
import type { IShimPropBag } from './dom-shim/element';
import type { IViewProps } from './components/view-props';
import type { ITextProps } from './components/text-props';
import type { IImageProps } from './components/image/image-props';
import type { IImageBackgroundProps } from './components/image-background-props';
import type { IPressableProps } from './components/pressable/pressable-props';
import type { IButtonProps } from './components/button-props';
import type { IActivityIndicatorProps } from './components/activity-indicator-props';
import type { ISafeAreaViewProps } from './components/safe-area-view-props';
import type { IRefreshControlProps } from './components/refresh-control-props';
import type { ITouchableOpacityProps } from './components/touchable-opacity/touchable-opacity-props';
import type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback/touchable-without-feedback-props';
import type { ITouchableHighlightProps } from './components/touchable-highlight/touchable-highlight-props';
import type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback/touchable-native-feedback-props';
import type { IScrollViewProps } from './components/scroll-view/scroll-view-props';
import type { ISwitchProps } from './components/switch/switch-props';
import type { ITextInputProps } from './components/text-input/text-input-props';
import type { IModalProps } from './components/modal/modal-props';
import type { IInputAccessoryViewProps } from './components/input-accessory-view/input-accessory-view-props';

// Open by construction, not by laziness: the shim hands every key to the engine's `routeProp`,
// which decides prop-vs-event per the node's ViewConfig at RUNTIME. There is no statically-known
// attribute set to enumerate, and a closed one would have to carry both spellings of every name
// (`accessibilityLabel` and the `accessibility-label` an author may write). `unknown` rather than
// `any` keeps the openness from leaking an escape hatch into the rest of the file.
//
// This is the FALLBACK for a tag with no real prop type yet (`sticky-header`,
// `horizontal-scroll-view`, …) — every other tag below is crossed to its real type instead, the
// same split Vue/React/Solid already have (`<prop_types_split_agnostic_vs_per_adapter>`,
// CLAUDE.md). Before this cross-typing pass EVERY tag used this bag, including `pressable` —
// which is why `style={({ pressed }) => …}` on a bare `<pressable>` reported `pressed` as
// implicitly `any` (TS7031): a callback assigned to an `unknown`-typed prop gives the checker
// nothing to infer the parameter from. Crossing `pressable` to its real `IPressableProps` (whose
// `style` is typed `IStyleProp | ((state: IPressState) => IStyleProp)`) is what fixes it.
export interface ISymbioteHostAttributes {
  // The one attribute with a definite type, and the one the miss-typing above actually breaks:
  // our own components emit `<view p={bag}>`, and `ShimElement`'s `p` setter is the single seam
  // every prop reaches the engine through.
  p?: IShimPropBag;
  [attribute: string]: unknown;
}

// Every tag with a real, non-generic prop type today - mirrors Vue's/Solid's `ICrossedPrimitiveProps`
// (`ICrossTypedIntrinsics`, `@symbiote-native/components`). `FlatList`/`SectionList`/
// `VirtualizedList`/`KeyboardAvoidingView` are absent: composed from several intrinsics, never a
// single tag an app writes. `view`/`text`/`image`/`switch` are crossed too but inert here - real
// SVG element names, so svelte2tsx's own `HTMLProps<'view', SVGAttributes>` still outranks this
// base; only the `SVGAttributes` escape hatch below actually reaches them.
export interface ICrossedPrimitiveProps {
  view: IViewProps;
  text: ITextProps;
  pressable: IPressableProps;
  button: IButtonProps;
  image: IImageProps;
  'image-background': IImageBackgroundProps;
  'input-accessory-view': IInputAccessoryViewProps;
  'refresh-control': IRefreshControlProps;
  'safe-area-view': ISafeAreaViewProps;
  'touchable-native-feedback': ITouchableNativeFeedbackProps;
  'touchable-opacity': ITouchableOpacityProps;
  'touchable-highlight': ITouchableHighlightProps;
  'touchable-without-feedback': ITouchableWithoutFeedbackProps;
  'scroll-view': IScrollViewProps;
  switch: ISwitchProps;
  'text-input': ITextInputProps;
  modal: IModalProps;
  'activity-indicator': IActivityIndicatorProps;
}

// Three gaps a real per-tag type exposes that the open bag hid, found via svelte-check against a
// locally-published build (2026-09-14):
//
// 1. `p={{ ... }}` (`ISymbioteHostAttributes.p` above) is legitimate on every intrinsic, crossed
//    or not - `NumberStepper.svelte`/`CanaryScreen.svelte` use it directly on `pressable`/
//    `text-input`/`refresh-control`/`scroll-view`/`touchable-highlight`, and
//    `IRefreshControlProps.onRefresh` is documented to ride it ("the idiomatic Svelte 5 callback
//    prop pattern", its own file header). A crossed type has no index signature to fall through
//    to, so `p` needs adding back explicitly or those call sites report `"p" does not exist`.
// 2. Svelte 5 removed `namespace: 'foreign'` (svelte2tsx's switch for `preserveAttributeCase`).
//    Without it, both svelte2tsx's check codegen and the real compiler lowercase every plain
//    (non-`on*`) attribute name on a lowercase-tag element - verified directly:
//    `<pressable testID={x}>` compiles to `$.set_attribute(pressable, 'testid', x)`.
//    `dom-shim/element.ts`'s `setAttribute` already repairs this at runtime
//    (`CANONICAL_BY_LOWER.get(name) ?? name`); the types didn't, so `testID`/`hitSlop` reported as
//    `"testid"`/`"hitslop"` not existing. Adding the lowercase spelling as an extra optional key
//    mirrors that runtime table - harmless on event handlers (`onPress`), which Svelte never
//    lowercases (it reads `on*` as an event binding, case preserved).
// 3. A required field (`IRefreshControlProps.refreshing`) can also arrive only through `p`
//    (`<refresh-control p={{ refreshing, onRefresh, tintColor }} />`), which the checker can't see
//    into. Since `p` is a typed stand-in for any named field, no field is provably "present" any
//    more - `Partial` reflects that honestly; a wrong value type on a field given by name is still
//    caught.
type IWithSvelteAttributeRealities<Props> = Partial<Props> & {
  p?: IShimPropBag;
} & {
  [K in keyof Props as K extends string ? Lowercase<K> : never]?: Props[K];
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace svelteHTML {
    // DERIVED from the intrinsic union, so a new host tag becomes valid markup in the commit that
    // registers its Fabric name. A hand-written twin cannot report a name missing from itself.
    // Crossed to `ICrossedPrimitiveProps` above, so a typo'd prop on `pressable`/`scroll-view`/…
    // reports here too, the same as Vue's/Solid's own cross-typing.
    //
    // This reaches the tags svelte2tsx does not already name (everything but `view`/`text`/
    // `image`/`switch`/`button`). It CANNOT reach those five: an own member of a merged interface
    // beats an inherited one, so svelte2tsx's explicit `view: HTMLProps<'view', SVGAttributes>`
    // wins over this base and the augmentation is silently inert on exactly the names that need
    // it. Measured — svelte-check stayed at 5 errors with only this half in place, while the file
    // count moved 635 -> 636, which is what said the declaration was LOADED and merely outranked
    // rather than unreachable.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ICrossTypedIntrinsics<
      ISymbioteHostAttributes,
      {
        [K in keyof ICrossedPrimitiveProps]: IWithSvelteAttributeRealities<
          ICrossedPrimitiveProps[K]
        >;
      }
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
