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
import type { ISymbioteIntrinsic } from '@symbiote-native/components';
import type { IViewProps, ITextProps } from './components';

export { Fragment, jsx, jsxs } from 'react/jsx-runtime';

// The loose host boundary, and the strict pair, exactly as `jsx.ts` derives them — same reasoning,
// same `Omit`, because an interface may not narrow an inherited member. See that file for why the
// strictness lives on the crossed primitives only.
interface IHostProps {
  style?: unknown;
  children?: import('react').ReactNode;
  [key: string]: unknown;
}

type ILooseIntrinsics = Omit<
  Record<ISymbioteIntrinsic, IHostProps>,
  'symbiote-view' | 'symbiote-text'
>;

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
  // the commit that registers its Fabric name. The hand-written twin of this list had fallen four
  // names behind before it was derived (`jsx.ts` records it).
  export interface IntrinsicElements extends ILooseIntrinsics {
    'symbiote-view': IViewProps;
    'symbiote-text': ITextProps;
  }
}
/* eslint-enable @typescript-eslint/no-namespace */
