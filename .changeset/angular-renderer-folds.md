---
'@symbiote-native/angular': minor
---

Angular gains the lowering pipeline, and three renderer fixes it uncovered.

Lowering runs as a Metro source pre-pass, `@symbiote-native/angular/metro-transformer`, rather
than as a Babel plugin. Angular's linker reads an inline template by slicing the file's source
text at the AST node's byte range, so a `template` rewritten in the AST is invisible to it while
the same plugin's `dependencies` edit lands — half-applied lowering, which leaves tags matching
nothing. Point `metro.config.js` at the new transformer and drop the plugin from
`babel.config.js`.

Fixed alongside it, all three independent of lowering:

- `id` never folded to `nativeID` on any Angular path, so `<View id="x">` reached Fabric with a
  key no ViewConfig declares and the native ID was silently lost. Both that fold and `Text`'s RN
  defaults now run in the renderer, which covers the wrapper, the lowered element and a host tag
  hand-written in adapter source alike.
- An array-composed `[style]` crashed inside Angular's own styling engine
  (`prop.indexOf is not a function`) and the throw landed in a zoneless change-detection tick with
  nothing catching it, so the retry re-fired forever. Arrays are flattened before the binding.
- `[(value)]` on `Switch` and `TextInput` lowers as written, instead of forcing an app to spell
  the two-way binding some other way.

Accessibility events are no longer forwarded eagerly. `accessibilityTap`, `magicTap`,
`accessibilityEscape` and `accessibilityAction` fire only when a boolean prop reaches the payload,
so an unconditional template binding lit the gate on every instance whether or not anything
subscribed. Components now answer their own gate, and a wrapper declares demand for its template
through DI so the cascade `Button -> TouchableOpacity -> Pressable` still works.

Renderer hot-path diagnostics are behind `isDebug()`. Nine sites built a template string on every
`createElement`, `appendChild`, `insertBefore`, `removeChild` and `setValue` in a Release build
that emits none of them, plus a closure per removed node: Create -5.5%, Append -10.7%,
Clear -25.5%.
