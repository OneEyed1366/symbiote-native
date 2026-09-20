import { mkdirSync } from 'node:fs';

// react-native's own source reads a bare `__DEV__`, which Metro defines and Node does not, so an
// upstream module imported from core/** throws `__DEV__ is not defined` on its first call rather
// than at import - the failure surfaces inside a catch, as an empty result, not as a stack.
//
// It is set as a global rather than through Vite's `define`, which does not reach a module in the
// SSR pipeline. `true` is deliberate: RN gates its own validation on this flag, and the validation
// is the half of an upstream module a hand-written port never reproduces.
Object.assign(globalThis, { __DEV__: true });

// Eighteen `*.probe.test.*` files dump their census into `.docs/`, and `.gitignore`'s blanket
// `.*/` rule means that directory does not exist in a fresh clone — so every one of them passed on
// a machine that happened to have it and threw ENOENT in CI. Created once here rather than beside
// each of the ~38 `writeFileSync` call sites: a probe's subject is what it MEASURES, and a
// mkdir repeated per call site is the copy that goes stale the next time somebody adds a probe.
mkdirSync(new URL('.docs/', import.meta.url), { recursive: true });
