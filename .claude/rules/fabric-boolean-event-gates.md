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
so the failure reads as a benchmark or lowering regression and is neither. Confirmed 2026-08-30
against a batch that touched Angular: the test file was last edited 2026-08-20 (`781193de`) and
that day's Angular diff was three lines mentioning none of the four. Before blaming a fresh commit
for it, diff the commit for those prop names — the answer is usually zero.

Full context, including why our payload is legitimately half stock's size: the
`symbiote-engine-core` skill, §10.
