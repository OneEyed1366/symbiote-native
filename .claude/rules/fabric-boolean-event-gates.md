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

Cite the HASH rather than a day for anything here: `781193de` was authored 2026-08-20 23:51 and
committed 08-21 20:53, so two sessions reading `%ai` and `%ci` will each "correct" the other's
date forever.

Full context, including why our payload is legitimately half stock's size: the
`symbiote-engine-core` skill, §10.
