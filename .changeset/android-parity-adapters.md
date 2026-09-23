---
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

- Every adapter keeps an iOS Modal mounted until native dismiss, then calls `onDismiss`.
- Every adapter sends `isInvertedVirtualizedList` for inverted lists.
- Svelte and Angular lists forward `removeClippedSubviews` and `nestedScrollEnabled` to their ScrollView.
- A bare boolean attribute (`<view accessible>`, `nested-scroll-enabled`) now reaches native as `true` in Vue templates and on Svelte tags. Before, it arrived as `""`, which Android rejects.
