package dev.symbiotenative.engine

import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.interfaces.BindingsInstallerHolder
import com.facebook.react.turbomodule.core.interfaces.TurboModuleWithJSIBindings

// Android's registration shim, and the twin of `core/engine/ios/SymbioteEngineModule.mm`. It carries
// no behaviour: creating it is what installs `global.__symbioteEngineNative`, and the payload lives
// in `core/engine/cpp/`, compiled unchanged by `../CMakeLists.txt`.
//
// `TurboModuleWithJSIBindings` is the Android analogue of iOS's `RCTTurboModuleWithJSIBindings` —
// `TurboModuleManager::getTurboModule` calls `getBindingsInstaller()` the moment it creates the Java
// module and applies the returned installer to the runtime. So there is no `install()` for JS to
// call, deliberately: an explicit install has an ordering requirement nothing enforces, while this
// hook cannot be skipped by anyone who reaches the module at all.
//
// Both members below are `external` and bound in `src/main/cpp/SymbioteEngineJni.cpp`. `getVersion`
// in particular: it is the ABI gate `native-engine.ts` reads, and its value is `kNativeVersion` in
// the shared C++ — restating it as a Kotlin constant would be a second spelling that drifts silently.
@DoNotStrip
@ReactModule(name = SymbioteEngineModule.NAME)
class SymbioteEngineModule(reactContext: ReactApplicationContext) :
    NativeSymbioteEngineSpec(reactContext), TurboModuleWithJSIBindings {

  // Not in a `companion object` initializer: the companion is only touched when something reads
  // `NAME`, and `getBindingsInstaller` is called on the INSTANCE. Loading here runs before either
  // native member can be reached, and a repeat `loadLibrary` of an already-loaded name is a no-op.
  init {
    System.loadLibrary("symbiote_engine")
  }

  @DoNotStrip external override fun getBindingsInstaller(): BindingsInstallerHolder

  @DoNotStrip external override fun getVersion(): Double

  companion object {
    // Declared here rather than read off the generated spec's own `NAME`, so this file and the
    // package beside it do not depend on a field of a class that exists only after codegen runs.
    const val NAME: String = "SymbioteEngine"
  }
}
