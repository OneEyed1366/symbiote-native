---
"@symbiote-native/test-utils": patch
---

Republish with the `build/` directory actually included — the currently published `0.1.1` tarball is missing it entirely (only `package.json`/`README.md`/`LICENSE` shipped), breaking module resolution for every consumer. `pnpm pack` against the current source confirms `build/` is produced correctly; this was a one-off publish gap, not a config bug.
