---
'@symbiote-native/components': patch
---

Sticky headers follow the scroll position past `contentInset.top` and start pinned at the initial `contentOffset`, as in React Native; the shared scroll value ignored both.
