// The first native code this project owns. Everything else under `packages/*` with a podspec is a
// WRAPPER that vendors somebody else's sources; this compiles our own.
//
// It exists for item 8c of the `symbiote-fabric-cxx-surface` skill: the engine's structure must live
// in memory a native module owns, so that JS reads it as a typed-array view rather than calling for
// it. This header is the iOS entry point — the module whose creation installs the host object.
//
// It does NOT touch React Native's own native sources, which `<native_core_is_untouched>` forbids.
// Everything it uses is public: `RCTTurboModuleWithJSIBindings` is a declared protocol, and RN's own
// `AnimatedModule` reaches the runtime through the identical hook.

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Registered as `SymbioteEngine`. Resolving it from JS is what CREATES it, and creation is what runs
 * `installJSIBindingsWithRuntime:callInvoker:` — so `core/engine/src/native-engine.ts` touches the
 * module for its side effect and then reads the global the hook installed.
 */
@interface SymbioteEngineModule : NSObject <RCTBridgeModule>
@end

NS_ASSUME_NONNULL_END
