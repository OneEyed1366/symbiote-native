---
'@symbiote-native/vue': patch
---

Three unrelated Vue fixes landing together:

- A template ref (`useTemplateRef()`) to a host element came back deep-readonly — Vue's
  `readonly()` wraps any `.value` whose `Object.prototype.toString` reads `"[object Object]"`,
  which is true of a plain `SymbioteNode` class instance. Reads worked, so a commit mirror saw a
  "committed" node, but a write like `setNativeProps` silently no-opped with a dev-only readonly
  warning. The renderer now `markRaw`s the node before handing it back.
- A listener wired through `onPress`/`onValueChange` runs from the engine's native event dispatch,
  entirely outside anything Vue wraps — a throw inside it skipped `onErrorCaptured` and
  `app.config.errorHandler` and reached Hermes's own top-level handler directly, an unframed
  redbox with no component stack. `patchProp` now wraps a native-event listener through
  `callWithErrorHandling` with the owning component instance, threaded down through `patch`
  exactly as Vue's own DOM renderer does for a native DOM event.
- `<Teleport>` inside a compiled `.vue` SFC silently stopped re-rendering once mounted.
  `runtime-helpers` used to shadow `vue`'s own `Teleport` with the adapter's guarded
  `../create-portal` wrapper for every `from 'vue'` import — but `@vue/compiler-sfc` recognizes
  the literal tag name `Teleport` as one of Vue's own built-ins at compile time regardless of what
  value it resolves to, and compiles its children with a PROPS-only patch flag. A real
  `defineComponent` under that name then goes through Vue's ordinary `shouldUpdateComponent` check,
  which only re-renders on the props named in that flag and never on a children/slot change — a
  `<Teleport :to="...">` gated by `v-if` rendered once at mount and froze. The real, unwrapped
  `Teleport` now flows through unshadowed for the compiled-SFC path; the guarded wrapper stays
  exported from the adapter's main barrel for hand-built `h(Teleport, ...)` calls (TSX), where no
  such codegen special-case applies.
