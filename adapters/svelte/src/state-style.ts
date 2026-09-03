// Re-export only. The implementation is shared (`@symbiote-native/components/state-style`) because
// two adapters had written byte-identical copies; this file exists so the code a transform EMITS
// keeps importing from the adapter package the app already depends on, rather than reaching past it.
//
// Both sides are a SUBPATH, not a barrel, and deliberately: an adapter barrel re-exports the core
// barrel wholesale, so a symbol placed there becomes public API in five packages at once — which is
// what briefly happened to this one.
export {
  resolveStateStyle,
  type IPressStateArgument,
  type IResolvedStateStyle,
} from '@symbiote-native/components/state-style';
