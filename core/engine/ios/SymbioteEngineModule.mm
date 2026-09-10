#import "SymbioteEngineModule.h"

#import <ReactCommon/RCTTurboModule.h>
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>
#import <SymbioteEngineSpec/SymbioteEngineSpec.h>

#include "../cpp/SymbioteEngineBindings.h"

using namespace facebook;

@interface SymbioteEngineModule () <NativeSymbioteEngineSpec, RCTTurboModuleWithJSIBindings>
@end

@implementation SymbioteEngineModule

RCT_EXPORT_MODULE(SymbioteEngine)

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<react::NativeSymbioteEngineSpecJSI>(params);
}

- (NSNumber *)getVersion
{
  return @(symbiote::kNativeVersion);
}

#pragma mark - RCTTurboModuleWithJSIBindings

// Called ONCE, by `RCTTurboModuleManager`, at the moment this module is first created — which is why
// `native-engine.ts` resolves the module for its side effect and then reads the global. There is no
// `install()` for JS to call, deliberately: an explicit install has to happen before the first use
// and nothing enforces that ordering, while this hook cannot be skipped by anyone who reaches the
// module at all.
//
// Everything below the next line is platform-shared. When Android's shim lands it calls the same
// `installBindings` from JNI, and this file stays this length.
- (void)installJSIBindingsWithRuntime:(jsi::Runtime &)runtime
                          callInvoker:(const std::shared_ptr<react::CallInvoker> &)callInvoker
{
  symbiote::installBindings(runtime);
}

@end
