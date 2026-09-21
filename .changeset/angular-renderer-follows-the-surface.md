---
'@symbiote-native/angular': patch
---

Keep publishing styles after Angular destroys a component.

The factory hands one `Renderer2` to every component on a surface, and `Renderer2.destroy()` runs
per destroyed component. That call used to release the renderer's `beforeFlush` registration, which
is the only door an accumulated style run has, so after a keyed `@for` replace the instance went on
serving every surviving view while writing into an accumulator nothing would publish. A selection
then reached Fabric only when some other node's style run closed, two steps later.

`destroy()` now publishes what it holds and nothing more; the registration is released by
`SymbioteRendererFactory.dispose()`, called from `teardown` once the surface itself is going away.
