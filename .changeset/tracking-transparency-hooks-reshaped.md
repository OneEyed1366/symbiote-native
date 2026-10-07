---
'@symbiote-native/tracking-transparency': minor
---

`useTrackingPermissions` is now built on the shared permission hook and exists on every adapter. It no longer has an `error` slot: React, Vue and Solid return a `[status, request, get]` tuple, Svelte returns `{ status, requestPermission, getPermission }`, Angular gets `TrackingPermissionsService`. This is a breaking change for callers that read the error.
