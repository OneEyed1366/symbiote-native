// The package's own JSX namespace — what an app points `jsxImportSource` at:
//
//   // tsconfig.json
//   "jsx": "preserve",
//   "jsxImportSource": "@symbiote-native/solid"
//
// TypeScript resolves the namespace from `<jsxImportSource>/jsx-runtime` and NOTHING ELSE. That
// holds under `jsx: "preserve"` too, which is easy to doubt — the flag is documented as naming the
// module the `jsx`/`jsxs` factories are imported from, and `preserve` imports nothing. Measured:
// pointing jsxImportSource at a package that does not exist fails with
// `TS2875: This JSX tag requires the module path '<source>/jsx-runtime' to exist`, on a config
// whose `jsx` is `preserve`. So the entry is type-only by nature — the emitted build/jsx-runtime.js
// is empty and never imported by anything, because babel-preset-solid rewrites JSX into calls on
// ./renderer instead (that is the `moduleName` option, a separate mechanism from this one).
//
// WHY OUR OWN NAMESPACE AND NOT AN AUGMENTATION OF SOLID'S. `@lightningtv/solid` (3.2.5), the
// most widely used universal renderer on a non-DOM host, ships exactly
// `declare module 'solid-js' { namespace JSX { interface IntrinsicElements { … } } }` plus
// `export type { JSX } from 'solid-js'`. That re-export is genuinely all it takes to make the
// entry resolvable, and it is what this package's own src/jsx.ts did before this file replaced it.
// It buys one thing: an app stops needing a `/// <reference types="@symbiote-native/solid" />` line
// to pull the augmentation into its program. It does NOT buy the other two, and both matter more:
//
//   1. Augmenting MERGES into solid-js's own IntrinsicElements, which lists every HTML and SVG
//      tag. `<div>` stays valid JSX in a React Native app and fails at runtime, not at compile
//      time. Declaring the interface fresh here is what makes an unknown tag an error.
//   2. solid-js's `JSX.Element` is `Node | ArrayElement | (string & {}) | number | boolean | null
//      | undefined`, and `Node` is a DOM type. A React Native program has no DOM lib (this repo:
//      `lib: ["ES2022"]`; the canary: RN's own config, equally DOM-less), so the name does not
//      resolve — and `skipLibCheck: true` SUPPRESSES that error inside solid-js's .d.ts rather
//      than surfacing it, leaving `Node` as `any`. One `any` in a union collapses the whole union,
//      so `JSX.Element` is `any` and every JSX child position in every consuming app goes
//      unchecked. Measured two ways: `const bogus: JSX.Element = { definitelyNotAnElement: true }`
//      compiles, and `const node: Node = …` in a first-party file (not skipLibCheck'd) reports
//      `TS2304: Cannot find name 'Node'`.
//
// The risk this trades against — recorded when the swap was deferred — is that our `Element` has
// to line up with what solid-js's own `<Show>` / `<For>` return. It does, for a reason that only
// holds because of point 2 above: those return solid's `JSX.Element`, which IS `any` in exactly the
// DOM-less programs we target, so it is assignable to anything of ours. jsx-runtime.test.tsx pins
// the runtime half (both compose through this renderer and re-render on a signal); the type half is
// carried by examples/solid's own `tsc --noEmit`. The one configuration that would break the
// alignment is an app that pulls in the DOM lib, giving solid's `Element` a real `Node` — recorded
// in `.claude/rules/solid-jsx-namespace.md`.

import type { ISymbioteIntrinsic } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';

// A flat bag, matching what routeProp actually accepts: it decides prop-vs-event per the node's
// ViewConfig at runtime, so there is no statically-known attribute set to enumerate. Values stay
// `unknown` rather than `any` — an index signature of `unknown` accepts any attribute without
// handing the rest of the file an escape hatch.
//
// This is the PLUMBING type, not the public API: apps use the typed components (`View`, `Text`, …)
// whose props are the real contract. Raw intrinsics are what those components and the Descriptor
// bridge emit.
type ISymbioteHostAttributes = {
  readonly children?: JSX.Element;
  readonly [attribute: string]: unknown;
};

// The member names below are TypeScript's, not ours — the compiler looks up `Element`,
// `IntrinsicElements`, `ElementChildrenAttribute` and friends by exact name, so the repo's
// `I`-prefix convention cannot apply to them. `IArrayElement` is our own helper and does carry it.
//
// The shape is equally the compiler's. A `namespace` is the only container it will read a JSX
// contract out of, several members are REQUIRED to exist while having nothing to declare, and
// `children: {}` has to stay the wide `{}` because it names the property, not its type. So both
// rules below are disabled by the contract rather than by preference, and only inside it —
// solid-js's own jsx.d.ts carries the same empty declarations for the same reason.
/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
export namespace JSX {
  // Mirrors solid-js's own union with the one substitution that matters: our committed host node
  // in place of the DOM's `Node`. `(string & {})` is solid's trick for accepting any string while
  // keeping literal types from widening at the use site.
  export type Element =
    | ISymbioteNode
    | IArrayElement
    | IFunctionElement
    | (string & {})
    | number
    | boolean
    | null
    | undefined;

  export interface IArrayElement extends Array<Element> {}

  // solid-js DECLARES this shape and then leaves it out of its own `Element` union. We put it in,
  // because our components hand `insert` a bare accessor by hand — `Pressable`'s zero-argument
  // child branch returns one so `insert` wraps it in its own render effect (the arity guard in
  // components/pressable.tsx). Without this member that line does not type-check; solid-js only
  // gets away with the omission because its accessors are emitted by the compiler, never written.
  //
  // It does NOT cost the contextual typing of a render prop, which was the fear: a children type of
  // `Element | ((state: Accessor<IPressState>) => Element)` now holds TWO function shapes, but they
  // differ in arity, and TypeScript picks the contextual signature by parameter count. Measured —
  // `{state => state().pressed}` with no annotation resolves `state` to `Accessor<IPressState>`,
  // and a bogus field on it reports `Property 'x' does not exist on type 'IPressState'`.
  export interface IFunctionElement {
    (): Element;
  }

  // Deliberately empty, exactly as solid-js leaves them: this adapter has no class components and
  // no props-bearing marker interface, and TypeScript requires the names to exist regardless.
  export interface ElementClass {}
  export interface ElementAttributesProperty {}

  export interface ElementChildrenAttribute {
    children: {};
  }

  // `key`, `ref` and friends are ordinary props here — routeProp sorts them at runtime — so there
  // is nothing to declare as universally-available.
  export interface IntrinsicAttributes {}

  // The tag union comes from @symbiote-native/components rather than being retyped, so a new host
  // tag becomes valid JSX in the same commit that registers its Fabric name — no second list to
  // forget. Declared FRESH (not merged into solid-js's HTML list), which is what makes `<div>` an
  // error in a React Native app.
  export interface IntrinsicElements extends Record<
    ISymbioteIntrinsic,
    ISymbioteHostAttributes
  > {}
}
/* eslint-enable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-object-type */
