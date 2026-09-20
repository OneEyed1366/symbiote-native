// SKIPPED, not deleted — migrated to a real-engine itest.
//
// This used to be a regression for a clone-on-write bug that only a Fabric-FAITHFUL prop MERGE
// reveals: real Fabric's `cloneNodeWithNewProps` merges the raw diff onto a node's existing
// props, so a folded key that simply stops appearing inside `style` between two commits (not an
// explicit `setProp(..., undefined)`) must still reach the clone as an explicit null, or the
// stale value survives. The file kept a purpose-built merge slot for exactly that reason —
// `installFabric()`'s TypeScript mirror used REPLACE semantics, which would make the test
// vacuously green (why the bug shipped in the first place).
//
// The mirror is gone (`.docs/mirror-elimination.md`). `installRecordingFabric()` is not a
// substitute here: its host intercepts the mutation-buffer wire (raw, un-folded `style` objects)
// BEFORE the engine ever reaches `SymbioteFabricProps.cpp`'s `diffProps` — the fold-and-merge
// this test is actually about happens entirely in C++, downstream of where that host sits. So the
// claim was ported to the real engine instead:
// `core/engine/cpp/tests/js/style-key-removal.itest.ts`, driven by the real
// `symbiote_tester` C++ binary through `scripts/run-itests.mjs`. That test was verified RED
// against a deliberately-broken `diffProps` (the vanished-key-resend loop commented out) and
// GREEN once restored, so it is a real, non-tautological proof of the exact behavior this file
// used to characterize — see its own header for the full story.

import { describe, it } from 'vitest';

describe('clone-on-write prop removal', () => {
  it.skip('sets opacity on press and fully resets it on release', () => {});
});
