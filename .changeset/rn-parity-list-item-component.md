---
'@symbiote-native/components': minor
'@symbiote-native/react': minor
'@symbiote-native/vue': minor
'@symbiote-native/solid': minor
'@symbiote-native/svelte': minor
'@symbiote-native/angular': minor
---

`FlatList` and `VirtualizedList` take RN's `ListItemComponent` (`listItemComponent` on Vue, Svelte and Angular), a component that draws a cell from `item`, `index` and `separators`. It wins over the item renderer and warns when both are given, a cell with neither throws like RN. The list handle's `getNativeScrollRef()` is the scroll's host ref, so it has `measure`, `measureLayout` and `measureInWindow`. `Button` falls back to `accessibilityLabel` for an empty `aria-label`.
