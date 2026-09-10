// The engine's native half, PLATFORM-SHARED. Every line that does real work lives here; the per-
// platform files under `ios/` (and, when item 8c-1 lands, `android/`) do nothing but register a
// module and call `installBindings`.
//
// That split is not tidiness, it is the arithmetic that decides whether Android is affordable.
// React Native's own equivalent — `AnimatedModule`, which reaches the runtime through the same
// `TurboModuleWithJSIBindings` hook and applies its per-frame edits with `ShadowNode::cloneMultiple`
// inside a registered commit hook — is a pure C++ TurboModule in `ReactCommon/react/renderer/`, with
// no platform directory at all. Every one of the eight `registerCommitHook` call sites in RN is
// likewise shared code. So the applier this file will eventually carry is ONE implementation for both
// platforms, and Android's cost is a JNI registration shim rather than a second applier.
//
// Why we still need a platform shim at all, when RN's own modules do not: RN registers its C++
// modules from inside its own TurboModule manager. A third-party package has no such hook in 0.86 —
// the codegen generator has no `cxxModules` path — so the module must be an ObjC class on iOS and a
// Java/JNI one on Android. That shim is the only thing that is written twice.

#pragma once

#include <jsi/jsi.h>

namespace symbiote {

/**
 * The ABI the JS side checks before it will use any of this.
 *
 * The two halves ship as separate artefacts — a CocoaPods sandbox and an npm package — with separate
 * install steps, so an `npm install` without a `pod install` leaves them disagreeing. That is the
 * ordinary state of this repo's local-dev loop, not an exotic one, which is why the version is a
 * gate rather than a diagnostic.
 *
 * 1 -> 2: nodes stopped being addressed by an integer id out of a C++ table and became JS objects
 * carrying their own `shared_ptr` as `NativeState`. Every method NAME survived that, so the JS
 * shape guard cannot see the difference — only this number can. A v1 pod given a v2 batch ignores
 * the `handles` argument and commits nothing; a v2 pod given v1 calls reads an integer as an object.
 * Must move with `SUPPORTED_NATIVE_VERSION` in `core/engine/src/native-engine.ts`.
 *
 * 3 -> 4: the bindings stopped replaying FABRIC operations (`Applier`) and started owning the shadow
 * tree (`Tree`). The three structural reads are new NAMES, which the JS shape guard would refuse on
 * its own — but `applyOps` went from six arguments to five under the SAME name, and a v3 binary
 * reads argument 1 as an `Int32Array` of child ids where JS now passes a string table. That read
 * succeeds against the wrong object and commits a wrong tree rather than throwing, which is exactly
 * the class this number exists to refuse. A refusal by luck, on the reads, is not a refusal.
 *
 * It did NOT move for `takeCommitSplit`: no layout and no calling convention changed, and JS reads
 * that one optionally so a pod without it degrades to zeroes rather than throwing. Same reasoning
 * `native-engine.ts` records for `probeUIManager`.
 */
constexpr double kNativeVersion = 4;

/**
 * Install `global.__symbioteEngineNative`.
 *
 * Called once, from whichever platform shim got hold of the runtime. Everything JS can reach on the
 * native side goes through the object this installs.
 */
void installBindings(facebook::jsi::Runtime &runtime);

} // namespace symbiote
