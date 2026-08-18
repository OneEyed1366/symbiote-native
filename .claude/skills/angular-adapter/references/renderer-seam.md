## 1. The renderer seam — Angular is already built for us

An Angular component **never touches the DOM directly**. Every paint goes through
`Renderer2` (created per-component by `RendererFactory2`). The default factory
returns a DOM renderer; Angular lets you provide your OWN factory. That is the exact
framework-agnostic seam, the twin of:

- Vue — `createRenderer(RendererOptions)` (`adapters/vue/src/renderer.ts`)
- React — the `react-reconciler` host config

So the adapter is a `SymbioteRenderer implements Renderer2` whose every method maps
onto the engine's tiny mutation API — the engine owns all Fabric clone-on-write,
shared with every other adapter (`<clone_on_write_lives_in_engine>`). Mapping
(mirror of the Vue `RendererOptions` map):

```
Angular Renderer2             →  @symbiote-native/engine
──────────────────────────────────────────────────────────────────
createElement(name)           →  createElement(descriptorFor(name)) + toPublicInstance
createText(value)             →  createRawText(value)
createComment(value)          →  createAnchor()            // twin of Vue createComment
appendChild(p, c)             →  appendChild(p, c)         + surface.requestCommit()
insertBefore(p, c, ref)       →  insertBefore / appendChild + requestCommit()
removeChild(p, c)             →  removeChild(p, c)         + requestCommit()
parentNode(n) / nextSibling   →  n.parent ?? surface / sibling lookup in children
setProperty(el, name, val)    →  routeProp(el, name, val)  + requestCommit()   // [prop]="x"
setAttribute(el, name, val)   →  routeProp(...)            + requestCommit()    // name="x"
setValue(textNode, val)       →  setText(textNode, val)    + requestCommit()
listen(node, event, cb)       →  setEventListener(node, event, cb)              // (press)="x"
setStyle / [style]="…"        →  routeProp(el,'style',…)   // per-key; merges via engine's getExplicitStyle
addClass/removeClass          →  per-node token Set, rejoined + routeProp(el,'class',joined)  // class="x" / [ngClass]
```

**Corrected 2026-07** (was previously documented as a no-op — see the
`symbiote-sfc-style-compiler` skill for the full cross-adapter design): Ivy
compiles every `class=`/`[class.foo]`/`[ngClass]` form down to per-token
`addClass`/`removeClass` calls, never a single string. `SymbioteRenderer`
accumulates a per-node `Set<string>` of tokens (`adapters/angular/src/
renderer.ts`) and re-joins it on every change, then routes through
`routeProp(el, 'class', joined)` — the SAME centralized class+style merge
React's `className` and Vue's `class` use (`core/engine/src/node.ts`), so a
class registered via the SFC/CSS-Modules style compiler resolves identically
regardless of adapter. `setStyle`/`removeStyle` were also fixed at the same
time: they now read/write via the engine's exported `getExplicitStyle(node)`
instead of `el.props.style` directly, since that may now hold the
`[classStyle, explicitStyle]` array the centralized merge writes.

Two facts that make this cheap:

- **Events come pre-named.** Angular compiles `(press)="…"` into a
  `listen(node, 'press', cb)` call — the event name is **explicit**, no `onX→x`
  inference. The engine already anticipates this: `setEventListener`'s comment in
  `core/engine/src/node.ts` literally names "Angular Renderer2.listen" as a planned
  direct caller. `[prop]="…"` bindings arrive via `setProperty` → `routeProp`
  (flat-bag path, shared with React/Vue). So Angular is mixed: events structural,
  props flat-bag — both already supported.
- **One renderer per surface.** `SymbioteRendererFactory.createRenderer` returns one
  `SymbioteRenderer(surface)` for all components (wolf-tui reuses a single instance
  the same way). The factory's `begin()/end()` hooks could coalesce a commit per CD
  cycle, but per-mutation `surface.requestCommit()` already microtask-coalesces, so
  the Vue path transfers verbatim.

The seam itself is ~150 lines, low risk. Reference shape:
`wolf-tui/packages/angular/src/renderer/{wolfie-renderer,wolfie-renderer-factory}.ts`
(same architecture, ANSI target — the framework seam transfers, the host-call
targets differ).
