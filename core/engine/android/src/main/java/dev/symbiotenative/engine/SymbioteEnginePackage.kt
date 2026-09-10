package dev.symbiotenative.engine

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

// The one ReactPackage for `@symbiote-native/engine`'s native half. Autolinking registers it (see
// `../../../../../../react-native.config.cjs`), so no app touches its `MainApplication`.
//
// `BaseReactPackage` rather than the plain `ReactPackage` that `packages/android` uses, and
// `isTurboModule = true` rather than the legacy-interop default: those two together are what put the
// module on `TurboModuleManager::getTurboModule`, which is the ONLY path that consults
// `TurboModuleWithJSIBindings`. On the legacy path the module would be created, work, and install
// nothing — with no error anywhere.
class SymbioteEnginePackage : BaseReactPackage() {

  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
      if (name == SymbioteEngineModule.NAME) SymbioteEngineModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
        SymbioteEngineModule.NAME to
            ReactModuleInfo(
                SymbioteEngineModule.NAME,
                SymbioteEngineModule::class.java.name,
                /* canOverrideExistingModule = */ false,
                /* needsEagerInit = */ false,
                /* isCxxModule = */ false,
                /* isTurboModule = */ true,
            )
    )
  }
}
