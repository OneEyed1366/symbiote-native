// @symbiote-native/test-utils: shared, framework-agnostic test harness. Imported by
// the co-located tests across engine, adapters, and the example apps so the fake-Fabric
// recorder and its helpers live in exactly one place.
export * from './fake-fabric';
// The reference shadow tree — the JS stand-in for what native holds on device. `installFabric()`
// installs it as the engine's tree host; it is exported so a fixture can drive it directly.
export * from './tree-applier';
export * from './lowering-equivalence';
export * from './wait-for';
