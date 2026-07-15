---
"@symbiote-native/css-parser": patch
---

Fix a false `UNRESOLVED` hit in the build's ESM-extension fixer: a doc comment quoting an example import (`` `import styles from './Card.module.css'` ``) matched the same regex the fixer uses to rewrite real relative imports, and since no such file exists on disk it was reported as unresolved and failed the build. The comment now describes the example without the literal import-statement text, so the fixer only ever matches real code.
