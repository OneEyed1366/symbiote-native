---
paths:
  - 'adapters/solid/**'
  - 'examples/solid/**'
---

# The Solid adapter owns its JSX namespace — and the reason is a silent `any`

`@symbiote-native/solid` ships `./jsx-runtime` (`src/jsx-runtime.ts`), and both the adapter and the
canary set `"jsxImportSource": "@symbiote-native/solid"`. Do not augment `solid-js`'s JSX namespace
instead, and do not reintroduce a `/// <reference types="@symbiote-native/solid" />` line in an app —
that shim existed only until this entry did.

## The trap that motivated it: `JSX.Element` is `any` under solid-js's namespace

solid-js declares

```ts
type Element = Node | ArrayElement | (string & {}) | number | boolean | null | undefined;
```

`Node` is a DOM type. A React Native program has no DOM lib (this repo: `lib: ["ES2022"]`; the
canary: RN's own config). So the name does not resolve — and `skipLibCheck: true` **suppresses**
that error inside solid-js's `.d.ts` instead of surfacing it, leaving `Node` as `any`. One `any` in
a union collapses the union, so `JSX.Element` is `any`, and **every JSX child position in every
consuming file goes unchecked**.

Nothing reports this. Measured 2026-08-17, two independent ways:

```ts
const bogus: JSX.Element = { definitelyNotAnElement: true }; // compiles → Element is any
const node: Node = { alsoNotANode: true }; // TS2304: Cannot find name 'Node'
```

The second line is in a first-party file, which is not `skipLibCheck`'d — same missing name, error
this time. The visible symptom was smaller than the cause: `Pressable`'s render-prop child needed an
explicit `(state: Accessor<IPressState>)` annotation, because a contextual type of `any` gives no
signature to infer from and `noImplicitAny` fires TS7006.

## What the entry has to contain

TypeScript resolves the namespace from `<jsxImportSource>/jsx-runtime` and nowhere else, **including
under `jsx: "preserve"`** — easy to doubt, since the flag is documented for `react-jsx` and
`preserve` imports nothing. Pointing it at a nonexistent package proves it:

```
error TS2875: This JSX tag requires the module path '<source>/jsx-runtime' to exist
```

So the entry is type-only by nature: the emitted `build/jsx-runtime.js` is `export {};` and nothing
ever imports it. JSX becomes calls on `./renderer` via babel-preset-solid's `moduleName`, which is a
separate mechanism — do not conflate the two.

Write it as a `.ts` module, never `src/jsx-runtime.d.ts`: tsc does not copy declaration INPUTS to
`outDir`, so a `.d.ts` type-checks in-repo and is then missing from the published `build/`. The
prior art in `wolf-tui/packages/solid/src/jsx.d.ts` has exactly that bug — `build/jsx.d.ts` does not
exist, so its host tags are untyped for any consumer of the built package.

## Where it deliberately diverges from the ecosystem

`@lightningtv/solid` (3.2.5), the most widely used universal renderer on a non-DOM host, ships

```ts
declare module 'solid-js' { namespace JSX { interface IntrinsicElements { node: NodeProps; … } } }
export type { JSX } from 'solid-js';
```

That re-export is genuinely all it takes to make the entry resolvable, and it removes the app's
reference line. It does **not** fix the two things that matter more, so we declare the namespace
fresh instead:

1. Augmenting MERGES into solid-js's `IntrinsicElements`, which lists every HTML and SVG tag —
   `<div>` stays valid JSX in a React Native app and fails at runtime. A fresh interface makes it
   `TS2339: Property 'div' does not exist on type 'JSX.IntrinsicElements'`.
2. It inherits the `any` collapse above.

Our `Element` swaps the DOM's `Node` for `ISymbioteNode` and — unlike solid-js — **keeps
`IFunctionElement` (`() => Element`) in the union**. solid-js declares that shape and then omits it,
which it gets away with because its accessors are compiler-emitted; ours are hand-written
(`Pressable`'s zero-arity child branch returns one). The omission would fail that line. Including it
costs nothing: a children type holding two function shapes still contextually types, because they
differ in ARITY and TypeScript picks the signature by parameter count — verified, `{state => …}`
resolves `state` to `Accessor<IPressState>` with no annotation.

## The one condition that would break composition

`<Show>` / `<For>` are typed against solid-js's `Element` and cannot know about ours. They compose
only because solid's is `any` in a DOM-less program. **An app that pulls in the DOM lib gives solid's
`Element` a real `Node`, and the two stop lining up.** That break is type-level and no test in this
repo can see it — `src/jsx-runtime.test.tsx` pins only the runtime half (both compose through the
renderer and update on a signal), and the type half rides on `examples/solid`'s `tsc --noEmit`.
If a canary ever needs `lib: ["DOM"]`, re-check this first.

## Verifying a change here

Type-level claims need a probe, because everything about this failure mode is silent:

```sh
# from examples/solid — each must produce the named error, not silence
echo 'export const P = () => <div />;' > probe.tsx            # TS2339 'div'
# and inside a render prop, with NO annotation:
#   state().nopeNotAField  → TS2339 … on type 'IPressState'   (not "implicitly any")
```

Run `tsc` raw (`./node_modules/.bin/tsc --noEmit`) when reading output closely, and never read the
exit code off the end of a pipeline — `$?` there belongs to `tail`, not to `tsc`.
