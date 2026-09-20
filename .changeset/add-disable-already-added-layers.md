---
"@symbiote-native/cli": patch
---

`add`'s interactive layer prompt now lists every layer always, disabling the ones already present with an "already added" hint, instead of filtering them out of the menu — a shrinking list with no visible reason read as a bug, not a filter.
