// The five adapter names, READ FROM DISK rather than written down.
//
// Three call sites used to hardcode this list — `tests/adapter-barrel-parity.test.ts`,
// `tests/package-subpath-parity.test.ts` and the since-deleted bundle-isolation checker — in
// three different orders and with no shared source. All three happened to be complete, and that
// completeness rested on six separate people not forgetting.
//
// They forgot three times. `solid` was added after the other four, so every list written before it
// existed still omitted it: `OVERLAY_ONLY` in the old overlay script, the `./solid` subpath in 12 of 25
// companion packages, and the census probe that three adapters got a fix for and Solid did not. In
// all three the symptom was silence — a stale measurement, an import that throws only in a
// consuming app, a probe that missed a repo-wide change — because no audit detects a member that is
// simply absent from the list being audited.
//
// A directory listing cannot be written stale. The sixth adapter becomes a member of every audit
// the moment its folder exists, which is the property the discipline was trying and failing to
// supply.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

/**
 * Every adapter directory under `adapters/`, sorted so the order is stable across hosts
 * (`readdirSync` is filesystem order, which differs between machines and would make a snapshot or a
 * printed grid churn for no reason).
 *
 * THE FILTER IS DELIBERATELY JUST `isDirectory()` — do not narrow it. Requiring a `package.json`,
 * a `src/index.ts`, or a name from an allow-list all look like tidying and each one re-opens the
 * exact hole this module closes: an adapter early enough not to have that file yet drops out of
 * every audit, silently. A stray directory, by contrast, fails LOUDLY and names itself
 * (`AccessibilityInfo: missing from zzz-probe`), so a human deletes it in seconds.
 *
 * That asymmetry is the whole argument. A false red costs a minute and explains itself; a missing
 * member costs a release and says nothing.
 *
 * @returns {string[]}
 */
export function adapterNames() {
  return readdirSync(join(REPO_ROOT, 'adapters'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}
