---
"@symbiote-native/cli": patch
---

`--styling css-modules`/`stylesheet` scaffolds now render the same branded screen as the default `css` one, instead of a bare "Taps: N" stub.

The two modes had drifted onto a hand-written skeleton `App.module.css` that overwrote whatever the real per-framework template shipped.
