---
"@symbiote-native/cli": patch
---

`--navigation` scaffolds' Menu/Details screens in `css-modules`/`stylesheet` now match the branded `css` scaffold (logo, header options, details screen), instead of a bare "Welcome to SymbioteNative!" stub.

Also fixes vue-tsx's `--navigation` Menu/Details screens calling `navigation.push()`/`.pop()` on an unwrapped `ComputedRef` in those two styling modes - the same class of bug already fixed for the base App.
