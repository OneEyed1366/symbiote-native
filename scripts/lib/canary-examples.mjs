// The canary example directories, READ FROM DISK rather than written down — `adapterNames()`'s
// sibling, for the same reason and after the same failure.
//
// `examples/vue-tsx` was in no CI list at all: `FRAMEWORK_EXAMPLES` in
// `scripts/check-packed-consumer-bundles.mjs` is keyed by FRAMEWORK, `vue` maps to `vue-sfc`, and
// nothing else in `scripts/`, `.github/` or `tests/` named it. Its `typecheck` script ran only when
// someone typed it, so its editor-facing `tsconfig.json` accumulated 1726 errors unseen
// (`.claude/rules/example-tsconfig-editor-parity.md`). One adapter, two examples — the arm count is
// simply not the adapter count, and a list keyed on the smaller of the two cannot express the
// larger.
//
// THE EXCLUSIONS ARE A DENY-LIST, NOT AN ALLOW-LIST — do not invert it. A new example joins every
// audit the moment its folder exists, which is the whole property; an allow-list would put the next
// one back in the silence vue-tsx spent a year in. Both entries are deliberate and documented in
// root CLAUDE.md's `<examples_vs_dot_examples>`:
//
//   bare-rn   NOT a canary. Plain react-native on React's own renderer, the baseline the adapters
//             are measured AGAINST, and its value is that it carries zero @symbiote-native deps.
//             Every parity audit is told to exclude it explicitly.
//   expo-*    outside the pnpm workspace and outside every CI example list.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

/**
 * Every canary example directory name under `examples/`, sorted so the order is stable across
 * hosts (`readdirSync` is filesystem order, which differs between machines).
 *
 * @returns {string[]}
 */
export function canaryExampleNames() {
  return readdirSync(join(REPO_ROOT, 'examples'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => name !== 'bare-rn' && !name.startsWith('expo-'))
    .sort();
}
