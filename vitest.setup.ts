// react-native's own source reads a bare `__DEV__`, which Metro defines and Node does not, so an
// upstream module imported from core/** throws `__DEV__ is not defined` on its first call rather
// than at import - the failure surfaces inside a catch, as an empty result, not as a stack.
//
// It is set as a global rather than through Vite's `define`, which does not reach a module in the
// SSR pipeline. `true` is deliberate: RN gates its own validation on this flag, and the validation
// is the half of an upstream module a hand-written port never reproduces.
Object.assign(globalThis, { __DEV__: true });
