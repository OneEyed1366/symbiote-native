// The read half of a tree host over a tree the host holds itself. Every host that keeps a node
// graph answers these the same way, so the answers are pinned here once

import { describe, expect, it } from 'vitest';

import { createTreeReads, type IRetainedNode } from './retained-tree';

type ITestNode = IRetainedNode<ITestNode> & {
  parent: ITestNode | undefined;
  children: ITestNode[];
};

function node(name: string, tagName = ''): ITestNode {
  return {
    handle: { name },
    props: {},
    tagName,
    parent: undefined,
    children: [],
  };
}

function adopt(parent: ITestNode, ...children: ITestNode[]): void {
  for (const child of children) {
    child.parent = parent;
    parent.children.push(child);
  }
}

function readsOver(...nodes: ITestNode[]): ReturnType<typeof createTreeReads> {
  return createTreeReads((handle, what) => {
    const found = nodes.find(candidate => candidate.handle === handle);
    if (found === undefined) throw new Error(`${what}: unknown handle`);
    return found;
  });
}

// root -> [a -> [a1, a2], b]
function sampleTree(): Record<'root' | 'a' | 'a1' | 'a2' | 'b', ITestNode> {
  const root = node('root');
  const a = node('a');
  const a1 = node('a1');
  const a2 = node('a2');
  const b = node('b');
  adopt(root, a, b);
  adopt(a, a1, a2);
  return { root, a, a1, a2, b };
}

describe('tree reads', () => {
  it('answers parent, children and siblings from the node graph', () => {
    const { root, a, a1, a2, b } = sampleTree();
    const reads = readsOver(root, a, a1, a2, b);

    expect(reads.parentOf(a1.handle)).toBe(a.handle);
    expect(reads.parentOf(root.handle)).toBeUndefined();
    expect(reads.childrenOf(root.handle)).toEqual([a.handle, b.handle]);
    expect(reads.firstChildOf(a.handle)).toBe(a1.handle);
    expect(reads.firstChildOf(b.handle)).toBeUndefined();
    expect(reads.nextSiblingOf(a1.handle)).toBe(a2.handle);
    expect(reads.nextSiblingOf(b.handle)).toBeUndefined();
    expect(reads.nextSiblingOf(root.handle)).toBeUndefined();
  });

  it('answers many parents in one call, element for element', () => {
    const { root, a, a1, b } = sampleTree();
    const reads = readsOver(root, a, a1, b);

    expect(reads.parentsOf([a1.handle, root.handle, b.handle])).toEqual([
      a.handle,
      undefined,
      root.handle,
    ]);
  });

  it('walks subtrees pre-order, concatenated in root order', () => {
    const { root, a, a1, a2, b } = sampleTree();
    const reads = readsOver(root, a, a1, a2, b);

    expect(reads.subtreesOf([a.handle, b.handle])).toEqual([
      a.handle,
      a1.handle,
      a2.handle,
      b.handle,
    ]);
    expect(reads.subtreesOf([root.handle])).toEqual([
      root.handle,
      a.handle,
      a1.handle,
      a2.handle,
      b.handle,
    ]);
  });

  it('narrows a teardown walk to each root, tagged nodes and the nodes between', () => {
    const root = node('root');
    const between = node('between');
    const tagged = node('tagged', 'pressable');
    const plainLeaf = node('plain-leaf');
    const plainSibling = node('plain-sibling');
    adopt(root, between, plainSibling);
    adopt(between, tagged, plainLeaf);
    const reads = readsOver(root, between, tagged, plainLeaf, plainSibling);

    expect(reads.teardownSubtreesOf([root.handle])).toEqual([
      root.handle,
      between.handle,
      tagged.handle,
    ]);
  });

  it('lists the node and every ancestor, deepest first', () => {
    const { root, a, a1 } = sampleTree();
    const reads = readsOver(root, a, a1);

    expect(reads.ancestorsOf(a1.handle)).toEqual([
      a1.handle,
      a.handle,
      root.handle,
    ]);
  });

  it('reads one prop or the whole bag', () => {
    const lone = node('lone');
    lone.props.opacity = 0.5;
    const reads = readsOver(lone);

    expect(reads.propOf(lone.handle, 'opacity')).toBe(0.5);
    expect(reads.propOf(lone.handle, 'missing')).toBeUndefined();
    expect(reads.propsOf(lone.handle)).toEqual({ opacity: 0.5 });
  });

  it('names the read that asked about an unknown handle', () => {
    const reads = readsOver();

    expect(() => reads.parentOf({})).toThrow('parentOf: unknown handle');
    expect(() => reads.subtreesOf([{}])).toThrow('subtreesOf: unknown handle');
  });
});
