---
paths:
  - "packages/*/package.json"
---

# New package: resolve scope tier before implementing

Creating a brand-new `packages/<name>/package.json`? Don't default straight to
this repo's usual full-adapter-parity assumption. First resolve which is
wanted: bare-skeleton (reserve the npm name, no functional code yet),
core-only, or core + full adapter parity — ask if it isn't already stated.
Full tier shapes, what NOT to touch at the bare-skeleton tier (catalog,
`examples/*`, `CHANGELOG.md`, the lockfile), and precedents: the
`symbiote-new-package-skeleton` skill.
