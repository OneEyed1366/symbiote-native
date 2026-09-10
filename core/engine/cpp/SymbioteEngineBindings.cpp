#include "SymbioteEngineBindings.h"

#include "SymbioteTree.h"

#include <react/renderer/mounting/ShadowTreeRegistry.h>
#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerBinding.h>

#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>

namespace symbiote {

using namespace facebook;

namespace {

/**
 * A block of `int32_t` owned by native and handed to JS as the backing store of an `Int32Array`.
 *
 * The node table's parent edge is already a flat `Int32Array` in JS (item 8b); the endpoint is that
 * the SAME array is memory the native applier writes. A `MutableBuffer`-backed `jsi::ArrayBuffer` is
 * the only JSI shape that gives JS a VIEW instead of a copy — every other route costs a crossing per
 * element, and the census that sized this design counted ~4 000 reads for a two-row swap.
 *
 * Note what this does and does not fork. `node-table.ts` is byte-identical whichever store it gets:
 * one implementation, two allocators. That is why the JS store may stand indefinitely, while the JS
 * APPLIER may not — see `native-engine.ts`'s header for the distinction, which is load-bearing.
 *
 * Lifetime is the ArrayBuffer's: `jsi::ArrayBuffer` retains the `shared_ptr`, so the store outlives
 * every JS view of it and is freed with the last one. A registry of live stores would be the leak
 * rather than the fix.
 */
class Int32Store : public jsi::MutableBuffer {
 public:
  explicit Int32Store(size_t lengthInInts) : data_(lengthInInts, 0) {}

  size_t size() const override {
    return data_.size() * sizeof(int32_t);
  }

  uint8_t *data() override {
    return reinterpret_cast<uint8_t *>(data_.data());
  }

 private:
  std::vector<int32_t> data_;
};

jsi::Value allocInt32Array(
    jsi::Runtime &runtime,
    const jsi::Value & /*thisValue*/,
    const jsi::Value *arguments,
    size_t count) {
  if (count < 1 || !arguments[0].isNumber()) {
    throw jsi::JSError(runtime, "allocInt32Array expects a length in elements");
  }

  const double requested = arguments[0].getNumber();
  // A negative or fractional length reaches `std::vector` as a wildly wrong `size_t`. Reject it here,
  // where there is a message, rather than at the allocation, where the failure is a bare crash.
  if (!(requested >= 0) || requested != std::floor(requested)) {
    throw jsi::JSError(runtime, "allocInt32Array expects a non-negative integer length");
  }

  auto store = std::make_shared<Int32Store>(static_cast<size_t>(requested));
  auto buffer = jsi::ArrayBuffer(runtime, store);
  auto constructor = runtime.global().getPropertyAsFunction(runtime, "Int32Array");
  return constructor.callAsConstructor(runtime, std::move(buffer));
}

/**
 * How many shadow trees the real `UIManager` is holding — or -1 when we could not reach one.
 *
 * This is item 8c-1's bring-up probe and it is deliberately NOT a commit hook. What it retires is
 * the whole reach chain in one device run: that our pod compiles against ReactCommon's renderer
 * headers, that it LINKS against the prebuilt `React.xcframework`, and that a plain JSI runtime
 * handed to a third-party TurboModule can resolve the UIManager with no app-side wiring. Every one
 * of those is a hard blocker for the native applier and none of them is visible from JS.
 *
 * -1 and 0 are different answers and that is the point. `getBinding` reads
 * `global.nativeFabricUIManager` and returns null when it is absent, so -1 means the ORDERING is
 * wrong — we were created before Fabric installed its binding. 0 means we reached a real UIManager
 * that happens to hold no surface. A boolean would collapse the two and cost a second build.
 *
 * The ordering is in fact safe by construction, and this probe is what confirms it rather than
 * assumes it: `getSlot()` (fabric.ts) reads `globalThis.nativeFabricUIManager` and throws when it is
 * absent, and only THEN resolves our module — so by the time this file's install hook runs, the
 * binding `getBinding` looks for is guaranteed to be there. That was luck when 8c-0 chose the seam.
 */
jsi::Value probeUIManager(
    jsi::Runtime &runtime,
    const jsi::Value & /*thisValue*/,
    const jsi::Value * /*arguments*/,
    size_t /*count*/) {
  auto binding = react::UIManagerBinding::getBinding(runtime);
  if (binding == nullptr) {
    return jsi::Value(-1.0);
  }

  int surfaces = 0;
  binding->getUIManager().getShadowTreeRegistry().enumerate(
      [&surfaces](const react::ShadowTree & /*shadowTree*/, bool & /*stop*/) { surfaces += 1; });
  return jsi::Value(static_cast<double>(surfaces));
}

} // namespace

void installBindings(jsi::Runtime &runtime) {
  auto bindings = jsi::Object(runtime);

  bindings.setProperty(runtime, "version", jsi::Value(kNativeVersion));
  bindings.setProperty(
      runtime,
      "allocInt32Array",
      jsi::Function::createFromHostFunction(
          runtime, jsi::PropNameID::forAscii(runtime, "allocInt32Array"), 1, allocInt32Array));
  bindings.setProperty(
      runtime,
      "probeUIManager",
      jsi::Function::createFromHostFunction(
          runtime, jsi::PropNameID::forAscii(runtime, "probeUIManager"), 0, probeUIManager));

  // One tree per runtime, and it holds NOTHING — a node's owner is the JS placeholder object,
  // through `NativeState`. So this instance exists only to give the methods a `this` to hang off,
  // and a per-call one would work identically. It is shared because an earlier version DID hold a
  // table, and keeping the shape makes the diff that removed it readable.
  auto tree = std::make_shared<Tree>();

  // Installed by name rather than through a switch so a JS caller's mistake is `undefined is not a
  // function` at the call site, instead of a runtime string comparison failing somewhere inside C++.
  // `isBindings` in `native-engine.ts` checks these names one by one for the same reason.
  const auto install = [&](const char *name,
                           unsigned int arity,
                           jsi::Value (Tree::*method)(jsi::Runtime &, const jsi::Value *, size_t)) {
    bindings.setProperty(
        runtime,
        name,
        jsi::Function::createFromHostFunction(
            runtime,
            jsi::PropNameID::forAscii(runtime, name),
            arity,
            [tree, method](
                jsi::Runtime &rt,
                const jsi::Value & /*thisValue*/,
                const jsi::Value *arguments,
                size_t count) { return (tree.get()->*method)(rt, arguments, count); }));
  };

  // The one member on a commit path.
  install("applyOps", 5, &Tree::applyOps);

  // The five reads — two value, three structural — and the imperative five. All ten take the same
  // placeholder object `applyOps` attached the node to, and none is on a commit path: they run at
  // gesture or lifecycle rate. `census` is deliberately absent; see `native-tree-host.ts`.
  install("getProp", 2, &Tree::getProp);
  install("getViewName", 1, &Tree::getViewName);
  install("parentOf", 1, &Tree::parentOf);
  install("childrenOf", 1, &Tree::childrenOf);
  install("committedRecordOf", 1, &Tree::committedRecordOf);

  install("dispatchCommand", 3, &Tree::dispatchCommand);
  install("sendAccessibilityEvent", 2, &Tree::sendAccessibilityEvent);
  install("measure", 2, &Tree::measure);
  install("measureInWindow", 2, &Tree::measureInWindow);
  install("measureLayout", 4, &Tree::measureLayout);

  // Diagnostics, read once per profile window rather than per op. See `Tree::takeCommitSplit`.
  install("takeCommitSplit", 0, &Tree::takeCommitSplit);
  install("readSurfaceTelemetry", 1, &Tree::readSurfaceTelemetry);

  runtime.global().setProperty(runtime, "__symbioteEngineNative", std::move(bindings));
}

} // namespace symbiote
