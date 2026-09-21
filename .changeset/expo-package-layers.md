---
"@symbiote-native/cli": minor
---

`new`/`add` can now select each Expo-backed `@symbiote-native/*` package individually (`--battery`, `--sensors`, `--haptics`, …, one flag per package in `packages/*`) instead of only the all-or-nothing `--expo-modules` bundle, which used to install all 21 wrapper packages unconditionally. Picking any one of them implies the `expo`/autolinking wiring `--expo-modules` provides, without a second explicit flag or prompt tick.
