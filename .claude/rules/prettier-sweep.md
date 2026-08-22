---
paths:
  - '.prettierrc.json'
  - '.prettierignore'
  - 'examples/**'
  - 'apps/docs-site/**'
---

# The prettier sweep covers everything, at 80 — five things that bit when it was widened

Until 2026-08-18 the root sweep was `{core,adapters,packages,apps}/**` at `printWidth: 100`,
`examples/` was ignored wholesale, `.svelte`/`.vue` were never formatted, and
`pnpm format:check` had been failing for long enough that nobody ran it (no workflow in
`.github/workflows` invokes it, so CI never said so). It is now `{core,adapters,packages,
apps,examples}` over `ts,tsx,js,json,astro,svelte,vue,md,mdx,css` at **80**, and green.

**An ignore pattern with an internal slash is anchored to the ignore file's directory.**
Plain `ios/Pods/` matched only a repo-root `ios/Pods`; every example's CocoaPods sandbox had
been caught by the blanket `examples/` line and started leaking in the moment that line went
away. It is `**/ios/Pods/` now. Same class: `package-lock.json` (npm owns it — examples are
standalone `npm install` trees), `*.xcassets/` (Xcode rewrites those `Contents.json`), `*.tgz`.

**A config's `plugins` are loaded for EVERY file that config covers, not just the ones needing
the parser.** So the root needs `prettier-plugin-svelte` merely to read
`examples/svelte/.prettierrc.js` — without it the sweep dies on that tree's plain `.ts` files
with `Cannot find package`. `examples/expo-svelte` had `.svelte` files but no plugin in its own
config at all, which only surfaced once the sweep reached it. Both plugins
(`prettier-plugin-svelte`, `prettier-plugin-astro`) are in the root catalog and declared in
`.prettierrc.json`'s `plugins` + `overrides`, because prettier 3 does not auto-discover them.

**Judging a file's width by its longest line gives the wrong answer.** Prettier does not wrap
comments or string literals, so a file wrapped at 80 still shows lines of 97. Measure by
running `--check` at a candidate width instead — that mistake produced a confident, wrong
claim that the examples were at 100.

**Prettier can emit MDX that no longer compiles.** In
`apps/docs-site/.../expo-native-module-setup.mdx` it indented a closing `</Aside>` by three
spaces to align it with the ordered list the Aside wrapped. MDX then reads that tag as list
content, the JSX block never closes, it swallows the following prose, and the astro build dies
in the COMPILED output with `[PARSE_ERROR] Expected ',' or '}'` pointing at a mangled
`const { Aside...` — nothing in the source looks wrong. The same file was also a format
fixpoint failure (`--write` then `--check` reported it dirty again). One edit fixes both: a
**blank line before the closing tag** of a JSX block that contains a markdown list. Write new
Asides that way. Note the build is the only thing that catches this — `format:check` was happy
with the broken output.

**Source-text test fences must compare whitespace-insensitively.**
`adapters/angular/src/angular-gaps.test.ts` greps Angular sources for bindings that can vanish
silently (ngc gives no signal for a removed `[x]="y"`). Reflowing to 80 split
`class AnimatedImage extends ImageBase` and `[accessibilityRespondsToUserInteraction]="..."`
across lines and failed two fences whose bindings were still perfectly present. Both sides now
run through `withoutSpacing()` before `toContain`, so layout cannot fail the guard; the guard
itself is still live (removing a binding was verified to fail it).
