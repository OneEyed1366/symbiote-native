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
 * It does NOT make everything portable, and the boundary is the same one as before: a rule may read
 * the parent's PROPS, which are declarative and present at commit time. It still cannot read live JS
 * state (`stickyFold`'s `translateY`), an owned LISTENER (`focusable`'s `onPress !== undefined`,
 * which lives in the stash and not in any bag), or anything a framework computes per render. Those
 * stay JS folds.
 */
folly::dynamic fabricProps(
    const std::string &component,
    const std::string &tagName,
    const folly::dynamic &props,
    const IPayloadFold &fold = {},
    const folly::dynamic *ownerProps = nullptr);

} // namespace symbiote
