// `svelte/internal/client` ships no type declarations of its own — its package.json export map
// has a `default` entry and nothing else, and svelte's `types/index.d.ts` does not cover it. This
// adapter is already, by design, coupled to Svelte's private internals (the whole DOM shim is —
// svelte-adapter-dom-shim skill §0), so the declaration is hand-maintained here, narrowed to the
// one function actually imported. Re-check it on every `svelte` bump, alongside §8's checklist.
declare module 'svelte/internal/client' {
  // internal/client/dom/elements/attachments.js. `getFn` is re-read inside a managed effect, and
  // the returned attachment is invoked inside a branch effect so a reactive read in its body
  // re-runs it with the previous teardown fired first.
  export function attach(node: unknown, getFn: () => unknown): void;
}
