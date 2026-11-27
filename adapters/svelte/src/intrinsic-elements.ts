// The tag alphabet, declared to svelte-check and the language server
// Without it `<view p={…}>` is checked against svelte/elements' SVG `<view>` and `p` is MISTYPED

// Not fixed here: the type of an element ref, which svelte2tsx bakes from `lib.dom` tag maps
// So the four SVG-named tags hand back an SVG element type and the other 17 fall through to `any`
import type {
  ISymbioteIntrinsic,
  ICrossTypedIntrinsics,
} from '@symbiote-native/components';
import type { ICrossedPrimitiveProps } from './crossed-primitive-props';
import type { IHostPropBag } from './element-props';

// Open by construction, as the renderer hands every key to `routeProp`
// It splits prop from event per the ViewConfig at RUNTIME, so there is no static key set to list
export type ISymbioteHostAttributes = {
  // The one attribute with a definite type, `setHostPropBag` is the seam every prop goes through
  p?: IHostPropBag;
  [attribute: string]: unknown;
};

// A crossed type has no index signature, so `p` is added back, and a field may arrive only in `p`
// Svelte 5 also lowercases plain attributes (`testID` -> `testid`), restored at runtime
type IWithSvelteAttributeRealities<Props> = Partial<Props> & {
  p?: IHostPropBag;
} & {
  [K in keyof Props as K extends string ? Lowercase<K> : never]?: Props[K];
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace svelteHTML {
    // Derived from the intrinsic union, so a new host tag is valid markup with its Fabric name
    // It cannot reach `view`, `text`, `image`, `switch` and `button`, as svelte2tsx owns them
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ICrossTypedIntrinsics<
      ISymbioteHostAttributes,
      {
        [K in keyof ICrossedPrimitiveProps]: IWithSvelteAttributeRealities<
          ICrossedPrimitiveProps[K]
        >;
      }
    > {}

    // The seam svelte2tsx leaves open for SVG-named tags, an empty interface made to be enhanced
    // The index signature makes its `Omit` erase the SVG surface, which an RN app never uses
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface SVGAttributes extends ISymbioteHostAttributes {}

    // The same seam for `button`, a real HTML name that svelte2tsx owns as `HTMLProps`
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface HTMLAttributes extends ISymbioteHostAttributes {}
  }
}

// Re-exported from the barrel so a consumer LOADS the declaration above
// A `.d.ts` that nothing imports applies inside this package only
export type ISymbioteIntrinsicTag = ISymbioteIntrinsic;
