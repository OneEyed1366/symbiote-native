---
paths:
  - 'apps/docs-site/**/*.astro'
---

# docs-site — Astro template whitespace vs inline tags

`pnpm run docs:build`'s HTML compression strips a line-break's whitespace to
**zero characters**, not one space, whenever the break lands immediately next
to an inline tag boundary (`<code>text</code>` opening or closing) — unlike a
browser's normal HTML whitespace collapsing. Two real, previously-unnoticed
instances of this: `Output()EventEmitter` and `further:import styles` in
`src/pages/index.astro`'s trait cards (both predate any Svelte work; found
and fixed 2026-08-15 while adding Svelte content to that same page).

Text immediately touching a `<code>`/`</code>` boundary must stay on the
SAME source line as that tag — only break a line where both sides are plain
text (or entirely inside one element's own text content, e.g. mid-string in
a `<code>` block). Verify after editing:

```bash
python3 -c "
import re
c = open('apps/docs-site/dist/index.html', encoding='utf-8').read()
print(re.findall(r'[a-zA-Z0-9.,;:)\'\"]<code', c))
print(re.findall(r'</code>[a-zA-Z]', c))
"
```

Both should be empty (a `</code>s` plural suffix with no space is fine and
intentional — check by eye, it isn't a false positive of the same bug).
