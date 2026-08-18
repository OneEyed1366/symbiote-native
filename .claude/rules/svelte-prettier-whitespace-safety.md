---
paths:
  - "examples/svelte/**/*.svelte"
  - "examples/expo-svelte/**/*.svelte"
  - "adapters/svelte/**/*.svelte"
  - "packages/*/src/svelte/**/*.svelte"
---

# `.svelte` markup is written NORMALLY — the old edge-to-edge discipline is retired

Write indented markup, one tag per line. Do not pack siblings edge-to-edge, and do not
"fix" a file that already reads normally. A whitespace-only text node under a parent
that cannot hold raw text becomes an anchor in `dom-shim/text.ts`, never an
`RCTRawText`, so the gap cannot reach Fabric — even with no preprocessor registered.
The PARENT is the discriminator: a stray gap and an `{#each}` placeholder are the same
`' '` string. Mechanism + cross-compiler measurements: `svelte-adapter-dom-shim` §16b;
the repo-wide sweep that acted on it: §16c.

A sentence wrapped across source lines inside one `<Text>` is folded back by
`collapseTextWhitespace()`, registered in every `svelte.config.js` and unconditionally
in `metro-svelte-transformer.cjs`. That half is still preprocessor-dependent, which is
what the audit gates — and it checks the PIPELINE'S OUTPUT, not your source, so a
sentence you wrapped for readability is not a hit:

```
node scripts/audit-svelte-stray-whitespace.mjs <path>   # 0 wrapped text nodes
cd examples/svelte && npm run typecheck
```

## If you ever need to un-cram a file again

- **Prettier will not do it for you, at any setting.** It never ADDS whitespace between
  siblings — `htmlWhitespaceSensitivity` `css`/`ignore`/`strict` all produce byte-identical
  output on crammed source. It DOES preserve a break you insert, so the fix is to insert
  breaks first and let prettier lay out the rest.
- **Insert them with the parser, not a regex.** Take each element's first/last child
  offsets from `svelte/compiler`'s `parse()` and break there. A `>` inside an attribute
  expression or a `lang="ts"` script is not a tag end, and an element that exceeds
  `printWidth` with zero whitespace inside gets re-crammed unless its text content is
  broken out too.
- **Each example has its OWN `.prettierrc.js`** (`examples/svelte`, `examples/expo-svelte`),
  separate from the repo root. A root-only config change never reaches them; all three now
  set `htmlWhitespaceSensitivity: 'ignore'`.
- **Gate every file on an AST compare**, whitespace-only text nodes dropped and remaining
  text collapsed AND trimmed — Svelte trims text-node edges itself, so `<p>x</p>` and
  `<p>\n  x\n</p>` compile byte-identical; forgetting the trim produces false refusals.

## Detector

`^[[:space:]]*>` alone is WRONG — it matches prettier's normal `bracketSameLine: false`
bracket for a multi-attribute tag, which is not cramming. Use:

```
grep -rnE '</[A-Za-z][A-Za-z0-9-]*$|/><[A-Za-z]|^[[:space:]]*><[A-Za-z]|></[A-Za-z]|^[[:space:]]*>[^ ]' --include="*.svelte" <path>
```

Expect 0 except `>(() => {` — a multi-line TS generic argument inside `<script>`, not markup.
