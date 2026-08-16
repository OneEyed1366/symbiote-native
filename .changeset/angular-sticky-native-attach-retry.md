---
'@symbiote-native/angular': patch
---

Fix Angular sticky headers that render in the right place and never move.

`stickyHeaderIndices` is an ordinary `@Input`, so it can arrive AFTER the first change-detection
pass - which is what any app deriving it from data rather than writing a literal in the template
does. The native scroll-value attach ran only from `ngAfterViewInit`, which fires once, and returns
early while the indices are still empty. It was never retried, so the scroll offset never reached
the AnimatedValue and every header's interpolation sat at its resting value forever.

What made this read as "the feature is on but broken" rather than "the feature is off": the
projection half self-heals. The wrapper is still created, around the right child, with the right
z-index - so the header appears exactly where it belongs and simply does not track scroll. Nothing
logs, nothing throws.

`attachSticky()` now also runs from `ngOnChanges`, and is idempotent: it records the
`(sticky enabled, host node)` pair the current attach was made for and returns when neither
changed, so driving it from every input change does not churn the native scroll event. The pair is
recorded even when the node is not resolved yet, so the next call - which will see a real node -
still reads as a change.

React, Vue and Svelte never had this hole: all three re-run the same attach from a reactive effect
keyed on the same condition, so a late `stickyHeaderIndices` self-heals there.
