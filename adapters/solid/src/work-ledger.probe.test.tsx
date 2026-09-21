// Work done against work needed, per step, on one ruler — SKIPPED, not deleted.
//
// Every case here read `applierWalk` (via `measureWorkStep`), the TypeScript mirror's own
// simulation of Fabric's `materialize` walk (`visited`/`rebuilt`/`scanned`/payload-fold counts).
// The mirror (`tree-applier.ts`/`fake-fabric.ts`) is gone (`.docs/mirror-elimination.md`) — every
// other test in this project now commits into either the real C++ engine
// (`core/engine/cpp/tests/js/*.itest.ts`) or `installRecordingFabric()`, neither of which runs
// `materialize`'s own decision-making, so neither can answer what these cases asked.
//
// Confirmed, not assumed, that no C++ substitute exists: `SymbioteTree.cpp`'s `Tree` class holds no
// members by design (a real device crash is on record from a similar attempt), RN's own
// `UIManagerDelegate` has no hook for a clone/re-adoption event, and `TransactionTelemetry` has no
// field at this granularity — see `.docs/mirror-elimination.md` Rounds 16/18/21 for the full
// investigation, including two real-engine substitutes that were tried and found not to answer the
// same claim.
//
// The two describes that DID need no mirror ("who crosses the boundary on a create", "what one
// benchmark row actually commits") already moved to `crossing-and-payload-census.probe.test.tsx`
// on `installRecordingFabric()` (Round 20).

import { describe, it } from 'vitest';

describe('what an idle surface costs a commit elsewhere', () => {
  it.skip('adds a constant per surface, not its size', () => {});
});

describe('what a second identical cycle costs', () => {
  it.skip('asks for exactly the work the first one did', () => {});
});

describe('the work a commit asks for, against the work it needs', () => {
  it.skip('accounts for every step of the benchmark sequence', () => {});
});

describe('how the work grows with the tree', () => {
  it.skip('asks for no more work per row as the row count rises', () => {});
});
