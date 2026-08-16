---
paths:
  - "examples/*/App.css"
  - "examples/*/components/*.css"
  - "examples/*/src/**/*.css"
  - "examples/*/**/*.vue"
  - "examples/*/**/*.svelte"
---

# CSS in an example app — two silent, build-clean traps

`core/engine/src/style-registry`'s registry is one flat `Map` shared across
every CSS source in an app; a same-named class in `App.css` and a
`components/*.css` file collide silently, and whichever registers LAST
(import order, not file position) wins — no build error, no warning. Before
changing a class-tied style/color here, grep the WHOLE app for that class
name, not just this file. Full incident + mechanics: invoke the
`symbiote-sfc-style-compiler` skill (§9, "Cross-file class-name collisions").

**`var()` resolves only inside the file that declares the custom property.**
A component stylesheet writing `var(--mist)` against a token declared in
`App.css`'s `:root` registers the LITERAL STRING `"var(--mist)"` and ships it
to Fabric — build-clean, silently unpainted on device. Outside `App.css`, use
literals. Check with
`node -e "console.log(require('./core/css-parser/build/index.js').parseCSS(require('fs').readFileSync('<file>','utf8')))"`
— any `var(--…)` left in the output is a bug. Same skill, the section next to §5b.
