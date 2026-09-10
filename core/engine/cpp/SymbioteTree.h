#pragma once

#include <jsi/jsi.h>

namespace symbiote {

/**
 * The shadow tree, owned by NATIVE. JS emits nothing but a command buffer.
 *
 * The spec is `core/engine/src/mutation-buffer.ts` and this file must agree with it — the opcode
 * numbers are the contract, and renumbering on one side commits a different tree in silence.
 *
 * ── WHAT THIS REPLACES, AND WHY IT IS SMALLER THAN WHAT IT REPLACES ──────────────────────────────
 *
 * `SymbioteApplier` sat beside this file until 2026-09-08 and is deleted. It replayed FABRIC
 * operations that a 2 041-line JS walk worked out — and that walk existed to re-derive a diff the
 * framework had already computed and thrown away: a reconciler's whole job is knowing what changed,
 * and every adapter tells us call by call.
 *
 * So this takes the ADAPTER's alphabet instead, and the derivation does not move here — it stops
 * existing. What was 2 041 lines of JS diffing is, on this side, a child vector and a dirty flag.
 * Three rules survive the collapse, and all three are two lines each rather than a walk:
 *
 *   a text element inside a text element commits as `RCTVirtualText`. Decided when a node acquires
 *   a PARENT, because that is when the answer first exists, and re-decided on a reparent.
 *
 *   an anchor and an empty raw-text node are skipped from their parent's child set — an anchor
 *   hoisting its own children up in its place. Decided when the set is built.
 *
 *   `cloneNodeWithNewProps` MERGES rather than replaces, so a clone's payload must be a minimal
 *   diff with vanished keys sent as `null`. Cheaper here than in JS: we already know which keys an
 *   op touched, so nothing has to be compared.
 *
 * ── LIFETIME: THIS CLASS HOLDS NOTHING ───────────────────────────────────────────────────────────
 *
 * A node's owner is the JS handle. `applyOps` attaches each created node to the placeholder object
 * the adapter is already holding, as JSI `NativeState`, so the node lives exactly as long as that
 * object and Hermes' collector is what frees it. A node also stays alive while a PARENT holds it,
 * which is the browser's rule exactly: alive while in the tree or referenced from script.
 *
 * That is not a preference. The previous applier kept an `unordered_map<int32_t, shared_ptr>` and
 * addressed nodes by a monotonic id — correct, and a second owner with nothing to tell it when the
 * first one let go. One benchmark suite took it from 792 MB to 1492 MB. A `weak_ptr` table was
 * tried and died on device on the first commit (`node 1 is gone`): Fabric's state reconciliation
 * clones a stateful node AND THE PATH TO THE ROOT, so any `ScrollView` re-creates the root every
 * commit while the JS side legitimately still names it. The repair is not a better table. It is
 * having one owner.
 *
 * Hence: no members. `Tree` exists to give the host functions a `this`, and a per-call instance
 * would behave identically.
 */
class Tree {
 public:
  /**
   * `applyOps(ops, strings, values, instanceHandles, handles)`.
   *
   * `ops` is an `Int32Array` read as MEMORY — the commands never become JS values. The side tables
   * carry what JSI has to marshal either way, and `handles` travels OUT: it holds the placeholder
   * object for every slot the ops address, and a created node is attached to the object at its own
   * slot. A slot is an index into THIS batch and is meaningless outside it, deliberately — an id
   * that outlives a batch is what forces a table on this side.
   *
   * Prop values are converted to `folly::dynamic` ONCE, here, and never marshalled again. That is
   * strictly cheaper than what ships today: `ConcreteComponentDescriptor::cloneProps` calls
   * `RawProps::parse` unconditionally, and in `Mode::JSI` the preparse walks every key of every
   * node with a `std::string` allocation per key — ~44 001 of each on a 1 000-row create, inside
   * `createNode`. `Mode::Dynamic` does the identical work with no JSI at all.
   */
  facebook::jsi::Value applyOps(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);

  /**
   * The five READS JS makes, and their oracle is `core/test-utils/src/tree-applier.ts` — the
   * TypeScript half of this file, which ~5 500 tests drive. Each one below mirrors an export there.
   *
   * Two are VALUE reads. The host behaviors (the press, text-input and switch machines) run in JS
   * and must see the props they react to; `getViewName` exists on top of that because it may answer
   * something the adapter did not choose — see the virtual-text rule above.
   *
   * Three are STRUCTURAL, and they are their seams' contract rather than our choice: Solid's nodeOps
   * declare getParentNode / getFirstChild / getNextSibling, Vue's RendererOptions and Angular's
   * Renderer2 declare a parent/sibling pair, and Svelte's compiled output reaches `firstChild` as a
   * real prototype getter. Fabric answers none of them — `nativeFabricUIManager` exposes no
   * structural read, and `NativeDOM` answers against the CURRENT REVISION, which is never the tree a
   * reconciler is mid-way through building.
   *
   * All five run at GESTURE or lifecycle rate rather than commit rate, which is what makes the
   * crossing irrelevant: ~10 reads per touch against the 19 009 per commit this design exists to
   * remove.
   *
   * `census` is deliberately NOT here. It has one JS caller, it is diagnostics, and answering it
   * would cost a full native walk of the very tree this design exists to stop walking.
   */
  facebook::jsi::Value getProp(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  facebook::jsi::Value getViewName(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  /** `parentOf(handle)` — the node's OWN parent, a surface included. */
  facebook::jsi::Value parentOf(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  /** `childrenOf(handle)` — in order, ANCHORS INCLUDED. */
  facebook::jsi::Value childrenOf(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  /** `committedRecordOf(handle)` — `{handle, tag, rootTag}`, or undefined before a first commit. */
  facebook::jsi::Value committedRecordOf(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);

  /**
   * The imperative five, taking the same placeholder object `applyOps` attached the node to.
   *
   * Each is the matching branch of `UIManagerBinding::get` with one substitution: where the binding
   * unwraps a handle IT minted, these unwrap ours and then take the `ShadowNode` the last commit
   * left on the node. They live HERE rather than beside `Applier` because a handle carries exactly
   * one `NativeState` — under this tree that state is a `Node`, which nothing in `Applier` can read.
   *
   * A node with no committed `ShadowNode` gets the SAME answer as a surface with no revision: six
   * zeroes, four zeroes, `onFail`, and a no-op for the two that go straight to `UIManager`. It is
   * the ordinary state under an async-batched commit, and an app that only asked where something is
   * must not be thrown into.
   *
   *   dispatchCommand(handle, name, args)   sendAccessibilityEvent(handle, eventType)
   *   measure(handle, cb)                   measureInWindow(handle, cb)
   *   measureLayout(handle, relativeTo, onFail, onSuccess)
   */
  facebook::jsi::Value dispatchCommand(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  facebook::jsi::Value sendAccessibilityEvent(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  facebook::jsi::Value measure(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  facebook::jsi::Value measureInWindow(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);
  facebook::jsi::Value measureLayout(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);

  /**
   * Milliseconds spent in each half of a commit since the last read, and zeroed by reading —
   * `{ buildMs, commitMs }`.
   *
   * DIAGNOSTIC, and the only thing on this ABI that is. It exists because `applyMs` in
   * `tree-host.ts` prices the whole crossing as one number, and the two halves have completely
   * different fixes: `buildMs` is OUR walk plus every `createNode`/`cloneNode` it issues, and
   * `commitMs` is `completeSurface` — Fabric's own `ShadowTree::commit`, the differ, layout and the
   * mount pass. A step that is slow says nothing about which one owns it.
   *
   * It has to reach JS rather than a log: `dlog` needs `DEBUG=1`, and a Debug build cannot be
   * benchmarked at all — the sign of the headline metric flips (root `CLAUDE.md`).
   */
  facebook::jsi::Value takeCommitSplit(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);

  /**
   * RN's own commit telemetry for ANY surface, read on demand — `{ layoutMs, textMs, layoutNodes,
   * textMeasures }` for whichever commit produced that surface's current revision.
   *
   * The pair of `takeCommitSplit`, and the difference is the whole point: that one accumulates
   * inside our own commit and can therefore only describe a tree this host built. This one takes a
   * surface id, so it can be pointed at a surface REACT drove — which is the only way to answer
   * whether a tree-wide text re-measure is something we cause or something a Fabric commit costs.
   */
  facebook::jsi::Value readSurfaceTelemetry(
      facebook::jsi::Runtime &runtime,
      const facebook::jsi::Value *arguments,
      size_t count);

 private:
  double buildMs_ = 0;
  double commitMs_ = 0;
  // Read out of RN's OWN telemetry after each `completeSurface`, not timed by us: a
  // `ShadowTreeRevision` carries the `TransactionTelemetry` of the commit that produced it, and
  // `ShadowTree::getCurrentRevision()` is public. So this is the inside of `commitMs_` without a
  // fork and without a hook — layout wall time, how many layoutable nodes layout actually touched,
  // and what text measurement cost, which is the one part of a Fabric commit that scales with the
  // TREE rather than with the change.
  double layoutMs_ = 0;
  double textMs_ = 0;
  int layoutNodes_ = 0;
  int textMeasures_ = 0;
};

} // namespace symbiote
