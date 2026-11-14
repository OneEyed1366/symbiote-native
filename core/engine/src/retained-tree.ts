// The read half of a tree host, for a host that keeps its own node graph. The headless host and
// the DOM host differ in what they do with an op, not in how they answer a question about the tree

import type { ITreeHost } from './tree-host';

// What a read needs to know about a node, spelled so a host's own node type satisfies it
export type IRetainedNode<TNode> = {
  readonly handle: object;
  readonly props: Readonly<Record<string, unknown>>;
  readonly tagName: string;
  readonly parent: TNode | undefined;
  readonly children: readonly TNode[];
};

export type ITreeReads = Pick<
  ITreeHost,
  | 'propOf'
  | 'propsOf'
  | 'parentOf'
  | 'childrenOf'
  | 'firstChildOf'
  | 'nextSiblingOf'
  | 'parentsOf'
  | 'subtreesOf'
  | 'teardownSubtreesOf'
  | 'ancestorsOf'
>;

// `nodeOf` throws for a handle the host never saw, and gets the read's name to say so
export function createTreeReads<TNode extends IRetainedNode<TNode>>(
  nodeOf: (handle: object, what: string) => TNode,
): ITreeReads {
  const collect = (node: TNode, out: object[]): void => {
    out.push(node.handle);
    for (const child of node.children) collect(child, out);
  };

  // Keeps a node when it is a root, carries a tag, or sits above one that does
  const collectWanted = (
    node: TNode,
    isRoot: boolean,
    out: object[],
  ): boolean => {
    const reserved = out.length;
    out.push(node.handle);
    let isWanted = isRoot || node.tagName !== '';
    for (const child of node.children) {
      if (collectWanted(child, false, out)) isWanted = true;
    }
    if (!isWanted) out.length = reserved;
    return isWanted;
  };

  return {
    propOf: (handle, key) => nodeOf(handle, 'propOf').props[key],
    propsOf: handle => nodeOf(handle, 'propsOf').props,
    parentOf: handle => nodeOf(handle, 'parentOf').parent?.handle,
    childrenOf: handle =>
      nodeOf(handle, 'childrenOf').children.map(child => child.handle),
    firstChildOf: handle => nodeOf(handle, 'firstChildOf').children[0]?.handle,
    nextSiblingOf: handle => {
      const node = nodeOf(handle, 'nextSiblingOf');
      const siblings = node.parent?.children;
      if (siblings === undefined) return undefined;
      return siblings[siblings.indexOf(node) + 1]?.handle;
    },
    parentsOf: handles =>
      handles.map(handle => nodeOf(handle, 'parentsOf').parent?.handle),
    subtreesOf: roots => {
      const out: object[] = [];
      for (const root of roots) collect(nodeOf(root, 'subtreesOf'), out);
      return out;
    },
    teardownSubtreesOf: roots => {
      const out: object[] = [];
      for (const root of roots) {
        collectWanted(nodeOf(root, 'teardownSubtreesOf'), true, out);
      }
      return out;
    },
    ancestorsOf: handle => {
      const chain: object[] = [];
      let node: TNode | undefined = nodeOf(handle, 'ancestorsOf');
      while (node !== undefined) {
        chain.push(node.handle);
        node = node.parent;
      }
      return chain;
    },
  };
}
