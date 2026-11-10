// The engine's native half, PLATFORM-SHARED. Every line that does real work lives here; the per-
// platform files under `ios/` (and, when item 8c-1 lands, `android/`) do nothing but register a
// module and call `installBindings`.
//
// That split is not tidiness, it is the arithmetic that decides whether Android is affordable.
// React Native's own `AnimatedModule` reaches the runtime through the same hook as this file
// It is a pure C++ TurboModule in `ReactCommon/react/renderer/` with no platform directory
// So the applier is ONE implementation for both platforms and Android costs only a JNI shim
//
// Why we still need a platform shim at all, when RN's own modules do not: RN registers its C++
// modules from inside its own TurboModule manager. A third-party package has no such hook in 0.86 —
// the codegen generator has no `cxxModules` path — so the module must be an ObjC class on iOS and a
// Java/JNI one on Android. That shim is the only thing that is written twice.

#pragma once

#include <jsi/jsi.h>

namespace symbiote {

/**
 * The ABI the JS side checks before it uses any of this
 * Moves with `SUPPORTED_NATIVE_VERSION`, for an op layout or a call, never for a diagnostic
 */
constexpr double kNativeVersion = 9;

/**
 * Install `global.__symbioteEngineNative`.
 *
 * Called once, from whichever platform shim got hold of the runtime. Everything JS can reach on the
 * native side goes through the object this installs.
 */
void installBindings(facebook::jsi::Runtime &runtime);

} // namespace symbiote
