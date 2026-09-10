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

// The create-path `__SYMBIOTE_BATCH_CREATE__` experiment lived here and is GONE (2026-09-08). It
// died with the walk, nothing read the flag any more, and the measurement it existed to settle is
// already in root CLAUDE.md: on device it was a wash — Create 256.8 on / 258.5 off, Append 252.1 /
// 252.5 — while demonstrably doing what it claimed (Fabric 9000/5000/1009 against 9000/8000/9).
// The five `BenchmarkScreen` toggles that drove it went with it. Do not rebuild it without a
// reason the numbers above do not already answer.
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
