---
'@symbiote-native/react-migrator': minor
'@symbiote-native/cli': minor
---

New `@symbiote-native/react-migrator`: `classifyPackageHooks` sorts the public `use*` hooks of a React Native package by what their bodies call, the first step of migrating its function components to every adapter. The CLI adds it with `--react-migrator`, into `devDependencies`
