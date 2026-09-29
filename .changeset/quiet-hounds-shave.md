---
'@symbiote-native/components': patch
---

ScrollView, RefreshControl, Switch and TextInput answer their events through the shared dispatch
too, so no behavior installs a listener closure per node any more except where the name is
Fabric-gated. Per thousand items: scroll-view 3 878 -> 2 276 KB, refresh-control 5 906 -> 3 937,
text-input 3 824 -> 3 105, switch 2 461 -> 2 015.
