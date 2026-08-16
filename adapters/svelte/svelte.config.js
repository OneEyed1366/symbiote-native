// `experimental.customRenderer` (sveltejs/svelte#18042) is what actually wires our adapter in —
// see svelte-adapter-custom-renderer skill. The value is a plain string tag, never resolved as a
// module path by our own tooling (mount() gets the real renderer object separately, via
// `{ renderer }`); it only needs to be a stable, non-empty identifier, matching how Svelte's own
// custom-renderer test suite uses an arbitrary file path for the same field. Once enabled, the
// compiler itself rejects `bind:`/`transition:`/`animate:`/`<svelte:head|window|body|document>`
// on an element at COMPILE TIME — the retired `forbid-web-only-constructs.ts` preprocessor caught
// the same constructs by hand; deleting it in favor of the compiler's own errors is the whole
// point of moving off the DOM shim. `fragments: 'tree'` is no longer load-bearing (the shim's
// from_tree/clone-on-write dance is gone — a custom renderer never clones, per the same PR) but
// is harmless to keep; `css: 'external'` stays mandatory (now enforced by the compiler, not just
// convention) — styling goes through @symbiote-native/css-parser + the class registry, the same
// path Vue SFC <style> blocks already use.
import { scopedStyles } from './src/preprocessor/scoped-styles.ts';

export default {
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
    experimental: {
      customRenderer: '@symbiote-native/svelte/renderer',
    },
  },
  preprocess: [scopedStyles()],
};
