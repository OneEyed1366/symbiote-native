// `IHostBehavior.afterCommit` — the two lifetime holes that make it unusable for the thing it was
// added for. Both are silent: nothing throws, nothing is logged outside DEBUG, and every other
// suite stays green.
//
// The subject is a SYNTHETIC behavior rather than TouchableOpacity's, deliberately. Its fold and
// its hook are three lines each, so a red row here names the engine seam and not a primitive's
// press machine — and neither case needs a fake clock, an Animated driver or a gesture.
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import {
  clearHostBehaviors,
  createElement,
  createSurface,
  disposeRoot,
  registerHostBehavior,
  routeProp,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
let nextRootTag = 7900;

// A tag whose Fabric name is an ordinary view, which is what every adapter passes — building the
// node with the TAG as its component would make the registry key match by accident
// (`.claude/rules/test-harness-false-greens.md` §11).
const PROBE_TAG = 'probe-behavior';
const PROBE_VIEW = 'RCTView';

// The prop the behavior reacts to AND strips: the shape `pressable`'s MACHINE_ONLY_KEYS produces,
// and the reason a write to it commits a byte-identical payload.
const MACHINE_ONLY = 'machineOnly';

function registerProbe(): { seen: unknown[]; detached: ISymbioteNode[] } {
  const seen: unknown[] = [];
  const detached: ISymbioteNode[] = [];
  registerHostBehavior(PROBE_TAG, {
    foldPayload: props => {
      const next = { ...props };
      delete next[MACHINE_ONLY];
      return next;
    },
    attach: () => {},
    afterCommit: node => seen.push(node.props[MACHINE_ONLY]),
    detach: node => detached.push(node),
  });
  return { seen, detached };
}

afterEach(() => {
  clearHostBehaviors();
});

describe('afterCommit and a payload the behavior itself made empty', () => {
  it('runs when a machine-only prop flips, though nothing reaches Fabric', () => {
    const { seen } = registerProbe();
    const node = createElement(PROBE_VIEW, false, PROBE_TAG);
    routeProp(node, 'testID', 'subject');
    const surface = createSurface((nextRootTag += 1));
    surface.appendChild(node);
    surface.commit();

    // The control, and it is what makes the row below attributable: the mount commit is a real
    // commit, so the hook fires there whether or not the defect exists. Without this a broken
    // registration and a broken drain read the same.
    expect(seen, 'the hook is wired at all').toEqual([undefined]);
    const beforeKeys = Object.keys(fabric.appRoot().children[0].props).sort();

    routeProp(node, MACHINE_ONLY, true);
    surface.commit();

    // The premise, asserted rather than assumed: this commit really did change nothing native, so
    // the row below is about the hook and not about a prop that quietly reached Fabric.
    expect(
      Object.keys(fabric.appRoot().children[0].props).sort(),
      'the fold kept the payload byte-identical',
    ).toEqual(beforeKeys);
    expect(seen).toEqual([undefined, true]);
  });
});

describe('unmount sweeps host behaviors', () => {
  it('stops draining a dead surface on every later commit', () => {
    const { seen, detached } = registerProbe();
    const node = createElement(PROBE_VIEW, false, PROBE_TAG);
    routeProp(node, 'testID', 'doomed');
    const deadTag = (nextRootTag += 1);
    const dead = createSurface(deadTag);
    dead.appendChild(node);
    dead.commit();
    expect(seen, 'the hook is wired at all').toHaveLength(1);

    dead.clear();
    disposeRoot(deadTag);
    expect(detached, 'teardown released the node').toEqual([node]);

    // Any later commit anywhere in the process. A live surface with no behavior at all: whatever
    // it drains cannot be its own.
    const live = createSurface((nextRootTag += 1));
    live.appendChild(createElement(PROBE_VIEW));
    live.commit();
    live.appendChild(createElement(PROBE_VIEW));
    live.commit();

    expect(seen).toHaveLength(1);
  });

  // The case above tears down from a container the final commit had not yet emptied, which is not
  // the order any adapter produces. React's `clearContainer` reaches `SymbioteSurface.clear()` and
  // then COMMITS, so by the time `disposeRoot` runs there is no subtree left to walk — the teardown
  // has to be nominated when the child is spliced out, exactly as `node.ts`'s `removeChild` does.
  it('releases a node the surface removed before the final commit', () => {
    const { detached } = registerProbe();
    const node = createElement(PROBE_VIEW, false, PROBE_TAG);
    routeProp(node, 'testID', 'spliced');
    const tag = (nextRootTag += 1);
    const surface = createSurface(tag);
    surface.appendChild(node);
    surface.commit();

    surface.removeChild(node);
    surface.commit();
    disposeRoot(tag);

    expect(detached, 'the spliced child was nominated for teardown').toEqual([
      node,
    ]);
  });
});
