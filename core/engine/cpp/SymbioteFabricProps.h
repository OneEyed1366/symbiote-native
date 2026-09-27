#pragma once

#include <folly/dynamic.h>

#include <functional>
#include <string>

namespace symbiote {

/**
 * A node's authored prop bag as the FLAT payload Fabric's C++ props expect.
 *
 * The reference is `core/engine/src/fabric-props.ts`, called by the TypeScript applier on the line
 * `SymbioteTree.cpp` hands `node.props` to `createNode`. Read the two side by side, same as
 * `SymbioteTree.cpp` and `tree-applier.ts`: what is here mirrors it, and what is deliberately NOT
 * here is enumerated in the implementation's header.
 *
 * `component` is the node's OWN view name, never `materialize`'s resolved one. A `<Text>` inside a
 * `<Text>` commits as `RCTVirtualText`, and the reference keys its processors on the handle's
 * component, which is never rewritten to the virtual name. Passing the resolved name would silently
 * change which processors run on every nested text node.
 */
/**
 * A behavior's own payload fold, for the ones that genuinely cannot live on this side.
 *
 * THIS USED TO SAY "IT CANNOT BE PORTED", FULL STOP, AND THAT WAS TOO WIDE. Two have moved —
 * `<text-input>`'s W3C aliases and `<pressable>`'s accessibility/ripple/machine-key rule — because
 * both are a function of the TAG and nothing else, which is the definition of user-agent behavior.
 * What the old wording was actually right about is the rest:
 *
 *   a third-party view's `validAttributes[*].process`, since `registerHostBehavior` takes any tag
 *   and a C++ table would cover only the primitives that happen to be ours;
 *
 *   `stickyFold`, which is built PER NODE and reads `runtime.state.translateY` — live JS state that
 *   is not a prop and moves on every scroll frame. Nothing folded ahead of time can serve it.
 *
 * `stickyFold` IS THE LAST ONE, as of 2026-09-18, and the case that nearly joined it is the useful
 * comparison. TouchableHighlight's underlay was listed here too, on the same "live state" reasoning:
 * `shown` flips inside a gesture and no props-only rule can see it. True, and not the question. That
 * fold's RULE was three ordinary inputs and one bit, so the bit crosses (`OP_SET_UNDERLAY_SHOWN`) and
 * the rule is `foldTouchableHighlightUnderlay` below.
 *
 * THAT PARAGRAPH FIRST SAID THE DIFFERENCE WAS RATE — "`translateY` moves every frame while a finger
 * drags" — AND IT IS WRONG, checked against the vendor an hour later. The value this fold commits is
 * the DEBOUNCED one (`ScrollViewStickyHeader.js:144-159`, 15 ms on Android and 64 ms on iOS); the
 * per-frame half rides an Animated graph and never passes through a fold at all. So sticky commits
 * at roughly the rate a bit would cross, and rate does not separate them.
 *
 * WHAT ACTUALLY KEEPS IT HERE is that its fold is the DECLARATIVE HALF OF A PAIR. The smooth pin is
 * an `AnimatedProps` leaf built in JS carrying `{transform, zIndex}`, written imperatively to the
 * same node, and the fold carries the same `zIndex` so an imperative write cannot drop it
 * (`behaviors/scroll-view/sticky.ts`). Move the fold's copy to a rule and the constant exists in C++
 * AND in that props map — a real mirror, with a real reason, which is the shape this migration
 * deletes rather than creates. The leaf is JS because `Animated` is; the fold is JS because the leaf
 * is.
 *
 * So the open question is not "port the fold" but "should the sticky pin be native at all" — which is
 * what a browser does (`position: sticky` is the engine's, with no page-side animated value) and is a
 * project rather than a port. Recorded here so the next reader does not re-derive the rate argument
 * and act on it.
 *
 * So a fold that is a property of the tag moves here; a fold that is a property of the instance
 * stays a JS closure and this side calls it. `SymbioteTree` supplies the wrapper; the cost is one
 * JSI round trip plus a bag marshalled both ways, per folded node per commit.
 */
using IPayloadFold = std::function<folly::dynamic(const folly::dynamic &)>;

/**
 * `tagName` is the INTRINSIC TAG (`pressable`), empty for a node that carries no host behavior.
 *
 * It is separate from `component` because it has to be: a `<pressable>` commits as `RCTView`, so
 * the Fabric view name cannot distinguish it from a plain view, and a rule keyed off the view name
 * would either miss every pressable or fire on every view. `<text-input>` is the case that hid
 * this — its view name happens to name it uniquely, so the first port needed no tag at all.
 */
/**
 * `ownerProps` is the PARENT node's props, or nullptr at a root.
 *
 * WHY A RULE MAY READ ITS PARENT AT ALL, when the whole point of a tag rule is that it is a function
 * of one node's own bag. Several of RN's component bodies build a node whose props are DERIVED from
 * the node above it — ScrollView's content view takes `collapsableChildren` from the scroller's
 * `maintainVisibleContentPosition`, ImageBackground's image takes its size from the wrapper's style.
 * In the wrapper world that was ordinary: one `render()` saw both. Split into per-node rules it looks
 * impossible, and this argument is why it is not: the TREE LIVES IN C++ NOW, so a node already knows
 * its parent and reading it costs a pointer hop rather than a JS closure and a crossing.
 *
 * It does NOT make everything portable. A rule may read the parent's PROPS, which are declarative
 * and present at commit time. It cannot read live JS state (`stickyFold`'s `translateY`) or anything
 * a framework computes per render; those stay JS folds.
 */
/**
 * `hasPressListener` — whether the APP has a callback wired to `press`, which is a name the behavior
 * owns and which therefore never becomes a prop.
 *
 * THIS PARAGRAPH USED TO SAY THE OPPOSITE, and the correction is the useful part. The boundary above
 * listed "an owned LISTENER (`focusable`'s `onPress !== undefined`, which lives in the stash and not
 * in any bag)" beside live JS state, as a thing a rule could never see. That conflated two different
 * facts about a listener: its FUNCTION, which is the application's and must never cross, and its
 * EXISTENCE, which is one bit the platform is entitled to know.
 *
 * The browser settles which is which rather than taste. A UA computes focusability itself, and it
 * can, because `addEventListener` is the UA's own API — the browser knows which of its elements
 * carry a click handler while the handler's body stays the page's. So the bit crosses, once per
 * flip, as `OP_SET_OWNED_LISTENER`; the closure stays in the JS stash where it always was.
 *
 * What is genuinely unreachable is narrower than the old wording: a value only JS can COMPUTE. A
 * value JS merely happens to HOLD is a wiring question, and wiring is cheap.
 */
/**
 * A rule's way of asking for an ANCESTOR further up than its parent.
 *
 * `ownerProps` answers the common case and `Button`'s label is the one that needs more: its style is
 * a function of the BUTTON's `color` and `disabled` while its parent is the wrapping view, so the
 * node it must read is a grandparent on iOS and a parent on Android. "Two up" is the wrong question
 * to build a seam around — what the rule wants is **the nearest ancestor that is a button**, which
 * is a CSS ancestor selector and is the shape a browser would use.
 *
 * A function pointer plus a context rather than a `std::function`, because this is on the per-node
 * commit path: a `std::function` would allocate for every node whether or not any rule asks. This
 * costs one pointer pair to pass and one indirect call only when a rule actually looks.
 *
 * The walk is the TREE's, which is why this is a callback at all — `SymbioteTree` owns `Node` and
 * this translation unit does not. What lives here is which tag to ask for; what lives there is how
 * to find it.
 */
struct IAncestorLookup {
  /** The nearest ancestor carrying `tag`, or nullptr. Never the node itself. */
  const folly::dynamic *(*find)(const void *context, const char *tag) = nullptr;
  const void *context = nullptr;
};

/**
 * The parent, as the three facts a rule can ask about it.
 *
 * `props` was a bare parameter until the descendant rule below needed the other two, and bundling
 * them is not tidying: a rule keyed on the parent's TAG is a different kind of rule from one keyed
 * on its own, and this is the one place that distinction is expressible.
 *
 * `tagName` is what makes a DESCENDANT rule possible — the shape a user-agent stylesheet has always
 * had (`td > *`), and the only shape that can serve `TouchableNativeFeedback` /
 * `TouchableWithoutFeedback`. Those render no view: RN's bodies end in `cloneElement(child, {…})`,
 * so our tag commits an anchor and the owner's props land on whatever the app wrote underneath. That
 * child's own tag is usually EMPTY — a plain `<view>` registers no behavior — so a self-keyed rule
 * can never reach it, and giving it the owner's tag is not available either, since it may already
 * own one.
 *
 * `hasPressListener` is the parent's bit, not the node's. `focusable` on a cloned child is a
 * function of whether the OWNER has a press callback, which is exactly the fact
 * `OP_SET_OWNED_LISTENER` already carries — read one hop up instead of on self.
 */
struct IOwner {
  const folly::dynamic *props = nullptr;
  const char *tagName = nullptr;
  bool hasPressListener = false;
  // TouchableHighlight's two halves land on TWO nodes — background on the container, opacity on the
  // single child (`TouchableHighlight.js:358-361, 379-383`) — so the child's rule needs the owner's
  // feedback state, which is `ISelf`'s and therefore unreachable from down here without these. Same
  // argument `hasPressListener` above already makes: a parent's bit, read one hop up.
  bool underlayShown = false;
  bool hasAnyPressListener = false;
};

/**
 * The FIRST CHILD, as the two facts a rule can ask about it — the only seam here that reads DOWN.
 *
 * `IOwner`, `IAncestorLookup` and `ownerProps` all read UP, and three iterations of this migration
 * recorded ScrollView's Android RefreshControl wrap as unportable because it is the one rule that
 * needs the other direction: `AndroidSwipeRefreshLayout` WRAPS the scroll view, and the app's style
 * is split across the two boxes with the wrapper taking the LAYOUT half of a style written on the
 * node BELOW it (`ScrollView.js:1854-1863`).
 *
 * IT IS NOT A NEW KIND OF CLAIM, which is what makes it affordable. `ownerProps`' own argument was
 * that the tree lives in C++, so reading another node costs a pointer hop rather than a closure and
 * a crossing — and that argument never mentioned a direction. Upstream builds the parent FROM the
 * child here (`cloneElement(refreshControl, {style: outer}, scrollView)`), so "derived from what it
 * contains" is RN's shape rather than one invented for this seam; a UA has the same (`:has()`, and
 * a table frame that has always followed its cells).
 *
 * THE DIRTY PATH IS THE HALF THAT IS NOT FREE, and it already existed. A rule runs when ITS node is
 * dirty, so a wrapper reading its child re-derives only if a write to that child marks the wrapper —
 * which `routeProp` does for `node.wrapper` under `slotDerived`. Without it the wrapper freezes at
 * its mount frame while the scroller visibly restyles inside it.
 *
 * FIRST child rather than a list, deliberately: the only shape that needs this is a wrapper, and a
 * wrapper has exactly one. A rule that wanted to survey N children would be reading the tree rather
 * than deriving from it, which is the line this seam should not cross.
 */
struct IFirstChild {
  const folly::dynamic *props = nullptr;
  const char *tagName = nullptr;
};

/**
 * The node's own facts that are NOT props — the bits a behavior owns and the platform is entitled to.
 *
 * It was a bare `bool hasPressListener` parameter until a second bit needed to cross, and bundling
 * is the same move `IOwner` made when `ownerProps` grew a tag: a lone bool beside three structs is
 * the shape that grows a fourth positional argument nobody can read at the call site.
 *
 * `hasPressListener` is `onPress` ALONE, which is what `focusable` asks (`TouchableOpacity.js:
 * 336-339`). `hasAnyPressListener` is any of RN's four (`TouchableHighlight.js:296-302`), which is
 * what "does this control react to a touch at all" asks. Two questions, deliberately not one.
 *
 * `underlayShown` is feedback STATE rather than wiring: TouchableHighlight's underlay, which lags the
 * press through a hold timer that stays in JS.
 */
struct ISelf {
  bool hasPressListener = false;
  bool hasAnyPressListener = false;
  bool underlayShown = false;
  // ScrollView's `sendMomentumEvents`: whether the app wired momentumScrollBegin or -End.
  bool hasMomentumListener = false;
  // Text's pressability (`Text.js:145-163`): onPress or onLongPress, and onStartShouldSetResponder.
  bool hasPressOrLongPressListener = false;
  bool hasStartShouldSetResponder = false;
};

folly::dynamic fabricProps(
    const std::string &component,
    const std::string &tagName,
    const folly::dynamic &props,
    const IPayloadFold &fold = {},
    const IOwner &owner = {},
    const ISelf &self = {},
    const IAncestorLookup &ancestors = {},
    const IFirstChild &firstChild = {});

} // namespace symbiote
