---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`SectionList` and `VirtualizedSectionList` paint separators the way RN does, inside the item cell. The section separator sits before a section's first item and after its last, the item separator only between two items of one section, and no separator is drawn next to a section header or footer. Separator components get `leadingItem`, `trailingItem`, `section`, `leadingSection` and `trailingSection`, and `highlight()` / `updateProps()` reach the neighbouring cell's separator.

A section can bring its own item render and item separator, which beat the list's. With a section separator set, flat indices now match RN's, so `getItemLayout` needs no per-boundary correction.
