---
"@symbiote-native/splash-screen": minor
---

Stop a failed `hide()` from stranding the app under a splash it can never dismiss. The readiness
gate marks itself fired before `hide()` settles, so a rejection meant `animate()` never ran and no
later layout or load event could retry - the caller's overlay stayed up over a working app, with
the failure swallowed by a bare `.catch(() => {})`. `animate()` now runs on both paths. The worst
case becomes a fade-out over a native splash that may still be showing; it used to be the whole
app.

This is a deliberate divergence from react-native-bootsplash, which swallows the same rejection.
A second `.catch` covers the caller's own `animate()` throwing, so that cannot become an unhandled
rejection either.

New optional `config.onError?: (failure: IHideAnimationFailure) => void`, where `failure.stage` is
`'hide'` or `'animate'`. It is the channel an app actually hears about this on - the `dlog` at the
same seam is DEBUG-gated and therefore the developer's, not the app's.

A MISSING native module still throws, unchanged and on purpose. `RNBootSplash` is acquired through
`TurboModuleRegistry.getEnforcing`, which fails loudly at import by design, and upstream reads its
constants unguarded for the same reason: an absent native module is a build error, not a runtime
condition to degrade around. Softening it would hide exactly the failure this repo already
documents - `npm install` deleting the `.rn-bootsplash/` sources the podspec vendors at
pod-install time.

`HideAnimationController` now reads the native constants once and exposes them as `readonly
constants`, so no adapter reads them itself.
