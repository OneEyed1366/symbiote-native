// A ref must not narrow what an app can do, and on this adapter one refusal is the whole reason it
// does not.
//
// The hazard, asked as a capability rather than a shape (`.claude/rules/adapter-parity-audit.md`):
// can app code reach `clear()` from what Svelte handed it? On the COMPONENT path yes — the wrapper
// exports the five `ITextInputHandle` methods as instance-script functions, which is Svelte 5's
// mechanism for an imperative handle. On a LOWERED element there is no component instance, and
// `bind:this` yields the ShimElement whose engine node carries only focus/blur/measure/
// setNativeProps — `clear`, `isFocused` and `setSelection` are simply absent.
//
// Both are fine today because `bind:this` REFUSES lowering outright: an element that takes a ref
// always stays a component. So the narrowing is unreachable, and this file is what keeps it that
// way — the refusal is load-bearing API surface, not an implementation detail, and relaxing it
// (Solid narrows its own refusal to a single tag) would silently drop three methods from every
// call site that takes a ref.
//
// Parameterised over the spec rather than a hand-written list: a primitive added later inherits the
// guard instead of needing to be remembered.
import { describe, expect, it } from 'vitest';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { lowerHostPrimitives } from './lower-host-primitives';

const NAMES = Object.keys(HOST_PRIMITIVES);

const INTRINSICS = new Set(
  Object.values(HOST_PRIMITIVES).flatMap(primitive =>
    [primitive.intrinsic, primitive.intrinsicWhen?.intrinsic].filter(
      (tag): tag is string => tag !== undefined,
    ),
  ),
);

function lowered(markup: string): string | undefined {
  const source = `<script>\n  import { ${NAMES.join(', ')} } from '@symbiote-native/svelte';\n</script>\n${markup}`;
  const out =
    lowerHostPrimitives().markup({ content: source, filename: 'Ref.svelte' })
      ?.code ?? source;
  // Set membership, not containment: these tags are a prefix family and a substring test matches a
  // sibling (see the dom-shim skill, §41).
  for (const match of out.matchAll(/<(symbiote-[a-z-]+)/g))
    if (INTRINSICS.has(match[1])) return match[1];
  return undefined;
}

// The SPREAD refusal is UNIVERSAL here, and two earlier readings of why were both wrong.
//
// `unreadableAttributeSet` exists because a transform cannot enumerate `{...bag}` and so cannot fold
// `id` -> `nativeID` in it. That reason has never applied here: this adapter folds in the shim,
// which sees the merged object, and `host-fold-parity.test.ts` measures a spread's committed payload
// as byte-identical to the wrapper's.
//
// The second reading — keep it, scoped to `observesState`, because a spread can hide a FUNCTIONAL
// `style` the compile-time split must see — was right when it was written and expired on
// 2026-09-01, when `routeProp` learned to resolve a callback `style` at both values of `pressed`
// (`isStyleCallback`, core/engine/src/node.ts). Re-measured through the bag on the same day:
//
//   p={{ ...bag }}  with bag.style = ({pressed}) => ({opacity: …})   ->  { testID, opacity: 1 }
//
// So the split is an optimisation now, not the mechanism, and that rationale is dead too.
//
// WHAT KEEPS THE REFUSAL is the hazard both readings mentioned in passing and neither measured: a
// `children` SNIPPET arriving through the bag. Measured both arms, on a STATELESS primitive:
//
//   <View {...bag}>                 component   the child COMMITS
//   <symbiote-view p={{ ...bag }}>  lowered     the child is absent, nothing red
//
// A bag key is routed through `routeProp`; a snippet is not markup there, so the subtree simply
// never mounts. That hazard has nothing to do with press state, which is why this suite asserts
// EVERY primitive and not just the stateful ones — narrowing the refusal to `observesState`, as the
// previous comment recommended, would silently drop children from every lowered `<View {...bag}>`.
// THE HAZARD HAS TWO DOORWAYS and closing one leaves the other open — which is how it shipped. A
// spread hides the snippet from the transform; an explicit `children=` attribute hands it over in
// plain sight, passes the "every attribute is a readable name/value pair" rule, and lowers. Both
// end in the same place: the snippet becomes an ordinary bag key and the subtree never mounts.
//
// Measured 2026-09-01 through the real transform, both arms of each door:
//
//   <View {...bag}>                       refuse
//   <View children={kids}>                LOWERED, and the child vanished  <- the bug
//   emitted:  <symbiote-view p={{testID: "parent", children: (kids)}}>
//
// The two `it.each` blocks below must BOTH be able to fail. Verified by deleting each refusal
// separately: removing the attribute-type check reddens only the spread rows, removing the
// `children` name check reddens only the attribute rows. A single block covering both would go
// green on whichever door was left open (`.claude/rules/test-harness-false-greens.md` §16).
describe('an element carrying a spread', () => {
  it.each(NAMES)('%s refuses to lower under a spread', name => {
    expect(lowered(`<${name} {...bag}>x</${name}>`)).toBeUndefined();
  });
});

describe('an element carrying children as an ATTRIBUTE', () => {
  // An identifier, not a snippet literal, because that is the spelling an app writes — and the
  // refusal keys on the NAME for exactly that reason: the right-hand side says nothing about what
  // it holds.
  it.each(NAMES)('%s refuses to lower under children={…}', name => {
    expect(lowered(`<${name} children={kids}></${name}>`)).toBeUndefined();
  });

  // The control, and it is load-bearing: without it the block above passes on a transform that
  // lowers nothing at all, and it also pins that only the NAME is refused — the same element with
  // any other readable attribute must still lower.
  it.each(NAMES)('%s still lowers with an ordinary attribute', name => {
    expect(lowered(`<${name} testID="t"></${name}>`), name).toBeDefined();
  });
});

describe('an element that takes a ref', () => {
  it.each(NAMES)('%s refuses to lower under bind:this', name => {
    expect(lowered(`<${name} bind:this={el}>x</${name}>`)).toBeUndefined();
  });

  it('lowers the same element without the ref', () => {
    // The control, and it is load-bearing: without it every assertion above passes on a transform
    // that lowers nothing at all.
    for (const name of NAMES)
      expect(lowered(`<${name}>x</${name}>`), name).toBeDefined();
  });
});
