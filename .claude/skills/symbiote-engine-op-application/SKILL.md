---
name: symbiote-engine-op-application
description: What `Tree::applyOps` in `core/engine/cpp/SymbioteTree.cpp` does with a mutation batch, and why every op behaves the way it does. Read BEFORE adding or changing an opcode, before touching the prologue, the string or value tables, the child-vector maintenance, or any `markDirty` decision inside the op switch. Holds the measured reason behind each choice, the guards that exist to turn writes away, the hints that are deliberately left stale, and the asymmetries with the TypeScript reference applier. Trigger on: 'add an opcode', 'applyOps', 'SymbioteTree.cpp', 'markDirty', 'why does setProp compare values', 'slotInParent', 'the batch prologue', 'string interning in the engine', 'why is insertBefore linear'.
---

# Applying a mutation batch

`applyOps(ops, strings, values, instanceHandles, handles)` is the one entry through which every JS
mutation reaches the retained C++ tree. The ops are an `Int32Array` of fixed stride; everything a
word cannot hold is an INDEX into one of the four side tables.

The code carries one-line pointers back here. This file holds the reasoning those lines used to.

## The prologue

`getObject`/`getArray`, never `asObject`/`asArray`. The checking pair runs an `isObject` and an
`isArray` per table, eight JSI round trips for four arguments, and they were 2.8 us of a 4.4 us
fixed entry cost. Measured on an EMPTY batch against a 0.13 us bare host call
(`small-batch-crossing-cost.itest.ts`): prologue 4.38 -> 1.54 us, a whole small drain 5.54 -> 2.76.

Safe because `takeBatch` is the only producer on this wire and always hands over four arrays, and
because `jsi::Value::getObject` / `Object::getArray` carry `assert`s that are LIVE in the
correctness build. `core/engine/cpp/tests/build` is Debug with `NDEBUG` off, which is the whole
reason it exists, so a fixture that hand-builds a malformed batch aborts there and the build that
ships pays nothing.

Who pays the entry: a framework that navigates between mutations pays it per MUTATION, not per
commit. Solid's `cleanChildren` enters `applyOps` 2 000 times to clear a thousand rows.

## The three per-batch tables

**Slots.** `bySlot` resolves a slot to a node at most ONCE per batch and usually not at all: a slot
this batch creates is written by its own create op and never read from JS, which on a create-shaped
commit is nearly every slot. Only a slot naming a node an EARLIER batch created costs a read, and
it costs exactly one however many ops go on to name it.

**Strings, decoded EAGERLY.** This used to read the JSI array and allocate a fresh `std::string`
inside the op loop, spending exactly the saving `mutation-buffer.ts` interns for: a 1 000-row create
emits about a dozen distinct view names across 10 000 elements and draws every prop key from a set
of a few hundred, and none of that reached here. Counted through a real adapter
(`adapters/solid/src/batch-decode-census.probe.test.tsx`): 16 005 decodes against a table of 2 008
entries on a create, the same 8.0x on an append. Two costs go and only one is measurable headless:
the allocation half benches at 3.26x for the whole path
(`core/engine/bench/batch-string-decode.cpp`), and the other half is 13 997 JSI crossings that
simply stop happening.

**Values, converted LAZILY.** The other half of the buffer's interning and useless without it:
`mutation-buffer.ts` gives one entry to one object however many nodes were handed it, so a
`StyleSheet.create` style shared by a thousand rows arrives as one entry and converts once. Lazy
rather than eager, unlike the strings, т.к. a batch's value table can hold entries no surviving op
names (a prop written and then overwritten in the same batch) and converting one eagerly would
charge for work the ops do not ask for. Consequence when a conversion throws:
`boundedDynamicFrom`'s message names the prop and view of the FIRST op to reach that entry, not
every op sharing it.

`valueAt` takes `auto &&describe` and not a `std::function`: the description must stay a lambda the
compiler can inline away, for the reason `boundedDynamicFrom`'s own comment gives. Building the
string eagerly was 48.8% of the decode path once, and a `std::function` per op would allocate to
reintroduce half of it.

## `publish`

Handing a freshly built node to its placeholder is where it acquires an OWNER, and the only place
one is taken: afterwards the object JS already holds is the handle, and when JS and the parent both
let go, the node goes. `node->handle` is taken in the same moment for the same reason, т.к. this is
the only point both halves are in hand and every later op resolves the node THROUGH the object, so
the edge back can never be re-derived from what the ops carry.

## Child-vector maintenance

**`kOpAppendChild`** writes `child->slotInParent` as a HINT. Appending past a hole is harmless: the
hole keeps its place until the next read compacts, and order is preserved either way.

**`kOpInsertBefore`, a move within the SAME parent, ERASES rather than punching a hole.** An insert
shifts the vector anyway, so a hole would force a compaction pass on top of the shift, measured 2.4x
worse on a 4 000-row reorder than simply erasing. A move to a DIFFERENT parent holes the old one as
usual, since nothing is about to shift it.

**The tail's hints are left one too low, deliberately.** Renumbering is O(width) per insert, which
was tried and made a reorder of 4 000 rows 34.6 ms against 6.7, five times worse, to keep a hint
exact that nothing requires to be. `detachFromParent` validates before it believes
(`siblings[hinted] == child`) and falls back to a scan, so a stale hint costs one detach its old
price and never costs correctness. What is still linear is the vector insert itself: finding the
anchor is a load now, making the insert a load needs a different container.

**`kOpRemoveChild` compares the child's OWN parent pointer**, which is the truth even when the
adapter names a stale parent, т.к. frameworks spell a move as remove-then-insert and can arrive here
after the insert already re-parented the node. `attachedHandle.reset()` happens HERE and not inside
`detachFromParent`, which the two attach ops also call to spell a move: dropping the pin there would
leave a window, mid-batch, where the node is in no tree and a collection could take the handle a
re-attach is about to need.

## Which ops mark dirty, and why

| op | marks | why |
| --- | --- | --- |
| `kOpSetTag` | no | arrives at `createElement`, before any prop is routed and long before the first commit, so there is no payload yet |
| `kOpSetOwnedListener` | yes | a listener can flip at any point in a screen's life, and the key it decides is already committed by then. Without it a control renders permanently unfocusable while visibly interactive, and nothing else in the batch would mark it |
| `kOpSetUnderlayShown` | node AND first child | the bit drives a rule on BOTH (`foldTouchableHighlightChild`), and a descendant rule runs when ITS node is dirty. First child and no walk: RN takes `React.Children.only` (`TouchableHighlight.js:306`) |
| `kOpSetComponent` | yes | `materialize`'s `needsFreshFamily` covers the consequence, so this only moves the name and marks |
| `kOpMarkPropsDirty` | yes | the only route a DERIVED payload has, since it writes no prop |

`kOpMarkPropsDirty` exists as an OP rather than the JSI call it replaced т.к. a call takes a HANDLE
and so has to be ordered against the ops that built the node, and forcing that order meant a
`flushOps` per mark. Measured at 1 530 B and 3.3 us per adopted child
(`anchor-touchable-item-cost.itest.ts`), which was 82% of what an anchor-backed touchable's behavior
cost per item.

## The two guards that turn writes away

**`kOpSetProp` skips a write of the value the node already holds.** Fabric never saw a difference
either way, т.к. `diffProps` would find the key unchanged and drop it, but the MARK is not free: it
climbs to the first already-dirty ancestor and strips every one of them of the reuse fast path, so
an otherwise untouched subtree gets rebuilt purely to prove it is untouched. Measured: Angular's
Pressable host bag pushed 104 000 setProp calls for a screen Solid built in 12 000, 90 000 of them
writing `undefined` over an absent key.

The guard lives in C++ and not in the engine's `setProp` т.к. it needs the value the node already
holds, a read JS would have to make over the wire ~44 001 times on a 1 000-row create, which is
exactly the traffic this design removes.

**One deliberate asymmetry with the reference applier, in the safe direction.** TS compares with
`Object.is`, so for a style object or a handler the guard never fires: an adapter may hand back the
SAME reference with mutated contents, and identity cannot see that. Here the value is a fresh
`folly::dynamic` copied off the JSI value, so nothing can mutate it behind us and a deep compare is
both available and correct. It turns away strictly MORE writes than TS does, which changes the work
and never the committed tree.

An absent key is not a key holding null: deleting one that is not there changes nothing, while
deleting one that IS there changes what the next `diffProps` sends, since a vanished key has to go
out as an explicit null. The value is COPIED where it used to be moved, т.к. the entry is shared by
every node the same object was handed to and has to survive the op.

**`kOpSetText` compares the string, and only a FLIP to or from `''` marks the PARENT.** That flip
takes the node out of its parent's renderable child list or puts it back, which is a structural
change nothing else here records. Marking unconditionally made every ordinary relabel do it too, and
`markDirty` sets the parent's SELF-dirty bit, forcing a full `fabricProps` + `diffProps` on a node
whose own props did not move. Counted through three adapters on a 1 000-row relabel
(`adapters/*/src/work-ledger.probe.test.*`): 3 000 payload keys rebuilt to send 1 000. The walk
still reaches the node either way, т.к. `markDirty(*node)` raises `pathDirty` on every ancestor.

## `kOpCommit`

The surface NODE is contributed, not its children: it is the AppContainer view (`createSurfaceRoot`,
`flex: 1` + `box-none`) and it commits. Routing it through the same call keeps the two shapes one
path, since an ANCHOR in that position hoists its children instead.

`nullptr` as the Fabric parent, т.к. the root CHILD SET is not a node. So a top-level node moving
between two surfaces is NOT caught by the parent comparison (both sides are `nullptr`), and the
surface id is what separates them, which is why `materialize` compares that too.

**The walk timer is the one that is not per node**, and it has to sit at the call site rather than
inside `materialize`: the walk is recursive, so a timer around the recursive call would count every
ancestor's time again for every descendant.

**`completeSurface` is SKIPPED when the root child set comes back identical.** `materialize` already
declines to clone a node nothing changed, so an unchanged tree produces the same handles, and
`completeSurface` on them is a full `ShadowTree::commit` with layout and a mount pass for no change
at all. This is what makes the JS side's commit fan-out free: every commit names every live root,
т.к. a cross-surface mutation dirties a surface whose renderer nobody is holding
(`commitSurfaceOps` in `tree-host.ts`), and an untouched root reaches here with an identical list
and stops.

`completeSurface` runs `ShadowTree::commit` itself with a lambda that REPLACES the root's children
outright, so a retry against a moved root is harmless and there is nothing to rebase, which is why
this needs neither a commit hook nor a retained pending root.

**The repair runs after `completeSurface` returns**, not in `materialize`: substitution happens
INSIDE the commit, so the only tree that can be believed is the one the registry holds afterwards.
See `adoptCommitted`.

## Adding an opcode

1. `mutation-buffer.ts`: the `OP_*` constant with its operand list in the trailing comment, and a
   `record*` function beside its neighbours.
2. `SymbioteTree.cpp`: the `kOp*` constant next to the others, and a `case` in the switch. The
   `default` throws, so an op the C++ does not know aborts loudly rather than being skipped.
3. `core/test-utils/src/recording-host.ts` if the headless host has to see it.
4. Keep the operand count at three or fewer. `push` takes four parameters; the one op with a fourth
   operand (`OP_CREATE_ELEMENT`) writes it through `pushFourth`.
