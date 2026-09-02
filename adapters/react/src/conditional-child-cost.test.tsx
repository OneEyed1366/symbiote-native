// What a FALSE conditional child costs React, in both currencies.
//
// WHY IT MATTERS AND WHY A FABRIC COUNT CANNOT ANSWER IT. The benchmark's row-shape arm
// (`examples/*/screens/BenchmarkScreen`) adds one TextInput per row under a condition, and its
// acceptance criterion is that the CONTROL arm — `plain` — stays byte-identical to what it
// committed before the arm existed. Stated in Fabric counters that criterion is satisfied by a
// framework whose false branch still retains a node: an anchor never reaches the slot, so
// `createNode` and `appendChild` do not move while the retained tree grows by one per row.
//
// Measured on the other adapters 2026-08-31, this is not hypothetical:
//
//   svelte  a false {#if}          +1 anchor per row   renderable unmoved
//   vue     v-if false             +1 retained         createNode unmoved
//   vue     a JSX ternary -> null  +1 retained         same cost, same blindness
//
// React's canary and the stock baseline both write the JSX ternary, so this is the arm every other
// column is read against and a contaminated control is the worst failure available. `createAnchor`
// (core/engine/src/node.ts) is the only producer of an anchor node and no file in this adapter
// calls it — but "the grep says zero" is an inference, and the two arms below are a measurement.
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import {
  censusRetainedTree,
  isSymbioteNode,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import { Text, View } from './components';

const ROOT_TAG = 8833;
const ROWS = 50;

const fabric = installFabric();

function Row({ withChild }: { withChild: boolean }): React.ReactElement {
  return (
    <View>
      <Text>{'id'}</Text>
      {withChild ? <Text>{'extra'}</Text> : null}
    </View>
  );
}

function List({ withChild }: { withChild: boolean }): React.ReactElement {
  return (
    <View testID="list">
      {Array.from({ length: ROWS }, (_value, index) => (
        <Row key={index} withChild={withChild} />
      ))}
    </View>
  );
}

function retainedRoot(): ISymbioteNode {
  const seed = fabric.created.find(node => node.props.testID === 'list');
  if (seed === undefined) throw new Error('the list node was never created');
  const handle: unknown = seed.instanceHandle;
  if (!isSymbioteNode(handle))
    throw new Error('the list node carries no retained handle');
  let current: ISymbioteNode = handle;
  while (current.parent !== undefined) current = current.parent;
  return current;
}

interface IArm {
  nodes: number;
  anchors: number;
  renderable: number;
  createNode: number;
}

function measure(withChild: boolean): IArm {
  fabric.reset();
  mount(ROOT_TAG, <List withChild={withChild} />);
  const census = censusRetainedTree([retainedRoot()]);
  const arm = {
    nodes: census.nodes,
    anchors: census.anchors,
    renderable: census.renderable,
    createNode: fabric.counts.createNode,
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

  // The two currencies, side by side, because the whole point is that they can disagree. A
  // framework paying an anchor per row moves `nodes` while `createNode` holds still.
  it('moves BOTH counters together, never one without the other', () => {
    const absent = measure(false);
    const present = measure(true);

    // One Text is two native views (symbiote-text + its RCTRawText child).
    expect(present.createNode - absent.createNode).toBe(ROWS * 2);
    expect(present.nodes - absent.nodes).toBe(ROWS * 2);
    expect(present.renderable - absent.renderable).toBe(ROWS * 2);
  });
});
