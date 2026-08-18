---
paths:
  - "core/engine/src/node.ts"
  - "core/engine/src/surface.ts"
  - "core/engine/src/commit.ts"
---

# A new mutation entry point owes a `markDirty` — forget it and the screen goes stale silently

`reconcile` skips any subtree whose root is not `dirty`. So ANY new code that writes
`node.props`, `node.children`, or reparents a node must call `markDirty` — otherwise the
change never reaches Fabric: no crash, no error, nothing to grep for. Add a row to
`core/engine/src/__tests__/dirty-marking.test.ts` proving the new mutator survives a commit.

Four traps, each already paid for once (full rationale: `symbiote-perf-measurement` skill,
"The fix: dirty marking"):

- **Listeners deliberately do NOT mark.** `node.listeners` never reaches Fabric, and React
  hands a fresh closure nearly every render — marking there re-dirties the whole tree and
  gives the win back. `layout` is the exception and goes through `setProp`.
- **Structural ops mark the PARENT chain, never the moved child** — a moved child may still
  be clean, and a mark on an already-dirty child stops instantly. Reparenting is caught by
  re-checking `committed.parent` on the early-exit path.
- **The synthetic root container is marked in `commitContainer`, not by bubbling.** Top-level
  nodes carry `parent === undefined`, so no mark can reach it. Removing that line reddens
  every Animated / `setNativeProps` test.
- **Anchors are cleared in `renderableChildren`** — they are flattened out of the walk and
  reach `reconcile` never, so a permanently-dirty anchor would swallow its subtree's marks.

## The other half: a no-op commit fires NO post-commit hook

`commitContainer` returns on `if (!result.changed)` and that `return` sits ABOVE
`runPostCommitHooks()`. So **anything that awaits a post-commit hook to learn "the mutation
landed" waits forever when the mutation changed nothing** — no error, no log outside DEBUG, just a
promise that never settles. Measurement harnesses and tests are where this bites; the benchmark
screens' fixed-order suite hit it and now guards its one potentially-empty step
(`if (rows.length > 0) await runStep(clear)`), with a timeout as the backstop rather than the fix.

No adapter is exempt. React's `resetAfterCommit` does call into the engine unconditionally, but the
early return lives in `commitContainer` itself, below that call — so a React harness hangs on a
no-op exactly like a Vue, Svelte or Angular one. Never treat "the post-commit hook will fire" as
guaranteed; it is conditional on the tree actually changing, in every adapter.
