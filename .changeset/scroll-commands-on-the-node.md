---
'@symbiote-native/engine': minor
'@symbiote-native/components': patch
---

`scrollTo`, `scrollToEnd` and `flashScrollIndicators` are now methods on `ISymbioteNode`, beside
`focus` / `blur` / `measure`.

A lowered ScrollView hands the app its engine node, with no wrapper to build an imperative handle
from — so anything the wrapper's handle offered has to be reachable from the node, or the public
surface silently shrinks the day the primitive stops being a component.

`buildScrollViewHandle` keeps its signature and now delegates to those methods instead of
dispatching its own commands. The defaults (`x`/`y` 0, `animated` true) live in one place, so a ref
and a tag cannot disagree about what `scrollTo()` with no argument means.
