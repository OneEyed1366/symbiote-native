---
"@symbiote-native/cli": patch
---

`add`'s interactive layer prompt is now grouped into "Core layers" and "Expo packages" sections instead of one flat 26-option list — the 21 Expo-backed packages alone outnumbered every other layer, so finding something like "Navigation" meant scrolling past all of them. clack's `groupMultiselect` doesn't enforce a `disabled` option the way plain `multiselect` does, so an already-added layer can still render checkable there; `add` now drops an already-added layer from the result regardless of what got checked, same as it already does for explicit `--flag`s, so picking a disabled-looking option silently has no effect instead of re-applying it.
