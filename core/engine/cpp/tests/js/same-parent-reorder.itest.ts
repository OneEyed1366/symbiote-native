// Reproduces shim-node.ts's `insertOne`: `removeChild` from the current parent, then
// `insertBefore` into that SAME parent, both before one commit, the shape a keyed
// `{#each}` reorder emits

import {
  appendChild,
  createElement,
  createSurface,
  insertBefore,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  committedShape,
  describe,
  expect,
  findAllCommitted,
  it,
  mounted,
  report,
  type IMountedView,
} from './harness';

function tile(testID: string): ISymbioteNode {
  const node = createElement('RCTView');
  routeProp(node, 'testID', testID);
  return node;
}

function order(): string[] {
  return findAllCommitted(one => one.props.testID !== undefined).map(
    one => one.props.testID,
  );
}

// what the platform mounted, not the shadow tree, the layer closer to what a real screen paints
function mountedOrder(): string[] {
  const testIDs: string[] = [];
  const walk = (view: IMountedView): void => {
    if (view.props.testID !== undefined) testIDs.push(view.props.testID);
    for (const child of view.children) walk(child);
  };
  walk(mounted());
  return testIDs;
}

describe('same-parent reorder, remove and insertBefore coalesced into one commit', () => {
  it('commits the new order when a mid child moves before an earlier sibling', () => {
    const parent = createElement('RCTView');
    const a = tile('a');
    const b = tile('b');
    const c = tile('c');
    const d = tile('d');
    appendChild(parent, a);
    appendChild(parent, b);
    appendChild(parent, c);
    appendChild(parent, d);

    const surface = createSurface(1);
    surface.appendChild(parent);
    surface.commit();
    expect(order()).toEqual(['a', 'b', 'c', 'd']);

    // mirrors `insertOne(c, b)`: detach records `removeChild`, then the insert records
    // `insertBefore` into the same parent, both before the next `commit()`
    removeChild(parent, c);
    insertBefore(parent, c, b);
    surface.commit();

    expect(order()).toEqual(['a', 'c', 'b', 'd']);
    expect(committedShape()).toBe(
      'RootView(View(View(View()View()View()View())))',
    );
    // proves the platform's own mount, not just the shadow tree, reflects the swap
    expect(mountedOrder()).toEqual(['a', 'c', 'b', 'd']);
  });

  it('commits the new order when a child moves to the tail', () => {
    const parent = createElement('RCTView');
    const a = tile('a');
    const b = tile('b');
    const c = tile('c');
    appendChild(parent, a);
    appendChild(parent, b);
    appendChild(parent, c);

    const surface = createSurface(1);
    surface.appendChild(parent);
    surface.commit();
    expect(order()).toEqual(['a', 'b', 'c']);

    removeChild(parent, a);
    appendChild(parent, a);
    surface.commit();

    expect(order()).toEqual(['b', 'c', 'a']);
  });
});

report();
