// What chunking actually buys, measured through a real adapter on the row that regressed — SKIPPED,
// not deleted.
//
// The claim read `childrenAdopted`, the TypeScript mirror's own simulation of what native
// `UIManager::cloneNode`'s child hand-over does (`fake-fabric.ts`'s tally of
// `cloneNodeWithNewChildren`/`cloneNodeWithNewChildrenAndProps` calls). The mirror is gone
// (`.docs/mirror-elimination.md`), and no real-engine substitute exists at this granularity —
// `SymbioteTree.cpp`'s `Tree` holds no members by design, and neither `UIManagerDelegate` nor
// `TransactionTelemetry` expose a clone/re-adoption count.
//
// The underlying question is ANSWERED, just not by this file any more. Real-engine measurement
// (`commitMs` off `readSurfaceTelemetry()`, `.docs/mirror-elimination.md` Rounds 19-21,
// `.docs/tree-inefficiency-findings.md` F-78) found: plain grouping (no `display:contents`) is a
// real, consistent ≈15-20% win over a flat list, confirming F-5's underlying mechanism. `display:
// contents` specifically erases that win — Yoga's own `skipContentsNodes()` layout iterator
// (`yoga/yoga/node/LayoutableChildren.h`) still walks every row through a flattened group, so the
// row-proportional layout cost never actually goes away, while the group wrappers still pay their
// own creation cost. F-78 has the full mechanism and the reconciliation with F-17's own (correct,
// but narrower — Yoga-only) benchmark.

import { describe, it } from 'vitest';

describe('what chunking buys on the row that regressed', () => {
  it.skip('prices flat against grouped by what Fabric is handed', () => {});
});
