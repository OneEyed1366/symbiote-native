// Covers buildComponentChildren's grouping algorithm directly: given a flat, owner-tagged native
// tree (ISerializedNode[]), it must merge non-adjacent siblings that share a chain prefix into
// ONE row per distinct ancestor — not one row per native node — which is what lets a purely
// composing app component (renders exclusively through other components, never a native node of
// its own) appear as a single boundary wrapping multiple, structurally separate native subtrees.
// See element.ts's resolveOwnerFromSvelteMeta and this file's own header comment for the design.
import { describe, expect, it } from 'vitest';
import { buildComponentChildren } from './components-panel';
import type { ISerializedNode } from './protocol';

function node(
  id: number,
  overrides: Partial<ISerializedNode> = {},
): ISerializedNode {
  return {
    id,
    component: 'RCTView',
    isText: false,
    props: {},
    children: [],
    ...overrides,
  };
}

describe('buildComponentChildren', () => {
  it('emits nothing for an untagged native tree — pure passthrough', () => {
    const tree = [node(1, { children: [node(2), node(3)] })];

    expect(buildComponentChildren(tree, [])).toEqual([]);
  });

  it('merges two non-adjacent native subtrees sharing a chain prefix into ONE ancestor row', () => {
    // The scenario that broke the naive per-node algorithm: CanaryScreen renders BOTH a
    // <ScrollView> and a <View> — two SEPARATE native subtrees, not siblings created by the same
    // node — that must still collapse into a single "CanaryScreen" row with two children.
    const scrollViewSubtree = node(10, {
      owner: {
        chain: [
          { component: 'App' },
          { component: 'CanaryScreen' },
          { component: 'ScrollView' },
        ],
      },
    });
    const viewSubtree = node(20, {
      owner: {
        chain: [
          { component: 'App' },
          { component: 'CanaryScreen' },
          { component: 'View' },
        ],
      },
    });

    const tree = buildComponentChildren([scrollViewSubtree, viewSubtree], []);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('App');
    expect(tree[0].children).toHaveLength(1);
    const canaryScreen = tree[0].children[0];
    expect(canaryScreen.name).toBe('CanaryScreen');
    expect(canaryScreen.children.map(child => child.name).sort()).toEqual([
      'ScrollView',
      'View',
    ]);
  });

  it('splices an untagged pass-through node children up to the nearest owner boundary', () => {
    const tagged = node(1, {
      owner: { chain: [{ component: 'App' }] },
      children: [
        // an untagged native wrapper in between (e.g. an anchor) — must not create a row, and
        // its own tagged descendant must still surface as App's child.
        node(2, {
          children: [
            node(3, {
              owner: { chain: [{ component: 'App' }, { component: 'Button' }] },
            }),
          ],
        }),
      ],
    });

    const tree = buildComponentChildren([tagged], []);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('App');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe('Button');
  });

  it('gives a boundary its own native props only when exactly one node terminates there', () => {
    const leaf = node(1, {
      props: { style: { padding: 10 } },
      owner: { chain: [{ component: 'App' }, { component: 'Button' }] },
    });

    const tree = buildComponentChildren([leaf], []);

    expect(tree[0].children[0].props).toEqual({ style: { padding: 10 } });
  });

  it('does not blow the JS stack on a deeply nested native tree', () => {
    // why: a real deeply-nested-navigator screen (React Navigation wraps each screen in many
    // layers) crashed the DevTools panel with `RangeError: Maximum call stack size exceeded` —
    // confirmed on a real device on `NestedNavigatorsScreen`. This synthesizes an equivalently
    // deep chain (native recursion depth this large reliably overflows a browser tab's stack).
    const DEPTH = 20_000;
    let deepest: ISerializedNode = node(DEPTH, {
      owner: { chain: [{ component: 'App' }, { component: 'Leaf' }] },
    });
    for (let level = DEPTH - 1; level >= 0; level -= 1) {
      deepest = node(level, { children: [deepest] }); // untagged wrapper — pure passthrough
    }

    expect(() => buildComponentChildren([deepest], [])).not.toThrow();
  });

  it('leaves props empty for a purely composing boundary spanning multiple native subtrees', () => {
    const scrollViewSubtree = node(10, {
      owner: {
        chain: [{ component: 'CanaryScreen' }, { component: 'ScrollView' }],
      },
    });
    const viewSubtree = node(20, {
      owner: { chain: [{ component: 'CanaryScreen' }, { component: 'View' }] },
    });

    const tree = buildComponentChildren([scrollViewSubtree, viewSubtree], []);

    // CanaryScreen never creates a native node of its own — there is no single node whose props
    // would represent it, so it must NOT borrow one child's props at random.
    expect(tree[0].props).toEqual({});
  });
});
