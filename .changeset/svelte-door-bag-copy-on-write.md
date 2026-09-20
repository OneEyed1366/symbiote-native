---
'@symbiote-native/svelte': patch
---

The DOM shim's `writeBagKey` now copies its door bag on write only while the bag is shared (right
after a `cloneNode`), instead of spreading it on every individual `setAttribute`/`set_style`/
`set_class`/`addEventListener` call. A copy-on-write ownership flag tracks whether an element is
still the sole holder of its door bag; once it is, a write mutates in place and routes just the one
changed key instead of re-diffing the whole bag — `foldedBag()` hands the bag back by reference when
there is no `p` bag to merge, so a mutated-in-place write and a full diff would otherwise compare the
bag against itself.
