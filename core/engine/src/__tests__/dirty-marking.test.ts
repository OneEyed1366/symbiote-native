// Co-located unit test for the dirty flag (`markDirty` in ../node.ts, the early exit in
// ../commit.ts). Two separate things are locked in here, and they fail in opposite directions:
//
//   1. The walk really does SKIP a clean subtree. Asserted through `readCommitProfile().
//      nodesVisited`, because a skip is invisible in the committed output - a correct engine and
//      a correct-but-slow engine produce byte-identical Fabric calls. Without this assertion the
//      optimisation can be reverted by accident and nothing goes red.
//   2. Every mutation entry point MARKS. This is the failure mode the flag introduces: forget one
//      mark and the screen silently keeps showing the old value - no crash, no error, nothing to
//      grep for. So each public mutator gets a row below proving its change survives to Fabric
//      through a commit that is otherwise entitled to skip the whole tree.
//
// Tests run in file order against ONE shared fabric/surface (installFabric installs a
// process-global slot), so each block builds its own subtree rather than sharing one.

import { beforeAll, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  insertBefore,
  readCommitProfile,
  removeChild,
  setEventListener,
  setNativeProps,
  setProp,
  setText,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
const ROOT_TAG = 77;
const surface = createSurface(ROOT_TAG);

// Two sibling branches of four nodes each, so "the walk skipped the other branch" is a
// measurable difference rather than a rounding error.
const BRANCH_DEPTH = 4;

function makeBranch(testID: string): {
  root: ISymbioteNode;
  leaf: ISymbioteNode;
} {
  const root = createElement('RCTView');
  setProp(root, 'testID', testID);
  let leaf = root;
  for (let depth = 1; depth < BRANCH_DEPTH; depth += 1) {
    const child = createElement('RCTView');
    setProp(child, 'testID', `${testID}-${depth}`);
    appendChild(leaf, child);
    leaf = child;
  }
  return { root, leaf };
}

const touched = makeBranch('touched');
const untouched = makeBranch('untouched');

function findByTestID(node: IFakeNode, testID: string): IFakeNode | undefined {
  if (node.props.testID === testID) return node;
  for (const child of node.children) {
    const hit = findByTestID(child, testID);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// Commit, then report how many nodes the walk actually looked at. Reading the profile zeroes it,
// so every call below measures exactly one commit.
function commitAndCountVisits(): number {
  readCommitProfile();
  surface.commit();
  return readCommitProfile().nodesVisited;
}

describe('the commit walk skips a subtree nothing touched', () => {
  let untouchedHandleAtMount: IFakeNode;
  let mountVisits = 0;

  beforeAll(() => {
    surface.appendChild(touched.root);
    surface.appendChild(untouched.root);
    mountVisits = commitAndCountVisits();
    untouchedHandleAtMount = findByTestID(fabric.appRoot(), 'untouched')!;
  });

  it('visits every node on the first mount', () => {
    // Nothing is committed yet, so nothing can be skipped: both branches plus the synthetic
    // AppContainer root. This is the number the assertions below are a reduction of.
    expect(mountVisits).toBe(BRANCH_DEPTH * 2 + 1);
  });

  it('walks only the marked branch when one leaf prop changes', () => {
    setProp(touched.leaf, 'opacity', 0.5);
    // The container, both of its top-level children (each checked, one skipped outright), and the
    // marked branch's own chain. The untouched branch's three descendants are never reached.
    expect(commitAndCountVisits()).toBe(1 + 2 + (BRANCH_DEPTH - 1));
  });

  it('reuses the untouched branch handle by reference across that commit', () => {
    expect(findByTestID(fabric.appRoot(), 'untouched')).toBe(
      untouchedHandleAtMount,
    );
  });

  it('looks at almost nothing when a commit mutates nothing at all', () => {
    // The container is dirtied at the commit entry point by design, so it and its two immediate
    // children are checked; both children bail out and the walk stops there.
    expect(commitAndCountVisits()).toBe(3);
  });
});

// Each row mutates a node buried under a branch that a skipping walk would otherwise never reach,
// then proves the change arrived. A missing markDirty makes exactly one of these go red.
describe('every mutation entry point marks its subtree dirty', () => {
  const host = createElement('RCTView');
  setProp(host, 'testID', 'host');
  const nest = createElement('RCTView');
  setProp(nest, 'testID', 'nest');
  appendChild(host, nest);

  const label = createElement('RCTText', true);
  setProp(label, 'testID', 'label');
  const rawText = createElement('RCTRawText');
  setText(rawText, 'before');
  appendChild(label, rawText);
  appendChild(nest, label);

  beforeAll(() => {
    surface.appendChild(host);
    surface.commit();
  });

  function committedNest(): IFakeNode {
    return findByTestID(fabric.appRoot(), 'nest')!;
  }

  it('setProp reaches Fabric', () => {
    setProp(nest, 'opacity', 0.25);
    surface.commit();
    expect(committedNest().props.opacity).toBe(0.25);
  });

  it('setText reaches Fabric', () => {
    setText(rawText, 'after');
    surface.commit();
    expect(
      findByTestID(fabric.appRoot(), 'label')!.children[0].props.text,
    ).toBe('after');
  });

  it('setEventListener("layout") raises the onLayout prop', () => {
    setEventListener(nest, 'layout', () => undefined);
    surface.commit();
    expect(committedNest().props.onLayout).toBe(true);
  });

  it('appendChild reaches Fabric', () => {
    const added = createElement('RCTView');
    setProp(added, 'testID', 'appended');
    appendChild(nest, added);
    surface.commit();
    expect(findByTestID(fabric.appRoot(), 'appended')).toBeDefined();
  });

  it('insertBefore reaches Fabric', () => {
    const inserted = createElement('RCTView');
    setProp(inserted, 'testID', 'inserted');
    insertBefore(nest, inserted, nest.children[0]);
    surface.commit();
    expect(committedNest().children[0].props.testID).toBe('inserted');
  });

  it('removeChild reaches Fabric', () => {
    removeChild(nest, nest.children[0]);
    surface.commit();
    expect(committedNest().children[0].props.testID).not.toBe('inserted');
  });

  it('setNativeProps reaches Fabric', () => {
    setNativeProps(nest, { opacity: 0.75 });
    expect(committedNest().props.opacity).toBe(0.75);
  });

  it('a surface-level removal reaches Fabric', () => {
    surface.removeChild(host);
    surface.commit();
    expect(findByTestID(fabric.appRoot(), 'host')).toBeUndefined();
  });
});

// An empty RCTRawText is dropped at commit exactly like an anchor (isEmptyRawText in ../node.ts),
// so it never reaches reconcile and nothing but renderableChildren can clear its dirty flag. Left
// permanently dirty, the setText that finally gives it content would stop at the node itself and
// never mark the parent - markDirty halts at the first already-dirty ancestor - so the text would
// never paint and nothing would go red anywhere else.
describe('an empty raw text that gains content still reaches Fabric', () => {
  const label = createElement('RCTText', true);
  setProp(label, 'testID', 'empty-label');
  const rawText = createElement('RCTRawText');
  setText(rawText, '');
  appendChild(label, rawText);

  beforeAll(() => {
    surface.appendChild(label);
    surface.commit();
  });

  it('commits no child while the text is empty', () => {
    expect(
      findByTestID(fabric.appRoot(), 'empty-label')!.children,
    ).toHaveLength(0);
  });

  it('paints the text once setText gives it content', () => {
    setText(rawText, 'now visible');
    surface.commit();
    expect(
      findByTestID(fabric.appRoot(), 'empty-label')!.children[0].props.text,
    ).toBe('now visible');
  });
});
