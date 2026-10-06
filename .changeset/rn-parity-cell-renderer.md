---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/solid': patch
'@symbiote-native/svelte': patch
'@symbiote-native/angular': patch
---

`FlatList`, `SectionList` and `VirtualizedList` take RN's `CellRendererComponent` (React and Solid `CellRendererComponent`, Vue `cellRendererComponent`, Svelte `cellRenderer` snippet, Angular `<ng-template vListCell>`): it replaces the view around each cell and receives the cell key, index, item, style and the layout and focus handlers.

The view around each cell of a horizontal list now lays out as a row, so the separator sits beside the item as in RN, and an inverted list's cell reverses its direction before flipping back.
