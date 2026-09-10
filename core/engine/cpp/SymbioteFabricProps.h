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
 * A behavior's own payload fold, or empty for the ~all of them that have none.
 *
 * It CANNOT be ported to this side and it cannot become data. `registerHostBehavior` takes any tag,
 * third-party views included, so a C++ copy would cover only the primitives that happen to be ours;
 * and on the tags branch a fold is no longer a function of the primitive at all — `stickyFold` is
 * built per node and reads `runtime.state.translateY`, live JS state that is not a prop and moves on
 * every scroll frame. Any scheme that folds ahead of time serves that node a stale payload.
 *
 * So it stays a JS closure, and this side calls it. `SymbioteTree` supplies the wrapper; the cost is
 * one JSI round trip plus a bag marshalled both ways, per folded node per commit.
 */
using IPayloadFold = std::function<folly::dynamic(const folly::dynamic &)>;

folly::dynamic fabricProps(
    const std::string &component,
    const folly::dynamic &props,
    const IPayloadFold &fold = {});

} // namespace symbiote
