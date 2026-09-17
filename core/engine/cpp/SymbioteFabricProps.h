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

folly::dynamic fabricProps(
    const std::string &component,
    const std::string &tagName,
    const folly::dynamic &props,
    const IPayloadFold &fold = {},
    const folly::dynamic *ownerProps = nullptr,
    bool hasPressListener = false,
    const IAncestorLookup &ancestors = {});

} // namespace symbiote
