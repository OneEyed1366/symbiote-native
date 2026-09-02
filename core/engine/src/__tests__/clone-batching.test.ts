import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  setProp,
  type ISymbioteNode,
} from '../index';
import { getSlot } from '../fabric';

const fabric = installFabric();

describe('clone-with-children batching', () => {
  it('is detected on the fake host and collapses the append loop', () => {
    expect(getSlot().supportsCloneWithChildren).toBe(true);

    const surface = createSurface(6100);
    const table = createElement('RCTView');
    const rows: ISymbioteNode[] = [];
    for (let index = 0; index < 100; index += 1) {
      const row = createElement('RCTView');
      setProp(row, 'testID', `row-${index}`);
      appendChild(table, row);
      rows.push(row);
    }
    surface.appendChild(table);
    surface.commit();

    fabric.reset();
    appendChild(table, createElement('RCTView'));
    surface.commit();

    expect(fabric.counts.appendChild).toBe(0);
    expect(fabric.counts.clone).toBe(2);
    expect(fabric.appRoot().children[0].children).toHaveLength(101);
    expect(fabric.appRoot().children[0].children[7].props.testID).toBe('row-7');
  });
});

describe('create-path batching (temporary __SYMBIOTE_BATCH_CREATE__ experiment)', () => {
  // A row shaped like the benchmark's: one parent with 3 children, each of which has 1 child.
  // Only the 3-child parent clears CREATE_BATCH_MIN_CHILDREN.
  function mountRow(rootTag: number): void {
    const surface = createSurface(rootTag);
    const row = createElement('RCTView');
    setProp(row, 'testID', 'row');
    for (let index = 0; index < 3; index += 1) {
      const cell = createElement('RCTView');
      const leaf = createElement('RCTView');
      setProp(leaf, 'testID', `leaf-${index}`);
      appendChild(cell, leaf);
      appendChild(row, cell);
    }
    surface.appendChild(row);
    surface.commit();
  }

  function leafIds(): string[] {
    const found: string[] = [];
    const walk = (
      nodes: readonly {
        props: Record<string, unknown>;
        children: readonly any[];
      }[],
    ) => {
      for (const node of nodes) {
        if (typeof node.props.testID === 'string')
          found.push(node.props.testID);
        walk(node.children);
      }
    };
    walk(fabric.appRoot().children);
    return found;
  }

  it('is OFF by default — the append loop is byte-for-byte what it was', () => {
    expect(globalThis.__SYMBIOTE_BATCH_CREATE__).toBeUndefined();
    fabric.reset();
    mountRow(6201);
    // container + row + 3 cells + 3 leaves = 8 edges into a parent, none batched.
    expect(fabric.counts.appendChild).toBe(7);
    expect(leafIds()).toEqual(['row', 'leaf-0', 'leaf-1', 'leaf-2']);
  });

  it('ON: the 3-child parent trades its appends for one clone, 1-child parents do not', () => {
    globalThis.__SYMBIOTE_BATCH_CREATE__ = true;
    try {
      fabric.reset();
      mountRow(6202);
      // The row's 3 appends become 1 clone; the three 1-child cells stay on appendChild.
      expect(fabric.counts.appendChild).toBe(4);
      expect(fabric.counts.clone).toBeGreaterThan(0);
      expect(leafIds()).toEqual(['row', 'leaf-0', 'leaf-1', 'leaf-2']);
    } finally {
      globalThis.__SYMBIOTE_BATCH_CREATE__ = undefined;
    }
  });
});
