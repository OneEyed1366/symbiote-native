---
'@symbiote-native/engine': minor
---

On Android, a view allocated in the commit that inserts it gets no props from that commit. `@media`, `matchMedia` and `@container` styles are now re-applied by a follow-up commit, so the first visible frame is styled.
