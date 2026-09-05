---
paths:
  - 'core/engine/src/node.ts'
  - 'core/engine/src/surface.ts'
  - 'core/engine/src/commit.ts'
---

# A new mutation entry point owes a `markDirty` — forget it and the screen goes stale silently

`reconcile` skips any subtree whose root has no pending work. So ANY new code that writes
`node.props`, `node.children`, or reparents a node must call `markDirty` — otherwise the
change never reaches Fabric: no crash, no error, nothing to grep for. Add a row to
`core/engine/src/__tests__/dirty-marking.test.ts` proving the new mutator survives a commit.

## The record moved off the node into a BUFFER (2026-09-05) — every rule below is unchanged

`dirty`, `propsDirty` and `structureDirty` are no longer fields on `ISymbioteNode`. The three
questions now live as three `Set`s in `core/engine/src/edit-buffer.ts`, read with `hasPendingWork`
/ `hasPendingProps` / `hasPendingStructure` and consumed with the matching `clearPending*`. The
`markDirty` / `markPropsDirty` / `markStructureDirty` names are UNCHANGED and are still the
mutation-side vocabulary every rule here is written in — nothing below needs re-reading, and a new
mutator still calls exactly the same function.

Why, since the behaviour is identical by construction: a node is meant to carry an ADDRESS and
nothing the framework did not already allocate, and a walk over per-node flags cannot be handed to
a native module where a drained buffer can (`symbiote-fabric-cxx-surface` §9). This is step one of
two — the buffer currently holds WHICH nodes were touched, not WHAT the edit was.

**The one genuinely new obligation, and it has no equivalent in the flag era: a removal must
NOMINATE.** A boolean died with its node; a `Set` pins it. So `nominateDroppedEdits(child)` is owed
by every path that cuts a parent link — `node.ts`'s `detach` and `removeChild`, `surface.ts`'s
`detach`, `removeChild` and `clear` — and `sweepDroppedEdits` decides at commit which nominees
really left. Forget it and `Clear` on a thousand ten-node rows pins ten thousand nodes for the life
of the process, with byte-identical Fabric output and every test in the repo green.

It cannot be done at removal instead, for the same reason `sweepDetachedBehaviors` exists one file
over: an adapter spells a MOVE as remove-then-reinsert, and dropping a moved child's entries loses
a prop written in the same tick — the silent-stale-UI failure this whole file guards. Covered by
`core/engine/src/__tests__/edit-buffer.test.ts`, whose header records which break reddens which row.

## Structural ops must mark BEFORE they mutate, not after (2026-08-23)

The ordering used to be free; it is now load-bearing. `reconcile` stores the reconciled child
list in the committed record **by reference**, so for a parent holding no anchors
`record.children` IS `parent.children` — one array, not two. `markStructureDirty` is what copies
it out of the way, and it can only do that while the old list is still intact. Mark after the
splice and the record silently follows the mutation: `childrenIdentical` then compares the array
against itself, reports no structural change, and the row never reaches Fabric.

Why the alias exists: the record used to hold `kids.slice()`, one array per node per commit —
9 002 on a 1 000-row create (measured), all but the handful of nodes that go on to change
discarded unread. Copy-on-write moves that to one copy per changed parent per commit→mutation
cycle: create went 9 003 → 1.

So a new entry point that mutates a child list owes `markStructureDirty(parent)` as its FIRST
statement. This bit `truncateChildren` in `reconcile.bench.ts` immediately — it splices
`parent.children` directly to stay O(N), and without the mark its rows measured nothing at all.

## An allocation-count win measured on V8 is not a Hermes win — `for...in` lost on device

Tried and reverted the same day, and worth keeping because the reasoning was sound and the answer
was still no. `fabricProps` calls `Object.keys` twice per non-text node — **10 007 arrays on a
1 000-row create**, counted by wrapping `Object.keys`. `for...in` allocates none: the count went
10 007 → 3 and the headless bench's create/replace `min` dropped 12-13%.

On device it was **slower**. Release, `examples/react`, with the Fabric call counts and the prop
payload byte-identical either way (9000/5000/1009, 32001 keys — so nothing below the JS changed):

```
              stock   react     verdict
before        186.8   217.8
after         195.5   243.2     stock +4.7% = its noise floor; react +11.7%
```

Hermes' `for...in` is not V8's enum cache. Reverted in `fabric-props.ts`, with the finding recorded
at the loop so nobody re-derives it from first principles.

Two transferable rules. **The headless bench ranks JS shapes for V8 and cannot rank them for
Hermes** — use it for algorithmic counts (how many arrays, how many visits), never to choose
between two spellings of the same loop. And **read the adapter against stock in the SAME run**: the
stock column moving 4.7% is what tells you 11.7% is real rather than drift.

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

## Clearing a node's flags can ORPHAN a dirty descendant — `markDirty`'s early exit is the reason

`markDirty` walks up `while (!current.dirty)` and stops at the first already-dirty ancestor. That is
correct and load-bearing for cost. What it means, though, is that **a descendant's dirty flag can be
the ONLY thing standing between a clean ancestor chain and a lost update** — and any code that later
CLEARS an ancestor's flags without publishing that descendant strands it permanently: `reconcile`
skips a subtree whose root is not dirty, so the node is unreachable from then on. No crash, nothing
red, and it never recovers, because every later write to that node marks it dirty again and bubbles
into the same clean chain.

Measured 2026-08-24 on the lowered `Pressable` path, per step (committed / engine-node):

```
external update        v10 / v10   commits=2   child[dirty=false]  pressable[dirty=false]
press + child update   v10 / v11   commits=2   child[dirty=TRUE ]  pressable[dirty=false]
external update        v10 / v21   commits=2   child[dirty=TRUE ]  pressable[dirty=false]
```

The sequence: `setNodePressed` dirties the pressed node; in the SAME tick the framework writes a
prop on its CHILD, so `markDirty` bubbles one step, meets the already-dirty pressed node and stops;
`commitTargeted` then publishes the pressed node's props and clears its flags without descending
(by design, and the function says so). The child is left dirty under a clean chain.

**So the rule has a second half: a path that CLEARS dirty flags owes the same care as one that sets
them.** `commitTargeted` already has the right shape for it — it bails to the general path on
`node.structureDirty` — and a dirty descendant deserves the same bail rather than a silent clear.

Two things this cost, worth not re-deriving:

- **A test suite covering "the node itself updates during a press" passes while this is broken.**
  Five such cases were green. The failing shape is specifically a DESCENDANT of the pressed node
  updating in the same tick, which no case had.
- **Three of five adapters hide it, by accident.** Vue and Solid re-render by rewriting the prop on
  the node itself, which re-dirties the chain; Svelte's fine-grained write touches only the child.
  So "it works on my adapter" is evidence about that framework's scheduler, not about this code —
  and a fix must not depend on a framework re-dirtying anything.
