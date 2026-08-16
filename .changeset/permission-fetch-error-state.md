---
'@symbiote-native/brightness': minor
'@symbiote-native/cellular': minor
'@symbiote-native/tracking-transparency': minor
---

Surface a failed permission fetch instead of losing it. `usePermissions` auto-fetches the current
status on mount, and that call had nobody to reject to: a native rejection escaped as an unhandled
promise rejection and left `status` at `null` - indistinguishable from "still fetching". A consumer
could not tell a device that denied the read from one that had not answered yet.

Every adapter now exposes an `error` of type `Error | null` beside `status`, so the two states read
apart:

| status   | error   | meaning                    |
| -------- | ------- | -------------------------- |
| `null`   | `null`  | not fetched yet            |
| `null`   | `Error` | the automatic fetch failed |
| response | `null`  | fetched                    |

A later successful `get()` / `request()` clears `error`, so a stale failure cannot sit next to a
fresh status. Hand-called `get()` and `request()` still REJECT to their direct caller - only the
automatic mount-time call was made safe; swallowing an error the app asked for by hand would be a
worse bug than the one this fixes.

React's returned tuple grows from three elements to four, `[status, request, get, error]`; existing
two- and three-element destructuring is unaffected. Vue and Svelte gain an object key, Angular a
`readonly error: Signal<Error | null>` beside the existing `connect()`, whose return type is
unchanged.

Angular's auto-fetch is now latched to at most one run per service instance. It used to re-fire on
every `connect()` call while `status` was still `null`, which a failed fetch makes permanent - and
unbounded the moment `connect()` is reached from a change-detected expression. `get()` is the
retry, and `error()` is how a consumer knows one is warranted.
