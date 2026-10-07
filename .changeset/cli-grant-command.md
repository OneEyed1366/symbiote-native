---
'@symbiote-native/cli': minor
---

Add `npx @symbiote-native/cli grant <id>` for opting into a package's policy-sensitive Android permission bundle (currently `audio`'s background recording and `location`'s background tracking) after declining the interactive prompt or running `new`/`add` non-interactively. Idempotent — safe to run again on an already-granted bundle.
