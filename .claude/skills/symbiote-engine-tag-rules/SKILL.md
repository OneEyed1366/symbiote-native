---
name: symbiote-engine-tag-rules
description: "Where a component's platform behavior lives, and how to move one into the engine. Read BEFORE adding a rule to `SymbioteFabricProps.cpp`, before writing or keeping an `IHostBehavior.foldPayload` in JS, before porting any React Native component rule out of an adapter or out of `core/components`, and before concluding that a rule 'cannot move' because it needs another node, a listener, live state or a platform branch. Holds: the tag model (`OP_SET_TAG`, emitted by `attachHostBehavior` alone) and the browser user-agent-stylesheet criterion that decides what may cross; every seam a C++ rule can reach (`ownerProps`, the parent's tag, `IAncestorLookup`, `IFirstChild`, `OP_SET_OWNED_LISTENER`, `OP_SET_UNDERLAY_SHOWN`, `SYMBIOTE_DLOG`); the dirty-marking obligation a cross-node rule takes on (`slotDerived`, `addDerivedNode`); the cost model (bag in, bag out, body free — ~9-31 us per node per commit, ordered by BAG SIZE not rule complexity); the traps, starting with a rule running BEFORE the JS fold and stripping a key that fold still reads; and why the contract must be an itest over the committed payload rather than a vitest over a second copy of the rule. Trigger on: 'port this rule to C++', 'payloadFold', 'foldPayload', 'tag rule', 'SymbioteFabricProps', 'why does the payload have/lack this key', 'platform rule per adapter', 'fabric-props.ts', 'should this live in JS or the engine', 'component behavior duplicated across adapters'."
---

# Tag-keyed platform rules

React Native's components carry framework-agnostic behavior inside their JS bodies: `Pressable`
folds `disabled` into `accessibilityState`, `Switch` uses different native prop names per platform,
`<Text>` defaults `ellipsizeMode`, `Image` resolves `srcSet` over `src` over `source`. Ported per
adapter that is five copies of every rule, drifting apart one release at a time.

So it is not ported. Each node carries the tag it was created with, and a rule keyed on that tag runs
**once, in C++, for whichever adapter committed the node** (`core/engine/cpp/SymbioteFabricProps.cpp`).

```
before                              now
a rule's home     JS, per adapter   C++, once, keyed on the node's tag
adding an adapter port it again     the rules are already there
cost per commit   a JSI round trip  none
```

**Status: zero `payloadFold` in production.** `IHostBehavior.foldPayload` is declared by nothing that
ships. The seam stays anyway, for two reasons recorded on the field itself: it is the JS ARM of every
measurement in `tag-rule-cost.itest.ts` (delete it and the per-node figures that justified every port
can never be taken again), and it is the declared extension point for a third-party primitive, which
has no option to write a C++ rule.

## What may cross

The criterion is the **browser's**, not "is it expressible as data". A user agent maps `inputMode`
onto a keyboard type for every `<input>` on every page — a property of the PLATFORM, not of any app,
framework or component instance. That may cross. What a browser keeps in the page stays in JS.

**Stays in JS, by the model and not by omission:**

- **gesture and press machines** — they run at gesture rate and call back into app code
- **the controlled-input handshake** — the event-count acknowledgement, autofocus
- **anything only the bundler knows** — `resolveAssetSource` turns `require('./logo.png')` into a
  `{uri,width,height,scale}` by asking METRO'S asset registry, a JS table built at bundle time.
  That belongs to the bundler. It moved EARLIER instead of across: `routeProp` resolves the three
  image source props on the way IN (`core/engine/src/image-source-write.ts`), so by commit time the
  bag holds resolved sources and the rest of the rule is pure. **This is the pattern for any rule
  touching something only JS knows.** Gated on the NODE (`resolvesImageSources`), not on the key,
  because a `WebView` or a third-party video view spells `source` too.
- **the tag -> Fabric component NAME table** (`component-names/index.{ios,android}.ts`) —
  `createElement` needs the native name BEFORE anything crosses, so a C++ table would cost a
  crossing per node
- **a derived node's STRUCTURE** (`buildStructure`) — Button assembles four nodes on iOS and three
  on Android. That is the platform's, but moving it means a tree builder in C++ and there is no seam.
- **`foldAriaProps`' JS twin** — see *Mirrors* below.

So "all behavior lives beside the C++" is **true of props and not yet of structure**. Say which one
is meant.

**"JS holds it" is not the same claim as "only JS can compute it."** The first is a wiring question
and wiring is cheap; the second is the real boundary. Every "cannot be ported" note is worth
re-reading against that distinction — three of them dissolved under it.

## The seams

A rule is not confined to its own node's props bag. The tree lives in C++, so reaching another node
is a pointer hop rather than a closure and a crossing.

| seam | reaches | first user |
|---|---|---|
| `ownerProps` | the parent's props | ScrollView's content fold |
| `IOwner.tagName` | the parent's TAG — a descendant rule | `touchable-native-feedback` / `-without-feedback`, whose bodies are `cloneElement` onto a child that usually carries no tag of its own |
| `IAncestorLookup` | the nearest ancestor with a given tag | Button's label style — the button is the label's grandparent on iOS and its PARENT on Android, so "two up" would encode one platform's tree shape |
| `IFirstChild` | the child | Android's RefreshControl wrap, where the WRAPPER is derived from the scroll view it contains |
| `OP_SET_OWNED_LISTENER` | whether a listener EXISTS, as a bitmask per name | `focusable` on a touchable |
| `OP_SET_UNDERLAY_SHOWN` | one live bit, at settle rate | TouchableHighlight's underlay |
| `SYMBIOTE_DLOG` / `takeNativeDebugLog()` | a developer warning out of C++ | ScrollView's ignored-`horizontal` warning |

**Direction is not the boundary and never was.** `ownerProps`' argument — the tree is in C++ — says
nothing about up or down; reading a CHILD was recorded as impossible three times purely because
every seam that existed happened to read upward. Upstream builds that wrapper FROM its child
(`cloneElement(refreshControl, {style: outer}, scrollView)`), and a UA has the same in `:has()` and
in a table frame that has always followed its cells.

What a rule may NOT read: **live JS state** (a value a framework computes per render, a closure, a
per-frame animated value). That is the browser's own line — a UA rule sees the tree, not the
application's closures.

`IFirstChild` is FIRST child rather than a list, deliberately: the only shape that needs it is a
wrapper, and a rule surveying N children would be reading the tree rather than deriving from it.
`IAncestorLookup` is a function pointer plus a context, not a `std::function` — this is the per-node
commit path and a `std::function` would allocate for every node whether or not any rule asks.

### A listener's EXISTENCE is the platform's; only its BODY is the app's

`focusable` on a touchable is `focusable !== false && onPress !== undefined && !disabled`. Two legs
are ordinary props; the middle one is an app callback, and on some tags `onPress` never becomes a
prop at all because the behavior OWNS the name and diverts it into a JS stash.

The browser settles it: `addEventListener` is the UA's own API, so a browser knows which of its
elements carry a click handler while the handler's body stays the page's. One bit crosses per flip;
the closure never leaves JS. **A flip is a mount-time event** — the engine already refuses to notify
on listener IDENTITY, since a framework hands a fresh closure nearly every render.

It is a **mask, not a bool**, and not for a size reason: `focusable` asks about `onPress` alone while
`_hasPressHandler` asks about any of four — and "any of four" can go DOWN when one name departs,
which C++ cannot recompute, because each op is about ONE name.

### The dirty-marking obligation

A rule runs when **its own** node is dirty. So a rule reading another node re-derives only if a write
to that other node marks this one — otherwise the derived node freezes at its first frame while the
thing it reads visibly changes around it.

- `slotDerived` on the behavior names which owner props dirty the slot
- `addDerivedNode` extends that mark PAST the slot (Button's late `color` write has to reach the
  label; `markPropsDirty` bubbles UP and nothing would reach it otherwise)
- `routeProp`'s `node.wrapper` branch carries it for a wrapper reading its child
- `SLOT_DERIVED_ALL` is the honest spelling for a `cloneElement` owner, which never derived from a
  NAMED set — it re-clones on every render, whatever changed. Naming the keys was an optimisation
  whose upkeep was a mirror.

The seam did not introduce the requirement — the JS fold had it too. Nothing said so out loud until
it was asserted. **Verify it by breaking it**: comment out the mark and the re-derive case must go
red.

## The cost model: bag in, bag out, body free

Ten rules on one ruler (`tag-rule-cost.itest.ts`, both arms the same tree in one process, payloads
asserted equal key by key before any millisecond):

```
             native walk   js walk    per node   the bag / what the rule does
 content        2.8         11.1        8.6 us   3 + a 2-key style / READS ITS PARENT
 imagebg        2.9         12.2        9.7 us   2 + a 3-key style / writes ONE key
 spinner        3.8         14.6       10.7 us   4, no style / the MOST work in the file
 accessory      3.4         14.8       11.4 us   4 / nothing at all
 button         4.1         16.8       12.4 us   5 + a 2-key style
 pressable      3.7         17.8       14.8 us   4 + a 3-key style
 scroll         4.2         19.1       15.4 us   4 + a 2-key style / the BIGGEST rule
 switch         4.8         23.9       19.6 us   6 + nested trackColor
 image          5.9         27.6       22.9 us   6 + what the rule BUILDS
 bgimage        7.5         36.9       30.6 us   6 + a 3-part style / TWO rules, READS ITS PARENT
```

The top three are a deliberate experiment: their rules do almost nothing, the most work in the file,
and literally nothing. They land within 1.4 us of each other. The column orders by what has to be
**marshalled**, with the dearest row dear because its rule CREATES keys that then travel back.

Two consequences: **a trivial fold over a large bag is the worst value available**, and **deleting a
fold that does nothing is worth as much as porting one that does a lot**. `input-accessory-view`'s
fold took the bag apart and reassembled it unchanged — deleted, not moved, and it had cost 10.7 us
per node to have had.

Read the native column as a measurement and the JS column as a floor: a JS fold allocates, so its
cost carries GC that best-of-N cannot suppress.

**A fold is charged per COMMIT, not per mount.** A single mounted touchable measured `foldsFound` 5,
because the opacity settle re-commits it before it comes to rest.

**Why the crossing is the cost:** `fabricProps` converts the whole bag to a `jsi::Value`, calls into
JS, and converts the result back. Split three ways: `toJs` 1.6, `call` 1.6, **`fromJs` 13.3** —
reading back costs eight times sending, because `jsi::dynamicFromValue` does `getPropertyNames` then
per key `getValueAtIndex` + `getString` + a `std::string` allocation + `getProperty`.

**A patch-shaped return was tried and pulled back.** A fold expresses a REMOVAL by not putting the
key back, so replacing is load-bearing and merging a "superset" restores every stripped key — and
`jsi::dynamicFromValue` maps JS `null` and `undefined` onto the same `folly::dynamic` nullptr, so no
value distinguishes "drop this" from "reset to the platform default", which is a real instruction
Fabric reads. There is no safe subset to convert first. Pinned in
`core/engine/src/__tests__/payload-fold-merge.test.ts`.

## Traps

**Trap A — a tag rule runs BEFORE the JS fold.** A JS fold reading a key the rule STRIPS reads it
gone. `foldPressableProps` erases `disabled`; two touchables read it out of the bag and would have
resolved every disabled control as focusable — a focus-order bug visible on a TV remote and in no
test that reads props. **Anything a JS fold needs after a rule has stripped it must come from
`propsOf(node)`, not from the bag.** One copy of the expression was corrected and the other was not,
which is how it shipped.

A cheap grep for the same shape: **one side erasing a prop while the other reaches around it for the
same value is two halves of one rule.**

**A node built with an unregistered tag carries an EMPTY `tagName`, so no rule fires.**
`recordSetTag` is emitted by `attachHostBehavior` and by nothing else. A bare-tag fixture needs a
stub behavior registered or it measures nothing — and `expectSamePayload` refusing to time two
disagreeing arms is what catches it, not a suspiciously good number.

**A DERIVED node needs its own registration to get a tag across**, even an empty one:
`registerHostBehavior('activity-indicator-spinner', {attach(){}, detach(){}})`. That is not a trick —
a registration is how this codebase declares a tag HAS platform semantics, which is exactly the
claim. Emitting a tag from `createElement` for every node stays rejected: an app's own
`<div>`-equivalent would pay an intern and an op to name something the host has no rule for.

**Composition through `?.()` is load-bearing and invisible to the type system.** Button's owner fold
called `touchable.foldPayload?.(props)`, so deleting that function would have silently dropped
Button's whole accessibility half with every test still green.

**The payload builder hoists style OVER the top-level keys**, so an `??` between a prop and a style
key of the same name is dead for exactly those keys. Pre-existing, pinned as characterization.

**Base style UNDER or OVER is a real decision.** `foldActivityIndicatorProps` and
`foldScrollViewProps` compose UNDER so an app can override; a sticky header composes OVER, because a
header whose own style set a transform would cancel the pin. The test is whether the style is a
DEFAULT or a MECHANISM. Only a case like "beats a transform the app wrote itself" catches an order
flip.

**A platform split with a NAME on the wire is testable headlessly; `#ifdef ANDROID` is not.**
`Switch` and `AndroidSwitch` are genuinely two Fabric components with two prop surfaces, so
`foldSwitchProps` reads the name and either arm is reachable on any build. Prefer that shape wherever
a platform difference has a name. `android_ripple` sits on an ordinary `RCTView` and has no such
tell, so it stays `#ifdef` — and is covered by `pnpm run test:android`, the second host build. All
twelve `#ifdef ANDROID` sites are in `SymbioteFabricProps.cpp`, which includes only `folly/dynamic.h`
and our own headers, so the define is scoped to that one translation unit
(`SYMBIOTE_PLATFORM_ANDROID`); defining it target-wide is the version that does not build. One line
genuinely cannot cross — `android_get_device_api_level` is the NDK's, so `androidApiLevel()` answers
with RN's minimum on a host: a rule's logic and a rule's platform CALL are separable.

Android fixtures split by suffix (`*.android.itest.ts`) and the split is hard in **both** directions —
an Android fixture asserts keys the default build never writes, and the default fixtures assert their
absence.

## Testing a rule

**The contract is an itest over the committed payload** (`committedPayloadOf`,
`core/engine/cpp/tests/js/*-payload.itest.ts`). `core/engine/src/fabric-props.ts` deliberately holds
**no** platform rule, and that is the policy, not an omission: a payload rule asserted against a
second copy of itself is asserted against nothing.

**The JS harness cannot see a rule-ORDERING bug.** It builds payloads through the TypeScript
`fabric-props.ts`, which carries no tag rules — so a fold reading a key an engine rule removes
resolves correctly there and nowhere else. The property that makes that harness correct is the same
property that blinds it. The shipping `focusable` bug had a vitest case asserting exactly it, and
passing.

**A case whose subject is a fold moves as a GROUP with its positive twins.** Twice this migration had
to delete a case that was still GREEN: an absence assertion on a harness that can no longer produce
the key ("OMITS colour entirely", "does not seed text defaults onto a View") passes forever and means
nothing. A control only controls beside the thing it controls.

**Do not locate a node by the thing under test.** Thirty-six cases went red on one cause: each
located its subject by the `testID` the owner CLONES, or by `payload.zIndex === 10` — the fold's own
output. The recording host has retained `tagName` all along for exactly this; locate by tag, or by
POSITION, which the tag guarantees anyway.

**What the adapter half becomes** when the platform half leaves is almost always one of two claims:
*does this adapter commit the node under the component the rule is keyed on*, and *does an authored
value reach the engine unchanged* — including the `false` that a `!== false` default exists for,
which is the value a renderer is most likely to swallow. For aria, assert the AUTHORED hyphenated key
arrives: the rule reads `aria-label` literally, and Svelte's compiler really does lowercase static
attribute names.

Two harness facts: the itest `toEqual` is `JSON.stringify`, so it is **key-order sensitive** (assert a
composite field by field) and **cannot see a key whose value is `undefined`**.

## Mirrors

**A second implementation is not automatically a mirror — ask what each one REACHES.** The obvious
cleanup was wrong twice:

- `foldHostBag`'s alias half LOOKED like a leftover once `id -> nativeID` had a C++ rule. It was not:
  a tag rule only reaches a node whose tag was registered, and `view`/`text` register none — so the
  rule never touched the two commonest elements in any app. The seam is `routeProp`, where every
  adapter's write ends whatever shape it starts in. Seven implementations became one.
- `foldAriaProps`' JS twin **stays**, and one call site settles it rather than taste:
  `packages/slider/src/core/slider-state.ts` must disable the slider's gesture MACHINE from
  `aria-disabled`, in JS, before any commit. **A component whose machine branches on the folded value
  cannot wait for the payload.** A page may ask a browser for an element's computed accessible state;
  asking is not reimplementing. So the mirror is made LOUD instead —
  `aria-fold-parity.itest.ts` computes the JS fold and commits the same bag through the C++ rule over
  seventeen bags, one per branch, and compares every key. It is the only place the comparison is
  possible, because that harness holds both in one process. It treats `undefined` and a `folly`
  null as ONE answer deliberately: both sides build a composite by listing every known field, each
  spells "unset" in its own language, and every consumer reads them identically.

Conversely, what IS a mirror goes: `backgroundProps` in `core/components` duplicated the
`#ifdef ANDROID` tail of `foldCloneOntoChild`, api-level gate included, with no runtime caller.
`canUseNativeForeground` sitting beside it stays — it is a QUESTION an app asks the platform (RN's
own public API), not a rule that decides a payload. Two functions in one file, one a mirror and one
not.

**A guard written to hold two copies in step is also what makes deleting one SAFE**, and should be
re-read as a deletion candidate every time its subject moves. `scroll-view-base-parity.itest.ts` was
cited three times as proof its JS copy was permanent; it was proof only that the two agreed, and it
went with the copy the day `IFirstChild` landed.

**Watch for the orphan shape**: a JS function whose only remaining caller is its own unit test.
`resolveButtonTextStyle`, `resolveButtonTitle`, `BUTTON_ACCESSIBILITY_ROLE`,
`resolveButtonImportantForAccessibility`, `splitLayoutProps`, `IHostBehavior.onWrapChange` all went
that way. A hook that exists to work around a missing seam should be deleted when the seam lands, not
left to misdirect the next reader. And a **write-only field is worse than a slow one**:
`node.hasAriaAlias` cost an `isAriaAliasKey(key)` on every one of 13 000 prop writes per create and,
once the fold left, was read by nothing — it type-checks, tests green, and reads as load-bearing.

## What porting keeps finding

Reading the vendor to port a rule is, empirically, the cheapest bug-finding this project has:

- a disabled `TouchableHighlight` reached Fabric as `focusable: true` (Trap A)
- `TouchableHighlight` never folded `disabled` into `accessibilityState`, so a screen reader
  announced a disabled control as enabled
- neither touchable stripped the six props its feedback machine consumes, two of them FUNCTIONS,
  forwarded to a native view declaring none of them
- `Switch` announced as a plain view (no default `accessibilityRole`), stretched on iOS (missing the
  `alignSelf: flex-start` compose), and on Android painted from nothing and could not be disabled —
  we sent the iOS prop names on both platforms
- `collapsableChildren` honoured `snapToAlignment` on **both** platforms where RN gates that leg to
  Android — every snapping iOS ScrollView telling Yoga not to flatten its children. **A test pinned
  it as correct**, written from our code rather than from upstream: an assertion copied from the
  implementation cannot disagree with it.
- `decelerationRate` reached Fabric as the string `'fast'` on every Android ScrollView carrying a
  RefreshControl, because the wrap path SWAPPED the ordinary fold out and had to repeat it. A rule
  that runs off the TAG cannot be swapped out.
- `boolAt` returned a pointer into a single `static thread_local` slot, so any two results held at
  once aliased. Nothing had ever needed two until Android's `disabled` beside
  `accessibilityState.disabled`.

Measurement discipline for any of this: `symbiote-perf-measurement`.
