/*
 * The whole native stack a headless test needs, assembled once: a real JSI runtime, a real
 * `UIManager` over a real `ShadowTree`, the engine's own bindings, and — the part that makes this
 * more than a compile check — React Native's own `StubViewTree` standing in for the platform.
 *
 * `StubViewTree` consumes the differ's mutations, which is exactly what iOS and Android consume. So
 * what a test reads back here is the tree that WAS MOUNTED, arrived at by the code that ships, and
 * not a description we kept alongside it. That is the property `core/test-utils/src/tree-applier.ts`
 * and `op-projection.ts` cannot have, however carefully either is written: they answer from their
 * own bookkeeping.
 *
 * JavaScriptCore by DEFAULT because macOS carries it and React Native already ships the binding
 * (`ReactCommon/jsc/JSCRuntime.cpp`). Nothing on the tree path is engine-specific; what matters is
 * that the values crossing into `applyOps` are real JS values.
 *
 * HERMES IS THE OTHER HALF, and it is not hypothetical: configure with
 * `-DSYMBIOTE_JS_ENGINE=hermes` and the same binary hosts the engine a device runs, against the
 * universal macOS `hermesvm.framework` the `hermes-engine` pod already unpacks. It is a SECOND
 * RULER and never a column beside the JavaScriptCore ones — Hermes has no JIT, so the two tables
 * have different floors and a ratio is only ever read inside one of them.
 */

#pragma once

#include "SymbioteEngineBindings.h"

#include <jsi/instrumentation.h>

#ifdef SYMBIOTE_USE_HERMES
#include <hermes/hermes.h>
#else
#include <JSCRuntime.h>
#endif
#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/components/image/ImageComponentDescriptor.h>
#include <react/renderer/components/modal/ModalHostViewComponentDescriptor.h>
#include <react/renderer/components/root/RootComponentDescriptor.h>
#include <react/renderer/components/scrollview/ScrollViewComponentDescriptor.h>
#include <react/renderer/components/text/ParagraphComponentDescriptor.h>
#include <react/renderer/components/text/RawTextComponentDescriptor.h>
#include <react/renderer/components/text/TextComponentDescriptor.h>
#include <react/renderer/components/view/ViewComponentDescriptor.h>
#include <react/renderer/core/EventBeat.h>
#include <react/renderer/core/EventQueueProcessor.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/stubs/stubs.h>
#include <react/renderer/runtimescheduler/RuntimeScheduler.h>
#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerBinding.h>

#include <cstdio>
#include <memory>
#include <string>
#include <vector>

namespace symbiote::testing {

using namespace facebook::react;
namespace jsi = facebook::jsi;

/**
 * The beat a host platform supplies, with the tick made callable.
 *
 * `EventBeat::request()` only raises a flag; `induce()` is what hands the queue to the runtime, and
 * on a device it is a run-loop observer that calls it. `induce` is protected precisely so that each
 * platform decides when the tick happens — which is what this subclass does, the same as
 * `RCTEventBeat` on iOS, except the trigger is a test rather than a display link.
 */
class TickingEventBeat final : public EventBeat {
 public:
  using EventBeat::EventBeat;
  void tick() const { induce(); }
};

constexpr SurfaceId kSurfaceId = 1;
constexpr Float kViewportWidth = 500;
constexpr Float kViewportHeight = 500;

/** A command a test dispatched at a mounted view — `nativeFabricUIManager.dispatchCommand`'s args. */
struct RecordedCommand {
  Tag tag;
  std::string commandName;
  folly::dynamic args;
};

/**
 * The one `UIManagerDelegate` hook this harness needs, over the thirteen it does not.
 *
 * `UIManager::dispatchCommand` (`UIManager.cpp`) only reaches a delegate at all when one is set —
 * `delegate_` is null by default, so a command a test dispatches is silently DROPPED with no error,
 * no crash, nothing to read back. The other thirteen methods on the interface are TRANSACTION/
 * MOUNTING notifications a real host uses to drive its OWN mounting pipeline; this Host already
 * pulls transactions itself (`mount()`, `mountingCoordinator_->pullTransaction()`), so they are
 * safe no-ops here rather than a second, competing mounting path.
 */
class CommandRecorder final : public UIManagerDelegate {
 public:
  std::vector<RecordedCommand> commands;

  void uiManagerDidDispatchCommand(const std::shared_ptr<const ShadowNode> &shadowNode,
                                    const std::string &commandName,
                                    const folly::dynamic &args) override {
    commands.push_back({shadowNode->getTag(), commandName, args});
  }

  void uiManagerDidFinishTransaction(std::shared_ptr<const MountingCoordinator>, bool) override {}
  void uiManagerDidCreateShadowNode(const ShadowNode &) override {}
  void uiManagerDidSendAccessibilityEvent(const std::shared_ptr<const ShadowNode> &,
                                           const std::string &) override {}
  void uiManagerDidSetIsJSResponder(const std::shared_ptr<const ShadowNode> &, bool, bool) override {}
  void uiManagerShouldSynchronouslyUpdateViewOnUIThread(Tag, const folly::dynamic &) override {}
  void uiManagerDidUpdateShadowTree(const std::unordered_map<Tag, folly::dynamic> &) override {}
  void uiManagerShouldAddEventListener(std::shared_ptr<const EventListener>) override {}
  void uiManagerShouldRemoveEventListener(const std::shared_ptr<const EventListener> &) override {}
  void uiManagerDidStartSurface(const ShadowTree &) override {}
  void uiManagerDidFinishReactCommit(const ShadowTree &) override {}
  void uiManagerDidPromoteReactRevision(const ShadowTree &) override {}
  void uiManagerShouldSetOnSurfaceStartCallback(OnSurfaceStartCallback &&) override {}
  void uiManagerDidCaptureViewSnapshot(Tag, SurfaceId) override {}
  void uiManagerDidSetViewSnapshot(Tag, Tag, SurfaceId) override {}
  void uiManagerDidClearPendingSnapshots() override {}
};

/**
 * The only engine-specific line in the harness, and it is deliberately the only one: everything
 * below this point talks to `jsi::Runtime` and cannot tell which engine answered.
 */
inline std::unique_ptr<facebook::jsi::Runtime> makeRuntime() {
#ifdef SYMBIOTE_USE_HERMES
  // `ES6BlockScoping` DEFAULTS TO FALSE and must be turned on here, which is not a preference:
  // without it Hermes gives a `let` or `const` declared in a loop ONE binding for every iteration,
  // so each closure made inside `for (const one of cases)` sees the last value. The harness's own
  // `report()` is such a loop, and the symptom was a run that executed the last case of a file once
  // per case and reported it as that many passes — a plausible wrong answer rather than an error.
  //
  // React Native never meets this because its Babel preset lowers block scoping on the way to a
  // device; our bundler does not, and esbuild refuses to lower `const` on its own ("Transforming
  // const to the configured target environment is not supported yet"), so the flag is the door.
  //
  // WHAT IT COSTS, and it belongs in any timing taken here: a device runs a Babel-LOWERED bundle
  // with this flag off, so the Hermes arm's codegen is not byte-for-byte the device's. It is a
  // second ruler either way (no JIT), and this is one more reason its numbers never join the
  // JavaScriptCore table.
  return facebook::hermes::makeHermesRuntime(
      ::hermes::vm::RuntimeConfig::Builder().withES6BlockScoping(true).build());
#else
  return facebook::jsc::makeJSCRuntime();
#endif
}

class Host {
 public:
  Host() : runtime_(makeRuntime()) {
    contextContainer_ = std::make_shared<ContextContainer>();

    // Events reach JS the way they reach it on a device, because the pipeline is React Native's own
    // — `Scheduler.cpp` assembles these four pieces in this order and we assemble the same four.
    // Building a shortcut instead (calling a registered handler directly, as the fake Fabric does)
    // is what makes an event test prove that the test double works.
    //
    // The executor runs INLINE: there is one thread here, and a test that has to pump a queue to
    // observe a press is measuring the harness.
    RuntimeExecutor inline_ = [this](std::function<void(jsi::Runtime &)> &&work) {
      work(*runtime_);
    };
    runtimeScheduler_ = std::make_unique<RuntimeScheduler>(inline_);
    uiManager_ = std::make_shared<UIManager>(inline_, contextContainer_);

    auto eventOwnerBox = std::make_shared<EventBeat::OwnerBox>();
    eventDispatcher_ = std::make_shared<std::optional<const EventDispatcher>>();
    eventOwnerBox->owner = eventDispatcher_;

    auto uiManager = uiManager_;
    auto eventPipe = [uiManager](jsi::Runtime &runtime, EventTarget *eventTarget,
                                 const std::string &type, ReactEventPriority priority,
                                 const EventPayload &payload, HighResTimeStamp eventTimestamp) {
      uiManager->visitBinding(
          [&](const UIManagerBinding &binding) {
            binding.dispatchEvent(runtime, eventTarget, type, priority, payload, eventTimestamp);
          },
          runtime);
    };
    auto statePipe = [uiManager](const StateUpdate &stateUpdate) {
      uiManager->updateState(stateUpdate);
    };
    auto eventBeat = std::make_unique<TickingEventBeat>(eventOwnerBox, *runtimeScheduler_);
    // Kept as an observer so the beat can be INDUCED. `request()` only raises a flag; on a device
    // the platform's run-loop observer calls `induce()` on the next tick and that is what actually
    // delivers. This process has no run loop, so the tick is explicit.
    eventBeat_ = eventBeat.get();
    eventDispatcher_->emplace(
        EventQueueProcessor(eventPipe, [](jsi::Runtime &) {}, statePipe,
                            std::weak_ptr<EventLogger>{}),
        std::move(eventBeat),
        statePipe,
        std::weak_ptr<EventLogger>{});

    auto registry = providers_.createComponentDescriptorRegistry(ComponentDescriptorParameters{
        .eventDispatcher = EventDispatcher::Shared{eventDispatcher_, &eventDispatcher_->value()},
        .contextContainer = contextContainer_,
        .flavor = nullptr});
    providers_.add(concreteComponentDescriptorProvider<RootComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ViewComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ParagraphComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<TextComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<RawTextComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ScrollViewComponentDescriptor>());
    // `Modal` and `SafeAreaView` need the codegen'd core spec, which React Native SHIPS already
    // generated (`React/FBReactNativeSpec`) — see the CMakeLists. A third-party Fabric view
    // (Slider, screens, PullToRefresh) has no C++ in this repo at all and never will.
    //
    // The trap is that a missing descriptor does not FAIL: an unregistered name falls back to a
    // plain View, so the test reads `View` where it expected `ModalHostView` and looks like a wrong
    // assertion rather than a missing component. That is how `symbiote-view` once appeared to work.
    providers_.add(concreteComponentDescriptorProvider<ImageComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ModalHostViewComponentDescriptor>());

    uiManager_->setComponentDescriptorRegistry(registry);
    uiManager_->setDelegate(&commandRecorder_);
    openSurface();

    UIManagerBinding::createAndInstallIfNeeded(*runtime_, uiManager_);
    symbiote::installBindings(*runtime_);
  }

  ~Host() { uiManager_->getShadowTreeRegistry().remove(kSurfaceId); }

  /**
   * Throw the surface away and open an empty one, so the next test starts on an empty platform.
   *
   * The RUNTIME is kept. A test file is one process and the engine's JS holds module state that a
   * fresh runtime would drop on the floor; what has to be empty between cases is the tree.
   */
  void reset() {
    uiManager_->getShadowTreeRegistry().remove(kSurfaceId);
    commandRecorder_.commands.clear();
    // Discards, rather than reads: any mutation log left over from a `mount()` the previous test
    // never read back would otherwise bleed into the next test's first `mountingLogs()` call.
    mounted_.takeMountingLogs();
    openSurface();
  }

  Host(const Host &) = delete;
  Host &operator=(const Host &) = delete;

  jsi::Runtime &runtime() { return *runtime_; }

  /**
   * Drain every committed revision into the stub platform, the way a host's mounting thread does.
   *
   * Call it after the JS under test has committed and before reading anything back: until a
   * transaction is pulled, a commit exists only as a shadow-tree revision and no platform — real or
   * stub — has seen it.
   */
  size_t mount() {
    size_t applied = 0;
    while (auto transaction = mountingCoordinator_->pullTransaction()) {
      const auto &mutations = transaction->getMutations();
      applied += mutations.size();
      mounted_.mutate(mutations);
    }
    return applied;
  }

  const StubView &root() const { return mounted_.getRootStubView(); }

  /** How many views the stub platform holds, the root included. */
  size_t size() const { return mounted_.size(); }

  /**
   * The engine's own heap and GC counters — cumulative allocation, live bytes, collections.
   *
   * The axis every instrument in this harness has been blind to. A wall clock prices the work a
   * commit does; on Hermes the ALLOCATION that work leaves behind is a separate cost, paid later and
   * elsewhere, and a small device heap pays it far more often than a Mac does. Hermes reports
   * `totalAllocatedBytes`, `allocatedBytes`, `heapSize`, `numCollections` and two peaks here.
   *
   * EMPTY ON JAVASCRIPTCORE, and that is jsi's own default rather than a failure
   * (`jsi.cpp:307` returns an empty map) — a reader gets nothing rather than a wrong number, and a
   * fixture skips on an empty map.
   */
  std::unordered_map<std::string, int64_t> heapInfo() {
    return runtime_->instrumentation().getHeapInfo(false);
  }

  /** A full collection, so a measurement can start from a known floor. */
  void collectGarbage() { runtime_->instrumentation().collectGarbage("itest"); }

  /**
   * Hermes's sampling profiler around a window of JS, dumped as a Chrome trace.
   *
   * A wall clock says a step is slow, a heap reading says it is not allocation; this names the
   * FUNCTIONS. Returns false on JavaScriptCore, which has no equivalent here.
   */
  bool startProfiling(double hz) {
#ifdef SYMBIOTE_USE_HERMES
    static_cast<facebook::hermes::HermesRuntime &>(*runtime_).registerForProfiling();
    hermesRoot().enableSamplingProfiler(hz);
    return true;
#else
    (void)hz;
    return false;
#endif
  }

  bool stopProfiling(const std::string &path) {
#ifdef SYMBIOTE_USE_HERMES
    auto &root = hermesRoot();
    root.dumpSampledTraceToFile(path);
    root.disableSamplingProfiler();
    static_cast<facebook::hermes::HermesRuntime &>(*runtime_).unregisterForProfiling();
    return true;
#else
    (void)path;
    return false;
#endif
  }

  /**
   * The shadow tree's own sequential commit number — how many times JS has committed, in total.
   *
   * COUNTING TRANSACTIONS DOES NOT ANSWER THIS, which was tried first and read 1 everywhere.
   * `MountingCoordinator::pullTransaction` diffs `baseRevision_` against `lastRevision_`, and every
   * commit merely overwrites `lastRevision_` — so a pull yields ONE transaction whatever happened in
   * between, and a `while (pullTransaction())` loop counts the caller's own drains.
   *
   * The commit number is the upstream fact that a transaction count cannot recover. On a device it
   * is what schedules mounting work: each commit signals the mounting thread, and only commits the
   * main thread failed to keep up with are collapsed into one transaction. So a renderer committing
   * several times per logical update pays several main-thread passes there and nothing extra here.
   */
  ShadowTreeRevision::Number commitNumber() const {
    ShadowTreeRevision::Number number = 0;
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      number = shadowTree.getCurrentRevision().number;
    });
    return number;
  }

  /** What the platform was told to do since the last read — React Native's own wording. */
  std::vector<std::string> mountingLogs() { return mounted_.takeMountingLogs(); }

  /**
   * Fire a native event at a mounted view, the way the platform fires one.
   *
   * `EventEmitter::dispatchEvent` is the entry a real host uses and the entry React Native's own
   * harness uses (`NativeFantom::enqueueNativeEvent`). From there it is the real pipeline: event
   * queue, `UIManagerBinding::dispatchEvent`, the instance handle, the listener. Calling a
   * registered JS handler directly instead — which is what the fake Fabric does — proves only that
   * the fake works.
   */
  bool dispatchEvent(Tag tag, const std::string &type, folly::dynamic payload) {
    auto node = findByTag(tag);
    if (node == nullptr) return false;
    const auto &emitter = node->getEventEmitter();
    if (emitter == nullptr) return false;
    emitter->dispatchEvent(type, std::move(payload), RawEvent::Category::Unspecified);
    // The tick a device gets from its run loop, and then the work loop that runs what the tick
    // scheduled. React Native's own harness spells the second half `runWorkLoop`.
    eventBeat_->tick();
    runtimeScheduler_->callExpiredTasks(*runtime_);
    return true;
  }

  /**
   * The committed SHADOW tree as `name(children…)`, which is a different tree from the mounted one.
   *
   * Both are needed and neither substitutes for the other. A mounted tree answers "what does the
   * platform hold", and it is flatter: a flattened view is not in it, and a VIRTUAL node — the text
   * a `<Text>` is made of — is not in it at all, because a paragraph's characters are an attributed
   * string rather than a view. The virtual-text rule is therefore invisible there and lives here.
   */
  std::string committedShape() const {
    std::string out;
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      out = shadowShapeOf(*shadowTree.getCurrentRevision().rootShadowNode);
    });
    return out;
  }

  /**
   * Every tag in the committed shadow tree, the root's included.
   *
   * From the SHADOW tree rather than the mounted one on purpose: a tag is minted when a node is
   * created, so a view that gets flattened away still took one out of the same counter and still
   * has to obey the same rules. Reading the mounted tree would miss exactly the nodes that are
   * cheapest to create and therefore most numerous.
   */
  std::vector<int32_t> committedTags() const {
    std::vector<int32_t> tags;
    const auto walk = [&](const auto &self, const ShadowNode &node) -> void {
      tags.push_back(node.getTag());
      for (const auto &child : node.getChildren()) self(self, *child);
    };
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      walk(walk, *shadowTree.getCurrentRevision().rootShadowNode);
    });
    return tags;
  }

  /**
   * The root of the committed shadow tree, or null before anything has committed.
   *
   * The counterpart to `mounted()`, and the two answer different questions on purpose. The mounted
   * tree is what the differ told a host to create, so a flattened view and every virtual node are
   * simply absent from it. This one holds every node Fabric committed, which is what a test asking
   * "did this node reach the renderer, and with what props" actually means.
   */
  std::shared_ptr<const ShadowNode> committedRoot() const {
    std::shared_ptr<const ShadowNode> root;
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      root = shadowTree.getCurrentRevision().rootShadowNode;
    });
    return root;
  }

  /**
   * Every raw-text string in the committed shadow tree, in document order.
   *
   * Read off `RawTextProps::text` rather than off the paragraph's attributed string, because the
   * question these answer is which raw-text NODES reached a child set at all. An empty one must not:
   * `AttributedString::appendFragment` drops an empty fragment while the text walk has already
   * recorded "the previous child was raw text", so the next raw sibling merges into an empty vector
   * and the process aborts. The shape alone cannot tell an empty node from a present one.
   */
  std::vector<std::string> committedTexts() const {
    std::vector<std::string> texts;
    const auto walk = [&](const auto &self, const ShadowNode &node) -> void {
      const auto *raw = dynamic_cast<const RawTextShadowNode *>(&node);
      if (raw != nullptr) texts.push_back(raw->getConcreteProps().text);
      for (const auto &child : node.getChildren()) self(self, *child);
    };
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      walk(walk, *shadowTree.getCurrentRevision().rootShadowNode);
    });
    return texts;
  }

  size_t committedRootChildCount() const {
    size_t count = 0;
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      count = shadowTree.getCurrentRevision().rootShadowNode->getChildren().size();
    });
    return count;
  }

  /**
   * The mounted tree as `name(children…)`, which is the one-line form every shape assertion needs.
   *
   * The ROOT is React Native's own surface root, and the app's container view is its first child —
   * reading one level too high here is the mistake that made two C++ tests pass falsely and 474
   * vitest tests disagree about what the app root is.
   */
  std::string shape() const { return shapeOf(root()); }

  /**
   * Every command dispatched at a mounted view since the last `reset()`, in order.
   *
   * `nativeFabricUIManager.dispatchCommand(shadowNode, name, args)` — the entry an imperative ref
   * call (`setNativeProps`'s sibling, `focus`, `scrollTo`, a controlled `<text-input>`'s write-back)
   * actually reaches on a device. Reading `shadowNode->getTag()` here is the REAL committed Fabric
   * tag, the same one `mounted()`/`committedTags()` read — not a value this harness invented.
   */
  const std::vector<RecordedCommand> &commands() const { return commandRecorder_.commands; }

 private:
#ifdef SYMBIOTE_USE_HERMES
  // Static lifetime per `makeHermesRootAPI`'s own contract, so a reference is safe to hand out.
  static facebook::hermes::IHermesRootAPI &hermesRoot() {
    return *jsi::castInterface<facebook::hermes::IHermesRootAPI>(
        facebook::hermes::makeHermesRootAPI());
  }
#endif

  std::shared_ptr<const ShadowNode> findByTag(Tag tag) const {
    std::shared_ptr<const ShadowNode> found;
    const auto walk = [&](const auto &self, const ShadowNode &node) -> void {
      for (const auto &child : node.getChildren()) {
        if (found != nullptr) return;
        if (child->getTag() == tag) {
          found = child;
          return;
        }
        self(self, *child);
      }
    };
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      walk(walk, *shadowTree.getCurrentRevision().rootShadowNode);
    });
    return found;
  }

  void openSurface() {
    // A real box to lay out in. Under a zero-sized constraint the layout pass has nothing to do,
    // and the layout pass is where several of the engine's sharper edges live.
    auto shadowTree = std::make_unique<ShadowTree>(
        kSurfaceId,
        LayoutConstraints{.minimumSize = {.width = 0, .height = 0},
                          .maximumSize = {.width = kViewportWidth, .height = kViewportHeight}},
        LayoutContext{},
        *uiManager_,
        *contextContainer_);
    mountingCoordinator_ = shadowTree->getMountingCoordinator();
    mounted_ = buildStubViewTreeWithoutUsingDifferentiator(
        *shadowTree->getCurrentRevision().rootShadowNode);
    uiManager_->getShadowTreeRegistry().add(std::move(shadowTree));
  }

  static std::string shadowShapeOf(const ShadowNode &node) {
    std::string out = node.getComponentName();
    out += '(';
    for (const auto &child : node.getChildren()) out += shadowShapeOf(*child);
    out += ')';
    return out;
  }

  static std::string shapeOf(const StubView &view) {
    std::string out = view.componentName;
    out += '(';
    for (const auto &child : view.children) out += shapeOf(*child);
    out += ')';
    return out;
  }

  std::unique_ptr<jsi::Runtime> runtime_;
  ComponentDescriptorProviderRegistry providers_{};
  std::shared_ptr<const ContextContainer> contextContainer_;
  std::unique_ptr<RuntimeScheduler> runtimeScheduler_;
  std::shared_ptr<std::optional<const EventDispatcher>> eventDispatcher_;
  TickingEventBeat *eventBeat_ = nullptr;
  std::shared_ptr<UIManager> uiManager_;
  std::shared_ptr<const MountingCoordinator> mountingCoordinator_;
  StubViewTree mounted_;
  CommandRecorder commandRecorder_;
};

} // namespace symbiote::testing
