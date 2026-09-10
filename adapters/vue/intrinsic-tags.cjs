// Every tag both Vue compilers must treat as an ELEMENT rather than as a component to resolve.
//
// Vue decides element-vs-component in two unrelated places — `@vue/compiler-sfc`'s
// `isCustomElement` and `@vue/babel-plugin-jsx`'s option of the same name — so the answer has to
// come from one set or the two paths drift. That drift is not loud: a tag Vue takes for a component
// compiles to `resolveComponent("text-input")` with its children as a slot the element path never
// reads, which renders a blank subtree with no error.
//
// DERIVED, never enumerated. Until 2026-09-07 this was the prefix test `tag.startsWith('symbiote-')`
// in ./babel-jsx.cjs — correct while every intrinsic carried that marker, and answering FALSE for
// every tag since the prefix was dropped (`core/components/src/component-names/shared.ts` says why
// it went). What hid it is the tag alphabet: `view` / `text` / `image` / `switch` are real SVG
// element names, so both compilers resolve those four as elements with no configuration at all, and
// only the hyphenated half degraded.
//
// SCOPE, stated because it is smaller than `ISymbioteIntrinsic`. That union also holds
// `scroll-view`, `modal`, `activity-indicator` and the rest, but it is a TypeScript type and these
// consumers are Babel/Metro plugins that run before TS exists. `HOST_PRIMITIVES` is the only
// runtime-readable table reachable from here, so a hand-written `<scroll-view>` still resolves as a
// component. Closing that needs a CJS intrinsic table in `core/components`.
//
// WHAT THAT GAP COSTS, measured 2026-09-11 rather than reasoned, because the first guess was that
// the tag simply would not work. It works: `resolveComponent` falls back to the tag STRING, and
// `normalizeChildren` then unwraps the `withCtx` default slot for an element shapeFlag, so
// `<scroll-view><text>hi</text></scroll-view>` committed `RCTView > RCTScrollView > RCTText >
// RCTRawText`. What it costs is a dev-mode `[Vue warn]: Failed to resolve component: scroll-view`
// on every such element plus the component codegen path (a slot closure per element) instead of
// `_createElementBlock`. That is a divergence from every other tag, so `ScrollView`,
// `TouchableOpacity` and `TouchableHighlight` stay COMPONENTS on Vue until their
// `HOST_PRIMITIVES` entries land — and `intrinsic-elements.ts` already types all three as valid
// markup off `ISymbioteIntrinsic`, so vue-tsc accepts what the runtime compiler warns about.
//
// The tell that the three are still wrapped rather than merely unlisted: `src/register.ts` does
// NOT call their behaviors, because a registered behavior plus a surviving wrapper is two owners
// on one node. Those two facts move together or not at all.
//
// .cjs, and its own file rather than a copy in each consumer: two transforms carrying one
// derivation is the drift the shared spec exists to prevent.

const {
  HOST_PRIMITIVES,
} = require('@symbiote-native/components/host-primitives');

// BOTH tags a spec entry can emit. A primitive with an `intrinsicWhen` selects between two native
// views by one prop, so its second intrinsic is as hand-writable as its first.
module.exports = new Set(
  Object.values(HOST_PRIMITIVES).flatMap(entry =>
    entry.intrinsicWhen === undefined
      ? [entry.intrinsic]
      : [entry.intrinsic, entry.intrinsicWhen.intrinsic],
  ),
);
