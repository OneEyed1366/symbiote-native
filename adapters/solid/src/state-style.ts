// Re-export only. The implementation is shared (`@symbiote-native/components`) because two adapters
// had written byte-identical copies; this file exists so the code a transform EMITS keeps importing
// from the adapter package the app already depends on, rather than reaching past it.
//
// Imported from the SUBPATH, not the barrel: every adapter barrel re-exports
// `@symbiote-native/components` wholesale, so a name on that barrel silently becomes public API on
// all five — which is how a transform internal nearly shipped as a supported export.
//
// Present on every adapter, including those with no lowering transform yet: a per-framework subpath
// that four of five declare is exactly the silent gap `tests/package-subpath-parity.test.ts` exists
// to catch, and the file costs a re-export. Deliberately NOT on the public barrel — the emitted
// code names it, app code does not.
export {
  resolveStateStyle,
  type IPressStateArgument,
  type IResolvedStateStyle,
} from '@symbiote-native/components/state-style';
