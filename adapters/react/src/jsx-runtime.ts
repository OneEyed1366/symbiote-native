// The package's own JSX namespace — what an app points `jsxImportSource` at:
//
//   // tsconfig.json
//   "jsx": "react-jsx",
//   "jsxImportSource": "@symbiote-native/react"
//
// WHY IT EXISTS, and it is not ergonomics. `src/jsx.ts` declares our tags by MERGING into
// `declare module 'react'`, which is the only spelling available for somebody else's namespace —
// and a merge inherits every key `@types/react` already owns. `view`, `text`, `image` and `switch`
// are real SVG elements with entries there, so an un-prefixed tag of those names is a TS2717
// ("subsequent property declarations must have the same type") and the `symbiote-` prefix is what
// has been avoiding it. Declaring the interface FRESH here is what frees the short names.
//
// The Solid adapter reached the same place first and its file (`adapters/solid/src/jsx-runtime.ts`)
// carries the measurements — chiefly that TypeScript resolves the namespace from
// `<jsxImportSource>/jsx-runtime` and nothing else. Two differences here:
//
//   1. This entry is NOT type-only. `babel-preset-solid` rewrites JSX into renderer calls, so
//      Solid's emitted runtime is empty and never imported; React's factories are real, and an app
//      that points BABEL's importSource here too must find them. Re-exporting React's own is one
//      line and makes the module correct under either config.
//   2. Only `IntrinsicElements` is declared fresh. Every other member is React's own, re-exported.
//      Solid declares its whole namespace so that `<div>` becomes an error; doing that here is a
//      separate change with its own risk — React's `ElementType` is what admits a component at all,
//      and narrowing it wrongly makes every component call site fail. Today's `jsx.ts` merges into
//      React's table and therefore already accepts `<div>`, so re-exporting keeps that exactly as
//      it is rather than regressing it. Closing the DOM tags is its own task.
import type { ICrossTypedIntrinsics } from '@symbiote-native/components';
import type { Key } from 'react';
import type { IViewProps, ITextProps } from './components';
import type { IPressableProps } from './components/pressable/pressable-props';
import type { IButtonProps } from './components/button-props';
import type { IImageProps } from './components/image/image-props';
import type { IImageBackgroundProps } from './components/image-background-props';
import type { IInputAccessoryViewProps } from './components/input-accessory-view-props';
import type { IRefreshControlProps } from './components/refresh-control-props';
import type { ISafeAreaViewProps } from './components/safe-area-view-props';
import type { ITouchableNativeFeedbackProps } from './components/touchable-native-feedback/touchable-native-feedback-props';
import type {
  ITouchableOpacityProps,
  ITouchableHighlightProps,
} from './components/touchable/touchable-props';
import type { ITouchableWithoutFeedbackProps } from './components/touchable-without-feedback/touchable-without-feedback-props';
import type { IScrollViewProps } from './components/scroll-view/scroll-view-props';
import type { ISwitchProps } from './components/switch/switch-props';
import type { ITextInputProps } from './components/text-input/text-input-props';
import type { IModalProps } from './components/modal';
import type { IActivityIndicatorProps } from './components/activity-indicator-props';

export { Fragment, jsx, jsxs } from 'react/jsx-runtime';

// The loose host boundary for every tag without a dedicated prop type (`sticky-header`,
// `horizontal-scroll-view`, ...). Its index signature already accepts `key` and any other name;
// IWithKey below exists because a closed, crossed type doesn't get that for free.
interface IHostProps {
  style?: unknown;
  children?: import('react').ReactNode;
  [key: string]: unknown;
}

// Every tag with a real, non-generic prop type - mirrors Vue's/Solid's/Svelte's
// `ICrossedPrimitiveProps` (`ICrossTypedIntrinsics`, `@symbiote-native/components`).
// `FlatList`/`SectionList`/`VirtualizedList`/`KeyboardAvoidingView` are absent: composed from
// several intrinsics, never a single tag an app writes.
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

// TypeScript only auto-merges `JSX.IntrinsicAttributes` (the `key` field) into a value-based
// element's props, not into a crossed intrinsic - verified directly: a component under this same
// jsxImportSource accepts `key`, but a closed crossed type reports "Property 'key' does not exist".
// The loose bag above escapes this only because its index signature already accepts any name.
type IWithKey<Props> = Props & { key?: Key | null };

// The member names are TypeScript's own — the compiler looks each up by exact name — so the repo's
// `I`-prefix convention cannot apply inside this namespace.
/* eslint-disable @typescript-eslint/no-namespace */
export namespace JSX {
  export type ElementType = import('react').JSX.ElementType;
  export type Element = import('react').JSX.Element;
  export type ElementClass = import('react').JSX.ElementClass;
  export type ElementAttributesProperty =
    import('react').JSX.ElementAttributesProperty;
  export type ElementChildrenAttribute =
    import('react').JSX.ElementChildrenAttribute;
  export type LibraryManagedAttributes<C, P> =
    import('react').JSX.LibraryManagedAttributes<C, P>;
  export type IntrinsicAttributes = import('react').JSX.IntrinsicAttributes;
  export type IntrinsicClassAttributes<T> =
    import('react').JSX.IntrinsicClassAttributes<T>;

  // DERIVED from the intrinsic union rather than retyped, so a new host tag becomes valid JSX in
  // the commit that registers its Fabric name.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface IntrinsicElements extends ICrossTypedIntrinsics<
    IHostProps,
    { [K in keyof ICrossedPrimitiveProps]: IWithKey<ICrossedPrimitiveProps[K]> }
  > {}
}
/* eslint-enable @typescript-eslint/no-namespace */

// Off OUR namespace, not React's. It used to be `keyof import('react').JSX.IntrinsicElements`,
// which was every HTML and SVG tag plus ours; now it is the host tags alone.
export type ISymbioteIntrinsicTag = keyof JSX.IntrinsicElements;
