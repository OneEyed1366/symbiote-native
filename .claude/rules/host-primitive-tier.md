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

Pressable was not the first of many; it was the largest of few. The honest next step is refusal-rate
work on real call sites — one `ActionButton` migrated to `:active` moves 90 instantiated nodes on
`examples/vue-sfc`, more than the whole remainder above. Promote Switch or TextInput when their
LIFECYCLE is the reason (one seam instead of five adapters' worth of hooks), not when perf is.
