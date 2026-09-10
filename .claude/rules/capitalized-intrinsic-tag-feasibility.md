---
paths:
  - "adapters/**/*.{ts,tsx,cjs,svelte}"
  - "core/components/**/*.{ts,cjs}"
  - "core/engine/src/node.ts"
---

# A primitive can be a public TAG, not a component — but the cost is per-adapter

Read the `symbiote-primitive-tags` skill before planning, reviewing, or "simplifying" any of this.
It holds the measurements; this file holds only what must not be got wrong in passing.

**DECIDED 2026-09-01: the primitive resolves to a TAG and the IMPORT STAYS.** A globally available
name — no import — was priced and skipped: it is what costs, on two adapters for unrelated reasons
(Solid loses the import as EVIDENCE that a `View` is ours; Vue's global registration is a live
reference, so every app bundles all 12 wrappers). Do not reintroduce it as an ergonomic win.

**SUPERSEDED 2026-09-07 by the owner, and it changes the TARGET rather than a measurement: the
developer writes the tag explicitly, so no lowering transform may remain.** The reconciliation
recorded on 2026-09-01 — "the consumer API may not change, therefore the transform STAYS as the
router for a refusing call site" — assumed the app keeps writing `<View>`. It does not: the app
writes `<view>`, there is no call site to route, and a refusal has nothing to refuse. Minimum
component wrappers, everything that can go through the engine going through the engine.

What that costs is one thing per adapter, and only Svelte's was a correctness dependency — now
closed (`svelte-shim-element-global-must-be-an-ancestor.md`). Do not quote the sections below that
price "keeping the transform"; they answer a question that is no longer open.

**The benchmark canary cannot show this migration's win, and expecting it to is the wrong test.**
Every `BenchmarkRow` in every example was written deliberately lowering-friendly BEFORE this
migration — no `ref`, no spread, no functional (non-pressed-only) `style`, so the compile-time
lowering transform ALWAYS lowered every node in it. Writing the tag directly commits the identical
Fabric tree the transform already produced, so a device A/B on this row reads as parity — measured
2026-09-10 on Svelte: Create 205.0→202.5, Append 223.1→200.4 (better), Replace 214.0→244.3 (worse,
but Replace is this project's noisiest, least-reproducible row — see `perf-claims-need-numbers.md`
— and needs a same-sitting repeat before reading anything into it). This migration's actual payoff
is invisible on a row built to already be at the lowering ceiling: it is (a) real app call sites
that the OLD transform used to REFUSE (a `ref`, a spread, a functional style reading unrelated
state) and therefore left as full components — those now get the tag path too, for the first time
— and (b) deleting the transform layer itself (4 per-adapter plugins, the shared spec, the fixture
table, `REFUSAL_CATEGORIES`) as a maintenance/correctness win, independent of any ms. Before
promising a device speedup from a "components to tags" change, check whether the canary being
measured was already lowering-friendly under the OLD system — if so, parity is the CORRECT
prediction, not a regression to explain.

**DONE 2026-09-08.** All four transforms, the Angular Metro wrapper, the shared verdict table, the
`specialize-state-style` compiler and the `state-style` runtime helper it emitted are deleted, and
the wiring is out of `solid/babel-preset.cjs`, `vue/babel-jsx.cjs`, `vue/metro-vue-transformer.cjs`,
`examples/angular/metro.config.js` and `examples/svelte/svelte.config.js`. `HOST_PRIMITIVES` stays
and is now read only at runtime (`resolve-intrinsic.ts`, `fold-host-bag.ts`) plus
`adapters/vue/intrinsic-tags.cjs`. `REFUSAL_CATEGORIES` and `LOWERING_RUNS_LAST` are gone with the
layer they described. 647 files / 5495 tests green, `tsc --build` clean.

Two things that fell out of it and are NOT bookkeeping. `minPressDuration` was the last real
wrapper-only capability: RN's `Touchable*` hand Pressability a 0 floor because they own the floor
themselves, and a tag has no private input to seed — so it is a readable prop now, in `configFor`
and in `MACHINE_ONLY_KEYS` so it never reaches Fabric. And `Animated.View` was the last consumer of
a deleted wrapper outside `adapters/` — `packages/navigation`'s Svelte drawer, which is why a
capability audit has to reach `packages/*`, not just the five adapters.

- **Tag case decides whether a transform is NEEDED, never what it must DO — and it only ever
  mattered for a CAPITALIZED spelling.** React/Vue/Angular need no plugin
  (`export const View: 'view' = 'view'` — and TypeScript still resolves `JSX.IntrinsicElements`, so
  a bad prop is TS2322). Solid and Svelte needed one because their compilers read `<View>` as a
  component. An app writing `<view>` is past all of it: the tag is lowercase, every compiler calls
  it an element, and the transform has nothing left to decide.
- **The `symbiote-` hyphen is load-bearing in the INTERNAL tag — SUPERSEDED 2026-09-03.** The
  original claim was: `view`, `text`, `image` and `switch` are real SVG elements, so Solid emits
  `<svg><view …` and Svelte drops off the custom-element codegen path, stringifying props. Both
  halves fail when re-measured on the configurations this repo actually ships:

  ```
  solid, generate:'universal'  <view p={{a:1}}/> -> _$createElement("view"); _$setProp(el,"p",…)
                               same shape as symbiote-view. No _$template, no <svg>, no namespace.
  svelte, fragments:'tree'     set_custom_element_data -> set_attribute, from_tree flag 2 -> 4,
                               and yet the COMMITTED props are identical: {testID, nativeID}
                               unpacked into the node, nothing stringified.
  ```

  The `_$template(...)` in the old measurement is DOM-generator output; universal mode builds no
  template string, so there is no parser to put in a namespace. On Svelte the discriminator was
  never the SVG word — `stacklayout` behaves exactly like `view` — it is the HYPHEN, and the shim
  already survives losing it: `set_attribute` (svelte `dom/elements/attributes.js:204`) writes
  `element[attr] = value` for a non-string value when `get_setters` finds the setter, `p` IS a
  setter on `ShimElement.prototype` (`element.ts:86,90`), and `patch-globals.ts:79` points
  `g.Element` at `ShimElementBase` precisely so that prototype walk reaches it. That comment
  predicted this case before it existed.

  **The method lesson is the durable half: the old numbers were taken on the compilers' STOCK
  configuration, not on ours.** A generator flag (`generate:'universal'`) removed the entire
  mechanism the finding named, and nothing about the finding said which config produced it.

  Still NOT cleared, and none of it is about the SVG names: Svelte leaves the `importNode` clone
  path for `cloneNode` (one probe is not the suite that watches it), the engine's tag->component
  table maps only `symbiote-*` so a hyphenless tag commits `viewName: "view"`, and React, Vue and
  Angular were not measured in that pass. React also augments `declare module 'react'`, so a
  lowercase `view` would collide with `@types/react`'s own SVG entry (TS2717) until it moves to its
  own `jsxImportSource` the way Solid already has.
- **Never delete a wrapper before its folds have moved down.** They vanish SILENTLY — a lowered
  `readOnly` input accepts typing, a `disabled` Pressable announces itself as enabled. The runtime
  home is `foldHostBag` (`@symbiote-native/components/fold-host-bag`) plus `IHostBehavior`.
- **A per-adapter fact must not enter `HOST_PRIMITIVES`.** Whether a primitive exposes a public ref
  is answered differently by Solid (a tag hands back the same node) and Vue (only for stateful
  components), and both are right.
- **Engine-side state-style resolution must land BEFORE any adapter renames.** A functional `style`
  on a bare tag misses `setEventListener`, lands in `setProp` as a function, and `fabricProps`
  drops function props — the commit carries NO style, with nothing red.


## A single-word HTML tag name IS available on Svelte — the escape hatch is a pair, and we use one half

Measured 2026-09-09 while pricing `Button` as a tag, and recorded because the first answer was WRONG
in the direction that kills a feature: "`button` collides with HTML and there is no fix."

The mistake was reading `svelte/elements.d.ts`, which types `button: HTMLButtonAttributes` against
`view/text/image/switch: SVGAttributes<…>` and makes the two look categorically different. That file
is the RUNTIME types. The one that decides is `svelte2tsx/svelte-jsx-v4.d.ts`, and
`intrinsic-elements.ts` already says so in its own header — the read went one layer off the file it
had been told to open (`.claude/rules/verify-the-deciding-side.md`, applied to a dependency).

```
svelte2tsx/svelte-jsx-v4.d.ts
  31   // in case someone enhanced the typings from svelte/elements HTMLAttributes/SVGAttributes
  32   interface HTMLAttributes<T extends EventTarget = any> {}     <- the half nobody used
  33   interface SVGAttributes<T extends EventTarget = any> {}      <- the half we enhance today
  38   type HTMLProps<Property, Override> =
  39     Omit<SvelteHTMLElements[Property], keyof Override> & Override;
  57   button: HTMLProps<'button', HTMLAttributes>;
2035   view:   HTMLProps<'view',   SVGAttributes>;
```

Identical shape, and BOTH escape interfaces are empty and enhanceable, by the same comment. So
enhancing `svelteHTML.HTMLAttributes` beside the `SVGAttributes` we already patch costs three lines
and makes every single-word HTML name typable: the index signature makes `keyof Override`
`string | number`, `Omit` erases the whole HTML surface, and ours is what remains. The existing
file's own justification transfers verbatim — an RN app has no HTML elements either.

**So the tag alphabet is not constrained to SVG-named and hyphenated members.** The constraint was
an artifact of only ever having hit SVG collisions. Measured on Svelte only; React and Solid own
their JSX namespaces now, Vue keys on `isCustomElement`, and Angular matches by directive selector —
none of those were checked in this pass, so treat them as open per adapter rather than cleared.

### What actually prices `Button` as a tag

Not the name. Two things, and the second is an argument FOR the tag rather than against:

- **`slotDerived` marks `node.childHost` and nothing else** (`core/engine/src/node.ts:683-685`), so a
  primitive with two internal nodes — Button's view and its text — has no declarative way to re-fold
  both when an owner prop moves. The memo half of the answer is right: without style objects
  MEMOIZED on their inputs, `setProp`'s `Object.is` never fires and the node re-commits forever
  (`list-geometry-feedback-loop`).

  **The `afterCommit` half was measured FALSE on 2026-09-09 and FIXED on 2026-09-10 — read the
  paragraph below as history, and do not design around it.** `title` and `color` are stripped from
  the host's payload by its own fold, so a write to either produced a byte-identical payload, and
  `commitContainer` returned on a no-op ABOVE `runDeferredAttaches` — the beat never happened.

  The repair is a SPLIT, not a hoist, and the split is the reusable part. Three hooks had been
  grouped by when they run and they ask different questions: `runPostCommitHooks` and
  `attachAfterCommit` need a fresh FABRIC TAG, which a commit making zero native calls never
  assigns, so they stay below the early return. `afterCommit` needs only that PROPS WERE PUBLISHED,
  so it now drains on both paths (`runCommittedHooks`, `core/engine/src/host-behavior.ts`). It had
  been sharing their gate by accident.

  The general form, restated as the question to ask rather than as the trap: **a hook grouped with
  others by WHEN it fires inherits their preconditions.** Before adding one to an existing drain,
  say what it needs — a tag, a published payload, a laid-out frame — and check the drain's gate
  answers that and not a neighbour's.
- **RN swaps the touchable itself on Android** (`TouchableNativeFeedback`, Button.js:280-283). As a
  component that is a platform branch in five templates. As a TAG it is one branch inside the
  behavior picking a different intrinsic per platform — which is exactly what ScrollView already
  does with `horizontal-scroll-view`, so the precedent is built.

And the reason the first verdict also got the COST wrong: "Button is rare" was measured on
`examples/*` and on this project's own habits. That is a fact about us, not about consumer apps,
where a Button in a list row is ordinary. A sample drawn from the repo cannot answer a question
about the repo's users.
