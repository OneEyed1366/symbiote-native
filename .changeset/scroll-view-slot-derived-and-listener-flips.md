---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
---

Two engine seams a composed host primitive needs, and ScrollView's prop half wired onto them.

`IHostBehavior.slotDerived` names owner props the internal slot's payload is computed from, so a
write to one marks the slot dirty. `markPropsDirty` bubbles up, so without it a derived slot value
is correct at mount and frozen forever after. Read past `setProp`'s identity guard, so a re-render
writing an unchanged value still costs nothing.

`IHostBehavior.onOwnedListenerChange` fires when the app wires or unwires an owned listener — never
on the fresh closure a framework hands over each render. `afterCommit` cannot serve this: a listener
change moves no Fabric prop, so the commit after it is a no-op and post-commit hooks are skipped.

A lowered ScrollView now resolves `decelerationRate` to the platform friction constant, turns off
content-cell flattening for `maintainVisibleContentPosition` / `snapToAlignment`, and synthesizes
`onContentSizeChange` from its content view's layout — installing that gated `onLayout` only when
the app passed a handler, as RN and every wrapper do.
