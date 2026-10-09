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
#include <ReactCommon/CallInvoker.h>
#include <jsi/JSIDynamic.h>
#include <react/renderer/animated/AnimatedModule.h>
#include <react/renderer/animated/NativeAnimatedNodesManagerProvider.h>
#include <react/renderer/animationbackend/AnimationChoreographer.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
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
#include <react/renderer/dom/DOM.h>
#include <react/renderer/core/EventQueueProcessor.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/stubs/stubs.h>
#include <react/renderer/runtimescheduler/RuntimeScheduler.h>
#include <react/renderer/scheduler/Scheduler.h>
#include <react/renderer/scheduler/SchedulerDelegate.h>
#include <react/renderer/scheduler/SchedulerToolbox.h>
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

// The clock a native animation reads, moved only by `Host::produceFrames`
inline std::chrono::steady_clock::time_point &stubNow() {
  static auto now = std::chrono::steady_clock::now();
  return now;
}
inline std::chrono::steady_clock::time_point readStubNow() { return stubNow(); }

// Fantom's `TesterAnimationChoreographer`: the shared animation backend ticks only when told to
class TestAnimationChoreographer final : public AnimationChoreographer {
 public:
  void resume() override { isPaused_ = false; }
  void pause() override { isPaused_ = true; }
  AnimationTimestamp now() const override {
    return std::chrono::duration_cast<AnimationTimestamp>(stubNow().time_since_epoch());
  }
  void runUiTick() {
    if (isPaused_) return;
    ShadowNode::setUseRuntimeShadowNodeReferenceUpdateOnThread(false);
    onAnimationFrame(now());
    ShadowNode::setUseRuntimeShadowNodeReferenceUpdateOnThread(true);
  }

 private:
  bool isPaused_{false};
};

// `jsInvoker` for the animation module: work for the JS thread waits here until the Host drains it
class QueuedCallInvoker final : public CallInvoker {
 public:
  explicit QueuedCallInvoker(jsi::Runtime &runtime) : runtime_(runtime) {}
  void invokeAsync(CallFunc &&func) noexcept override { queue_.push_back(std::move(func)); }
  void invokeSync(CallFunc &&func) override { func(runtime_); }
  void drain() {
    while (!queue_.empty()) {
      auto func = std::move(queue_.front());
      queue_.pop_front();
      func(runtime_);
    }
  }

 private:
  jsi::Runtime &runtime_;
  std::deque<CallFunc> queue_;
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

// What a platform hands the `Scheduler`. Commands and animation writes are kept for a test to read
// back; mounting notifications are no-ops, since this Host pulls transactions itself
class HostSchedulerDelegate final : public SchedulerDelegate {
 public:
  std::vector<RecordedCommand> commands;
  // The last props an animation wrote straight into a view, and the ones it committed to Fabric
  std::unordered_map<Tag, folly::dynamic> directManipulation;
  std::unordered_map<Tag, folly::dynamic> fabricUpdates;
  std::function<void(SurfaceId)> onMergeReactRevision;

  void schedulerDidFinishTransaction(const std::shared_ptr<const MountingCoordinator> &) override {}
  void schedulerShouldRenderTransactions(const std::shared_ptr<const MountingCoordinator> &) override {}
  void schedulerShouldMergeReactRevision(SurfaceId surfaceId) override {
    if (onMergeReactRevision) onMergeReactRevision(surfaceId);
  }
  void schedulerDidRequestPreliminaryViewAllocation(const ShadowNode &) override {}
  void schedulerDidDispatchCommand(const ShadowView &shadowView, const std::string &commandName,
                                   const folly::dynamic &args) override {
    commands.push_back({shadowView.tag, commandName, args});
  }
  void schedulerDidSendAccessibilityEvent(const ShadowView &, const std::string &) override {}
  void schedulerDidSetIsJSResponder(const ShadowView &, bool, bool) override {}
  void schedulerShouldSynchronouslyUpdateViewOnUIThread(Tag tag,
                                                        const folly::dynamic &props) override {
    merge(directManipulation[tag], props);
  }
  void schedulerDidUpdateShadowTree(const std::unordered_map<Tag, folly::dynamic> &updates) override {
    for (const auto &[tag, props] : updates) merge(fabricUpdates[tag], props);
  }
  void schedulerDidCaptureViewSnapshot(Tag, SurfaceId) override {}
  void schedulerDidSetViewSnapshot(Tag, Tag, SurfaceId) override {}
  void schedulerDidClearPendingSnapshots() override {}

 private:
  static void merge(folly::dynamic &into, const folly::dynamic &props) {
    if (!into.isObject()) into = folly::dynamic::object();
    for (const auto &[key, value] : props.items()) into[key] = value;
  }
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
    // The pipeline is RN's own `Scheduler`: an event test proves the engine, not a test double.
    // The executor runs INLINE, there is one thread
    RuntimeExecutor inline_ = [this](std::function<void(jsi::Runtime &)> &&work) {
      work(*runtime_);
    };
    runtimeScheduler_ = std::make_shared<RuntimeScheduler>(inline_);
    auto container = std::make_shared<ContextContainer>();
    container->insert(RuntimeSchedulerKey, std::weak_ptr<RuntimeScheduler>(runtimeScheduler_));
    contextContainer_ = container;

    providers_.add(concreteComponentDescriptorProvider<RootComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ViewComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ParagraphComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<TextComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<RawTextComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ScrollViewComponentDescriptor>());
    // `Modal` and `SafeAreaView` use the codegen'd spec RN ships (see the CMakeLists). A missing
    // descriptor does not fail: the name falls back to a View and reads like a wrong assertion
    providers_.add(concreteComponentDescriptorProvider<ImageComponentDescriptor>());
    providers_.add(concreteComponentDescriptorProvider<ModalHostViewComponentDescriptor>());

    SchedulerToolbox toolbox{
        .contextContainer = contextContainer_,
        .componentRegistryFactory =
            [this](const EventDispatcher::Weak &eventDispatcher,
                   const std::shared_ptr<const ContextContainer> &context) {
              return providers_.createComponentDescriptorRegistry(ComponentDescriptorParameters{
                  .eventDispatcher = eventDispatcher, .contextContainer = context, .flavor = nullptr});
            },
        .bridgelessBindingsExecutor = std::nullopt,
        .runtimeExecutor = inline_,
        // `request()` only raises a flag, a device's run-loop observer induces the delivery; here
        // the tick is explicit, so the beat is kept
        .eventBeatFactory =
            [this](std::shared_ptr<EventBeat::OwnerBox> ownerBox) -> std::unique_ptr<EventBeat> {
          auto beat = std::make_unique<TickingEventBeat>(std::move(ownerBox), *runtimeScheduler_);
          eventBeat_ = beat.get();
          return beat;
        },
        .commitHooks = {},
        .animationChoreographer = makeChoreographer(),
    };
    scheduler_ = std::make_unique<Scheduler>(toolbox, nullptr, &schedulerDelegate_);
    uiManager_ = scheduler_->getUIManager();
    schedulerDelegate_.onMergeReactRevision = [this](SurfaceId surfaceId) {
      uiManager_->getShadowTreeRegistry().visit(
          surfaceId, [](const ShadowTree &shadowTree) { shadowTree.mergeReactRevision(); });
    };
    openSurface();

    symbiote::installBindings(*runtime_);
  }

  ~Host() { uiManager_->getShadowTreeRegistry().remove(kSurfaceId); }

  // Throw the surface away and open an empty one, so the next test starts on an empty platform.
  // The RUNTIME is kept: the engine's JS holds module state a fresh runtime would drop
  void reset() {
    uiManager_->getShadowTreeRegistry().remove(kSurfaceId);
    schedulerDelegate_.commands.clear();
    // Discards, rather than reads: any mutation log left over from a `mount()` the previous test
    // never read back would otherwise bleed into the next test's first `mountingLogs()` call.
    mounted_.takeMountingLogs();
    openSurface();
  }

  Host(const Host &) = delete;
  Host &operator=(const Host &) = delete;

  jsi::Runtime &runtime() { return *runtime_; }

  // Drain the committed revisions into the stub platform, as a host's mounting thread does.
  // Call it before reading anything back: until pulled, a commit has no platform view
  size_t mount() {
    size_t applied = 0;
    while (auto transaction = mountingCoordinator_->pullTransaction()) {
      const auto &mutations = transaction->getMutations();
      // A running animation overrides every pull with a transaction, empty when nothing changed
      if (mutations.empty()) break;
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

  // Fantom's `runWorkLoop`: the beat a run loop gives and the tasks it scheduled, which is where a
  // state update such as a ScrollView's content size turns into the next commit
  void runWorkLoop() {
    eventBeat_->tick();
    runtimeScheduler_->callExpiredTasks(*runtime_);
    if (callInvoker_ != nullptr) {
      // What native handed the JS thread, then the immediates it scheduled, before the UI tick
      callInvoker_->drain();
      flushJsTimers();
    }
    runUiTick();
  }

  void flushJsTimers() {
    auto flush = runtime_->global().getProperty(*runtime_, "__symbioteFlushTimers");
    if (flush.isObject() && flush.getObject(*runtime_).isFunction(*runtime_)) {
      flush.getObject(*runtime_).getFunction(*runtime_).call(*runtime_);
    }
  }

  // RN's `NativeAnimatedModule`, the C++ half of `Animated`, created on first ask. The JS that
  // wants it hands it out as `NativeAnimatedModule` from its `__turboModuleProxy`
  jsi::Value animatedModule(jsi::Runtime &runtime) {
    if (animatedModule_ == nullptr) {
      g_setNativeAnimatedNowTimestampFunction(&readStubNow);
      animatedProvider_ = std::make_shared<NativeAnimatedNodesManagerProvider>(
          [this](std::function<void()> &&onRender, bool) { onAnimationRender_ = std::move(onRender); },
          [this](bool) { onAnimationRender_ = nullptr; });
      callInvoker_ = std::make_shared<QueuedCallInvoker>(runtime);
      animatedModule_ = std::make_shared<AnimatedModule>(callInvoker_, animatedProvider_);
      TurboModuleWithJSIBindings::installJSIBindings(animatedModule_, runtime);
    }
    return jsi::Object::createFromHostObject(runtime, animatedModule_);
  }

  // One animation tick on the current clock, what Fantom's `flushMessageQueue` ends with. Work it
  // hands to the JS thread waits in the invoker for the next `runWorkLoop`
  void runUiTick() {
    if (choreographer_ != nullptr) choreographer_->runUiTick();
    else if (onAnimationRender_) onAnimationRender_();
  }

  // Only a run with `useSharedAnimatedBackend` has one, the Scheduler builds the backend on it
  std::shared_ptr<AnimationChoreographer> makeChoreographer() {
    if (!ReactNativeFeatureFlags::useSharedAnimatedBackend()) return nullptr;
    choreographer_ = std::make_shared<TestAnimationChoreographer>();
    return choreographer_;
  }

  // Fantom's `unstable_produceFramesForDuration`: a 16.333 ms frame at a time, the animation
  // clock moving with each
  void produceFrames(double milliseconds) {
    constexpr double kStepMicroseconds = 16'333;
    for (double left = milliseconds * 1000; left > 0; left -= kStepMicroseconds) {
      stubNow() += std::chrono::microseconds(static_cast<long>(std::min(left, kStepMicroseconds)));
      runUiTick();
    }
  }

  // `getBoundingClientRect` of a mounted view from the committed shadow tree, transform included
  folly::dynamic boundingClientRect(Tag tag) {
    folly::dynamic rect = folly::dynamic::object("x", 0)("y", 0)("width", 0)("height", 0);
    auto node = findByTag(tag);
    if (node == nullptr) return rect;
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      const auto found = dom::getBoundingClientRect(
          shadowTree.getCurrentRevision().rootShadowNode, *node, true);
      rect = folly::dynamic::object("x", found.x)("y", found.y)("width", found.width)(
          "height", found.height);
    });
    return rect;
  }

  // Fantom's `unstable_getDirectManipulationProps` / `unstable_getFabricUpdateProps`
  folly::dynamic directManipulationProps(Tag tag) { return propsOf(schedulerDelegate_.directManipulation, tag); }
  folly::dynamic fabricUpdateProps(Tag tag) { return propsOf(schedulerDelegate_.fabricUpdates, tag); }

  // Resize the surface like `SurfaceHandler::constraintLayout`, Fantom's `createRoot({viewport…})`
  void setViewport(double width, double height) {
    const auto size = Size{.width = static_cast<Float>(width), .height = static_cast<Float>(height)};
    const auto constraints = LayoutConstraints{.minimumSize = size, .maximumSize = size};
    const auto parserContext = PropsParserContext{kSurfaceId, *contextContainer_};
    uiManager_->getShadowTreeRegistry().visit(kSurfaceId, [&](const ShadowTree &shadowTree) {
      shadowTree.commit(
          [&](const RootShadowNode &oldRoot) {
            return oldRoot.clone(parserContext, constraints, LayoutContext{});
          },
          {});
    });
    runWorkLoop();
  }

  // `NativeFantom::enqueueScrollEvent`: the offset on the emitter, then in the node's state, which
  // is what the differ reads to cull. Nothing is delivered until the next tick
  bool enqueueScroll(Tag tag, double x, double y) {
    auto node = findByTag(tag);
    const auto *scrollView = dynamic_cast<const ScrollViewShadowNode *>(node.get());
    if (scrollView == nullptr) return false;

    const auto point = Point{.x = static_cast<Float>(x), .y = static_cast<Float>(y)};
    auto scrollEvent = ScrollEvent();
    scrollEvent.contentOffset = point;
    scrollEvent.contentSize = scrollView->getStateData().getContentSize();
    scrollEvent.containerSize = scrollView->getLayoutMetrics().frame.size;
    scrollEvent.contentInset = scrollView->getConcreteProps().contentInset;
    scrollView->getConcreteEventEmitter().onScroll(scrollEvent);

    auto state = std::static_pointer_cast<const ScrollViewShadowNode::ConcreteState>(
        scrollView->getState());
    state->updateState([point](const ScrollViewShadowNode::ConcreteState::Data &oldData)
                           -> ScrollViewShadowNode::ConcreteState::SharedData {
      auto newData = oldData;
      newData.contentOffset = point;
      return std::make_shared<const ScrollViewShadowNode::ConcreteState::Data>(newData);
    });
    return true;
  }

  bool scrollTo(Tag tag, double x, double y) {
    if (!enqueueScroll(tag, x, y)) return false;
    runWorkLoop();
    return true;
  }

  // `NativeFantom::enqueueModalSizeUpdate`: the host's screen size for a mounted Modal
  bool setModalSize(Tag tag, double width, double height) {
    auto node = findByTag(tag);
    const auto *modal = dynamic_cast<const ModalHostViewShadowNode *>(node.get());
    if (modal == nullptr) return false;

    auto state =
        std::static_pointer_cast<const ModalHostViewShadowNode::ConcreteState>(modal->getState());
    state->updateState(ModalHostViewState(
        Size{.width = static_cast<Float>(width), .height = static_cast<Float>(height)}));
    runWorkLoop();
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

  // Every command dispatched at a mounted view since the last `reset()`, in order, by the real
  // committed Fabric tag. The delegate hears a command as a queued rendering update, so run them
  const std::vector<RecordedCommand> &commands() {
    runtimeScheduler_->callExpiredTasks(*runtime_);
    return schedulerDelegate_.commands;
  }

 private:
  static folly::dynamic propsOf(const std::unordered_map<Tag, folly::dynamic> &byTag, Tag tag) {
    const auto found = byTag.find(tag);
    return found == byTag.end() ? folly::dynamic::object() : found->second;
  }

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
    // The animation provider listens for surfaces that start after it was created
    scheduler_->uiManagerDidStartSurface(*shadowTree);
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
  std::shared_ptr<RuntimeScheduler> runtimeScheduler_;
  TickingEventBeat *eventBeat_ = nullptr;
  std::shared_ptr<UIManager> uiManager_;
  std::shared_ptr<const MountingCoordinator> mountingCoordinator_;
  StubViewTree mounted_;
  HostSchedulerDelegate schedulerDelegate_;
  std::shared_ptr<QueuedCallInvoker> callInvoker_;
  std::shared_ptr<TestAnimationChoreographer> choreographer_;
  std::shared_ptr<NativeAnimatedNodesManagerProvider> animatedProvider_;
  std::shared_ptr<AnimatedModule> animatedModule_;
  std::function<void()> onAnimationRender_;
  // Last, so it is destroyed first, while the delegate and the runtime it reports to still exist
  std::unique_ptr<Scheduler> scheduler_;
};

} // namespace symbiote::testing
