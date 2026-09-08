---
paths:
  - 'adapters/svelte/src/dom-shim/patch-globals.ts'
  - 'adapters/svelte/src/dom-shim/element.ts'
---

# `globalThis.Element` must be an ANCESTOR of `ShimElement`, never `ShimElement` itself

`patchGlobals()` set `g.Element = ShimElement`, which reads as obviously right and silently broke
**every Svelte API that routes through `set_attributes`**. Svelte's `get_setters`
(`internal/client/dom/elements/attributes.js`) walks from the ELEMENT INSTANCE up and stops when it
reaches `Element.prototype`. Pointing `Element` at the class that OWNS the setters puts the stop one
step before them:

```
visited before the stop   ['ShimElement']   the instance alone
setters found             []                `p` lives on ShimElement.prototype, never reached
```

`set_attributes` then falls through to `setAttribute`, which writes an inert Map — so the props
vanish with nothing red. Measured 2026-09-01: `<svelte:element this="symbiote-view" p={{…}}>`
committed NOTHING while the identical bag on a literal `<symbiote-view>` committed correctly in the
same run, because the literal tag takes `set_custom_element_data` and never goes near `get_setters`.

The fix is an empty `ShimElementBase` between `ShimNode` and `ShimElement`, with
`g.Element = ShimElementBase`. Three lines, no allocation. **Not** "install an Element global" — it
was installed; the hierarchy was the lie.

Two things that travel with it:

- **`set_style` writes `dom.style.cssText`**, so a shim with no `.style` THROWS rather than
  no-opping. Keep that slot LAZY — an eager field is one object per element, ~9 000 per create, the
  exact shape `svelte-shim-is-the-per-node-create-path.md` records for the two Maps beside it.
- **This did not make bare tags work — CLOSED 2026-09-07, by the separate change it named.**
  `setAttribute` now routes each key through `routeProp` and merges it into the same folded bag the
  `p` setter writes, so `<view id="x" testID="y">` commits what `<view p={{…}}>` commits.
  `dom-shim/bare-tag-props.test.ts` pins the parity row; all six rows go red with the routing call
  removed. The change was smaller than predicted (one private method) because the bag machinery —
  fold, class normalisation, diff, pre-live replay — already existed and only needed a second
  writer. What made it worth doing is not ergonomics: **this was the only reason Svelte's lowering
  transform was load-bearing for CORRECTNESS**, while it is an optimisation on every other adapter.

## The same walk is what makes `set_custom_element_data` lossless — but only if `customElements.get()` LIES

Closed 2026-09-07, and the enabling half is one line in `patch-globals.ts` rather than anything about
the hierarchy. A hyphenated tag (`text-input`, `safe-area-view`) takes `set_custom_element_data`,
whose condition is a TERNARY and not a fallback (`attributes.js:245-265`):

```
setters_cache.has(nodeName) || !customElements || customElements.get(nodeName)
  ? get_setters(node).includes(prop)     <- a real setter decides; the raw value passes through
  : value && typeof value === 'object'   <- a HEURISTIC: an object is set as a property, and
                                            EVERY scalar is handed on as String(value)
```

The fake registry returned `undefined`, which selects the heuristic — so `<text-input
multiline={false}>` committed the STRING `"false"`, `maxLength={5}` committed `"5"`, and an
object-valued prop was assigned to a plain JS property nothing reads and vanished. Returning
anything truthy steers it to `get_setters`, which is where this file's hierarchy fix already
guarantees `ShimElement.prototype` is reached. One reader in the whole client runtime.

That only pays off with setters to find, hence ~290 accessors installed on the prototype at module
load from `dom-shim/canonical-prop-names.ts` — one-time, nothing per node. Two costs worth knowing:
`get_setters` returns an ARRAY and svelte scans it with `.includes`, so the scan went from ~2 entries
to ~291; `p` and `className` are class members and therefore land FIRST, so the shipping `p={bag}`
path still resolves in two comparisons and only a bare tag pays the longer walk.

**And the third defect the same list fixes is not about values at all.** `fix_attribute_casing`
lowercases every STATIC attribute name on every tag, and `normalize_attribute` does the same to a
DYNAMIC one on any tag that is not an SVG element name — so `<view testID="x">` and `<pressable
accessibilityLabel={l}>` both reached Fabric under a key no ViewConfig declares. `setAttribute` now
maps the lowercased spelling back. Measured: only `view`-dynamic and the hyphenated tags were ever
safe.

**The list must stay DERIVED.** It is generated from this adapter's own barrel — every exported
`I*Props` type, unioned through the TypeScript checker — and `canonical-prop-names.test.ts`
re-derives and compares. Deriving it from `react-native`'s ViewConfig `validAttributes` was measured
and rejected: that covers the native surface only and misses 110 of the 255 camelCase names our
shared layer reads (`readOnly`, `inputMode`, `enterKeyHint`, `activeOpacity`, `delayLongPress`, …).

Status: LANDED 2026-09-01. The cost is one extra prototype link, **below the headless bench's
floor** rather than shown to be free — four interleaved runs of 9 000 constructions read before
`0.7409 0.7422 0.7582 0.7612` and after `0.7394 0.7499 0.7525 0.7640`. Headless has mis-sized this
class of cost three times in both directions, so a device pair (both arms one sitting, one
simulator, differing only in the shim) is what settles it; the 2026-08-23 Svelte column cannot serve
as a before-arm, being a different engine build and a different binary.

**What this makes FALSE once it ships**, and it is written down in two places as a law rather than a
defect: `examples/svelte/components/api-playground/SpecialElementsDemo.svelte` says props on a
dynamic tag "MUST go through `{@attach hostProps(...)}`, never a `p={bag}` attribute", and
`BindingsDemo.svelte` inherits the same caveat. That was true and is the workaround this fix
removes — `p={{…}}` on a `<svelte:element>` now commits the same payload as a literal tag. The
adapter's own `scroll-view/index.svelte` and `virtualized-list/index.svelte` headers likewise call
`<svelte:element>` "unverified under the DOM shim" / "forbidden", which is now only half true: the
mechanism works, the remaining reason to avoid it is per-attribute props, not the tag.

Surrounding contract: the `svelte-adapter-dom-shim` skill, §3a (what `init_operations` requires of
these prototypes) and §3g (why a lowered element uses the object-bag property instead).

## The FIFTH door: `addEventListener` has to route through `routeProp` too

Closed 2026-09-08, and it is the same shape as the `setAttribute` fix above — a door into the shim
that did not converge on the folded bag. Svelte turns EVERY `on*` attribute into `$.event()`,
whatever the name means to us, so `addEventListener` received both names that ARE events and names
that are not:

```
onPress        press is in RESPONDER_EVENTS          -> a listener        correct either way
onValueChange  no ViewConfig declares valueChange    -> node.props.onValueChange
```

`behaviors/{switch,text-input}.ts` read `node.props.onValueChange`. Calling `setEventListener`
directly answered "event" for both and stashed the second under a name nothing dispatches to, so a
lowered `<switch onValueChange={fn}>` moved natively and never called back — nothing red, on any
suite. Only `routeProp` knows which is which, so the handler now re-enters as `on` + the name
Svelte stripped it from, and `domListeners` is gone with the special case.

**The general form, and it is what makes this file's three entries one rule: every way into the
shim must reach `routeProp`.** A door that decides prop-vs-event for itself is deciding something
only the node's ViewConfig can answer.

## A `{#snippet}` directly under a host tag renders NOTHING

A snippet is a component channel. `<Pressable>{#snippet children({pressed})}…{/snippet}</Pressable>`
was a render-prop child; the same markup on `<pressable>` declares a local snippet nobody renders —
it compiles clean, warns nowhere, and the subtree is simply absent. This is the call site a lowering
transform used to REFUSE, so migrating an app to tags is exactly when it becomes the author's
problem.

Find them with the parser, not a grep — only a snippet whose DIRECT parent is a host tag counts, and
propagating "nearest enclosing tag" down through components over-reports by 14x (measured across
`examples/*`, which held exactly one real instance):

```js
if (node.type === 'RegularElement')
  for (const child of node.fragment?.nodes ?? [])
    if (child.type === 'SnippetBlock') report(node.name, child.expression?.name);
```

The repair is the one any app has to make: mirror the state with `onPressIn`/`onPressOut` into a
`$state`, since an element has no channel to hand a descendant its press state.

## A host ref is held as `unknown`, never as `ShimElement`

svelte2tsx bakes a `bind:this` return type out of `lib.dom`'s tag maps — an SVG element type for
`view`/`text`/`image`/`switch`, `any` for the other seventeen — and neither map accepts
augmentation. So `let box = $state.raw<ShimElement | null>(null)` is a svelte-check error on every
one of the four, and there is no cast this project permits.

`hostInstance()` and `findNodeHandle()` therefore take `unknown` and narrow with the `isShimElement`
guard they already had at runtime. App code declares `$state.raw<unknown>(null)`. That is not a
weakening: the guard is what was doing the work, and the declaration was asserting a type the
compiler could never see.

## A prototype ACCESSOR over an instance FIELD is fatal on Metro and invisible in vitest

Device crash, 2026-09-08, on the app's ROOT node before a single frame:

```
Uncaught Error: Cannot convert undefined value to object
  ShimNode#makeLive   shim-node.ts   for (const child of this.children)
  createRootShimElement · mount · runApplication
```

`children` is BOTH a canonical prop name (every `I*Props` carrying `children: Snippet`) and
`ShimNode`'s own field — the tree itself. The ~290-accessor loop skipped names already on the
PROTOTYPE (`if (name in ShimElement.prototype)`), which a class field is not, so it installed a
`children` getter/setter. What happens next depends entirely on the transform:

```
vitest / esbuild   useDefineForClassFields   this.children = []  ->  defineProperty on the
                                             instance, which SHADOWS the accessor. Works.
Metro / babel      loose class fields        this.children = []  ->  a plain assignment the
                                             prototype SETTER swallows. Every read then returns
                                             `this.p.children`, i.e. undefined.
```

All 328 headless tests passed. `tsc` passed. `svelte-check` passed with 0 errors. The app died on
mount. Exactly one of 286 names collides today, and it is the one that carries the tree.

**The repair is a real instance, not a list.** `const SHAPE_PROBE = new ShimElement('view')` built
before the loop, skipping any name it owns — it answers with whatever fields the ACTIVE transform
materialises, so a field added later is covered without anyone remembering. Its fields need
explicit `= undefined` initializers: a bare `private attributes: Map<…> | undefined;` emits nothing
under Metro and the probe cannot see it.

**And the test has to assert the SHAPE, because no behaviour test can see this.** Under vitest the
buggy build behaves correctly, so "mount and check" is green in both arms.
`dom-shim/prototype-accessors-shadow-no-field.test.ts` asserts that no name the instance OWNS also
has a prototype getter — with a control that the loop ran at all (a name the instance does not own
DID get one), since an empty filtered list is otherwise satisfied by an empty name set.

The general form, and it is the JIT-vs-AOT family this repo already records for Angular: **when two
build pipelines disagree about a language semantic, a test that runs in one of them is evidence
about that one only.** Class fields, decorators and `useDefineForClassFields` are where they
disagree.

## The SIXTH door: a spread drops a handler's RETURN VALUE, and one engine contract reads it

`{...bag}` on a host tag compiles to `attribute_effect` -> `set_attributes`, whose `on*` branch
does not hand your function to `create_event` — it hands a wrapper:

```js
function handle(evt) { current[key].call(this, evt); }   // attributes.js:423 — no return
current['$$' + key] = create_event(event_name, element, handle, opts);
```

`create_event` itself returns what its handler returns, which is why the other doors are fine.
Only this wrapper is lossy, and for a DOM event nothing reads a return, so upstream has no reason
to notice.

We have exactly one contract that does. The responder negotiation is a VOTE: `findWantsResponder`
(`core/engine/src/events/index.ts`) grants the gesture to the first node whose
`onStartShouldSetResponder` returns `true`. Measured through a real mount:

```
<view {...bag}>                     listener present, returns undefined
<view onStartShouldSetResponder={}> listener present, returns true
<view p={bag}>                      listener present, returns true
```

So a spread element asks for every gesture and is never heard — device-diagnosed 2026-09-08 as
`PanResponder startShouldSet -> true` followed immediately by `responder start: nobody wants it`.

**Not fixable from here.** The wrapper is built inside `set_attributes` and the original function
never reaches any code of ours; `addEventListener` receives the lossy handler already. Pinned as a
known upstream defect by `dom-shim/spread-drops-handler-return.test.ts`, whose two passing arms are
what make the third one evidence rather than a broken reader.

**So the bag is the Svelte spelling of a spread on a tag**, and that is a framework idiom rather
than a gap: `p={panResponder.panHandlers}`. React's `{...panHandlers}` is plain props and has no
such layer.

One typing consequence, and it is not obvious: `p` takes a `Record<string, unknown>`, and a TS
**`interface` gets no implicit index signature** — so a handler bag declared as an interface is a
type error there while the identical object literal is fine. `IGestureResponderHandlers` is a
`type` for this reason.

## The five doors do not own their keys the same way

Moving one demo off the spread, per the section above, opened a second bug the same hour:
`<view p={bag} class="xy-box" style={{...}} />` committed a node with no class. The box was not on
screen at all.

Two doors on one element is a shape no adapter component and no lowered tag writes, and the
compiler is what puts them there:

```
<view p={bag} class="x" style={s} />   from_tree([['view', { class: 'x' }]])   <- clone-time
                                       $.set_attribute(view, 'p', bag)
                                       $.set_style(view, s)
<view {...bag} class="x" style={s} />  $.attribute_effect(...)  -> set_attributes, ONE bag
```

`writeBagKey` MERGES into the bag; `set p` REPLACED it. So `class`, written at clone time, was
deleted by the `set p` on the next line, and `set_style` survived only by running last. `testID`
went the same way.

**Not "make `p` merge too": the two ownerships genuinely differ.** `p` owns its key SET, since a
key dropped from the bag has to reset the prop, while an attribute stands until whoever wrote it
clears it. Held apart as `doorBag` / `pBag`, published as their folded merge, attribute winning a
name collision. Guarded by `bare-tag-props.test.ts` §"a tag written through two doors at once" -
five arms including the counterweight that `p` still drops what it stops carrying, all five red
under break-test.

Two things worth carrying:

- **The file's own header said "all five converge on one folded bag."** Four converged and the
  fifth overwrote. It was true when written, because `p` was then the only door a lowered tag
  used - a header stating an invariant is not the invariant.
- **A fix that changes a binding SPELLING moves the call site onto different compiler helpers**,
  and those can carry contracts the old ones did not. The `v-model` retarget this file records for
  Vue is not a Vue property; it is what a spelling change does anywhere.
