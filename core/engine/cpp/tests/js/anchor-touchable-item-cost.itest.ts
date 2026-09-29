// Why the two ANCHOR-BACKED touchables are the dearest tags per COMMITTED NODE.
// `primitive-suite` pins them at one node per item, the same as `view`, and they read 4.3x its
// bytes while `touchable-opacity`, which commits TWO, reads less

// Four rungs over the item shape the suite renders, each adding one thing, so the subtractions name
// where it goes. The engine alone: no adapter is in the path, so nothing here is Vue's

import {
  ANCHOR_COMPONENT,
  appendChild,
  createElement,
  createSurface,
  markPropsDirty,
  registerHostBehavior,
  routeProp,
  setBehaviorListener,
  SLOT_DERIVED_ALL,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { takeBatch } from '@symbiote-native/engine/mutation-buffer';
import '@symbiote-native/components/register';

import {
  collectGarbage,
  describe,
  expect,
  heapInfo,
  it,
  print,
  report,
} from './harness';

const ITEMS = 1_000;
const SAMPLES = 5;

// Between the two measured readings, 0 B with the skip and 1 530 B without it
const MARK_BUDGET = 200;

/** `primitive-suite`'s own `ITEM_STYLE` and `CHILD_STYLE`, so the rungs render what it renders. */
const ITEM_STYLE = { width: 40, height: 20 };
const CHILD_STYLE = { width: 10, height: 10 };

/** `touchable-without-feedback`'s own list, the two gated names first. */
const FORWARDED_LISTENERS = ['layout', 'accessibilityAction', 'blur', 'focus'];

let nextRootTag = 41_000;

type IReading = { readonly bytes: number; readonly wall: number };

// Best of `SAMPLES` on the clock, the allocation of one clean run on the bytes (§18j). A FRESH
// surface per sample, т.к. a list that was already built has nothing left to build
function measure(
  build: (into: ReturnType<typeof createSurface>) => void,
): IReading {
  let wall = Infinity;
  for (let at = 0; at < SAMPLES; at += 1) {
    const surface = createSurface((nextRootTag += 1));
    const startedAt = performance.now();
    build(surface);
    surface.commit();
    const took = performance.now() - startedAt;
    if (took < wall) wall = took;
    takeBatch();
  }
  collectGarbage();
  const before = heapInfo().hermes_totalAllocatedBytes ?? 0;
  const surface = createSurface((nextRootTag += 1));
  build(surface);
  surface.commit();
  const bytes = (heapInfo().hermes_totalAllocatedBytes ?? 0) - before;
  takeBatch();
  return { bytes: bytes / ITEMS, wall: (wall * 1_000) / ITEMS };
}

function styled(component: string, tag: string | undefined): ISymbioteNode {
  const node =
    tag === undefined
      ? createElement(component)
      : createElement(component, false, tag);
  routeProp(node, 'style', ITEM_STYLE);
  return node;
}

// The child every touchable spec in `primitive-suite` renders inside the tag
function childOf(owner: ISymbioteNode): void {
  const child = createElement('RCTView');
  routeProp(child, 'style', CHILD_STYLE);
  appendChild(owner, child);
}

describe('an anchor-backed touchable item', () => {
  it('costs its two nodes and the adoption, not a multiple of a plain pair', () => {
    const plain = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        surface.appendChild(styled('RCTView', undefined));
      }
    });
    const pair = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled('RCTView', undefined);
        childOf(owner);
        surface.appendChild(owner);
      }
    });
    const opacity = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled('RCTView', 'touchable-opacity');
        childOf(owner);
        surface.appendChild(owner);
      }
    });
    // The anchor owner with NO behavior on it, which separates what the tag costs from what an
    // uncommitted owner node costs on its own
    const anchorPair = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled(ANCHOR_COMPONENT, undefined);
        childOf(owner);
        surface.appendChild(owner);
      }
    });
    // ADOPTION ALONE: the owner claims the child as its slot and dirties it, which is what makes
    // the C++ clone run on the child's commit. No machine, no forwarding
    registerHostBehavior('bench-adopts', {
      attach(): void {},
      detach(): void {},
      slotDerived: [SLOT_DERIVED_ALL],
      onChildInserted(node, child): void {
        node.childHost = child;
      },
    });
    // The same adoption WITH the dirty mark `onChildInserted` owes, which is a `flushOps` per item
    registerHostBehavior('bench-adopts-dirty', {
      attach(): void {},
      detach(): void {},
      slotDerived: [SLOT_DERIVED_ALL],
      onChildInserted(node, child): void {
        node.childHost = child;
        markPropsDirty(child);
      },
    });
    const adoptsDirty = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled(ANCHOR_COMPONENT, 'bench-adopts-dirty');
        childOf(owner);
        surface.appendChild(owner);
      }
    });
    const adopts = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled(ANCHOR_COMPONENT, 'bench-adopts');
        childOf(owner);
        surface.appendChild(owner);
      }
    });

    // What `arm` does for a name the app did NOT wire: the delete finds nothing, and a GATED name
    // still writes its flag prop as a clear
    const clears = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled(ANCHOR_COMPONENT, undefined);
        const child = createElement('RCTView');
        routeProp(child, 'style', CHILD_STYLE);
        appendChild(owner, child);
        for (const name of FORWARDED_LISTENERS)
          setBehaviorListener(child, name, undefined);
        surface.appendChild(owner);
      }
    });
    const nativeFeedback = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled(ANCHOR_COMPONENT, 'touchable-native-feedback');
        childOf(owner);
        surface.appendChild(owner);
      }
    });
    const withoutFeedback = measure(surface => {
      for (let at = 0; at < ITEMS; at += 1) {
        const owner = styled(ANCHOR_COMPONENT, 'touchable-without-feedback');
        childOf(owner);
        surface.appendChild(owner);
      }
    });

    print(
      `DEBUG ANCHORITEM plain ${plain.bytes.toFixed(0)}B/${plain.wall.toFixed(2)}us · ` +
        `pair ${pair.bytes.toFixed(0)}B/${pair.wall.toFixed(2)}us · ` +
        `anchorPair ${anchorPair.bytes.toFixed(0)}B/${anchorPair.wall.toFixed(2)}us · ` +
        `opacity ${opacity.bytes.toFixed(0)}B/${opacity.wall.toFixed(2)}us · ` +
        `tnf ${nativeFeedback.bytes.toFixed(0)}B/${nativeFeedback.wall.toFixed(2)}us · ` +
        `twf ${withoutFeedback.bytes.toFixed(0)}B/${withoutFeedback.wall.toFixed(2)}us`,
    );
    print(
      `DEBUG ANCHORITEM deltas  adoption alone ${(adopts.bytes - anchorPair.bytes).toFixed(0)}B/` +
        `${(adopts.wall - anchorPair.wall).toFixed(2)}us · ` +
        `its dirty mark ${(adoptsDirty.bytes - adopts.bytes).toFixed(0)}B/` +
        `${(adoptsDirty.wall - adopts.wall).toFixed(2)}us · ` +
        `four unwired clears ${(clears.bytes - anchorPair.bytes).toFixed(0)}B · ` +
        `anchor over a view owner ${(anchorPair.bytes - pair.bytes).toFixed(0)}B · ` +
        `opacity behavior ${(opacity.bytes - pair.bytes).toFixed(0)}B · ` +
        `tnf behavior ${(nativeFeedback.bytes - anchorPair.bytes).toFixed(0)}B · ` +
        `twf behavior ${(withoutFeedback.bytes - anchorPair.bytes).toFixed(0)}B`,
    );

    // The mark on a node this batch CREATED must cost nothing: it has no committed payload, and
    // the drain it used to force read 1 530 B per item. Measured 0, and 1 530 with the skip gone
    expect(adoptsDirty.bytes - adopts.bytes).toBeLessThan(MARK_BUDGET);

    // `touchable-opacity` commits BOTH nodes of the pair and the anchor-backed one commits only the
    // child, so a twf item that costs more than an opacity item is paying for something other than
    // the tree it builds
    expect(withoutFeedback.bytes).toBeLessThan(opacity.bytes);
  });
});

report();
