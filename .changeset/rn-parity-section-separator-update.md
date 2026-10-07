---
'@symbiote-native/components': patch
---

In a section list, `separators.updateProps('leading', ...)` routed to the previous cell now replaces that cell's earlier separator props instead of merging into them, as in React Native.
