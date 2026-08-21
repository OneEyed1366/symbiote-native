// Fabric reactTags are caller-allocated: even numbers (odd-mod-10 is reserved
// for root tags). A tag is minted once when a node is first created and then
// stays with it across clone-on-write commits (the clone keeps the family), so
// this counter only ever moves forward: one tag per node, not per commit.

import { dlog } from './debug';

// WHY IT DOES NOT START AT 2. React's own Fabric renderer allocates tags the exact same way and
// from the exact same seed — `let nextReactTag = 2; ... nextReactTag += 2` in
// react-native-renderer/src/ReactFiberConfigFabric.js. We replace React as the APP's renderer, but
// React is still in the bundle and still drives one Fabric surface of its own: **LogBox**. So the
// first JS error in a symbiote app opens a redbox, React mints tag 2 for it, and Fabric aborts the
// process on a Create for a tag the engine registered at app start:
//
//   *** Terminating app due to uncaught exception 'NSInternalInconsistencyException',
//   reason: 'RCTComponentViewRegistry: Attempt to dequeue already registered component.'
//   -[RCTComponentViewRegistry dequeueComponentViewWithComponentHandle:tag:]
//   RCTPerformMountInstructions(...)
//
// `RCTComponentViewRegistry` is process-wide, not per-surface, so the two allocators must not
// overlap. Diagnosed 2026-08-20 on examples/svelte: an `effect_update_depth_exceeded` on the API
// Playground screen turned into a SIGABRT with no JS stack, because the redbox that would have
// named the file killed the app instead of showing. Starting a whole surface's worth of tags above
// React's seed keeps the redbox a redbox: LogBox needs a few hundred nodes, so it can never walk
// 500k allocations up into this range.
const REACT_LOGBOX_TAG_RESERVE = 1_000_000;

let next = REACT_LOGBOX_TAG_RESERVE + 2;
let announced = false;

export function nextTag(): number {
  if (!announced) {
    announced = true;
    // Printed once, next to the first `commit ... createNode tag=` line: a device log that shows a
    // Fabric tag below this base was minted by React (LogBox), not by us.
    dlog(`tag allocator base=${next} (React's own Fabric tags stay below it)`);
  }
  const tag = next;
  next += 2;
  return tag;
}

// The lowest tag this allocator can ever hand out. Exported for the regression test that pins the
// no-overlap invariant against React's own allocator; nothing at runtime reads it.
export const FIRST_TAG = REACT_LOGBOX_TAG_RESERVE + 2;
