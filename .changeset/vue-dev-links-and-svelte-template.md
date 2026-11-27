---
'@symbiote-native/vue': patch
'@symbiote-native/cli': patch
'@symbiote-native/test-utils': patch
---

`vue`: in a dev build a removed screen is now freed, as Vue's dev links on its elements are dropped.

`cli`: the Svelte template turns on `experimental.customRenderer`, adds the `svelte-custom-renderer`
Metro condition and requires `svelte >= 5.59.1`.

`test-utils`: `createLiveTree` leaves out an empty raw text, as a commit does. Pass `keepBlankText`
to keep it.
