---
name: symbiote-docs-site-agent-surface
description: "Symbiote docs-site agent-facing surface — read BEFORE touching apps/docs-site/astro.config.mjs's `plugins:` array, `src/pages/[...slug].md.ts`, `src/components/PageTitle.astro`, the llms.txt/llms-full.txt corpora, or `docs/ai-agents.mdx`. Two halves: starlight-llms-txt (a dependency) owns the CORPORA — /llms.txt index, /llms-full.txt, /llms-small.txt, one `_llms-txt/<framework>.txt` per adapter via customSets; LOCAL code owns the PER-PAGE surface — a raw-MDX `.md` twin of every page plus the Copy-for-agent / Open-in actions row under the title. Holds WHY the per-page half is local rather than the obvious plugin (starlight-page-actions was shipped for a day, then removed: its tidymd cleaner deletes `<TabItem label=\"Vue\">` as layout chrome — 334 labels across 46 of 76 pages — and its regex import-stripper empties any inline code span containing an `import … from '…'`, both reproducible in 12 lines outside this repo), the `baseUrl` trap if it is ever reconsidered, and the two grep assertions that catch a regression. Trigger on 'copy for agent', 'llms.txt', 'llms-full.txt', 'AGENTS.md block', 'docs for AI agents', 'per-page markdown', 'tidymd', 'starlight-page-actions', 'agent can't write SymbioteNative'."
---

# Docs-site agent surface

Agents were trained before SymbioteNative existed, so unprompted they write React Native.
The docs site answers that with three things, wired 2026-09-22.

- `starlight-llms-txt` (dep) generates `/llms.txt`, `/llms-full.txt` (~900 KB),
  `/llms-small.txt`, and one `/_llms-txt/<framework>.txt` per adapter (~260 KB) from
  `customSets`. The per-framework set is the one to actually hand an agent.
- `src/pages/[...slug].md.ts` serves `<path>.md` for every page: raw MDX, frontmatter turned
  into `# title` plus a `>` description, Starlight import line dropped.
- `src/components/PageTitle.astro` overrides the h1 and adds Copy for agent, View as Markdown,
  and the hand-off links to ChatGPT, Claude, Cursor and Copilot.
- `docs/ai-agents.mdx` is the reader-facing page: the URL table and the paste-ready
  `AGENTS.md` block.

## Why the per-page half is hand-rolled

`starlight-page-actions` ships exactly this row plus `.md` twins. It was installed, measured
and removed the same day. Its cleaner `tidymd` (same author, v0.2.0, released 2026-07, two
issues ever, regex over raw text with no AST) does two things our docs cannot survive:

1. **Tab labels are deleted.** Its README lists `Tabs`/`TabItem` among "layout-only wrappers"
   removed, so `<TabItem label="Vue">` disappears and five adapters' snippets become one
   unlabelled stack. 334 labels on 46 of our 76 pages. It also does not dedent what it
   unwraps, so tab bodies keep their 4-space indent and read as indented code blocks.
2. **Inline code containing an import is emptied.** The "remove component imports" feature is
   a plain regex, so `` `import { View } from 'react-native'` `` in prose becomes `` `` ``.
   Reproducible in isolation: `cleanStarlightMarkdown("Line \`import { View } from 'x'\` here.")`
   → ``"Line `` here."``. Braces alone (`` `a { b }` ``) survive; it is the import pattern.

Total saving for that damage: 930 KB -> 860 KB, 7.5%. Raw MDX costs that 7.5% and loses
nothing; PostHog serves raw MDX for the same reason.

If the plugin is ever reconsidered: never give it `baseUrl`. That is the only thing that makes
it write its own `dist/llms.txt` in `astro:build:done`, after starlight-llms-txt's route, which
silently overwrites the richer index with a flat URL list.

## Assertions after any docs build

```sh
cd apps/docs-site && pnpm build
grep -rho '<TabItem label="[^"]*"' --include='*.md' dist | wc -l   # 334, never 0
grep -rn '``[,. )]' --include='*.md' dist                          # must print nothing
```

The second one catches the emptied-inline-code class of bug from either direction.

## Do not teach `:active` as the default press idiom

`:active` works: the one state pseudo-class the CSS pipeline keeps, as a compound token beside
the class with correct specificity (`core/css-parser/src/lightning/selectors.test.ts:165`),
flipped below the framework by `setNodePressed` (`core/engine/src/node.ts:1444`).

It is still wrong as the first thing a reader meets. Whoever sees it concludes CSS states are
supported, tries `:hover` next, and gets silence.

So examples use `onPressIn`/`onPressOut` into local state, or a functional
`style={({ pressed }) => …}`. `:active` lives in `learn/styling.mdx`'s "What is not CSS",
stated together with what does not follow from it. Any new mention belongs there, same caveat.

Still stale on this, not yet fixed: `packages/css-parser.mdx:345` and `api/svelte.mdx:156` both
say a pseudo-class selector is dropped, with no `:active` exception.

## Keeping the rules block honest

`docs/ai-agents.mdx` ends in a fenced `AGENTS.md` block a reader pastes into their own project.
It restates facts that live elsewhere in the docs — the intrinsic tag list, per-framework event
syntax, which components are still imported, the `react-native` peer rule. When one of those
changes, that block is a second place to edit. The duplication is deliberate: an agent follows a
short pinned rules file far more reliably than a 900 KB corpus. `docs/ai-agents` is in every
`customSets` path list, so each per-framework corpus carries the rules too.
