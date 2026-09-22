---
'@symbiote-native/test-utils': patch
---

README: replaced every reference to the deleted `installFabric()` with the real `installRecordingFabric()`/`createRecordingHost()`/`propsOf()` API, removed a "Committed-payload assertions" section documenting functions (`normalizeCommitted`, `expectCommittedProps`) that never existed in source, and added the missing "Reading the live tree" (`createLiveTree`, `walkLive`/`findLive`, `serialize`, `outline`) and "Measuring the engine, not the app" (`censusLive`, `trackHostCrossings`) sections for APIs that shipped with no documentation.
