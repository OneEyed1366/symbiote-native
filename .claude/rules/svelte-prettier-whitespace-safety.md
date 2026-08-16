---
paths:
  - "examples/svelte/**/*.svelte"
  - "adapters/svelte/**/*.svelte"
---

# `prettier --write` on `.svelte` files needs a follow-up audit, not blind trust

Reformatting with `prettier-plugin-svelte` can silently reintroduce §16's whitespace
bug (a stray text node between siblings) and can independently break `svelte-check`
by reformatting a `{#snippet}` block onto multiple lines. Both are invisible to `tsc`
and to a normal diff read. After any `.svelte` reformat, run both:

```
node scripts/audit-svelte-stray-whitespace.mjs <path>
cd examples/svelte && npm run typecheck
```

A sentence wrapped across source lines inside one `<Text>` is now auto-fixed at build
time by `collapseTextWhitespace()` (registered in every `svelte.config.js` and in
`metro-svelte-transformer.cjs`) - the one-physical-line discipline no longer needs
hand-enforcing, only the sibling-gap case still does. Full incident + fix, measured
2026-08-17, verified on a real iOS simulator: `svelte-adapter-dom-shim` skill §29/§30.
