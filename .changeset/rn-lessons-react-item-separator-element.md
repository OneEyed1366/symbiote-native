---
'@symbiote-native/react': patch
---

`ItemSeparatorComponent` of `FlatList`, `VirtualizedList`, `SectionList` and `VirtualizedSectionList` accepts a ready React element as well as a component, as in RN 0.83. An element is rendered as it is, a component gets the separator props. Before, an element threw "Element type is invalid" on the first separator.
