/*
 * Runs a JavaScript bundle inside the real engine: `symbiote_tester <bundle.js>`.
 *
 * This is the half that removes the TypeScript tree entirely. The gtest files beside it drive the
 * engine from C++, which proves the engine but leaves the ~5 500 adapter and engine tests still
 * committing into a stand-in. Those tests are JavaScript, so the answer is to run THEM here —
 * against the same `applyOps`, the same `UIManager`, the same differ and the same stub platform.
 *
 * The shape is React Native's own (`private/react-native-fantom`): a bundler produces one file, a
 * native binary evaluates it against a real runtime, and results travel back as lines on stdout.
 * What this binary owes JavaScript is therefore small and fixed — a way to see what was mounted,
 * and a way to say something. Everything else, including the test API, lives in JS where it can be
 * read and changed without a compiler.
 */

#include "symbiote-host.h"

#include <folly/json.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/featureflags/ReactNativeFeatureFlagsDynamicProvider.h>

#include <chrono>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {

using symbiote::testing::Host;
namespace jsi = facebook::jsi;

jsi::Value dynamicToValue(jsi::Runtime &runtime, const folly::dynamic &value) {
  return jsi::valueFromDynamic(runtime, value);
}

/**
 * One mounted view, as the platform holds it.
 *
 * `props` is `Props::rawProps` where React Native populates it, and the debug props otherwise —
 * either way it is what FABRIC parsed, never a payload rebuilt on this side.
 */
folly::dynamic describe(const facebook::react::StubView &view) {
  folly::dynamic layout = folly::dynamic::object;
  layout["x"] = view.layoutMetrics.frame.origin.x;
  layout["y"] = view.layoutMetrics.frame.origin.y;
  layout["width"] = view.layoutMetrics.frame.size.width;
  layout["height"] = view.layoutMetrics.frame.size.height;

  // What FABRIC parsed, asked for the way React Native asks itself: `getDebugProps` is the
  // renderer's own introspection of a props struct, so a key present here is a key that reached a
  // real `ViewProps` field, not one that merely travelled in a payload. Values arrive as the
  // strings the renderer prints, because a props struct is typed C++ and has no other honest
  // serialisation without the Android-only `RN_SERIALIZABLE_STATE` — and building this harness with
  // a flag the device build does not carry would make it a different renderer.
  folly::dynamic props = folly::dynamic::object;
  if (view.props != nullptr) {
    for (const auto &one : view.props->getDebugProps()) {
      if (one != nullptr) props[one->getDebugName()] = one->getDebugValue();
    }
  }

  folly::dynamic out = folly::dynamic::object;
  out["viewName"] = std::string{view.componentName};
  out["tag"] = view.tag;
  out["props"] = std::move(props);
  out["layout"] = std::move(layout);

  auto children = folly::dynamic::array();
  for (const auto &child : view.children) children.push_back(describe(*child));
  out["children"] = std::move(children);
  return out;
}

/**
 * One committed shadow node, described the same way a mounted view is.
 *
 * The props come from the same `getDebugProps` as the mounted side, for the same reason: it is the
 * renderer's own introspection of a typed props struct, so a key present here reached a real field.
 * What it is NOT is complete — it is a hand-written selection per component, and the honest
 * consequence is that an ABSENT key proves nothing at all. Assert on a key you have seen present.
 */
folly::dynamic describeShadow(const facebook::react::ShadowNode &node) {
  folly::dynamic props = folly::dynamic::object;
  const auto &nodeProps = node.getProps();
  if (nodeProps != nullptr) {
    for (const auto &one : nodeProps->getDebugProps()) {
      if (one != nullptr) props[one->getDebugName()] = one->getDebugValue();
    }
  }

  folly::dynamic out = folly::dynamic::object;
  out["viewName"] = std::string{node.getComponentName()};
  out["tag"] = node.getTag();
  out["props"] = std::move(props);

  auto children = folly::dynamic::array();
  for (const auto &child : node.getChildren()) children.push_back(describeShadow(*child));
  out["children"] = std::move(children);
  return out;
}

void install(Host &host) {
  auto &runtime = host.runtime();
  auto tester = jsi::Object(runtime);

  const auto bind = [&](const char *name, size_t argumentCount,
                        jsi::HostFunctionType &&function) {
    tester.setProperty(runtime, name,
                       jsi::Function::createFromHostFunction(
                           runtime, jsi::PropNameID::forAscii(runtime, name), argumentCount,
                           std::move(function)));
  };

  // Drain every committed revision into the stub platform and hand back what it now holds. One
  // call rather than two because a test has no reason to observe the tree mid-mount.
  bind("mounted", 0, [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
    host.mount();
    return dynamicToValue(runtime, describe(host.root()));
  });

  // `dispatchEvent(tag, type, payload)` — the tag comes from `mounted()`, so a test can only fire
  // at a view the platform actually holds.
  bind("dispatchEvent", 3,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 2) throw jsi::JSError(runtime, "dispatchEvent(tag, type, payload?)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         const auto type = arguments[1].toString(runtime).utf8(runtime);
         auto payload = count > 2 && !arguments[2].isUndefined()
             ? jsi::dynamicFromValue(runtime, arguments[2])
             : folly::dynamic::object();
         if (!host.dispatchEvent(tag, type, payload)) {
           throw jsi::JSError(runtime, "no mounted view with tag " + std::to_string(tag));
         }
         return jsi::Value::undefined();
       });

  // Fantom's `runWorkLoop`
  bind("runWorkLoop", 0,
       [&host](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) {
         host.runWorkLoop();
         return jsi::Value::undefined();
       });

  // `setViewport(width, height)`, Fantom's `createRoot({viewportWidth, viewportHeight})`
  bind("setViewport", 2,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 2) throw jsi::JSError(runtime, "setViewport(width, height)");
         host.setViewport(arguments[0].asNumber(), arguments[1].asNumber());
         return jsi::Value::undefined();
       });

  // `setModalSize(tag, width, height)`, Fantom's `enqueueModalSizeUpdate`
  bind("setModalSize", 3,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 3) throw jsi::JSError(runtime, "setModalSize(tag, width, height)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         if (!host.setModalSize(tag, arguments[1].asNumber(), arguments[2].asNumber())) {
           throw jsi::JSError(runtime, "no mounted Modal with tag " + std::to_string(tag));
         }
         return jsi::Value::undefined();
       });

  // The flag a test branches on, the backend two Fantom arms of one file differ by
  bind("usesSharedAnimatedBackend", 0,
       [](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) {
         return jsi::Value(facebook::react::ReactNativeFeatureFlags::useSharedAnimatedBackend());
       });

  // The C++ half of `Animated`, as the host object a `__turboModuleProxy` hands out
  bind("animatedModule", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         return host.animatedModule(runtime);
       });

  // `produceFrames(ms)`, Fantom's `unstable_produceFramesForDuration`
  bind("produceFrames", 1,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 1) throw jsi::JSError(runtime, "produceFrames(milliseconds)");
         host.produceFrames(arguments[0].asNumber());
         return jsi::Value::undefined();
       });

  // `boundingClientRect(tag)`: the view's frame with its transform, from the committed tree
  bind("boundingClientRect", 1,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 1) throw jsi::JSError(runtime, "boundingClientRect(tag)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         return dynamicToValue(runtime, host.boundingClientRect(tag));
       });

  // `directManipulationProps(tag)` / `fabricUpdateProps(tag)`: what a native animation wrote
  bind("directManipulationProps", 1,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 1) throw jsi::JSError(runtime, "directManipulationProps(tag)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         return dynamicToValue(runtime, host.directManipulationProps(tag));
       });
  bind("fabricUpdateProps", 1,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 1) throw jsi::JSError(runtime, "fabricUpdateProps(tag)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         return dynamicToValue(runtime, host.fabricUpdateProps(tag));
       });

  // `enqueueScroll(tag, x, y)`, Fantom's `enqueueScrollEvent`: delivered by `runWorkLoop`
  bind("enqueueScroll", 3,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 3) throw jsi::JSError(runtime, "enqueueScroll(tag, x, y)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         if (!host.enqueueScroll(tag, arguments[1].asNumber(), arguments[2].asNumber())) {
           throw jsi::JSError(runtime, "no mounted ScrollView with tag " + std::to_string(tag));
         }
         return jsi::Value::undefined();
       });

  // `scrollTo(tag, x, y)`, Fantom's `scrollTo` on a mounted ScrollView
  bind("scrollTo", 3,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments,
               size_t count) {
         if (count < 3) throw jsi::JSError(runtime, "scrollTo(tag, x, y)");
         const auto tag = static_cast<facebook::react::Tag>(arguments[0].asNumber());
         if (!host.scrollTo(tag, arguments[1].asNumber(), arguments[2].asNumber())) {
           throw jsi::JSError(runtime, "no mounted ScrollView with tag " + std::to_string(tag));
         }
         return jsi::Value::undefined();
       });

  bind("committedShape", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         return jsi::String::createFromUtf8(runtime, host.committedShape());
       });

  // The whole committed shadow tree. Flattened views and virtual nodes are HERE and absent from
  // `mounted()` — which is the difference a test has to pick between, not a detail.
  bind("committedTree", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         const auto root = host.committedRoot();
         if (root == nullptr) return jsi::Value::null();
         return dynamicToValue(runtime, describeShadow(*root));
       });

  bind("committedTags", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         const auto tags = host.committedTags();
         auto out = jsi::Array(runtime, tags.size());
         for (size_t at = 0; at < tags.size(); at++) {
           out.setValueAtIndex(runtime, at, jsi::Value(tags[at]));
         }
         return jsi::Value(runtime, out);
       });

  bind("committedTexts", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         const auto texts = host.committedTexts();
         auto out = jsi::Array(runtime, texts.size());
         for (size_t at = 0; at < texts.size(); at++) {
           out.setValueAtIndex(runtime, at, jsi::String::createFromUtf8(runtime, texts[at]));
         }
         return jsi::Value(runtime, out);
       });

  // Every command a test dispatched at a mounted view since the last reset, in order — the real
  // `nativeFabricUIManager.dispatchCommand` pipeline, not a description of what was asked for.
  bind("commands", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         const auto &commands = host.commands();
         auto out = jsi::Array(runtime, commands.size());
         for (size_t at = 0; at < commands.size(); at++) {
           auto entry = jsi::Object(runtime);
           entry.setProperty(runtime, "tag", commands[at].tag);
           entry.setProperty(runtime, "commandName",
                              jsi::String::createFromUtf8(runtime, commands[at].commandName));
           entry.setProperty(runtime, "args", dynamicToValue(runtime, commands[at].args));
           out.setValueAtIndex(runtime, at, entry);
         }
         return jsi::Value(runtime, out);
       });

  // What the Differentiator told the platform to do, in RN's wording ("Create", "Update")
  // Reads what the last `mounted()` drained, so call that first
  bind("mountingLogs", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         const auto logs = host.mountingLogs();
         auto out = jsi::Array(runtime, logs.size());
         for (size_t at = 0; at < logs.size(); at++) {
           out.setValueAtIndex(runtime, at, jsi::String::createFromUtf8(runtime, logs[at]));
         }
         return jsi::Value(runtime, out);
       });

  // The shadow tree's running commit number — a step's own commit count is the delta across it.
  // Not a transaction count: see `Host::commitNumber` for why those are not the same question.
  bind("commitNumber", 0,
       [&host](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) {
         return jsi::Value(static_cast<double>(host.commitNumber()));
       });

  // The engine's heap and GC counters, as Hermes reports them. Empty on JavaScriptCore by jsi's own
  // default, so a fixture reads an empty object rather than a wrong number.
  bind("heapInfo", 0,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *, size_t) {
         auto info = host.heapInfo();
         auto out = jsi::Object(runtime);
         for (const auto &entry : info) {
           out.setProperty(runtime, entry.first.c_str(),
                           jsi::Value(static_cast<double>(entry.second)));
         }
         return jsi::Value(runtime, out);
       });

  // A full collection, so a measurement can start from a known floor rather than from whatever the
  // previous case left standing.
  bind("collectGarbage", 0,
       [&host](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) {
         host.collectGarbage();
         return jsi::Value::undefined();
       });

  // Hermes's sampling profiler over a window, false on JavaScriptCore
  bind("startProfiling", 1,
       [&host](jsi::Runtime &, const jsi::Value &, const jsi::Value *args, size_t count) {
         const double hz = count > 0 && args[0].isNumber() ? args[0].getNumber() : 1000;
         return jsi::Value(host.startProfiling(hz));
       });

  bind("stopProfiling", 1,
       [&host](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *args, size_t count) {
         if (count == 0 || !args[0].isString()) return jsi::Value(false);
         return jsi::Value(host.stopProfiling(args[0].getString(runtime).utf8(runtime)));
       });

  bind("reset", 0, [&host](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) {
    host.reset();
    return jsi::Value::undefined();
  });

  bind("print", 1,
       [](jsi::Runtime &runtime, const jsi::Value &, const jsi::Value *arguments, size_t count) {
         if (count > 0) {
           std::cout << arguments[0].toString(runtime).utf8(runtime) << '\n' << std::flush;
         }
         return jsi::Value::undefined();
       });

  // Monotonic clock in fractional milliseconds, `Date.now()` is too coarse to split a phase
  // `steady_clock` since a wall clock can step backwards and give a negative duration
  bind("now", 0, [](jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t) {
    static const auto origin = std::chrono::steady_clock::now();
    return jsi::Value(std::chrono::duration<double, std::milli>(
                          std::chrono::steady_clock::now() - origin)
                          .count());
  });

  runtime.global().setProperty(runtime, "__symbioteTester", tester);
}

std::string read(const char *path) {
  std::ifstream file(path);
  if (!file) throw std::runtime_error(std::string{"cannot read bundle: "} + path);
  std::ostringstream contents;
  contents << file.rdbuf();
  return contents.str();
}

} // namespace

int main(int argc, char **argv) {
  if (argc < 2) {
    std::cerr << "usage: symbiote_tester <bundle.js>\n";
    return 2;
  }

  try {
    // Fabric feature flags are read once on first access, so they go in before the host exists
    if (const char *flags = std::getenv("SYMBIOTE_FLAGS")) {
      facebook::react::ReactNativeFeatureFlags::override(
          std::make_unique<facebook::react::ReactNativeFeatureFlagsDynamicProvider>(
              folly::parseJson(flags)));
    }
    // Never destroyed: JavaScriptCore aborts on a runtime torn down while a retained node still
    // owns its JS handle, and the OS reclaims everything at exit
    auto *host = new Host();
    install(*host);
    auto &runtime = host->runtime();
    runtime.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(read(argv[1])), argv[1]);

    // Cases may be async and C++ cannot await, so drain timers and microtasks until the file says
    // it is done, bounded so a case that never settles fails instead of hanging
    constexpr int kDrainRounds = 1'000;
    for (int round = 0; round < kDrainRounds; round++) {
      auto done = runtime.global().getProperty(runtime, "__symbioteDone");
      if (done.isBool() && done.getBool()) break;
      auto flush = runtime.global().getProperty(runtime, "__symbioteFlushTimers");
      if (flush.isObject() && flush.getObject(runtime).isFunction(runtime)) {
        flush.getObject(runtime).getFunction(runtime).call(runtime);
      }
      // Hermes leaves its microtask queue to the host, and without this drain the case chain
      // interleaves wrongly and re-reports the last case instead of failing
      runtime.drainMicrotasks();
    }

    auto results = runtime.global().getProperty(runtime, "__symbioteResults");
    if (results.isObject() && results.getObject(runtime).isArray(runtime)) {
      auto lines = results.getObject(runtime).getArray(runtime);
      for (size_t at = 0; at < lines.size(runtime); at++) {
        std::cout << lines.getValueAtIndex(runtime, at).toString(runtime).utf8(runtime) << '\n';
      }
      std::cout << std::flush;
    }

    auto done = runtime.global().getProperty(runtime, "__symbioteDone");
    if (!done.isBool() || !done.getBool()) {
      std::cerr << "the test file never settled: a case is still pending after "
                << kDrainRounds << " drain rounds\n";
      return 1;
    }
  } catch (const jsi::JSError &error) {
    std::cerr << error.getMessage() << '\n' << error.getStack() << '\n';
    return 1;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
  return 0;
}
