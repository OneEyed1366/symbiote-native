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

  // What the real Differentiator told the platform to do since the last read, RN's own wording
  // ("Create {...}", "Update {...}", …) — draws from whatever `mounted()`'s last `host.mount()`
  // drained, so call `mounted()` first to populate it. An "Update" line is the real equivalent of
  // the retired mirror's clone-protocol count: the Differentiator decided this node's props
  // actually changed enough to need a native prop update, not merely that JS wrote to it.
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

  // A REAL monotonic clock, in fractional milliseconds.
  //
  // The runner's prelude used to define `performance.now()` off `Date.now()`, which is whole
  // milliseconds — fine for a phase measured in tens of them, useless for splitting one. Measured
  // 2026-09-17: the JS `fill` phase of a 10 001-node create is ~25 ms, and no sub-phase of it could
  // be told apart at 1 ms granularity, so every question about where that 25 ms goes had to be
  // answered by rewriting the fixture into separate bulk passes.
  //
  // `steady_clock` rather than `system_clock` for the same reason `TelemetryClock` is: a wall clock
  // can step backwards and produce a negative duration.
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
    // Deliberately never destroyed. A retained node owns its JS handle, and JavaScriptCore aborts
    // when its runtime is torn down while any API object is still alive ("dangling API object") —
    // so a tree that is still standing, which is the normal state at the end of a test file, is
    // enough to abort a run that has already passed. The process is one test file long and the OS
    // reclaims everything; ordering a teardown nobody needs would be the only reason to model it.
    auto *host = new Host();
    install(*host);
    auto &runtime = host->runtime();
    runtime.evaluateJavaScript(std::make_shared<jsi::StringBuffer>(read(argv[1])), argv[1]);

    // Cases may be ASYNC — most adapter tests are — and C++ cannot await. So the file collects its
    // results and this drains until it says it is finished: run the queued timers, then let the
    // engine drain its microtasks. Bounded, because a test that never settles has to fail rather
    // than hang.
    //
    // THE EXPLICIT DRAIN IS NOT OPTIONAL, and which engine is hosting decides whether forgetting it
    // shows. JavaScriptCore drains its microtask queue by itself whenever the JS stack empties, so
    // this loop worked for years without asking. Hermes does not — the host owns the queue there,
    // which is why React Native's own runtime drains it per tick — and without this call a Hermes
    // run advances the case chain in the wrong interleaving and re-reports the last case instead of
    // failing. A wrong ANSWER rather than an error, which is the worst shape a harness defect has.
    constexpr int kDrainRounds = 1'000;
    for (int round = 0; round < kDrainRounds; round++) {
      auto done = runtime.global().getProperty(runtime, "__symbioteDone");
      if (done.isBool() && done.getBool()) break;
      auto flush = runtime.global().getProperty(runtime, "__symbioteFlushTimers");
      if (flush.isObject() && flush.getObject(runtime).isFunction(runtime)) {
        flush.getObject(runtime).getFunction(runtime).call(runtime);
      }
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
