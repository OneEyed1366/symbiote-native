// The device regression: the first press changes nothing visually while its callback fires
// A press asks the engine for a commit of its own (`requestCommitFor`) in the same tick as the
// framework's update, so one of the two commits may swallow the other

// This runs against the real committed tree, т.к. the recording host reads the node's current state
// and would pass whether or not the race was lost

// `nativeID` marks which value won the race, т.к. `getDebugProps()` does not expose
// `accessibilityLabel` and `nativeID` takes any string

import {
  appendChild,
  createElement,
  createSurface,
  requestCommitFor,
  routeProp,
  setNodePressed,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, findByTestId, it, report } from './harness';

// Must be 1: the C++ harness watches one fixed `kSurfaceId`, whatever tag JS passes to
// `createSurface`, and every case gets a fresh registry from the harness's per-case `reset()`
const ROOT_TAG = 1;

// The pressed look: the explicit style and the variant the engine swaps in while pressed
function giveLook(button: ISymbioteNode): void {
  routeProp(button, 'style', { opacity: 1 });
  routeProp(button, 'activeStyle', { opacity: 0.6 });
}

function mountTree(): {
  surface: ReturnType<typeof createSurface>;
  button: ISymbioteNode;
  sibling: ISymbioteNode;
} {
  const surface = createSurface(ROOT_TAG);
  const root = createElement('RCTView');
  const button = createElement('RCTView');
  const sibling = createElement('RCTView');
  giveLook(button);
  routeProp(button, 'testID', 'button');
  routeProp(sibling, 'testID', 'sibling');
  routeProp(sibling, 'nativeID', 'before');
  appendChild(root, button);
  appendChild(root, sibling);
  surface.appendChild(root);
  surface.commit();
  return { surface, button, sibling };
}

// What the host behavior does: `setNodePressed` only dirties, and a press arrives outside every
// renderer mutation path, so nothing schedules a commit unless the behavior asks
function press(node: ISymbioteNode, pressed: boolean): void {
  setNodePressed(node, pressed);
  requestCommitFor(node);
}

describe('a press commit racing the framework commit, on the real engine', () => {
  it('publishes the pressed style when the framework commits FIRST in the same tick', async () => {
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
    const { surface, button, sibling } = mountTree();

    press(button, true);
    await Promise.resolve();
    routeProp(sibling, 'nativeID', 'after');
    surface.commit();

    expect(findByTestId('button')?.props.opacity).toBe('0.6');
    expect(findByTestId('sibling')?.props.nativeID).toBe('after');
  });

  // The cases above update a sibling, the report is that the pressed node itself stops committing
  // Its props stay correct, only the commit is lost
  it('keeps committing the pressed node itself after its first press', async () => {
    const { surface, button } = mountTree();

    // A read before the press, or a later empty read looks like a tree that never committed
    routeProp(button, 'nativeID', 'before');
    surface.commit();
    expect(findByTestId('button')?.props.nativeID).toBe('before');

    press(button, true);
    await Promise.resolve();

    routeProp(button, 'nativeID', 'after');
    surface.commit();
    expect(findByTestId('button')?.props.nativeID).toBe('after');
  });

  // The same case through `requestCommit()`, the coalesced commit a fine-grained adapter uses
  it('keeps committing the pressed node through the COALESCED commit path', async () => {
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

  // The casualty is a descendant dirtied in the same tick as the press
  // The targeted commit clears the pressable's flags and never descends, so the framework's commit
  // finds a clean chain and the child stays dirty under it for good
  it('does not orphan a dirty DESCENDANT dirtied in the same tick as the press', async () => {
    const surface = createSurface(ROOT_TAG);
    const root = createElement('RCTView');
    const button = createElement('RCTView');
    const label = createElement('RCTView');
    giveLook(button);
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

  // The reported shape: press, release, press again
  it('survives two press cycles with a framework commit interleaved', async () => {
    const { surface, button, sibling } = mountTree();
    const cycle = async (label: string): Promise<void> => {
      press(button, true);
      routeProp(sibling, 'nativeID', label);
      surface.commit();
      await Promise.resolve();
      expect(findByTestId('button')?.props.opacity).toBe('0.6');

      press(button, false);
      await Promise.resolve();
      // Released opacity is 1, its own default, which `getDebugProps()` leaves out of props
      expect(findByTestId('button')?.props.opacity).toBe(undefined);
    };

    await cycle('first');
    await cycle('second');
  });
});

report();
