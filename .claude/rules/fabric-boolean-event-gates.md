# Six Fabric events fire only if a BOOLEAN prop reaches the payload

`fabricProps` drops every function prop. For most events that is correct — the native component
emits scroll / touch / change unconditionally. For six it is not: Fabric's C++ runs `if (props.onX)`
before touching the event emitter, so a handler with no flag is dead. The listener is present, the
tree is right, `tsc` and the whole headless suite are green, and only a device shows nothing
happening.

```
layout               -> onLayout               BaseViewProps.h:103
textLayout           -> onTextLayout           ParagraphShadowNode.cpp:351
accessibilityTap     -> onAccessibilityTap     RCTViewComponentView.mm:1603
magicTap             -> onMagicTap             RCTViewComponentView.mm:1613   # C++ member is
accessibilityEscape  -> onAccessibilityEscape  RCTViewComponentView.mm:1623   # onAccessibilityMagicTap;
accessibilityAction  -> onAccessibilityAction  RCTViewComponentView.mm:1633   # RN's view config disagrees
```

Exhaustive as of RN 0.86 — it is every `bool on*` field in
`ReactCommon/react/renderer/components/**`. Adding one means adding it to `GATED_EVENT_PROPS` in
`core/engine/src/node.ts` AND declaring the event in `view-config.ts` (`BASE_EVENTS` /
`COMPONENT_EVENTS`), or flat-bag adapters route it to `setProp` and it is dropped again.
`core/engine/src/__tests__/gated-event-props.test.ts` is what keeps those two lists in step —
it asserts the flag in the COMMITTED payload, not on `node.props`.

Before concluding "the adapter never wired this event", check the flag first: dump the committed
payload keys, don't read the listener map.

Adapters that forward an event eagerly (Angular binds `(accessibilityTap)="emit(...)"` on every
`Pressable`) get the flag on every instance — the engine cannot tell a subscriber from a forwarder.
That is adapter debt, not a gate bug.

**And the debt SPREADS with the component surface — it is not a Pressable property.** Measured
2026-09-01 by enumerating the committed keys of `examples/angular`'s benchmark row: `TextInput`
binds the same four in BOTH of its template branches (single-line and multiline,
`components/text-input.ts:201` and `:218`), so a row with two Pressables and one input carries
**12** eager gate keys, not 8. Any future Angular component that copies the Pressable template
inherits them silently, and nothing in the repo counts them — `EAGERLY_FORWARDED_GATES` in
`adapters/angular/src/__tests__/benchmark-row-shape.test.ts` subtracts the four NAMES from both
sides of its comparison, which is deliberately blind to how many ELEMENTS carry them.

The cheap census, which is what found it: mount the row headless with the app's real CSS
registered and `Object.keys` every committed node. On that row Angular reads 56 prop keys where
the other adapters read 43 — 12 of the 13 are these gates, and the 13th is
`mostRecentEventCount`, which Angular's TextInput writes at CREATE while every other adapter's
behavior writes it only on a change EVENT.

**That last clause is TRUE and its framing is WRONG, and the framing is why nobody chased it for a
week.** It reads as Angular being the outlier. It is not: on every other adapter the WRAPPER writes
`mostRecentEventCount` at create too — Solid's hands it to `renderTextInput` on every render — while
the shared behavior writes that key only inside the change handshake. So this was never
adapter-vs-adapter. It is **the two paths of ONE adapter disagreeing, in the shared behavior, on all
four that register it**: a lowered `<TextInput>` commits without the key until the user types, and
its own wrapper commits with it.

Found 2026-09-01 by the lowering-equivalence arms, which mount a primitive as a component and as a
bare intrinsic and diff the committed trees — three adapters' arms (Solid, Vue SFC+TSX, Svelte)
reported it independently within one hour. Closed by the behavior seeding the key at attach with
`INITIAL_EVENT_COUNT`, the value its own state already starts at; that is deliberately sequenced
AFTER Angular's prop-key census, because it adds a key to every lowered input's CREATE payload and
would move the 56-vs-43 baseline while it is being measured.

**A framing that misattributes a shared gap to one adapter is worse than no entry** — it tells the
next reader the other four are fine.

**It has a standing red test, and it is not the one you would guess from the name.**
`adapters/angular/src/__tests__/benchmark-row-shape.test.ts` asserts the flat and composed row
shapes commit identically, and it fails on exactly four keys — `onAccessibilityAction`,
`onAccessibilityTap`, `onMagicTap`, `onAccessibilityEscape` — present on composed and absent on
flat, because only the composed `Pressable` template binds them. Nothing about row SHAPE is wrong,
so the failure reads as a benchmark or lowering regression and is neither.

**The DEBT predates the failure; the failure does not predate the batch, and conflating those two
is how this entry was first written wrong.** Those four names entered `GATED_EVENT_PROPS` on
2026-08-30 — 12 additions, zero deletions, and the constant did not exist at all in the commit
before the batch. Until then no flag was emitted for them, so eager forwarding was invisible and
flat and composed committed identically. The Angular template has bound all four unconditionally
for far longer; the gate is simply what made it observable.

So the probe has to scope to the DECIDING side, which is the engine's gate list and not the
adapter the test lives in:

```bash
git diff <before>..HEAD -- core/engine core/components \
  | grep -cE "onAccessibilityAction|onAccessibilityTap|onMagicTap|onAccessibilityEscape"
```

The first version of this paragraph scoped that grep to `adapters/angular/` — because the failing
test is an Angular test — got 0, and concluded the red predated the batch. Both the count and the
conclusion were wrong, and the shape of the mistake is `.claude/rules/verify-the-deciding-side.md`
applied to a PROBE rather than to a claim: a probe aimed at the wrong file returns a clean answer,
not an error. Before trusting a zero, ask which side would have had to change for the answer to be
nonzero.

Resolved in `a57ea1c0` by subtracting the four from BOTH sides of the comparison under a named
`EAGERLY_FORWARDED_GATES`, carrying a pointer here and an explicit "delete this when composed
stops binding unconditionally" — deliberately NOT by skipping the test. That assertion is the
only oracle comparing Angular's two paths at all, so a skip trades one known red for zero reds
and no coverage,
and the silent state is the worse one. Narrowing keeps every other divergence caught, and the
subtraction list is itself the marker that the debt is still open.

Cite the HASH rather than a day for anything here: `781193de` was authored 2026-08-20 23:51 and
committed 08-21 20:53, so two sessions reading `%ai` and `%ci` will each "correct" the other's
date forever.

Full context, including why our payload is legitimately half stock's size: the
`symbiote-engine-core` skill, §10.

## The flag follows the VALUE, not the key

A recurring wrong premise, and it drives real design questions ("must a lowered element skip a prop
key whose value is `undefined`?"): the gate is not set by the key being present. `setEventListener`
computes `isHandler = typeof value === 'function'` and writes `setProp(node, flagProp, isHandler ?
true : undefined)`; `setProp` on `undefined` deletes the key, or no-ops when it was never there. So
writing `onLayout: undefined` and omitting `onLayout` leave the node in the same state — the same
collapse plain props get.

Measured 2026-08-30 against the committed payload, control included:

```
routeProp(onLayout, () => {})   committed.props.onLayout === true      <- control moves
routeProp(onLayout, undefined)  no flag, no 'layout' listener, no key
routeProp(nativeID, undefined)  Object.keys(committed.props) identical to never writing it
```

Consequence for adapters and lowering transforms: **do not hand-roll an omit-when-undefined fold.**
The engine normalises it once for every adapter, and a transform cannot do it anyway — it prints a
static attribute list and does not know runtime values (`.claude/rules/adapter-parity-audit.md`,
"Admission test for a row in the shared lowering table"). A conditional write in a shared render fn
is cosmetic; `render-input-accessory-view.ts` guards `nativeID`/`backgroundColor` and writes `style`
unconditionally one line above, which is the tell.

## It is not "a template-copying fact" — it is nearly every Angular component. Counted, 2026-09-01

`Pressable` and `TextInput` were named above as the two known sites; a third (`SafeAreaView`) was
found by accident while auditing something else. The count, once someone actually grepped
`adapters/angular/src/components` for the five unconditional bindings (`(accessibilityAction)=`,
`(accessibilityTap)=`, `(magicTap)=`, `(accessibilityEscape)=`, `(layout)=`) rather than fixing the
one just found:

```
already fixed          Pressable, SafeAreaView  — and TextInput, which was listed here and
                       was NOT fixed; see the correction below                          2
still eager, 4 events   TouchableNativeFeedback, RefreshControl, Touchable (x3 templates),
                        Button, SectionList, Image (.ios/.android), ImageBackground,
                        Modal, InputAccessoryView                                      11 files
also eager on `layout`  KeyboardAvoidingView, VirtualizedList (x3 template sites)        2 files
```

**Every one lights its gate flags on EVERY instance, subscriber or not** — the binding itself is
what sets the flag (`setEventListener`'s `isHandler` check), so a handler that internally no-ops or
forwards conditionally (`virtualized-section-list`'s `resolvedOnAccessibilityAction?.($event)`,
`image`'s `handleAccessibilityAction($event)`) does not help: the TEMPLATE binding already lit the
flag before the handler body ever runs. So counting must be by BINDING, not by reading each
handler's own logic — a smart-looking handler is not evidence the site is clean.

`Touchable` alone accounts for THREE of the eleven — one shape (`Touchable`/`TouchableOpacity`/
`TouchableHighlight`/whatever its three templates are) repeated per variant, the same "count
instantiations, not call sites" trap `.claude/rules/adapter-parity-audit.md` records for lowering.

The fix shape is proven three times over (Pressable, TextInput, SafeAreaView): move the four-or-five
bindings into the component's `hostProps()`/flat-bag path as `.observed`-gated forwarders
(`eventEmitterHandler`/`accessibilityEmitterHandler`), delete the template bindings. Not yet applied
to the eleven-plus-two above — this is the count, not the fix; sequence it as its own pass rather
than folding it into whatever else touches one of these files next, since it is thirteen files wide
and several (`Touchable`, `VirtualizedList`) are non-trivial templates repeated at multiple sites.

## The pass, run 2026-09-01 — and it splits into two shapes the fix above only covers one of

Seven of the thirteen bind directly on a bare intrinsic host tag (`<symbiote-view>`,
`<symbiote-image>`, …), the same shape Pressable/TextInput/SafeAreaView were fixed in. Landed the
same flat-bag `.observed`-gated pattern, each with a positive AND negative control test
(no-subscriber → zero gate keys; one subscriber → exactly that key `true`), each break-tested by
reverting the template and confirming the negative control fails:

```
TouchableNativeFeedback, RefreshControl, Modal, InputAccessoryView, Image (.ios/.android),
KeyboardAvoidingView
```

**`KeyboardAvoidingView`'s `layout` binding is the one exception that must stay eager, and it is
correct as-is, not a bug.** Unlike the four accessibility events, this component READS its own
`onLayout` internally — `handleLayout` measures the frame that feeds the next keyboard event's
inset fixpoint math (`.claude/rules/keyboard-avoiding-view-rn-contract.md`). Gating it on
`.observed` would silently break inset-following the moment an app does not subscribe to the
`layout` @Output(). Only its four accessibility bindings were gated; `(layout)` stays unconditional.

**The other six of the thirteen do not fit the flat-bag pattern at all — they bind the gated events
on ANOTHER ANGULAR COMPONENT's own `@Output()`, not on a bare tag:**

```
Touchable (x3 templates: TouchableOpacity/TouchableHighlight/TouchableWithoutFeedback)
                                        binds on <Pressable (accessibilityAction)="...emit($event)">
Button                                 binds on <TouchableOpacity (accessibilityAction)="...">
SectionList                            binds on <VirtualizedSectionList (accessibilityAction)="...">
ImageBackground                        binds on <Image (accessibilityAction)="...">
VirtualizedList (x3 template sites)    binds on <ScrollView (accessibilityAction)="...">, plus
                                        (layout) — ScrollView's own component is clean (grepped: no
                                        binding in scroll-view/shared.ts at all), the defect is
                                        entirely in the wrapper
```

Angular has no conditional template-binding syntax, so `(accessibilityAction)="x.emit($event)"` on
a component tag ALWAYS subscribes — which permanently defeats the INNER component's own `.observed`
gate the moment the OUTER wrapper is used at all, regardless of any fix applied to the inner
component. Fixing `Pressable`'s gate did nothing for `Touchable`, because `Touchable` itself is an
eager subscriber of `Pressable`'s outputs. This is the same defect one level up, cascading.

## CLOSED 2026-09-02 — the wrapper answers the gate, through DI rather than a binding

`adapters/angular/src/gate-demand.ts`. A wrapper declares itself the DEMAND for its own template
(`viewProviders: [provideGateDemand(() => Button)]`); the component that owns the gate injects it
and lets it override `.observed`. Chains to any depth — the real chains are
`Button -> TouchableOpacity -> Pressable` and
`SectionList -> VirtualizedSectionList -> VirtualizedList -> ScrollView`.

**`@ViewChild` + a programmatic subscribe, which this file proposed, does not work.** The gate has
to reach the CREATE payload, and `@ViewChild` is not resolved until after the child view exists; a
subscription on the inner's own `EventEmitter` dirties nothing, so the flag would never be written
at all.

**An `@Input` carrying the demand does not work either, for a different reason: an input is public
API.** An app could bind it on a `Pressable` and silently switch that component's accessibility
events OFF — nothing in the repo would detect it and nothing on screen would show. A `viewProviders`
entry is not part of the binding surface.

Three facts about Angular DI decided the shape, all measured rather than reasoned — and the first
two came out OPPOSITE to the prediction:

```
@Host()                  does NOT see the enclosing component's own providers. It stops BEFORE the
                         host element's injector, so a child in the wrapper's own template gets
                         null while PROJECTED content — walking up the element tree from below —
                         finds it. Exactly inverted from what the fix needs.
viewProviders            own template YES, projected content NO. The boundary that is wanted, and
                         it needs no `host` flag at all.
a component sees its
own viewProviders        so a wrapper that also CONSUMES demand needs `skipSelf`, or Angular throws
                         NG0200 at construction. Loud, but easy to write wrong — hence two named
                         lookup helpers rather than one with a flag.
```

Verified on both rungs, because `viewProviders` compiles into the component definition
(`ɵɵProvidersFeature`) and this repo has a recorded case of JIT and AOT disagreeing on a compiled
binding (`test-harness-false-greens.md` §21/§21a): JIT through `mount()`, then again by executing
the artifact from a real `ngc --compilationMode partial` + `babel-linker.cjs` chain. Same four cells
both times.

Guarded by `components/gate-demand-cascade.test.ts` — 6 rows, and the two break arms are DISJOINT,
which is what says the two halves are independent (§20): removing the demand override reddens 5
rows, swapping one `viewProviders` to `providers` reddens exactly the projection row.

**And `TextInput` was NOT among the fixed three, though the table above said so for a day.** Both of
its template branches still bound all four on their bare host tag — 8 bindings, no `.observed`
anywhere in the file. Fixed the same day into its flat bag, with its own positive/negative controls
covering BOTH branches (`multiline` picks a different host tag, so a one-branch fix is exactly the
shape that component invites). The code was the deciding side; a census recorded in prose was not.

**The fourteenth site, `VirtualizedSectionList`, is in the cascade** — it binds on
`<VirtualizedList>`, one link of the four-deep chain, and is covered by the same mechanism. Its
conditional-LOOKING handler body (`resolvedOnAccessibilityAction?.($event)`) never mattered: the
BINDING lights the flag, not the handler.

Verification: `tsc --build` clean, full repo 5485 passed, each fix break-tested individually.
