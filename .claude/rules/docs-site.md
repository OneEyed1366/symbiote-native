---
paths:
  - "apps/docs-site/**/*.mdx"
  - "apps/docs-site/**/*.md"
---

# docs-site — install snippets

Docs are read by real consumers installing symbiote packages from npm, who have
no pnpm workspace and no `workspace:*` protocol. Never write `"workspace:*"`
(or any other monorepo-internal version specifier) in a docs-site code
snippet. Show a real install command instead: `pnpm add @symbiote/<pkg>` /
`pnpm add -D @symbiote/<pkg>` — no version pinned, `package.json` only shows
fields the reader actually needs to add by hand (e.g. a `scripts` entry).
