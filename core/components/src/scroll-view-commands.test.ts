// The scroll commands on the node, and the one property that makes them worth moving there: a
// LOWERED ScrollView hands the app its engine node, with no wrapper to build a handle from. If the
// node and `buildScrollViewHandle` each dispatched their own commands, `scrollTo()` with no
// argument could mean one thing through a ref and another through a tag, and no test in either
// package would see it — each would be internally correct.
//
// So the assertions are paired: what the node sends, and that the handle sends the SAME thing by
// delegating rather than by agreeing.
//
// It lives in `core/components` and not beside the node it tests, because the dependency runs one
// way — components imports the engine, never the reverse — and the drift this file exists to
// prevent is only visible from the side that can see both.
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendChild,
  createElement,
  createSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { installFabric } from '../../test-utils/src/index';
import { buildScrollViewHandle } from './scroll-view-commands';

const fabric = installFabric();
let nextRootTag = 9800;

// A COMMITTED node, because every command resolves through the node's Fabric handle and no-ops
// before its first commit — an uncommitted node makes every assertion below vacuously empty.
function mountScrollNode(): ISymbioteNode {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = createElement('RCTScrollView', false, 'symbiote-scroll-view');
  appendChild(root, node);
  surface.commit();
  return node;
}

function scrollCommands(): Array<{
  commandName: string;
  args: readonly unknown[];
}> {
  return fabric.commands
    .filter(entry => entry.node.viewName === 'RCTScrollView')
    .map(({ commandName, args }) => ({ commandName, args }));
}

afterEach(() => {
  fabric.reset();
});

describe('the node sends RN ScrollViewCommands', () => {
  it('scrollTo defaults to 0/0/animated, in RN arg order', () => {
    const node = mountScrollNode();
    node.scrollTo();
    node.scrollTo({ x: 4, y: 8, animated: false });

    expect(scrollCommands()).toEqual([
      { commandName: 'scrollTo', args: [0, 0, true] },
      { commandName: 'scrollTo', args: [4, 8, false] },
    ]);
  });

  it('scrollToEnd defaults to animated', () => {
    const node = mountScrollNode();
    node.scrollToEnd();
    node.scrollToEnd({ animated: false });

    expect(scrollCommands()).toEqual([
      { commandName: 'scrollToEnd', args: [true] },
      { commandName: 'scrollToEnd', args: [false] },
    ]);
  });

  it('flashScrollIndicators takes no arguments', () => {
    const node = mountScrollNode();
    node.flashScrollIndicators();

    expect(scrollCommands()).toEqual([
      { commandName: 'flashScrollIndicators', args: [] },
    ]);
  });
});

describe('the wrapper handle cannot drift from the node', () => {
  it('sends identical commands for the same calls', () => {
    const node = mountScrollNode();

    node.scrollTo();
    node.scrollToEnd({ animated: false });
    node.flashScrollIndicators();
    const direct = scrollCommands();

    fabric.reset();
    const handle = buildScrollViewHandle(() => node);
    handle.scrollTo();
    handle.scrollToEnd({ animated: false });
    handle.flashScrollIndicators();

    expect(scrollCommands()).toEqual(direct);
  });

  // The lazy-getter contract, which delegation must not have quietly dropped: the node is null
  // until the element commits, so an eager capture would freeze null and every command would
  // no-op forever.
  it('reads the node on every call, not once at build time', () => {
    let node: ISymbioteNode | null = null;
    const handle = buildScrollViewHandle(() => node);

    handle.scrollTo();
    node = mountScrollNode();
    fabric.reset();
    handle.scrollTo();

    expect(scrollCommands()).toEqual([
      { commandName: 'scrollTo', args: [0, 0, true] },
    ]);
  });
});
