// The device regression reported 2026-08-24: the FIRST press changes nothing visually while its
// callback fires, and every press after it works. Tier-2 made a press ask the engine for a commit
// of its own (`requestCommitFor`), which lands in the same tick as the framework's own update — so
// the suspicion is that one of the two commits swallows the other.
//
// Replaces the `installFabric()` half of core/engine/src/__tests__/press-commit-race.test.ts —
// STAYED on the mirror through Rounds 12-14 because the claim is "did THIS commit publish the
// prop", and `installRecordingFabric()`'s `propOf`/`payloadOf` read the node's CURRENT state,
// which `routeProp` mutates whether or not a commit ever ran — a tautology that would pass whether
// or not the race was actually lost. Against the REAL committed tree there is no such ambiguity:
// `mounted()` only ever reflects what the real Differentiator actually mounted, so a swallowed
// commit reads as a stale value here, not as a passing assertion.
//
// One substitution throughout: `accessibilityLabel` swapped for `nativeID` as the "which value won
// the race" marker prop. `getDebugProps()`'s selection (measured in `committed-props.itest.ts`:
// accessible/backgroundColor/nativeID/opacity/pointerEvents/testID/zIndex) does not include
// `accessibilityLabel` at all — that is RN's own `BaseViewProps::getDebugProps()` choosing what to
// expose, not something this project curates, so there is no C++ side to extend here. `nativeID`
// takes an arbitrary string with no color-parsing/validation the way `backgroundColor` would need,
// so it is a drop-in stand-in for the same "any string, freely settable" role.

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  requestCommitFor,
  routeProp,
  setNodePressed,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  afterEach,
  describe,
  expect,
  findByTestId,
  it,
  report,
} from './harness';

// Must be 1: the C++ harness's ShadowTreeRegistry watches one fixed `kSurfaceId` (symbiote-host.h),
// not whatever tag JS passes to `createSurface` — every case gets a fresh registry via the
// harness's own per-case `reset()`, so reusing 1 across cases is correct, not accidental reuse.
const ROOT_TAG = 1;

const PRESSED_RULES = [
  {
    tokens: ['btn'],
    specificity: [0, 1, 0] as [number, number, number],
    order: 0,
    style: { opacity: 1 },
  },
  {
    tokens: ['btn', ':active'],
    specificity: [0, 2, 0] as [number, number, number],
    order: 1,
    style: { opacity: 0.6 },
  },
];

function mountTree(): {
  surface: ReturnType<typeof createSurface>;
  button: ISymbioteNode;
  sibling: ISymbioteNode;
} {
  const surface = createSurface(ROOT_TAG);
  const root = createElement('RCTView');
  const button = createElement('RCTView');
  const sibling = createElement('RCTView');
  routeProp(button, 'class', 'btn');
  routeProp(button, 'testID', 'button');
  routeProp(sibling, 'testID', 'sibling');
  routeProp(sibling, 'nativeID', 'before');
  appendChild(root, button);
  appendChild(root, sibling);
  surface.appendChild(root);
  surface.commit();
  return { surface, button, sibling };
}

// What the host behavior does, spelled out here rather than imported: `setNodePressed` only
// DIRTIES, and a press arrives outside every renderer mutation path, so nothing schedules a commit
// unless the behavior asks. A probe that calls only the first half reads as a dead mechanism — the
// exact false RED this suite exists to distinguish from a real one.
function press(node: ISymbioteNode, pressed: boolean): void {
  setNodePressed(node, pressed);
  requestCommitFor(node);
}

afterEach(() => {
  clearGlobalStyles();
});

describe('a press commit racing the framework commit, on the real engine', () => {
  it('publishes the pressed style when the framework commits FIRST in the same tick', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button, sibling } = mountTree();

    // Native event: the press dirties the node and queues its own commit.
    press(button, true);
    // The app's own onPress handler, same tick: a prop somewhere else, then the framework commits.
    routeProp(sibling, 'nativeID', 'after');
    surface.commit();
    // ...and only now the queued microtask runs.
    await Promise.resolve();

    expect(findByTestId('sibling')?.props.nativeID).toBe('after');
    expect(findByTestId('button')?.props.opacity).toBe('0.6');
  });

  it('publishes the framework update when the press commit lands FIRST', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button, sibling } = mountTree();

    press(button, true);
    await Promise.resolve();
    routeProp(sibling, 'nativeID', 'after');
    surface.commit();

    expect(findByTestId('button')?.props.opacity).toBe('0.6');
    expect(findByTestId('sibling')?.props.nativeID).toBe('after');
  });

  // THE CASE THE THREE ABOVE MISS, and the one a peer reproduced headlessly: they all update a
  // SIBLING after the press. The report is that the PRESSED node itself stops committing — for
  // ordinary updates too, forever after its first press. Engine-node props stay correct; only the
  // commit is lost.
  it('keeps committing the pressed node itself after its first press', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button } = mountTree();

    // Observable control BEFORE the press: without it a later empty read cannot be told apart from
    // a tree that never committed at all.
    routeProp(button, 'nativeID', 'before');
    surface.commit();
    expect(findByTestId('button')?.props.nativeID).toBe('before');

    press(button, true);
    await Promise.resolve();

    routeProp(button, 'nativeID', 'after');
    surface.commit();
    expect(findByTestId('button')?.props.nativeID).toBe('after');
  });

  // The SAME case again, but committed the way a fine-grained adapter does it: `requestCommit()`
  // (coalesced, its own microtask) rather than the synchronous `commit()` React uses. Both are
  // engine API and a press has to survive either — and only one of them was covered.
  it('keeps committing the pressed node through the COALESCED commit path', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button } = mountTree();

    routeProp(button, 'nativeID', 'before');
    surface.requestCommit();
    await Promise.resolve();
    expect(findByTestId('button')?.props.nativeID).toBe('before');

    press(button, true);
    await Promise.resolve();

    routeProp(button, 'nativeID', 'after');
    surface.requestCommit();
    await Promise.resolve();
    expect(findByTestId('button')?.props.nativeID).toBe('after');
  });

  // THE ONE THE FIVE ABOVE MISS. They all update the pressed node ITSELF, and a peer's flag dump
  // showed the casualty is its DESCENDANT, updated in the same tick:
  //
  //   1. the press dirties the pressable, and markDirty walks UP marking the chain
  //   2. same tick, the framework dirties a CHILD — markDirty walks up, meets the pressable
  //      already dirty, and stops there, which is its documented fast path
  //   3. the microtask runs the targeted commit: it publishes the pressable's props and clears
  //      its flags, and by design it never descends
  //   4. the framework's own commit reconciles from the root, finds a clean chain, and skips
  //   5. the child is left dirty under a clean chain — unreachable, forever
  //
  // Vue and Solid survive only because their schedulers rewrite the prop on the node itself and
  // re-dirty the chain. That is a property of those schedulers, not of this contract, so the fix
  // must not depend on it.
  it('does not orphan a dirty DESCENDANT dirtied in the same tick as the press', async () => {
    registerRules(PRESSED_RULES);
    const surface = createSurface(ROOT_TAG);
    const root = createElement('RCTView');
    const button = createElement('RCTView');
    const label = createElement('RCTView');
    routeProp(button, 'class', 'btn');
    routeProp(button, 'testID', 'button');
    routeProp(label, 'testID', 'label');
    routeProp(label, 'nativeID', 'before');
    appendChild(button, label);
    appendChild(root, button);
    surface.appendChild(root);
    surface.commit();
    expect(findByTestId('label')?.props.nativeID).toBe('before');

    press(button, true);
    routeProp(label, 'nativeID', 'after');
    surface.requestCommit();
    await Promise.resolve();
    await Promise.resolve();

    expect(findByTestId('label')?.props.nativeID).toBe('after');
    // And the node must not be stranded for every LATER update either.
    routeProp(label, 'nativeID', 'later');
    surface.requestCommit();
    await Promise.resolve();
    expect(findByTestId('label')?.props.nativeID).toBe('later');
  });

  // The reported shape exactly: press, release, press again. If the first cycle is lost and the
  // second works, this is where it shows.
  it('survives two press cycles with a framework commit interleaved', async () => {
    registerRules(PRESSED_RULES);
    const { surface, button, sibling } = mountTree();

    for (const label of ['first', 'second']) {
      press(button, true);
      routeProp(sibling, 'nativeID', label);
      surface.commit();
      await Promise.resolve();
      expect(findByTestId('button')?.props.opacity).toBe('0.6');

      press(button, false);
      await Promise.resolve();
      // Released opacity is 1, opacity's own default — getDebugProps() omits any
      // field that equals its default, so it never reaches props at all.
      expect(findByTestId('button')?.props.opacity).toBe(undefined);
    }
  });
});

report();
