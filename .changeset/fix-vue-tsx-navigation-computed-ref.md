---
"@symbiote-native/cli": patch
---

Fix `--navigation --vue-flavor tsx` scaffolds throwing `TypeError: undefined is not a function` when navigating: `useStackNavigation()` returns a Vue `ComputedRef`, and vue-sfc's `<template>` auto-unwraps a top-level ref referenced in it (so `navigation.push(...)` compiles there), but the tsx flavor's App is a plain JSX render function that Vue's compiler never touches — the same call left `navigation` a bare `ComputedRef` with no `.push`/`.pop`. The template now calls `navigation.value.push(...)`/`navigation.value.pop()`.
