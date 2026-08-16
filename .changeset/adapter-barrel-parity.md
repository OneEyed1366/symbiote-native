---
"@symbiote-native/angular": minor
"@symbiote-native/react": minor
"@symbiote-native/vue": minor
---

Close 22 gaps in the adapters' public barrels. About half of each adapter's surface is names
re-exported verbatim from `@symbiote-native/engine` and `@symbiote-native/components`, and nothing
enforced that the four lists agreed, so they drifted apart. A missing re-export is not a type
error, so `tsc` never saw it — it only surfaced when an app tried to import a name and its
framework's package turned out not to have it.

Newly reachable per adapter: React gains `setColorProcessor`, `setDeviceEventSource`, `dlog`,
`isDebug`, `ISymbioteNode`, `IRootTag`, `IKeyboardEvent`, `IKeyboardMetrics` and ten
component-detail types; Vue gains `setDeviceEventSource` and five types; Angular gains eleven
engine types and eleven component types. `ITextInputProps` stays deliberately per-adapter, since
React and Vue declare their own over the shared agnostic base and Angular takes props as
`@Input()`s.

`tests/adapter-barrel-parity.test.ts` now enforces this and compares its known-gap list for
equality, so adding a shared name to one barrel without the rest fails with the adapters named,
and closing a gap without deleting its entry fails too — the list cannot rot into an allowlist.

Also removes 31 passthrough stub files (`src/modules/x.ts` containing nothing but a re-export from
the engine). They were internal, so no import path changes: a pure passthrough belongs in the
barrel itself.
