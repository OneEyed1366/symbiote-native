---
'@symbiote-native/keep-awake': patch
'@symbiote-native/clipboard': patch
'@symbiote-native/engine': patch
'@symbiote-native/svelte': patch
'@symbiote-native/vue': patch
---

Four unrelated defects, each small and each previously invisible in tests.

**`keep-awake` leaked a listener across teardown.** Activation is async and nothing guarded the
window: a consumer that unmounted before it resolved still got a listener registered afterwards,
attached to something gone, with nothing left to remove it. React was half-clean - it had the
unmount guard but discarded the subscription, so a listener attached during a NORMAL mount was
never removed either. A shared attachment helper now refuses to attach after release and removes
anything that already landed; all four adapters use it.

**`clipboard.hasStringAsync` threw synchronously** where its eight siblings reject. It was declared
`function`, not `async`, so the `UnavailabilityError` escaped at the call site before a promise
existed - `hasStringAsync().catch(handler)` never reached the handler. (Upstream expo has the same
split at `Clipboard.ts:57`; diverging here because a guard that fires differently from every other
method in one API is a trap, not a wart.)

**`AnimatedValue.resetAnimation` reset only the JS side.** The native graph keeps its own copy of
the value, so a native-driven node stayed wherever the animation stopped while JS believed it had
been reset - visible on device, invisible to every JS-driven test. `setValue` already pushed for
this reason; RN pushes here too.

**Vue's `setElementText` built an invalid Fabric tree in silence.** `insert()` throws when a raw
text lands under a non-`<Text>` parent, but Vue routes an element's single string child through
`setElementText`, which had no such check - so the same invalid tree the array path rejects was
accepted quietly. It now enforces the same invariant. Only reachable from a hand-written `h()` on a
raw intrinsic; the `View` wrapper passes children as slots and already hit the guard.

**Svelte's web-only-construct guard missed namespace imports.** It inspected named import
specifiers, which a namespace import has none of, so `import * as R from 'svelte/reactivity'`
carried the banned `MediaQuery` straight through - a browser-only API that answers `false` to every
query on a native host, indistinguishable from a legitimate no. A namespace import of a module with
banned members is now refused, since the preprocessor cannot tell statically which members it
reaches.
