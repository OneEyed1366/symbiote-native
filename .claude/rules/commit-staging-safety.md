---
paths:
  - "lint-staged.config.js"
  - ".husky/*"
---

# Never stage a partial hunk in this repo — the pre-commit hook deletes the rest

`.husky/pre-commit` runs `lint-staged`, which **replaces the working tree with the staged content**
for the duration of its tasks. One of those tasks is `tsc --build` scoped to the touched packages.
An **untracked** file is not reverted (lint-staged only restores tracked ones), so it stays on disk
referencing symbols that live in the hunks you did NOT stage. The build fails, lint-staged kills the
remaining tasks, and the restore leaves most tracked files sitting at HEAD.

Measured 2026-08-21: staging only the `setNodeHidden` hunk of `core/engine/src/node.ts` left the
untracked `core/engine/src/__tests__/child-scan-profile.test.ts` calling `takePropStats`, which the
staged `node.ts` did not export. 163 files of a day's uncommitted work were reverted by one commit.

**So: commit whole files.** When a file genuinely carries two themes, name both in the subject
(`feat(engine): add a hidden style slot and commit-path counters`) rather than splitting the file.
The index-only techniques in the global `commit-work` skill (`git apply --cached`,
`git hash-object` + `git update-index`) are safe by themselves — it is the HOOK that does the
damage, and it fires after they do.

## Recovery, and why the obvious command is not enough

`git stash list` shows `stash@{0}: lint-staged automatic backup`. The content IS there.

**`git stash apply` restored none of the tracked files** — it exited 0, printed a normal status, and
left `node.ts` at HEAD. Do not trust its exit code; verify a known symbol afterwards. What works is
file-by-file:

```bash
for f in $(git stash show --name-only stash@{0}); do
  git show "stash@{0}:$f" | cmp -s - "$f" || git show "stash@{0}:$f" > "$f"
done
```

**That loop has its own trap**, and it cost a second round: for a path DELETED in the stash,
`git show` fails, but the shell has already created an empty file via the `>` redirect. A deleted
`ProbeScreen.{css,ts}` came back at 0 bytes and broke the CSS golden-corpus snapshot. Afterwards,
sweep for zero-byte files among the modified set and delete the ones that should be gone:

```bash
git status --porcelain | awk '$1=="M"{print $2}' | while read f; do [ -s "$f" ] || echo "EMPTY: $f"; done
```

Then run the full suite before continuing — the snapshot test was the only thing that caught it.
