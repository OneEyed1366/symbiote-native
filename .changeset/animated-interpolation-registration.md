---
"@symbiote-native/engine": patch
---

Fix `.interpolate()` throwing `interpolation factory not registered` in release builds only.
`AnimatedInterpolation` lived in its own module whose load-time side effect registered the factory
`AnimatedNode.interpolate()` needs. Metro enables `inlineRequires` for production only, which moves
a `require()` down to the first place its binding is used as a value, and a barrel's re-export
compiles to a lazy getter. Nothing ever named `AnimatedInterpolation` as a value — adapters only
type it, and `verbatimModuleSyntax` erases that — so the module never evaluated and the
registration never ran. Development builds were fine, `tsc` saw nothing, and the code was present
in the bundle, just never executed.

`AnimatedInterpolation` now lives in `animated/graph.ts` beside the base class it extends, and
`interpolate()` constructs it directly, so there is no registration left to skip. Colour handling
moves to `animated/rgba.ts` alongside it. A load-time registration test guards the pattern.
