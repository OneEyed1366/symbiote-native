// Can a plain macOS binary host Hermes through the same JSI headers our engine compiles against?
//
// why: every "but a device runs Hermes" caveat in the measurement skill exists because the tester
// links `-framework JavaScriptCore`. React Native answered the same question for itself by building
// Fantom (`private/react-native-fantom`), and the `hermes-engine` pod already unpacks a universal
// macOS `hermesvm.framework` beside the iOS ones. The one thing that could still make a second
// tester target impossible is a JSI ABI mismatch between the prebuilt dylib and ReactCommon's
// headers — so this probe does the smallest thing that proves or disproves it, and nothing else.
//
// Not wired into the CMake build on purpose: it answers a yes/no about the toolchain, and a target
// that nobody runs is a target that rots. Build it by hand — `hermes-probe/README.md`.

#include <hermes/hermes.h>

#include <cstdio>
#include <memory>

int main() {
  auto runtime = facebook::hermes::makeHermesRuntime();

  auto sum = runtime->evaluateJavaScript(
      std::make_shared<facebook::jsi::StringBuffer>("1 + 1"), "probe.js");
  std::printf("sum=%g\n", sum.asNumber());

  // A second evaluation that allocates, loops and builds a string, so a runtime that merely
  // constructs without being able to RUN anything cannot pass.
  auto text = runtime->evaluateJavaScript(
      std::make_shared<facebook::jsi::StringBuffer>(
          "(() => { const a = []; for (let i = 0; i < 3; i++) a.push(i * 2); "
          "return a.join(','); })()"),
      "probe2.js");
  std::printf("text=%s\n", text.asString(*runtime).utf8(*runtime).c_str());

  // The ARRAY READ this whole investigation is about (§18), through the host boundary rather than
  // inside JS: if a Hermes target ever lands, this is the first thing it has to be able to time.
  auto array = runtime->evaluateJavaScript(
      std::make_shared<facebook::jsi::StringBuffer>(
          "Array.from({length: 8}, (_v, i) => i)"),
      "probe3.js");
  auto values = array.asObject(*runtime).asArray(*runtime);
  double total = 0;
  for (size_t at = 0; at < values.size(*runtime); at++) {
    total += values.getValueAtIndex(*runtime, at).asNumber();
  }
  std::printf("arraySum=%g\n", total);
  return 0;
}
