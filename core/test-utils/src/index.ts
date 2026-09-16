// @symbiote-native/test-utils: shared, framework-agnostic test harness. Imported by the co-located
// tests across engine, adapters, and the example apps.
//
// The TypeScript mirror (`tree-applier.ts`/`fake-fabric.ts`, `installFabric()`) that used to stand
// here is GONE (`.docs/mirror-elimination.md`) — every test commits into either the real C++ engine
// (`core/engine/cpp/tests/js/*.itest.ts`, driven by `scripts/run-itests.mjs`) or
// `installRecordingFabric()` below, which records the op stream and derives nothing.
export {
  createRecordingHost,
  installRecordingFabric,
  payloadOf,
  type IAuthoredNode,
  type IRecordingHost,
} from './recording-host';
// Reading the tree that is ON SCREEN over that recording — the lens for every residency question
// (`is this still mounted`, `did the pop remove it`) that `find` cannot answer, because `find`
// searches the creation log. Anchors flatten, as the commit walk flattens them. See its header.
export {
  censusLive,
  createLiveTree,
  type ILiveCensus,
  type ILiveNode,
  type ILiveTree,
} from './live-tree';
// How many times JS crossed the host boundary — generic over whichever host is installed.
export {
  trackHostCrossings,
  type IHostCrossingTracker,
} from './host-crossings';
export * from './wait-for';
