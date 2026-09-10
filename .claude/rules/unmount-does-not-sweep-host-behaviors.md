---
paths:
  - 'core/engine/src/host-behavior.ts'
  - 'core/engine/src/commit.ts'
  - 'core/components/src/behaviors/**'
---

# `unmount()` drops the container and leaves every `afterCommit` node armed — CLOSED 2026-09-10

> **Fixed: `disposeRoot` now calls `teardownSubtree(container, detachAnimatedProps)` BEFORE deleting
> the container, which is the only beat at which the subtree is still reachable.** `detachSubtree`
> also skips a node already in `tornDown`, so an unmount after the framework emptied the tree does
> not detach twice. Guarded by `core/engine/src/__tests__/after-commit-lifecycle.test.ts`.
>
> **The two diagnostic shapes below stay true as symptoms to recognise** — they are what a
> behavior-lifetime bug looks like, and the next one will look the same.

`disposeRoot` (`core/engine/src/commit.ts:630`) was the whole of what a surface teardown did:

```ts
pendingByRoot.delete(rootTag);
rootContainers.delete(rootTag);
```

It touches no NODE. `committedOf` reads `node.committed`, a field on the node, so every node of the
dead surface still answers `isCommitted` -> true. And `committedEachTime`
(`host-behavior.ts:471`) is module state whose own comment says it "holds until teardown" — a
teardown that, for a real surface, never comes. `clearHostBehaviors()` clears it and is marked
**test-only**.

So after `unmount()`, every node that declared `afterCommit` keeps being drained on **every later
commit anywhere in the process**.

Two shapes it takes, and the first is the one that wastes a day:

```
in tests    a suite's Switch snap-back leaks one setValue:[false] into every LATER test in the
            file — the failure lands in a test that never mounted a Switch
on device   Fast Refresh / surface restart reuse a rootTag, so the previous surface's snap-backs
            and its Touchable delayPressIn timers keep firing against dead Fabric tags
```

Measured 2026-09-10 during the Solid component-to-tag round: reproduced twice, once through Switch
(cross-test `setValue` leakage) and once through TouchableOpacity (a `delayPressIn` timer outliving
its surface, which read as a behavior bug and is not one).

## Working around it without masking it

Scope the oracle to the node under test rather than to the command log — a `commandsFor(testId)`
helper, not `commands.at(-1)`. A global-log assertion in this engine is reading every surface that
has ever existed, which is why it drifts as a file grows rather than failing outright.

## Before blaming a behavior for a stale value

Ask whether an EARLIER test in the same file mounted the same primitive. A behavior that is correct
on Svelte and wrong on one other adapter's suite is far more likely to be this than an adapter
divergence — Svelte's `touchable-opacity.smoke.test.ts` passes the same nine cases on the same
shared behavior.

## Why the sweep could not do it

`sweepDetachedBehaviors` only walks nodes a `removeChild` NOMINATED, and an unmount nominates
nothing — the adapter drops the whole surface rather than removing children. So the one path that
tears behaviors down was structurally unable to see the one event that ends every node's life. A
teardown mechanism keyed on the wrong signal reads as complete for as long as nobody asks it the
other question.
