---
paths:
  - ".vendors/expo/packages/**"
  - "packages/*/package.json"
---

# Migrating an Expo package: check the catalog first

Before porting any `.vendors/expo/packages/<name>` into `@symbiote-native/*`, check the
`symbiote-expo-package-catalog` skill — it holds the audited scope filter (CLI/EAS/router/
internal-interface packages are permanently excluded, not deferred), the anomalous-package
backlog (`expo-sqlite`/`expo-maps`/`expo-ui`/`expo-widgets`), and the single complexity-ranked
priority queue for the ~59 real candidates. Two packages look like obvious candidates but
already have an RN-native (not Expo) implementation in this repo — `expo-linking` and
`expo-status-bar` — always grep `core/engine/src/` and `adapters/*/src/modules/` for an
existing module before assuming an Expo package is net-new work.
