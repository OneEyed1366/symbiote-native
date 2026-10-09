---
'@symbiote-native/css-parser': minor
---

`@keyframes`, `animation` and `transition` compile to the shape Reanimated reads, and keyframes declared in one file reach a class used in another.

`:hover`, `:focus`, `:focus-within`, `:active` and `:active-deepest` on the last compound of a selector compile to a state of the property they set, such as `opacity: { ':hover': 0.5 }`. The engine joins it with the base value of the same property.

A state on an ancestor, two states on one compound and a state through a deep combinator are dropped with a warning.

`:active` is no longer a switched-off selector, and a style with states that nothing serves is refused by the engine in a dev bundle.
