---
paths:
  - 'examples/svelte/**/*.svelte'
  - 'adapters/svelte/**/*.svelte'
---

# Write ordinary readable Svelte — the build fixes the whitespace

`collapseTextWhitespace()` is registered in every `svelte.config.js` and in
`metro-svelte-transformer.cjs`, and it fixes BOTH shapes normal formatting produces:
a sentence wrapped across source lines inside one `<Text>`, and a whitespace-only
node between two siblings that spans a newline (i.e. each sibling on its own line).
So format `.svelte` like Vue or like any normal Svelte file - real indentation,
siblings on their own lines, long sentences wrapped. The packed edge-to-edge style
some files still carry is legacy, not a requirement.

Verified 2026-08-19 by compiling `examples/svelte/screens/BenchmarkScreen.svelte`
through the real preprocessor chain after reformatting it readably: zero
whitespace-only literals, zero text nodes carrying a newline.

**Still uncaught, and the only case to hand-check:** a whitespace-only gap between
two siblings on ONE line (`<View><A /> <B /></View>`) - indistinguishable from an
intentional inline space, so the preprocessor leaves it. Normal formatting does not
produce one.

**The audit must run on PREPROCESSED source.** `scripts/audit-svelte-stray-whitespace.mjs`
does this as of 2026-08-19; before that it compiled raw source and reported every
readable file as an offender, which is what pushed this codebase into the packed style
in the first place. It needs `adapters/svelte/build/` present and exits 2 if it is
missing rather than emitting a wrong report.

After any `.svelte` reformat still run both - prettier can also break `svelte-check`
by reflowing a `{#snippet}` block, which is unrelated to whitespace and invisible to `tsc`:

```
node scripts/audit-svelte-stray-whitespace.mjs <path>
cd examples/svelte && npm run typecheck
```

Full incident + the preprocessor's own reasoning: `svelte-adapter-dom-shim` skill
§16/§29/§30 (those sections still describe the packed style as mandatory - stale,
correct them when that skill is next edited).
