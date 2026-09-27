// What a FALSE conditional child costs React. A Fabric count alone cannot answer it: a framework
// whose false branch still retains a node satisfies "byte-identical commit" while the retained
// tree grows by one per row, since an anchor never reaches the slot (`createAnchor`, node.ts).
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { parentOf, type ISymbioteNode } from '@symbiote-native/engine';
import {
  censusLive,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from './render';

const ROOT_TAG = 8833;
const ROWS = 50;

const fabric = installRecordingFabric();

function Row({ withChild }: { withChild: boolean }): React.ReactElement {
  return (
    <view>
      <text>{'id'}</text>
      {withChild ? <text>{'extra'}</text> : null}
    </view>
  );
}

function List({ withChild }: { withChild: boolean }): React.ReactElement {
  return (
    <view testID="list">
      {Array.from({ length: ROWS }, (_value, index) => (
        <Row key={index} withChild={withChild} />
      ))}
    </view>
  );
}

function retainedRoot(): ISymbioteNode {
  const seed = fabric.find(node => node.props.testID === 'list');
  if (seed === undefined) throw new Error('the list node was never created');
  let current: ISymbioteNode = seed.handle;
  let above = parentOf(current);
  while (above !== undefined) {
    current = above;
    above = parentOf(current);
  }
  return current;
}

type IArm = {
  /** What the engine SENT: every creation in the op stream, anchors included. */
  sent: number;
  /** What it RETAINS: the live tree, anchors included. */
  nodes: number;
  anchors: number;
  nonAnchors: number;
};

function measure(withChild: boolean): IArm {
  fabric.reset();
  mount(ROOT_TAG, <List withChild={withChild} />);
  const census = censusLive(retainedRoot());
  const arm = {
    sent: fabric.findAll(() => true).length,
    nodes: census.nodes,
    anchors: census.anchors,
    nonAnchors: census.nonAnchors,
  };
  unmount(ROOT_TAG);
  return arm;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('a false conditional child costs React nothing to retain', () => {
  // The first mount in a process pays for container chrome the next one reuses, so an arm taken
  // cold reads one createNode short of a warm one — which looks exactly like "the null child made
  // Fabric do less work". Both arms are taken after this.
  beforeEach(() => {
    mount(ROOT_TAG, <List withChild={false} />);
    unmount(ROOT_TAG);
  });

  it('retains no anchor and no extra node for the false branch', () => {
    const absent = measure(false);

    expect(absent.anchors).toBe(0);
    // The CONTROL, and it is what separates this from a probe that cannot fail: a real child must
    // cost a retained node, or the census is not reading the tree under test at all.
    const present = measure(true);
    expect(present.nodes).toBeGreaterThan(absent.nodes);
    expect(present.anchors).toBe(0);
  });

  // The two currencies, side by side, because the whole point is that they can disagree. `sent` is
  // the op stream — every creation the engine asked for, whether or not the tree still holds it;
  // `nodes` is what the tree holds now. A framework that creates and then discards moves the first
  // without the second, and one paying an anchor per row moves both while `nonAnchors` holds still.
  it('moves BOTH counters together, never one without the other', () => {
    const absent = measure(false);
    const present = measure(true);

    // One Text is two native views (text + its RCTRawText child).
    expect(present.sent - absent.sent).toBe(ROWS * 2);
    expect(present.nodes - absent.nodes).toBe(ROWS * 2);
    expect(present.nonAnchors - absent.nonAnchors).toBe(ROWS * 2);
  });
});
