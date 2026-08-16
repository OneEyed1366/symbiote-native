---
"@symbiote-native/components": patch
"@symbiote-native/angular": patch
"@symbiote-native/react": patch
"@symbiote-native/vue": patch
---

Keep sticky headers correct when a cell is force-rendered. `VirtualizedList` can render a cell
outside the normal virtualization flow — to satisfy `initialScrollIndex`, or to keep a focused row
mounted — and the sticky-header reducer treated those cells as if they had arrived through the
usual windowing path. The tracked header index then disagreed with what was actually mounted, and
the wrong section header stuck (or none did) until the next ordinary scroll correction.

The reducer now distinguishes force-rendered cells from windowed ones, and each adapter's
`VirtualizedList` reports them as such.
