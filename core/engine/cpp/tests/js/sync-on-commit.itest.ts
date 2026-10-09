// RN's `SyncOnCommit-itest` with commit branching off
// @symbiote-fabric-flags {"updateRuntimeShadowNodeReferencesOnCommit":true}
// @symbiote-fabric-flags {"enableFabricCommitBranching":false}

import { defineSyncOnCommitCases } from './sync-on-commit-cases';
import { report } from './harness';

defineSyncOnCommitCases();
report();
