// The package's own JSX namespace — what an app points `jsxImportSource` at:
//
//   // tsconfig.json
//   "jsx": "preserve",
//   "jsxImportSource": "@symbiote-native/vue"
//
// WHY OUR OWN NAMESPACE AND NOT PLAIN `"vue"`. `vue/jsx-runtime` types `IntrinsicElements` off
// `NativeElements` (`@vue/runtime-dom`) — the real BROWSER DOM/SVG tag table. `view`, `text`,
// `image` and `switch` are real SVG element names there, so pointing `jsxImportSource` at plain
// `"vue"` types every bare `<view>`/`<text>` as an SVG element (`SVGAttributes & ReservedProps`,
// with no `testID`), not as ours — same TS2717-shaped collision `adapters/react/src/jsx-runtime.ts`
// and `adapters/solid/src/jsx-runtime.ts` both document for their own tag alphabets. A namespace
// declared fresh here is what frees the short names.
//
// TYPE-ONLY, unlike React's: `@vue/babel-plugin-jsx` (wired in every app's babel.config.js via
// `@symbiote-native/vue/babel-jsx`) rewrites every JSXElement into an `h()` call directly and never
// consults `jsxImportSource` — so the emitted `build/jsx-runtime.js` is empty and nothing imports
// it at runtime. TypeScript still requires the module path to exist under `<jsxImportSource>/jsx-
// runtime` (`jsx: "preserve"` included — see `adapters/solid/src/jsx-runtime.ts`'s own measurement),
// which is the whole reason this file exists.
import type { VNode } from '@vue/runtime-core';
import type { ICrossTypedIntrinsics } from '@symbiote-native/components';
import type { IViewProps } from './components/view-props';
import type { ITextProps } from './components/text-props';
import type { IPressableProps } from './components/pressable-props';
import type { IButtonProps } from './components/button-props';
import type { IImageProps } from './components/image-props';
import type { IImageBackgroundProps } from './components/image-background-props';
import type { IInputAccessoryViewProps } from './components/input-accessory-view-props';
import type { IRefreshControlProps } from './components/refresh-control-props';
import type { ISafeAreaViewProps } from './components/safe-area-view-props';
import type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback-props';
import type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
} from './components/touchable-props';
import type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback-props';
import type { IScrollViewProps } from './components/scroll-view/scroll-view-props';
import type { ISwitchProps } from './components/switch/switch-props';
import type { ITextInputProps } from './components/text-input/text-input-props';
import type { IModalProps } from './components/modal';
import type { IActivityIndicatorProps } from './components/activity-indicator-props';

export {};

// Every tag with a real, non-generic per-adapter prop type today. Kept as ONE named map (rather
// than inlined into `IntrinsicElements` below) so `intrinsic-elements.ts` can derive its own
// `IDefineIntrinsic`-wrapped version from the SAME list for Volar/`.vue` SFCs — one place records
// which tags are crossed, not two. `FlatList`/`SectionList`/`VirtualizedList` are deliberately
// absent: they are composed components built from several intrinsics (`scroll-view` + many
// `view`/`text` children), never a single tag an app writes, and their prop types are generic
// (`<ItemT>`), which a non-generic `Record<ISymbioteIntrinsic, …>` cannot hold anyway.
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

// Open by construction, matching `intrinsic-elements.ts`'s `ISymbioteHostAttributes`: `routeProp`
// decides prop-vs-event per the node's ViewConfig at RUNTIME, so there is no statically-known
// attribute set to enumerate for a tag with no dedicated prop type yet.
interface IHostAttributes {
  [attribute: string]: unknown;
}

// The member names below are TypeScript's own — the compiler looks each up by exact name — so the
// repo's `I`-prefix convention cannot apply inside this namespace.
/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
export namespace JSX {
  export interface Element extends VNode {}
  export interface ElementClass {
    $props: {};
  }
  export interface ElementAttributesProperty {
    $props: {};
  }
  // Kept open (not just `key`, unlike React's) so a component still forwarding props through
  // Vue's `$attrs` fallthrough with no declared schema does not read as an excess-property error
  // in TSX — `.vue` SFCs never hit this because the template compiler doesn't excess-property-check
  // against JSX's `IntrinsicAttributes` at all. Measured: this index signature does NOT blunt the
  // per-tag checking below — TS checks `view`'s own attributes against `IViewProps` directly, and
  // an unknown key there (`definitelyNotAProp`) still reports TS2322, not silently swallowed. The
  // `key` field here matters ONLY for value-based (component, e.g. `<ActionButton>`) elements —
  // TypeScript's JSX algorithm never intersects `IntrinsicAttributes` into a string-named intrinsic
  // element's checked type, so `key`/`ref` on `<pressable key={x}>` need to come from the crossed
  // prop type ITSELF (`IWithJsxAttrs` below), not from here.
  export interface IntrinsicAttributes {
    key?: string | number | symbol;
    [name: string]: unknown;
  }
  // `key` and `ref` are NOT admitted by `IntrinsicAttributes` above for a string-named (intrinsic)
  // element — that interface's merge only reaches value-based/component elements. Measured
  // 2026-09-13: `<pressable key={x} .../>` inside a `.map()` reported `Property 'key' does not
  // exist` the moment `pressable` was crossed to a real (non-index-signature) type. `IViewProps`/
  // `ITextProps` happen to declare `key`/`ref` themselves (predating this cross-typing pass); the
  // other 16 do not. Adding both HERE, once, generically, is what lets every crossed prop type stay
  // exactly what the adapter exports — no duplicate `key?`/`ref?` fields to keep in step across 18
  // files, and no risk of a 19th tag joining the map without them.
  type IWithJsxAttrs<Props> = Props & {
    key?: string | number | symbol;
    ref?: import('@vue/runtime-core').VNodeRef;
  };

  // DERIVED from the intrinsic union via the shared `ICrossTypedIntrinsics` recipe
  // (`@symbiote-native/components` — the same shape `intrinsic-elements.ts` below instantiates for
  // Volar), crossed to `ICrossedPrimitiveProps` above — every tag with a real, non-generic prop
  // type today, not just `view`/`text`/`pressable` — so a new host tag stays valid JSX in the same
  // commit that registers its Fabric name, no second list to keep in step. `children` is
  // deliberately NOT added to any of those prop types (Vue's shared convention: they take children
  // on their own channel) — `IntrinsicAttributes`'s index signature above is what admits a child
  // position here without touching the exported adapter types. Crossing `pressable` (and every
  // other primitive whose `style` takes a state callback) is also what lets
  // `style={({ pressed }) => …}` infer `pressed` from `IPressableProps['style']`'s
  // `(state: IPressState) => …` branch — no per-call-site `({ pressed }: { pressed: boolean })`
  // annotation needed.
  export interface IntrinsicElements extends ICrossTypedIntrinsics<
    IHostAttributes,
    {
      [K in keyof ICrossedPrimitiveProps]: IWithJsxAttrs<
        ICrossedPrimitiveProps[K]
      >;
    }
  > {}
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */

export type ISymbioteIntrinsicTag = keyof JSX.IntrinsicElements;
