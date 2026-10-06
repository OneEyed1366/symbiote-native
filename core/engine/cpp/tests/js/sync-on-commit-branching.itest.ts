// RN's `SyncOnCommit-itest` with commit branching on
// @symbiote-fabric-flags {"updateRuntimeShadowNodeReferencesOnCommit":true}
// @symbiote-fabric-flags {"enableFabricCommitBranching":true}

import { defineSyncOnCommitCases } from './sync-on-commit-cases';
import { report } from './harness';

defineSyncOnCommitCases();
report();
