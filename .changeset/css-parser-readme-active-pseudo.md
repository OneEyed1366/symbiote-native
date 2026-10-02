---
'@symbiote-native/css-parser': patch
---

README: documents that `:active`/`:hover`/`:focus` are dropped like any other pseudo-class (the `:active` machinery exists in `selectors.ts` but is deliberately disabled) and points to `Pressable`'s functional `style={({ pressed }) => ...}` prop as the supported way to style a pressed state — previously unstated, leaving the pressed-state gap undocumented.
