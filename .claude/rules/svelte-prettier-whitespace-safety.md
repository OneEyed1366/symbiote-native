---
paths:
  - 'examples/svelte/**/*.svelte'
  - 'examples/expo-svelte/**/*.svelte'
  - 'adapters/svelte/**/*.svelte'
  - 'packages/*/src/svelte/**/*.svelte'
---

# `.svelte` markup is written NORMALLY — the old edge-to-edge discipline is retired

Write indented markup, one tag per line. Do not pack siblings edge-to-edge, and do not
"fix" a file that already reads normally. The packed style some files still carry is
legacy, not a requirement. Two independent mechanisms make that safe, and they cover
different halves:

1. **Between siblings — the shim, no preprocessor needed.** A whitespace-only text node
   under a parent that cannot hold raw text becomes an anchor in `dom-shim/text.ts`, never
   an `RCTRawText`, so the gap cannot reach Fabric — even with no preprocessor registered.
   The PARENT is the discriminator: a stray gap and an `{#each}` placeholder are the same
   `' '` string. Mechanism + cross-compiler measurements: `svelte-adapter-dom-shim` §16b;
   the repo-wide sweep that acted on it: §16c.
2. **Inside one text node — the preprocessor.** A sentence wrapped across source lines
   inside one `<Text>` is folded back by `collapseTextWhitespace()`, registered in every
   `svelte.config.js` and unconditionally in `metro-svelte-transformer.cjs`. It also
   deletes a whitespace-only node that spans a newline, so it closes the between-siblings
   shape at build time as well. This half is still preprocessor-dependent, which is what
   the audit gates.

Verified 2026-08-19 by compiling `examples/svelte/screens/BenchmarkScreen.svelte` through
the real preprocessor chain after reformatting it readably: zero whitespace-only literals,
zero text nodes carrying a newline.

The one shape neither pass removes is a whitespace-only gap between two siblings on ONE
line (`<View><A /> <B /></View>`) — indistinguishable from an intentional inline space, so
the preprocessor leaves it. Normal formatting does not produce one, and (1) keeps it out of
Fabric anyway.

**The audit checks the PIPELINE'S OUTPUT, not your source**, so a sentence you wrapped for
readability is not a hit. `scripts/audit-svelte-stray-whitespace.mjs` runs `preprocess()`
first as of 2026-08-19; before that it compiled raw source and reported every readable file
as an offender, which is what pushed this codebase into the packed style in the first place.
It needs `adapters/svelte/build/` present and exits 2 if it is missing rather than emitting
a wrong report.

After any `.svelte` reformat still run both — prettier can also break `svelte-check` by
reflowing a `{#snippet}` block, which is unrelated to whitespace and invisible to `tsc`:

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

## Detector — the grep MISSES the commonest shape; count with the parser

The grep below was the documented detector until 2026-09-01 and it does not answer the question.
None of its five alternatives matches `</Text><Pressable`, which is what cramming actually looks
like once a tag has attributes — the boundary is `t><P`, so `></` and `/><` both miss, and the line
ends on `<Pressable` rather than on a closing tag. Measured the same day: it reported
`examples/svelte` clean while `JsFrameRateMeter.svelte` held **14** crammed sibling pairs, and it
reported three files as hits of which all three were the known `>(() => {` false positive.

```
grep -rnE '</[A-Za-z][A-Za-z0-9-]*$|/><[A-Za-z]|^[[:space:]]*><[A-Za-z]|></[A-Za-z]|^[[:space:]]*>[^ ]' --include="*.svelte" <path>
```

Keep it only as a cheap smell test, and never read a 0 from it as an answer. **Cramming has an
exact AST definition — two sibling element/component nodes where `prev.end === next.start`** — so
count it with `parse()` from the tree's own `svelte/compiler`, walking `fragment.nodes` and every
nested block. That is the same reason the section above gives for inserting the breaks with the
parser: a `>` inside an attribute expression or a `lang="ts"` script is not a tag end, and the
regex cannot tell.

The fix loop, gated: insert `\n` at each `next.start` (descending, so earlier offsets stay valid) →
`prettier --write` → the AST compare from the section above → re-scan to 0. Verified on
`JsFrameRateMeter.svelte`: 14 breaks, AST IDENTICAL, `svelte-check` 632 files 0 errors,
`adapters/svelte` 404 pass.

Repo state after that pass: **0 crammed pairs** across all 112 source `.svelte` files
(`adapters/svelte/src`, `packages/*/src/svelte`, `examples/svelte`, `examples/expo-svelte`).

Full incident + the preprocessor's own reasoning: `svelte-adapter-dom-shim` §16 (+ §16a
intra-text, §16b the shim fix, §16c the sweep) and §29–§31.

## A primitive tag is written SELF-CLOSING — the warning is off in `svelte.config.js`

`<pressable class="x" />` is how an app writes a primitive, and Svelte warns on it:
`element_invalid_self_closing_tag`, on every tag it does not know to be void (`view`, `text`,
`image`, `switch` escape only because Svelte reads those four as SVG). The warning is about HTML's
PARSING ambiguity, and nothing in this stack is ever parsed as HTML — `fragments: 'tree'` makes the
compiler emit `from_tree()`, so every element is built by `createElement`.

Filtered project-wide since 2026-09-10, in all three configs (`adapters/svelte`, `examples/svelte`,
`examples/expo-svelte`), with the full reasoning in the adapter's:

```js
compilerOptions: {
  warningFilter: warning => warning.code !== 'element_invalid_self_closing_tag',
}
```

`svelte-check` and the language server are the whole surface — `metro-svelte-transformer.cjs` reads
`js.code` and discards `warnings`. Measured on svelte 5.56.8 (sveltejs/svelte#14654, `warningFilter`
ignored in 5.10.0, is long fixed): `examples/svelte` 15 warnings -> 3, and the 3 that remain are
real Svelte-API ones (`svelte_self_deprecated`, `svelte_component_deprecated`,
`state_referenced_locally`).

**Do not reach for the two alternatives.** A per-file `<!-- svelte-ignore
element_invalid_self_closing_tag -->` above the root element does work component-wide, and has to be
remembered on every new file. And writing an explicit closing tag instead is the trap: at the indent
a list row sits at, `<touchable-highlight class={…} testID={…}></touchable-highlight>` busts
`printWidth`, and prettier reflows it into

```
            <touchable-opacity class={cellClass(row)} testID={row.label}
            ></touchable-opacity>
```

which is what sent this rule looking for a config-level answer in the first place.

The blanket filter is safe for a project-specific reason: a React Native app has NO html elements,
so every lowercase tag is a Symbiote primitive. Re-check that premise before copying this into a
tree that also renders web.
