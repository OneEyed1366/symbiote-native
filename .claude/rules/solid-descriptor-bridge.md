---
paths:
  - 'adapters/solid/**'
---

# Solid adapter: accessors, not values — six traps that are silent, green headless, wrong on device

One fact drives all of these. A Solid component body runs **ONCE**, and unlike every other adapter
there is **no reconciler between what our code produces and the host nodes**: Vue diffs vnodes,
Svelte patches compiled output in place, Angular updates bindings, React reconciles. Solid's
`insert` REPLACES. So anything reactive we hand across a boundary must cross it as an **accessor**;
a snapshot value read inside a tracked scope forces a full subtree rebuild instead of a leaf update.

`descriptorToSolid` takes an accessor for exactly this reason. Traps 1-3 are the bridge's; trap 4 is
the same mistake one layer up, in a component; trap 5 is the one case where a rebuild is CORRECT and
has to be asked for by name; trap 6 is not about reactivity at all — it is Solid's `mergeProps`
quietly disagreeing with a JS spread about what `undefined` means. All of them were green under vitest before a test was written
specifically for them.

## 1. `spread` never resets a key that VANISHES from the bag

Solid's `spreadExpression` (`solid-js/universal/dist/universal.js`) is:

```js
for (const prop in props) {
  // the CURRENT key set only
  if (value === prevProps[prop]) continue;
  setProperty(node, prop, value, prevProps[prop]);
} // no "was present, now gone" pass
```

A prop the render fn STOPS emitting keeps its last value on the native view forever.

This is live, not theoretical: `resolveAccessibilityProps` has two branches with **different key
sets** — it returns its input untouched while no `aria-*` alias holds a value
(`hasAnyAriaKey` tests the VALUE, not key presence), and returns
`{...props, role: undefined, …every alias blanked, accessibilityLabel: <folded>}` once one does.
So a caller whose `aria-label` signal goes `undefined` drops the folded `accessibilityLabel` KEY,
and a screen reader keeps announcing a label the app already removed.

React and Vue hand their reconciler a whole new prop object, and the engine's `diffProps` sends a
vanished key down as literal `null` (`symbiote-engine-core` §8). The fix restores that: widen the
bag to every key ever seen, so a vanished key arrives as `undefined`, which `routeProp` treats as
a delete — and `spread` keeps doing all the actual diffing (`withStableKeys` in
`adapters/solid/src/utils/stable-keys.ts`). Do NOT hand-roll the diff instead.

The trap is NOT the bridge's alone, which is why the helper moved out of it: `View` and `Text`
(`adapters/solid/src/components/{view,text}.tsx`) build their host element directly — no Descriptor
involved — and still fold their props through the same two-branch `resolveAccessibilityProps`.
Any Solid component that runs its props through a whole-object transform before `spread` needs
this, and a prop bag whose keys are all statically present (a plain `props` object, a `splitProps`
rest proxy) does not.

## 2. Shape is read ONCE at build, so every later run must be re-checked against it

`buildNode` reads `descriptor().type` and `mountChildren` iterates `children()` a single time.
Without an explicit re-check, two drifts pass in total silence:

- a changed `type` lands the new descriptor's props on the **old** host element — the screen
  paints a plausible-looking wrong view rather than erroring;
- a **grown** child list is never visited again, so the added child simply never reaches the
  screen. (A shrunk list already throws via `childAt`.)

Both bridges now share one implementation: `createDescriptorShapeGuard` in
`core/components/src/descriptor.ts`, which lives next to `IDescriptor` because the shape contract
is the PRODUCER's, not each consumer's. Solid's `assertSameShape` calls it from inside the `spread`
accessor, so it fires on every recompute; Svelte's `syncChild` calls the same four predicates.
They had already drifted before the lift — Svelte's covered all four drifts, Solid's only two.
A new fine-grained adapter must use the guard, never grow a third private copy.

## 3. Control flow must be imported explicitly, or it silently becomes `undefined`

`babel-preset-solid` with `generate: 'universal'` resolves a built-in component name — `Show`,
`For`, `Index`, `Switch`, `Match`, `Suspense`, `ErrorBoundary`, `Portal`, `Dynamic` — against the
`moduleName` module whenever the file does not import it. Measured with `babel.transformSync`
against the installed preset:

```js
// <Show when={p.x}>hi</Show>  with NO import
_renderer.createComponent(_renderer.Show, {...})     // ← a property renderer.ts does not export

// same JSX, with `import { Show } from 'solid-js'`
_renderer.createComponent(_solidJs.Show, {...})      // ← correct
```

`renderer.ts` exports only the twelve names `createRenderer()` returns, so the first form reads
`undefined` off the module. **This is NOT a bundler error — the bundle builds fine** and
`createComponent(undefined, …)` fails at runtime instead, far from the JSX that caused it. Always
`import { Show, For, … } from 'solid-js'` in adapter source and in app code; never rely on the
implicit resolution.

## 4. A render-prop child takes an accessor too — a snapshot kills the gesture

The same mistake one layer up, in a component. `Pressable`'s function child was called
`children({ pressed: pressed() })`, and that call sits inside `View`'s `insert` render effect — so
the press signal joined that effect's dependency set and every touch REPLACED the whole child
subtree.

That is not merely wasteful. Device-diagnosed 2026-08-17 on `examples/solid`'s Pressable row, which
fired `onPress` on only every OTHER tap and whose label stuck on its pressed text:

```
FAILING TAP                       WORKING TAP
topTouchStart                     topTouchStart
Pressable pressIn                 Pressable pressIn
solid createElement RCTText ×2    responder granted to RCTView   ← grant won the race
commit created=4                  Pressable press
— no grant, no press —            createElement …  (rebuild came AFTER)
```

`pressIn` flips the signal, the child re-runs **synchronously inside the touch handler** (Solid
effects are synchronous within a tick), and the rebuild lands between `pressIn` and the responder
grant. The grant never happens, the gesture dies, `pressed` stays `true` — and the next tap starts
from a different state and works. Hence "every other tap".

The other three adapters pass a plain value and are fine, because their framework reuses the nodes:
Vue `slots.default(state)` → patched vnodes, Svelte `{@render children?.(state)}` → Snippet updated
in place, Angular → template context + change detection. Do not conclude from them that a value is
safe here.

Fix: the child takes `Accessor<IPressState>` and is called ONCE, untracked — the shape Solid core
already uses for `<For>{(item, index) => …}`, whose map fn runs under `createRoot` (which nulls the
Listener). Only the leaf reading `state()` re-runs. The divergence from React's
`(state) => ReactNode` is allowed by `<prop_types_split_agnostic_vs_per_adapter>`: Vue spells it a
scoped slot, Svelte a `Snippet`, and both have a node-reusing layer underneath that Solid lacks.

Two consequences of the untracked call, worth knowing before writing the next render prop:

- A signal read at the child function's TOP LEVEL is frozen. Nest it in the JSX — the compiler
  wraps a dynamic fragment/array member in its own memo, so that stays reactive — or in a `<Show>`.

  **Where "in the JSX" ends is a compiler behaviour, not a style preference, and it is the single
  easiest thing to get wrong in this adapter.** `babel-preset-solid` runs `wrapConditionals` by
  default, which memoizes the CONDITION of a ternary or `&&` written inside JSX. So

  <!-- prettier-ignore -->
  ```text
  <View>{layout().kind === 'nested' ? <A/> : <B/>}</View>   safe — the compiler memoizes the condition
  <View>{renderContent()}</View>                            NOT safe — same ternary, moved to a helper
  ```

  are not equivalent, even though the helper is a pure refactor of the expression. Extracting a
  conditional into a named function to tidy a render is exactly how a working component starts
  rebuilding its subtree on every signal change. Measured 2026-08-17 while adding
  KeyboardAvoidingView: the inline form could not be made to fail, and moving it verbatim into a
  `renderContent()` helper turned a keyboard show into `expected 6 to be 4` extra `createNode` calls.
  When in doubt, hang the branch off a `createMemo` so it does not depend on the compiler's reach.

- `typeof children === 'function'` cannot separate a render prop from a bare zero-argument
  accessor, which `JSX.Element` also permits. ARITY can: a 0-arity child is handed back unread so
  `insert` wraps it in its own render effect; calling it untracked would freeze it.

None of this shape is invented here — it is what solid-js's own `<Show>` does, line for line:

```js
const child = props.children;
const fn = typeof child === "function" && child.length > 0;   // the same arity guard
return fn ? untrack(() => child(keyed ? c : () => …)) : child; // untrack + accessor
```

`<Show keyed>` is the opt-in that passes the VALUE instead, and it recreates the subtree on every
change — i.e. React/Vue/Svelte's snapshot signature is Solid's `keyed` mode, which Solid documents
as a rebuild. Non-keyed `Show` even compares its condition with `equals: (a, b) => !a === !b` so a
truthy→truthy change cannot rebuild anything. Reach for the value form only when a rebuild is the
intent.

A PROP BAG is not affected, and the distinction is the useful half of this. `style` in its function
form also reads `pressed()`, but it feeds `viewProps`, and a prop bag reaches the host through
`spread` — a per-key diff on the SAME element. Nothing is rebuilt, so nothing can be rebuilt
mid-gesture. The hazard is only where a value crosses into the CHILD tree.

**The headless fake cannot see the grant loss at all.** `fabric.fireEvent` dispatches straight into
the node's listener map, bypassing native responder negotiation entirely — there is no grant to
lose. The only headless-observable trace is the node churn itself: count `createNode` for the child
subtree across a full press cycle; it must not grow.

## 5. A host tag that CHANGES at runtime needs an explicit rebuild boundary

Trap 2 says a changed `type` between runs is an error. This is its flip side: some components
legitimately change host tag. `TextInput` is one — `multiline` selects between
`RCTSinglelineTextInputView` and `RCTMultilineTextInputView`, and RN treats them as different
native views, not one view with a prop.

Every other adapter gets the swap for free: React remounts, Vue `h()`s a new type, Svelte swaps an
`{#if}` branch. Here there is no reconciler to notice, and the bridge fixes a node's shape at build
— so a naive port does not merely paint the wrong view, it THROWS through trap 2's guard.

The swap must be an explicit boundary: a `createMemo` that depends on the DISCRIMINATOR ALONE, with
the build itself untracked.

```ts
return createMemo(() => {
  const multiline = local.multiline === true; // the only tracked read
  return untrack(() => buildHost(multiline)); // load-bearing
});
```

**The `untrack` is not defensive tidying.** Building reads the render fn, which touches every prop;
without it the memo subscribes to all of them and rebuilds the entire native view on every
keystroke — new view, lost cursor, dismissed keyboard. Solid's own `createComponent` untracks for
exactly this reason, and there is no component here to inherit that from. Pin BOTH halves with
tests: one that the flip does rebuild, one that a keystroke does not.

## 6. `mergeProps` will NOT override with `undefined` — a JS spread will

Not a reactivity trap; a plain semantic difference that reads as a no-op and is not.
`mergeProps` scans its sources back-to-front and takes the first **non-undefined** value, so a later
source explicitly setting a key to `undefined` loses to an earlier source that has a value. React's
JSX spread is last-wins INCLUDING `undefined`, so code ported from the React adapter changes meaning
without changing shape. Measured against the installed solid-js:

```text
mergeProps({leadingItem: WRAPPER}, {leadingItem: undefined}).leadingItem  →  WRAPPER
({...{leadingItem: WRAPPER},        leadingItem: undefined}).leadingItem  →  undefined
```

Found on device-free ground while building VirtualizedSectionList (2026-08-18). The line

```tsx
<ItemSeparator {...entryProps} leadingItem={unwrapEntryItem(entry.leading)} />
```

is correct in React and wrong here: at a gap next to section chrome `unwrapEntryItem` returns
`undefined`, which is exactly the signal "there is no flanking ITEM on this side" — and `mergeProps`
(which the compiler uses for a spread followed by an explicit prop) discarded it, so the separator
received the raw `ISectionEntry` wrapper instead. The user's `leadingItem` was then a section-chrome
object masquerading as a list item, with no error anywhere.

The fix is not a cast or a filter: build **one** bag so there is a single source and nothing to
merge.

```tsx
const entrySeparatorProps = () => ({
  ...entryProps(),
  leadingItem: unwrapEntryItem(entry.leading),
});
<ItemSeparator {...entrySeparatorProps()} />;
```

Rule of thumb: the moment an explicit prop after a spread can legitimately be `undefined`, a spread

- override is the wrong shape in Solid. Collapse it to one object. Where `undefined` is genuinely
  impossible, `mergeProps` is fine — and it is still the right tool for defaults, which is what it was
  designed for (`mergeProps({size: 'small'}, props)` reads "props wins unless it says nothing").

## Writing the test so it is not vacuous

Both fixes are invisible to a test that never changes the key set or the shape between runs — the
existing suite passed unmodified. After adding a guard, revert the fix, confirm the new tests fail,
and restore it. Measured: 3 new tests, 3 failures without the fix, 0 with.

Trap 4 needs the same discipline for a harder reason: the grant loss itself is UNREACHABLE
headless. The fake Fabric hands an event straight to the node's listener, so there is no responder
negotiation to interrupt, and a five-test reproduction of the device symptom passed on the broken
code. The one observable trace is `fabric.counts.createNode` across a full press cycle — a press
that updates a leaf creates nothing, a press that rebuilds the subtree creates two nodes (the
`RCTText ×2` from the log). Measured: of six tests in
`adapters/solid/src/components/pressable-render-prop.test.tsx`, only that counter fails on the old
code.

Full context and the reviewer findings behind these: the `symbiote-parity-check` skill (structural
parity), `symbiote-engine-core` §8 (why a removed key is `null`, not absence).
