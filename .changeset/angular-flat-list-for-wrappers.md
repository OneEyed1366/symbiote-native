---
'@symbiote-native/angular': minor
---

`FLAT_LIST_TEMPLATE`, `provideGateDemand` and the `IVListCellContext` type are exported, so a list built on `FlatList` can keep its template and its accessibility gate. The scroll handle methods of `FlatList` now sit in a base class that such a list extends.
