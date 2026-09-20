// Android's registration shim — the twin of `core/engine/ios/SymbioteEngineModule.mm`, and the only
// file in this folder that is not build configuration. Everything it does is hand the platform-shared
// `symbiote::installBindings` to whatever runtime React Native offers it.
//
// The seam is `TurboModuleWithJSIBindings`
// (ReactAndroid/src/main/java/com/facebook/react/turbomodule/core/interfaces/TurboModuleWithJSIBindings.kt).
// `TurboModuleManager::getTurboModule` checks `isInstanceOf(JTurboModuleWithJSIBindings)` right after
// it creates the Java module and immediately calls `installer->cthis()->installBindings(runtime, ...)`
// (ReactAndroid/src/main/jni/react/turbomodule/ReactCommon/TurboModuleManager.cpp:205-216). That is
// exactly what `installJSIBindingsWithRuntime:callInvoker:` is on iOS: a hook nobody can skip who
// reaches the module at all, so JS resolves the module for its SIDE EFFECT and then reads the global.
//
// RN's own sample of this shape is
// ReactCommon/react/nativemodule/samples/platform/android/{SampleTurboModule.kt,ReactCommon/SampleTurboModuleJSIBindings.cpp}
// — a `jni::JavaClass` whose descriptor names the Kotlin module, `registerNatives` binding
// `getBindingsInstaller`, and a `BindingsInstallerHolder::newObjectCxxArgs` lambda. This file is that,
// with our installer inside the lambda.

#include <ReactCommon/BindingsInstallerHolder.h>
#include <ReactCommon/CallInvoker.h>
#include <fbjni/fbjni.h>
#include <jsi/jsi.h>

#include "SymbioteEngineBindings.h"

namespace symbiote {

using namespace facebook;

namespace {

/**
 * The C++ side of `dev.symbiotenative.engine.SymbioteEngineModule`.
 *
 * Both of the Kotlin class's `external` members are bound here. `getVersion` is native rather than a
 * Kotlin constant on purpose: `kNativeVersion` is the ABI gate `native-engine.ts` reads, and a second
 * spelling of it in Kotlin is the kind of pair that drifts without anything going red.
 */
class SymbioteEngineJni : public jni::JavaClass<SymbioteEngineJni> {
 public:
  static constexpr const char *kJavaDescriptor = "Ldev/symbiotenative/engine/SymbioteEngineModule;";

  static void registerNatives() {
    javaClassLocal()->registerNatives({
        makeNativeMethod("getBindingsInstaller", SymbioteEngineJni::getBindingsInstaller),
        makeNativeMethod("getVersion", SymbioteEngineJni::getVersion),
    });
  }

 private:
  static jni::local_ref<react::BindingsInstallerHolder::javaobject> getBindingsInstaller(
      jni::alias_ref<SymbioteEngineJni> /*self*/) {
    return react::BindingsInstallerHolder::newObjectCxxArgs(
        [](jsi::Runtime &runtime, const std::shared_ptr<react::CallInvoker> & /*callInvoker*/) {
          installBindings(runtime);
        });
  }

  static jdouble getVersion(jni::alias_ref<SymbioteEngineJni> /*self*/) {
    return static_cast<jdouble>(kNativeVersion);
  }
};

} // namespace

} // namespace symbiote

// `System.loadLibrary("symbiote_engine")` from the module's own initializer is what gets here, so the
// natives are bound before anything can call them.
extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void * /*reserved*/) {
  return facebook::jni::initialize(vm, [] { symbiote::SymbioteEngineJni::registerNatives(); });
}
