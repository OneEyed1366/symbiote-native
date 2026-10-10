---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
---

`aria-label`, `aria-labelledby`, `aria-live`, `aria-hidden` and `role` now win over their explicit `accessibility*` twins, as in RN's `View`. `Text` resolves a negative `numberOfLines` to 0, maps style `userSelect` to `selectable` and `verticalAlign` to `textAlignVertical`, and folds `disabled` into `accessibilityState`.
