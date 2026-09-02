---
paths:
  - 'adapters/*/src/components/**'
  - 'core/components/src/view/**'
---

# Place a primitive in a TIER before writing it — component vs element is the expensive decision

Vue, Svelte, Solid and Angular all optimize ELEMENT subtrees and stop dead at a COMPONENT
boundary. (React is the exception — no build-time analysis, host and composite are both fibers —
which is why it gained nothing from lowering and sits nearest stock.) The root cause is not code
size: **an element's name IS its output, a component's name is a function whose output is unknown
until called.** So children become a closure, static props cannot be hoisted, and an instance is
created. Vue's `View` wrapper was three lines of pure pass-through and still cost ~25 us each.

```
1  no state                       -> intrinsic tag        View · Text · Image · SafeAreaView
2  state the TEMPLATE never reads -> tag + engine-owned   Switch · TextInput · ScrollView
   (the browser's <input>/<button> tier)                  Pressable without v-slot*
3  output shape decided in JS     -> component, forever   FlatList · {#if} · render props
```

\* On Svelte, dropping the children snippet is not enough on its own — Pressable's
`{#if ripple}{:else}` is 2 of its 3 anchors, so that branch has to move into the engine as well
(`svelte-adapter-dom-shim` §33 prices each construct).

A THIRD DISQUALIFIER, found 2026-08-23 while promoting Pressable and not visible from the tier
table: **a wrapper that ARBITRATES a single-owner resource cannot be deleted, because deleting it
removes the arbiter, not just the cost.** `node.listeners` is a `Map<string, IListener>` — one slot
per event name, last writer wins. Today an app's `onPress` and the press machine's own handler
never collide only because the component destructures `onPress` out of its props and hands the node
`handlers.handlePress` instead. Lowering deletes exactly that mediation, and no ordering fixes it:
`attach` runs inside `createElement` when the map is still empty, and installing lazily is circular
because the keys involved (`onStartShouldSetResponder` / `onResponderMove`, see `RESPONDER_EVENTS`
in `core/engine/src/node.ts`) are how the gesture starts — the machine cannot wait for an event it
can only receive by already owning the slot. So before promoting anything, ask what the wrapper
ARBITRATES, not only what it computes. The answer for Pressable is that events must reach a
behavior through the behavior seam rather than by competing for the listener slot.

The criterion is **not** "does it have state" — it is "does the FRAMEWORK need to SEE the state".
`onScroll` is a callback, not a render input; Switch/TextInput are controlled (value in as a prop,
change out as an event). All three are tier 2, and `symbiote-switch` / `symbiote-text-input` /
`symbiote-scroll-view` already exist as engine tags — the wrapper survives only to host the
lifecycle, so the work is moving lifecycle DOWN, not inventing a primitive.

Per-instance price is a DERIVATION, not a measurement: Vue ~25 us, Solid ~13 us (Solid emits no
hoisting or patch flags, so its number is the wrapper alone). Use the 10-25 us band, low end
outside Vue. "Removing the wrapper closes the gap to stock" holds for VUE only; on every other
adapter it is unverified. When those columns were taken the examples were NOT all on one engine
build (resolved 2026-08-23 16:37); the rule that outlived it is that a version string cannot tell
you which engine an example carries — only a grep of its installed
`build/{node,fabric-props}.js` can, since all six read 0.3.0 regardless. Re-check before quoting
any cross-column ratio.

Full derivation, the compiled Vue codegen proof, the per-framework currency table, and Pressable
as the worked tier-2 example: the `symbiote-add-component` skill, §6b.

## `:active` is what code MIGRATES ONTO, not what fixes code in place

The engine resolves `.x:active` below the framework (`setNodePressed`, `core/engine/src/node.ts`),
which removes the reason a pressable must be a component — but only for a call site that no longer
reads press state in JS. Existing call sites still do, and `:active` does not convert them.

Measured 2026-08-23 across `examples/*`: nine functional `style` props (react 3, vue-tsx 3,
svelte 3; vue-sfc, angular and solid have none), every one of them an arrow returning an object
literal whose values are a constant or a two-literal ternary on `pressed`. No computed case exists
in this codebase. `ActionButton` is the shape:

```tsx
className="action-button"
style={({ pressed }) => ({
  borderColor: color,            // prop-driven — cannot become a static CSS rule
  opacity: pressed ? 0.6 : 1,    // the only pressed-dependent key
})}
```

For a transform to lower that by itself it would have to SPLIT the object into pressed-dependent
and pressed-independent keys and emit a CSS rule from the first half — a JS-to-CSS compiler, in
each of five transforms. That is the same multiplication the shared spec exists to avoid.

**The migration is one edit per component DEFINITION and it is trivial.** Move `opacity: 0.6` into
`.action-button:active` in the same stylesheet; `style` collapses to `{ borderColor: color }`, an
ordinary object, and the refusal lifts. Six definitions across the examples cover ~850
instantiation sites (react 156, vue-sfc 161, angular 181, solid 146, svelte 137, vue-tsx 68) plus
six one-off call sites in `CanaryScreen`.

Two consequences worth carrying:

- **The refusal rule stays simple.** A functional `style` refuses, full stop — no proving that both
  branches are static, no partial lowering. Nothing is added to any transform.
- **An earlier claim of this thread was wrong.** "`:active` moves 625 sites from refused to
  lowered" is true only AFTER the hand migration; on today's code those sites still refuse. Do not
  quote the instantiation count as a win the feature delivers by itself.

## Tier 2's silent precondition: the `:active` half needs a class the registry can KEY on

A lowered pressable gets its pressed look from an `:active` rule, and `baseStyleOf` swaps slot 0
only when `parts.className` resolves to a string. Miss that and the base style still lands, the
press still fires, the machine still runs — and the button simply never changes appearance, with
nothing red in any suite. It is the failure mode this whole tier is most exposed to, because every
other half of the contract is observable.

The boundary is narrower than "give it a static class", and worth stating exactly, because the
over-broad version rules out bindings that work fine:

```
class="action-button"                 string             ✓ resolves the :active variant
class={['a', 'b']}                    all-string array   ✓ canonicalClassName joins it first
class={{ a: true }}                   clsx boolean map   ✓ the ADAPTER joins it before routeProp
class={['a', { margin: 4 }]}          mixed array        ✗ base only — and correctly so
```

Only the last line is a universal exclusion, and it is deliberate: a mixed array's object entries
are resolved STYLES riding the class channel, not tokens, so converting it would turn a style into
a class name. The all-string array is handled in the engine (`canonicalClassName`,
`core/engine/src/style-registry`, covered by `active-state.test.ts`).

**The boolean map is handled by the ADAPTER, not the engine, so it is the one row that must be
answered per adapter rather than in general.** Vue's `createVNode` normalises a class to a string
before the engine sees anything; Svelte's `normalizeSvelteClass` (`adapters/svelte/src/class-value.ts`)
joins any clsx-shaped value — string, number, array, boolean map — and returns the value untouched
only when `collectClsxParts` fails, which is exactly the resolved-style case. Both verified by
driving a committed payload, not by reading. An adapter that does NOT normalise would land on the
✗ side here with nothing red, so the check for a new adapter is: does a boolean map reach
`routeProp` as an object?

So the instruction to an app author is **"a class your adapter or the engine can canonicalise"** —
in practice anything clsx-shaped — and the instruction to an adapter is to normalise before
`routeProp` if it does not already.

Verified end to end 2026-08-23 through the installed parser rather than by reading: compile the real
`App.css`, register, build the node the way the adapter builds it, read the COMMITTED payload —
resting has no `opacity` key, pressed carries `0.6`, released reads `null` (Fabric's spelling for
"back to the default", not `undefined`).

## What the day's numbers actually say — the work was DELETED, not relocated

The tempting one-sentence reading of the 2026-08-23 results is "the more work we take out of the
adapters and put in the engine, the faster it gets". That is wrong in a way that changes what to
build next, and the instruments say so directly: across all three adapters that were lowered,
FABRIC (`createNode` / `appendChild` / prop keys), `VISITED` and `WRITES` were **byte-identical
before and after**, and the reconcile window barely moved (Vue's even rose slightly on Create).

If work had migrated into the engine, the engine's counters would have grown. They did not. The
engine did exactly the same work on exactly the same tree. What disappeared was the framework's
per-node BOOKKEEPING — an instance, a props Proxy, anchor nodes, an LView — machinery that exists
only so a framework can track something about a node. When the node's shape is known at build time
and its state never reaches the template, that tracking buys nothing and lowering deletes it.

So the correct sentence is: **the fewer nodes the framework is obliged to supervise, the faster it
gets.** Not "move work down a layer" — "stop asking for the work at all".

Two consequences that follow only from the correct version:

- **Moving a computation into the engine to "help" an adapter is not this lever** and should be
  justified on its own terms. The three lowerings won 31-57% while adding nothing to the engine.
- **The remaining lever is the REFUSAL RATE, not new primitives.** One `ActionButton` migrated to
  `:active` moves 90 instantiated nodes on `examples/vue-sfc`; closing the rest of tier-2 moves
  fewer. And the refusal rate is the lever that works in a USER's app, not just in ours.

## Before adding a fold to four transforms, check whether the ENGINE already normalises it

A component body that writes a prop conditionally — `...(onLayout !== undefined && { onLayout })`,
or `nativeID` written only when defined — reads like something a transform must reproduce, since
lowering deletes the body that was doing it. It does not. Asked across three adapters on 2026-08-30,
all three came back the same way, for two independent reasons.

**It is unnecessary.** The engine normalises an absent prop and an `undefined` prop to one state.
`setProp(node, key, undefined)` deletes the key, or no-ops when it was never there
(`core/engine/src/node.ts`), and the boolean event gate reads the VALUE rather than the key —
`setEventListener` computes `isHandler = typeof value === 'function'` and writes
`setProp(node, flagProp, isHandler ? true : undefined)`. So an `onLayout: undefined` arriving in the
bag CLEARS the gate rather than lighting it, which was the exact hazard that prompted the question
(`.claude/rules/fabric-boolean-event-gates.md`). Both channels were checked, not only the event one:
`nativeID` / `backgroundColor` go through `setProp` directly and behave identically.

**It is also inexpressible.** A transform emits a STATIC attribute list — `"on-layout": _ctx.maybe`
— and cannot know whether that expression is `undefined` at runtime. Implementing the fold would
mean emitting a runtime helper into every lowered element, in four transforms, to reproduce a
normalisation the engine already performs once for everyone.

So a conditional spread lowers to an unconditional key, safely. The general rule: **when a component
body's behaviour looks like it must be re-implemented in the transforms, first ask whether the layer
BELOW already produces the same end state.** A fold added to four transforms for something the
engine handles is four copies of nothing, and each copy is somewhere they can drift.

One contract this rests on, and it is an ADAPTER property rather than an engine one: equivalence
requires the adapter's diff to route DISAPPEARED keys. Svelte's shim does — `applyBagDiff` walks
`Object.keys(prev)` and calls `routeProp(node, key, undefined)` for anything missing from `next`. An
adapter whose diff walked only `next` would leave a stale value standing, and for that adapter
unconditional emission is not merely equivalent but strictly safer.

## What is left, audited component by component (2026-08-30)

Every component in `adapters/react/src/components/` — the fullest surface — classified by what it
BOTTOMS OUT IN and where its state ENDS UP. Ranked by what must be built, not by eligibility.

```
tier 1, one node, an intrinsic underneath
  safe-area-view        'symbiote-safe-area-view'; sits at the root of every screen
  refresh-control       'symbiote-refresh-control'
  input-accessory-view  tag named in core; the adapter nests children under it
  image                 one 'symbiote-image' plus a large source/style translation

tier 1, all-intrinsic composite — the transform must emit a subtree, not a tag
  image-background      symbiote-view > symbiote-image + children
  activity-indicator    symbiote-view > symbiote-activity-indicator

tier 2
  Switch                cheapest: tag exists, no handle. lastNativeReport -> dispatchViewCommand
  TextInput             tag exists; the cost is a 5-method handle plus two mirrors to re-home
  TouchableOpacity      no state reaches the template, but the seam is the ANIMATED GRAPH
  TouchableWithoutFb    (useNativeDriver), not a :active rule
  KeyboardAvoidingView  inset -> three style keys; needs a keyboard seam built from nothing,
                        and its 'position' branch emits two nodes

tier 3 — state decides rendered output
  TouchableHighlight    `shown` picks child identity through cloneElement
  Modal                 `isRendered` gates whether ANY node is committed
  scroll-view, virtualized-list and the list family: output shape decided in JS

no gain — a zero-hook wrapper whose child is the expensive component
  button (-> TouchableOpacity + Text) · touchable-native-feedback (-> Pressable)
  flat-list, virtualized-section-list (-> VirtualizedList, 16 hooks)
  section-list (a pure alias; VirtualizedSectionList is the subject)
```

Three traps this audit walked into, each of which produced a wrong answer that looked derived:

- **Hook count is not the predicate.** Deleting a zero-hook wrapper whose single child is a 16-hook
  component removes the cheap instance and keeps the expensive one. Ask what a component bottoms
  out in, not how much state it holds. (A narrow grep for `useState|useReducer|useEffect` also
  undercounts: `virtualized-section-list` reads 0 and holds a `useRef` plus a `useImperativeHandle`.)
- **Eligibility is not cost.** `KeyboardAvoidingView` qualifies and is expensive; `Switch`
  qualifies and is nearly free, because its intrinsic already exists and only the lifecycle moves.
- **A file is not a component.** `Touchable` is three of them and they land in two different tiers.

Two obstacles are shared by every tier-1 candidate, so they are prerequisites rather than
per-component work. `resolveAccessibilityProps` folds `aria-*`/`role` in JS across 14 React files
and has no home in the engine. And statics on the component value (`Image.getSize`,
`TouchableNativeFeedback.Ripple`) must outlive the instance a tag replaces. Also worth knowing
before the first attempt: `descriptorToReact` injects a `key` prop a hand-lowered intrinsic will
not have, and `TextInput`'s `multiline` picks between two intrinsics on a PROP, which a transform
can resolve statically.

**The audit above covered `adapters/*/src/components/` and that is not the whole surface.** Checked
2026-08-30 after the question was put directly: `packages/*` ships components too. Almost all of the
25 are imperative modules with no view, and their `symbiote-*-host` tags are Angular service TEST
fixtures rather than components — but two are real. **`packages/slider` is a genuine tier-1
candidate** (zero hooks, a wrapper over one native view, one per adapter), and `packages/navigation`
is tier 3 by construction, since a navigator decides its output shape in JS.

The method error is worth more than the missing entry, because it is the third instance in one day:
**a directory boundary was taken for the surface boundary.** First the sample was the example apps
rather than the component catalogue, then one adapter rather than all five, then `adapters/` rather
than `adapters/` plus `packages/`. Each answer looked complete because within its own boundary it
was. State the boundary out loud before counting, and ask what sits outside it.

## Angular cannot be lowered by rewriting tags — the selector is dual and scoped to the TEMPLATE

Found 2026-08-30, and it corrects the obvious plan. Angular's primitives declare
`selector: 'symbiote-view, View'` (`adapters/angular/src/primitives/index.ts`), so BOTH spellings
match the same `@Component`. Directive matching is resolved per TEMPLATE, not per branch — so
writing `<symbiote-view>` inside a template whose `imports` still lists `View` lowers nothing at
all: the intrinsic spelling resolves straight back to the component, silently, with no error and no
visible difference except that the measurement says the change did nothing.

So an Angular lowering is not "emit the tag". It needs the component OUT of that template's scope —
a separate component with its own `imports` and `schemas: [CUSTOM_ELEMENTS_SCHEMA]`, or the dual
selector split, or a build-time transform that edits `imports` alongside the tags. That last one is
the shape the other three adapters have, and it is a whole feature rather than a diagnostic.

The headless A/B that established the prize was built the first way — one component with a private
template scope: component-backed `min 19.85 ms` against lowered `min 13.26 ms`, a 33% cut, with the
committed Fabric tree byte-identical between arms. **That is stronger evidence than the setProp-count
finding it resembles**, because that one measured 0% on V8 and only appeared on Hermes, i.e. it was a
tax on the missing JIT. A cut visible UNDER a JIT is structural work no optimiser erases. Do not
carry the 33% to a device as a prediction — headless has mis-sized five device results in a row, in
both directions.

## Lowerable means lower it — the population argument was measured on the wrong population

The paragraph that stood here said "Pressable was not the first of many; it was the largest of few",
and backed it by counting how often each remaining component appears in `examples/*`. **That census
is worthless for this decision and the correction is the user's**: the examples are synthetic demos,
not a sample of anyone's app. Their component mix says nothing about a real screen's, and we do not
get to choose which primitives a developer reaches for.

It was the fourth time in one day that a directory boundary was mistaken for the population boundary
— examples for the catalogue, one adapter for five, `adapters/` for `adapters/` + `packages/`, and
now our demos for the world's apps. The tell is identical each time: within its own boundary the
count is correct and complete, so the answer looks derived.

**So the rule is: if a primitive CAN be lowered, it should be.** We pay the cost once; an app that
lowers nothing pays it on every screen where that primitive lands in a hot position. Ordering is by
implementation cost, never by how often our own demos happen to use it.

The corollary for ordering: the first item is not a component at all. `bagFold` — the refusal on
`role`/`aria-*` — applies to EVERY primitive including the three already lowered, and accessibility
props are ordinary in real code. Moving `resolveAccessibilityProps` into the engine unlocks call
sites across `View`, `Text` and `Pressable` at once, which is more coverage than any single new
component.

**DONE, and `bagFold` is retired with it (2026-08-31).** The fold lives in the engine and the
category is gone from `REFUSAL_CATEGORIES` — kept above because the ORDERING argument is the
transferable part: the next such item is again likely to be a cross-primitive fold rather than a
component. Do not quote the category as live; `.claude/rules/adapter-parity-audit.md` records what
that cost a reader.

## The tier-3 line was drawn by the wrong criterion

"State decides rendered output" is what put `TouchableHighlight`, `Modal`, `ScrollView` and the list
family in a permanent no. But `Pressable` met that description too, until the state moved BELOW the
framework. The criterion that actually decided it is stated in `core/components/specialize-state-
style.cjs`: the callback's argument is OURS, so `pressed`'s domain is exactly `{true, false}` and two
specialisations cover it completely. **A domain we did not own could not be handled that way at all.**

Re-read against that criterion, several tier-3 entries have the same shape as `Pressable`:

```
pressed  {T,F}      ours       done
shown    {T,F}      ours       TouchableHighlight — same shape
value    {T,F}      ours       Switch — same shape
visible  {T,F}      ours       Modal — same domain, but the consequence is MOUNTING, not style
text     string     the APP's  TextInput — the blocker is the imperative handle, not the state
window   computed   the APP's  VirtualizedList — real logic, not a rendering wrapper
```

So the question to ask of a candidate is not "does its template read state" but **"is the state's
domain finite and ours, and can an engine behavior own the consequence?"**

**Audited against the source 2026-08-31. Four of the six survive as lowerable; the tier-3 label was
wrong on two of them for a reason worth reading.**

```
TextInput          LOWERABLE, new engine behavior   cheapest — tag exists, handle has a precedent
TouchableOpacity   LOWERABLE, new engine behavior   the Animated graph is already IN the engine
TouchableHighlight LOWERABLE, new engine behavior   needs a first-renderable-child style channel
ScrollView         LOWERABLE, refusing on sticky    default output is a static two-node nest
Modal              NOT LOWERABLE — and it would be a REGRESSION
VirtualizedList    NOT LOWERABLE — the app owns the domain
```

- **`TouchableHighlight` was misfiled on a misreading.** `cloneElement` there does not pick child
  identity; it merges one style key onto the same element
  (`adapters/react/src/components/touchable/index.ts:177`). `shown` is boolean and ours, held past
  the tap for `delayPressOut`. The output is two style swaps, one of which is literally today's
  `activeStyle`.
- **`ScrollView` was misfiled by generalising one branch.** Only `stickyHeaderIndices` rewrites child
  identity (`sticky-header.tsx:309`); the default output is `createElement(content, …)` inside
  `createElement(scrollView, …)`, the same all-intrinsic composite this file already calls tier 1 for
  `image-background`. Sticky is a REFUSAL CATEGORY, not a tier — the same correction
  `emitStyleExpressionOnce` got.
- **`Modal` passes the domain test and fails the behavior test**, which is why the criterion has two
  halves. `shouldRenderModal` false makes the component return `null`
  (`adapters/react/src/components/modal/index.ts:110`) — an element cannot decline to exist. A
  hidden modal costs ZERO nodes today; lowered it would cost the whole subtree. Lowering it makes
  the app slower, so this is a no even though it is buildable.
- **`VirtualizedList` is the clean no.** `renderItem` is an app-supplied callback returning a
  framework element, over the app's own data array — unbounded and app-owned, failing both halves.

## The prerequisite that gates three of those four: a behavior cannot be ordered against COMMIT

`IHostBehavior.attach` runs "at createElement, before any prop is routed — the node has its
component and nothing else" (`core/engine/src/host-behavior.ts:46-49`, verbatim). `Pressable` never
needed more, because its machine only reacts to events that arrive long after commit.

Every other candidate does need more. `TextInput`'s `autoFocus` dispatches a view command at mount,
`TouchableOpacity`'s `useNativeDriver: true` connect, and `ScrollView`'s `attachNativeEvent` all
require a COMMITTED Fabric tag at attach time. On Vue, Solid and Angular the commit is a tick later,
so all three would be **lowerable on paper and dead on device, with the headless suite green** — the
async-commit shape `vue-adapter-reactivity` already documents.

So a post-commit attach hook is the first thing to build, before any transform is touched. Nothing
else on the list is blocked by anything.

## The oracle that makes lowering a new primitive safe

`core/test-utils/src/lowering-equivalence.ts`. Mount a primitive as a COMPONENT and as a LOWERED
intrinsic with the same props; require the two COMMITTED trees to be identical, by key NAME.

Committed and not retained: anchors live only in the retained tree and are exactly what lowering
removes, so the retained trees legitimately differ while the committed ones must match exactly.

It carries guards for the two false greens that would otherwise make it decorative. **Both arms
taking the same path** — the live instance is Angular's dual selector, but the general form is any
hand-written intrinsic the renderer routes back through the wrapper; the discriminator is the
retained node count, which lowering must change, so equal counts fail. And **both arms empty**,
since `committed` is `[]` before `completeRoot` and two empty trees compare equal.

The third false green has no guard yet and is worth stating: every existing lowered test writes the
intrinsic BY HAND, which proves the RENDERER seeds and says nothing about what the TRANSFORM emits.
For the four transform adapters the lowered arm should be generated by running the real transform
over the component snippet.

**Pressable is the one exception to the paragraph above — it needs no tag-rewriting trick at all,
BUT the obvious "omit Pressable from imports" plan for it is wrong, unlike for View/Text.** Its
press machine already lives as an ENGINE-NODE BEHAVIOR keyed on the tag `symbiote-pressable`
(`registerPressableBehavior`, `core/components/src/behaviors/pressable.ts`) — the same mechanism
Vue/Svelte/Solid's lowering transforms already call. Angular simply never called it.

The first attempt (2026-08-31) wrote a bare `<symbiote-pressable>` in a template that omits
`Pressable` from `imports`, on the (wrong) assumption this was the same trick as View/Text.
It is not: `symbiote-pressable` is unconditionally in Angular's `ANCHOR_HOST_COMPONENTS`
(`adapters/angular/src/anchor-host-registry.ts`) — it is one spelling of the composed Pressable's
OWN dual selector, `'Pressable, symbiote-pressable'`, and `isAnchorHostComponent` runs on the bare
TAG STRING with zero awareness of which template's `imports` matched it. Unlike View/Text's dual
selector (resolved by Angular's own template-scoped directive matching), this check is the
ADAPTER'S, not Angular's, and it is global. So writing `<symbiote-pressable>` — regardless of
`imports` — silently produced a non-painting ANCHOR: no Fabric view, no press machine
(`createAnchor()` bypasses `attachHostBehavior` entirely). `ngc` built it clean, every existing
test stayed green, and the row was simply broken — found only by a headless probe that printed the
committed tree and noticed a Pressable's own wrapping view was missing (the label Text became a
direct child of the row, one level up from where it should sit).

A SECOND, independent bug compounded it: `adapters/angular/src/renderer/index.ts`'s `createElement`
never passed the intrinsic tag to the engine's `createElement(component, isText, tag)` — only two
arguments, so `attachHostBehavior` always looked up the RESOLVED Fabric name (`'RCTView'`), never
the tag `registerPressableBehavior` registered under. Vue's renderer already does this correctly
(`createElement(descriptor.component, descriptor.isText, type)`); Angular's was simply missing the
third argument. This meant `registerPressableBehavior()` could never have attached through Angular's
renderer AT ALL, for any tag, even one not in `ANCHOR_HOST_COMPONENTS` — exactly the shape
`test-harness-false-greens.md` §11 already named as a risk ("the registry is keyed by intrinsic tag
and the node is not"), just not previously confirmed as a live bug in shipped adapter code.

Both are now fixed: the renderer passes the tag through generically, and a small, adapter-exported
`DIAGNOSTIC_LOWERED_PRESSABLE_TAG` (`'symbiote-pressable-lowered-diagnostic'`, resolved to the same
`symbiote-pressable` descriptor + behavior tag but never checked against `ANCHOR_HOST_COMPONENTS`)
is what `BenchmarkRowPressableLowered` actually uses — not the real `symbiote-pressable` string.
Verified via the same probe: the wrapping view is back, real Fabric `RCTView`, same committed prop
keys as a bare `(press)` view (10/9 vs "expected 32001" — the press machine itself adds ZERO prop
keys either way, since `press`/`pressIn`/etc. are pure JS-side registration, not gated boolean
props; see `fabric-boolean-event-gates.md`). `angular-adapter-change-detection` §22 has the full
account, the node-count accounting and the controlled pair this unlocks (`composed` vs
`composed-lowered`, isolating exactly the 2 Pressable anchors per row against `composed`'s 12).
Still a hand-written example, not a shipped adapter capability — no babel-lowering transform exists
for Angular yet, same caveat as `lowered` itself.

**Retired the same day, at the root rather than the workaround: composed Pressable's dual selector
was vestigial and got dropped.** Nothing in the composed component's own template ever rendered
`symbiote-pressable` (it renders `symbiote-view`, above), and a repo-wide grep found no app or
example code invoking the composed component by that literal tag either — the alternate spelling
existed but nothing used it. So `selector: 'Pressable, symbiote-pressable'` became
`selector: 'Pressable'` (matching TextInput's own single-name selector, `'TextInput'`), bare
`symbiote-pressable` came OUT of `ANCHOR_HOST_COMPONENTS`, and `DIAGNOSTIC_LOWERED_PRESSABLE_TAG`
(the escape hatch two paragraphs up) was deleted along with the renderer branch and barrel export
that served it — `BenchmarkRowPressableLowered` now writes the real `<symbiote-pressable>` tag
directly. Verified via a real `ngc -p tsconfig.angular.json` build: the compiled
`ɵɵngDeclareComponent` reads `selector: "Pressable"` (single string, no comma), and the full
`adapters/angular` suite (259 tests, one pre-existing unrelated flake excluded — see
`verify-the-deciding-side.md`) stays green. **The instruction above is now backwards: writing the
bare `<symbiote-pressable>` tag is the CORRECT, supported way to reach the engine-node behavior —
do not resurrect the diagnostic constant.**

This does not by itself make Pressable LOWERABLE by the babel transform (`REFUSAL_CATEGORIES`
still owes it `observesState`/`renderPropChild`/`instanceBoundDirective` handling before it can
join `LOWERABLE_NAMES`) — it only removes the anchor-registry collision that made even a
HAND-WRITTEN bare tag unreachable. That collision was the concrete, named prerequisite this file
asked for; the transform work itself is still open.

## A lowered primitive loses whatever its WRAPPER did — and the RN default fold is the silent case

The six-prop-key gap that blocked every Angular-vs-anyone comparison for a day turned out to be a
real defect rather than a measurement artefact, and the shape generalises past this instance.

Enumerated 2026-08-31 on the real `examples/vue-sfc/components/BenchmarkRow.vue`, compiled through
the real transform and mounted through the real adapter — 9 nodes, 32 keys per row:

```
23  style     from .bench-row* + .flex1        (identical token-for-token in the Angular app)
 6  defaults  ellipsizeMode + allowFontScaling, 2 x 3 Text nodes
 3  text      RCTRawText
32
```

**The six are RN's own `Text` defaults**, which `Text.js` applies unconditionally on its way to
native. A wrapper `<Text>` component folds them in (`resolveTextProps`); a LOWERED `symbiote-text`
has no wrapper, so unless the adapter puts them back, a `numberOfLines` string truncates with no
ellipsis. That was caught on device once already.

Four adapters cover it, in three different ways, and the fifth does not cover it at all:

```
svelte    compile time, from the spec's `defaults`   (applyDefaults, preprocessor)
vue       runtime, seeded in the renderer            (src/renderer/index.ts)
solid     runtime, seeded in the renderer            (transform emits no defaults)
react     wrapper only — never lowers, so correct
angular   wrapper only (primitives/index.ts resolveTextProps) — AND IT LOWERS. Gap.
```

So Angular's lowered rows are not merely 6 keys lighter; they ship text that does not ellipsise.
Two lessons, and the second is the one that generalises:

- **A lowered element inherits nothing its wrapper component did.** Prop defaults, alias renames and
  bag folds all live in the wrapper. The spec carries `aliases` and `defaults` for exactly this, but
  carrying them is not applying them — check the adapter actually consumes both, at compile time or
  at runtime, before calling a lowering done.
- **No test catches this, because the shared lowering table asks only about Pressable and only about
  `lower`/`refuse` verdicts.** The oracle that would catch it is a CAPABILITY, phrased so all five
  answer identically wherever their fold lives: _does a lowered `<Text>` commit `ellipsizeMode` and
  `allowFontScaling`?_ Compile-time and runtime seeding both pass it; a missing fold fails it. A
  check on the transform's OUTPUT instead would report Solid and Vue as broken for seeding at
  runtime — the shape-vs-capability trap in `.claude/rules/adapter-parity-audit.md`, one layer in.

**And the same question asked about `aliases` immediately found a bigger defect.** `ID_ALIAS`
(`id` -> `nativeID`, RN's W3C-named alias that `View.js`/`Text.js` copy over unconditionally) was
folded by React, Solid and Svelte in a wrapper or a transform — and by Angular NOWHERE, not even on
the composed path. So `<View id="x">` reached Fabric with an unknown `id` key and no `nativeID`, on
every Angular app, silently, device-only. The lowering investigation surfaced it; the bug predates
lowering entirely. Both folds now live in Angular's RENDERER, which is the one place that covers
`setAttribute`, `setProperty` and a hand-built call alike.

That is the argument for where a fold BELONGS, and it is worth stating separately from the bug: put
it at the layer every path goes through. A wrapper covers one path and looks complete because the
tests all take that path.

## The THIRD path: a host tag hand-written inside the adapter's own source

Two paths are obvious — the wrapper component, and an element the transform lowered. The third has
neither, and every adapter has it: `virtualized-list`, `image-background`, `activity-indicator`,
`keyboard-avoiding-view`, Solid's ripple and both Buttons all write `<symbiote-view>` /
`<symbiote-text>` directly. No wrapper to fold, no transform to rewrite.

Found 2026-08-31 by the Svelte session, in `adapters/svelte/src/components/button.svelte` — the
title reached Fabric with no `ellipsizeMode`, so a long button label clipped mid-word where React's
ellipsised. React's button renders the `Text` COMPONENT and gets the fold for free.

**The survey across all five settles where a fold belongs, and it is not a style preference:**

```
vue · solid · angular   seed in the RENDERER    every path covered, hand-written included
svelte                  fold at COMPILE TIME    covers only what the transform rewrote  <- the bug
react                   wrapper only            correct: it never lowers
```

A compile-time fold covers exactly the call sites the transform saw. A renderer fold covers
`createElement` and every prop write, so all three paths fall under it by construction — and the one
adapter whose fold sits above that layer is the one that shipped the defect. **Put a fold at the
layer every path goes through; a wrapper covers one path and looks complete because every test takes
it.**

The oracle that catches this is not the equivalence one — no test mounts every component, so
`button` is invisible to it. Svelte's second oracle is the right shape: **every hand-written host tag
in the adapter's own source must be shown to apply its fold**, checked structurally over the source
tree rather than by mounting. It catches the next hand-written tag on the day it is written. Its
honest limit, which belongs beside it: a textual check proves the fold is CALLED in that file, not
that its result reaches the tag.

Method note worth keeping: the gap was found only by diffing prop-key NAMES between two adapters.
The totals had been known for a day and produced nothing but a wrong estimate ("6 per row" was
`(32001-26001)/1000`, never enumerated, and it was used as an acceptance bar).

## A lowered element and its wrapper must not share an intrinsic tag

The host-behavior registry is keyed by the INTRINSIC TAG (`attachHostBehavior(node, tag)` — the node
itself only ever carries the resolved Fabric name, and keying by that would put a press machine on
every `View` in the app). So the tag is what decides whether a tier-2 machine attaches, and any path
that emits the tag gets the machine.

`Pressable` never had to think about this: its wrapper renders `symbiote-view`, so the lowered tag
`symbiote-pressable` was a NEW name and the two sets could not intersect. `TextInput` inverted it —
the wrapper already rendered `symbiote-text-input`, and the lowering transforms reused that name. A
plain `registerTextInputBehavior()` would then have installed the engine machine on wrapper-built
nodes, where the adapter's own lifecycle already runs the same five things. Two owners: `setInput-
Focused` twice per focus, `mostRecentEventCount` written from two places, `attachAfterCommit`
racing the wrapper's mount effect. Nothing red — each half is individually correct.

**It was nearly shipped as "safe", on an argument worth recognising.** The wrapper destructures
`autoFocus` out and folds `value`/`defaultValue` into `text` before either reaches the node, so the
machine would have read `undefined` for both and stayed inert on three of the five. That is three
coincidences, not a design: nothing enforces any of them, and the two that DO collide were only
found by reading the wrapper's focus/blur handlers rather than its prop fold.

The fix is a second tag resolving to the same native view — `symbiote-text-input-managed`, declared
in `component-names/shared.ts` and both platform tables, rendered by `render-text-input.ts` and by
Angular's hand-written template. The plain name belongs to the LOWERED path because that is the end
state: when the wrappers stop owning the state, the `-managed` pair is deleted and nothing else
moves.

Three consequences worth carrying:

- **A third path exists, and NAMING it is not the same as auditing it.** Angular and Svelte both
  write the intrinsics literally in their own component source instead of going through the shared
  render fn, so each needed the same edit in a different file. Angular's was caught by its own
  drift-protection test (`babel-register-composed.test.ts`, selectors vs the `ISymbioteIntrinsic`
  union). Svelte's was not caught by anything — it was found by that session reading its template
  after being told the split had landed, and until then its wrapper kept printing the very tags the
  machine had just been registered against: one node, two owners, full suite green.

  **Green was guaranteed there, by construction.** Both spellings resolve to the same native view,
  so the committed tree cannot tell them apart — no assertion about what Fabric received can see
  the difference, and the only observable is the literal in the template. That is why Svelte's new
  guard (`components/text-input/text-input-tag.test.ts`) reads the SOURCE and derives both sides:
  the expected tag from calling `renderTextInput`, the forbidden ones from `HOST_PRIMITIVES`.

  The audit that should have run at the split, and did not: `grep -rn "symbiote-text-input"
adapters/*/src` — every literal, every adapter, before trusting a green suite. Two of five had
  one. Checking the one adapter whose test happened to fail is not an audit; it is a report.

  **And behavioural tests cannot stand in for the drift oracle — measured, not assumed.** Angular
  reverted its template to the lowered tags and ran four cases: only the one asserting WHICH tag
  `createElement` received went red. `focus()`, the focus/blur mirror and `clear()`/`setSelection()`
  all stayed green, because a second owner in the fake-Fabric harness merely subscribes alongside
  the first — there is no native side to conflict over. So for this class of defect the drift
  oracle is the SOLE detector, and a suite of behavioural tests around it is not partial coverage
  but zero.

- **Count how many things the wrapper does, not how many the machine reads.** The safety argument
  was built from the machine's inputs, which is the side that happens to be quiet.
- **A derived key-set test catches a MISSING method and not a STUB.** Svelte's and Vue's handles
  are invisible to `tsc` (instance-script exports; an untyped `expose()`), so a test deriving the
  expected names from `Object.keys(buildTextInputHandle(node))` is their only guard — and
  `typeof handle[name] === 'function'` is satisfied by `() => {}`. One end-to-end case closes it:
  drive a forwarded method through and require the node to actually move. Svelte pinned
  `setNativeProps`; the other three forwards are unreachable in that harness, because the fake slot
  has no `measure` to call.
- **`registerXBehavior()` goes into `adapters/{vue,svelte,solid}/src/register.ts` only.** React and
  Angular carry no lowering transform, so no lowered node exists there and neither has a
  `register.ts` at all — the same reason they skip Pressable's.

### The split FORKS the tag, so every tag-keyed table has to be audited for the fork

The split's whole purpose is that ONE table — the behavior registry — must NOT see the wrapper's
tag. That is loud and deliberate. What is quiet is that every OTHER tag-keyed structure must see
both, and each one fails differently when it does not.

Audited 2026-09-02, after TextInput and Switch were found committing a raw `id` on their component
path — a key no ViewConfig declares, so Fabric drops it, `nativeID` never lands, and nothing is red:

```
behavior registry      lowered ONLY      the point of the split
FOLD_PLAN_BY_TAG       BOTH              was lowered-only. The bug.
platform name tables   BOTH              correct — both spellings resolve to one native view
```

`fold-host-bag.ts` derives the wrapper spelling with a suffix rather than a spec field, so the next
`-managed` twin is covered on the day it is named. `fold-host-bag.test.ts` pins the convention
against the platform tables, so a twin named some other way fails instead of silently losing folds.

**The general question when a primitive forks its tag: enumerate what is keyed by tag, and decide
per table.** The default is BOTH — a split is about ownership of a machine, not about which folds a
node gets — and only the registry wants one side. A table left on the lowered spelling does not
crash; it stops running for the wrapper.

Two method notes from tracing it. The entry recording this divergence said "cause untraced" and
listed a hypothesis it had already falsified (an accessibility fold), which was right to record and
is what kept the next reader from re-running it. And the fold's own `tagsOf` comment already
described this exact failure on the OTHER axis — `intrinsicWhen`, one primitive committing two
tags — so the second axis was one line from the first and nobody looked for it.

## The disqualifier: a render that SYNTHESIZES a node can never be a lowered tag

Every tier question above is about cost. This one is not — it is a hard structural line, and it was
found by assigning a primitive to the wrong tier and having the session refuse to build it.

**The test, one line, applied to the shared render fn:** does it emit a node that is not the
primitive itself?

```
ActivityIndicator   el('symbiote-view', wrapper, [el('symbiote-activity-indicator', native)])   SYNTHESIZES
Modal               el('symbiote-modal', props, [el('symbiote-view', containerStyle)])          SYNTHESIZES
Switch              el('symbiote-switch', props)                                                 single
InputAccessoryView  el('symbiote-input-accessory-view', mapped, [])                              single
SafeAreaView        one element per adapter, children on the framework's own channel             single
ScrollView          the adapter builds scroll view + content container                        SYNTHESIZES
```

**ScrollView fails it too, checked 2026-09-01 rather than assumed, and it fails harder than
ActivityIndicator.** There is no shared render fn to apply the test to at all —
`render-scroll-view.ts` contains no `el(...)` and no `render*` function, only pure helpers, and
`selectScrollIntrinsics` hands the adapter TWO intrinsic names. Each adapter then manufactures the
pair itself (`adapters/vue/src/components/scroll-view/shared.ts`, `const content =
h(contentIntrinsic, contentProps, contentChildren)`).

Three things make it worse than the spinner rather than the same:

```
the synthesized node is PROP-BEARING   contentContainerStyle lands on it, and horizontal adds
                                       flexDirection:'row' — a fold cannot route a prop onto a
                                       node that does not exist
it is a distinct NATIVE class          symbiote-scroll-content -> RCTScrollContentView on iOS
                                       (RCTView only on Android), so dropping it is not merely a
                                       layout change
there is no shared half to extract     five adapters build the tree, and the shared file holds
                                       only the decisions, never the nodes
```

So the last hot primitive is not lowerable, and the reason is structural rather than unbuilt. That
closes the question rather than deferring it.

**Passing the app's children through is not a disqualification; manufacturing a container is.** The
first version of this rule said "returns a tree", which over-rejects `SafeAreaView`,
`InputAccessoryView` and every future primitive that takes children — all of them emit ONE element
and let children arrive on the framework's own channel.

**That sentence used to name `Modal` as its example, and the example was FALSE — corrected
2026-09-01, measured rather than read.** `renderModal` returns
`{symbiote-modal -> [symbiote-view]}`, and the synthesized child is PROP-BEARING (`style`,
`collapsable: false`), which is the same aggravating factor recorded for ScrollView two paragraphs
up: a fold cannot route a prop onto a node that does not exist. The render fn's own comment says the
adapter injects the user children UNDER that container, never as a sibling of the host — so the
children never touch `symbiote-modal` at all, which is the opposite of what the row claimed.

The correction cost nothing because Modal was already a NO on independent grounds (the tier-3 audit
above: `shouldRenderModal` false commits no node, so lowering it is a REGRESSION). **That is what
made it survive — a false row on an entry whose verdict is right by another route is never
contradicted by the verdict.** A counter-example rots independently of the rule it illustrates, and
this one was load-bearing: a reader checking the rule against Modal's source would have found the
rule contradicting itself and had no way to tell which half was stale. When a rule's exemplar is the
thing keeping it from over-rejecting, re-derive the exemplar from source on each use, not the rule.

Why it is structural rather than expensive: a lowered tag is ONE engine node, and a host behavior's
`foldPayload` maps props to props on that node. It cannot create a child. So lowering a synthesizing
primitive silently drops a node and changes layout — an optimisation moving the observable surface.

Both escapes were priced (2026-09-01) and both cost more than a spinner is worth:

```
a behavior that CREATES a node   needs a commit hook -> a machine -> a `-managed` split.
                                 A new category, not a fold.
the container in the commit walk NOT the RCTVirtualText precedent it resembles. `viewNameFor`
                                 changes what one node IS and never ADDS one; adding one makes the
                                 retained and committed trees disagree on node count, which every
                                 counter, census probe and benchmark here assumes.
```

## The SECOND disqualifier, independent of the first: a position its PARENT decides

Synthesis is about what a primitive emits. This one is about what emits IT, and a primitive can pass
the synthesis test and still be unreachable.

RefreshControl, checked 2026-09-01. Its own node is a single element, so the test above clears it.
What disqualifies it is that its POSITION is chosen by the ScrollView it belongs to, and differs per
platform:

```
iOS      PullToRefreshView          a SIBLING inside the ScrollView, before the content container
Android  AndroidSwipeRefreshLayout  WRAPS the scroll view — the ScrollView becomes ITS child
```

The parent does not merely place it, it INTROSPECTS it: `adapters/vue/src/components/scroll-view/index.android.ts`
reads `refreshControl.type` and `.props` off the vnode the app passed, checks `isHostType(rc.type)`,
and re-hosts it with the scroll view nested inside. React does the same with `cloneElement`.

**A host behavior is per-NODE, so it cannot own a decision another component makes about where that
node goes.** `foldPayload` runs on a node that already exists in a tree someone else shaped. And
there is no shared render half to extract — five separate implementations, worse than the three
Image had.

The general form, because it will recur: **ask not only what the primitive builds, but who decides
where it lives.** A primitive whose parent re-parents it per platform belongs to that parent's work,
not to a lowering wave — whoever settles ScrollView settles this pair together.

**And under half A the cost of leaving such a primitive as a component is zero to an app.** Every
primitive is an ordinary import from the adapter barrel, so which one is internally a tag and which a
component is invisible at the call site. The uniformity requirement was about the import boundary,
and half A keeps all of them on the same side of it — a point that was missed for an hour while the
alternatives were being priced.

So: apply the test BEFORE assigning a primitive to a tier. The wrong axis — "does it have a state
machine" — is what put ActivityIndicator in the fold-only batch, and only the assigned session
stopping to check saved a layout regression.
