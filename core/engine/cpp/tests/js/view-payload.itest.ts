// What `View.js` does to its props before native, against what a committed plain view carries

import {
  committedPayloadOf,
  createElement,
  createSurface,
  setProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

function commit(
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(1);
  const node = createElement('RCTView', false, 'view');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}

describe('tabIndex', () => {
  // `View.js`: `focusable = !tabIndex`, the stock native side reads `tabIndex` only behind a flag
  it('makes the view focusable for 0 and not for -1', () => {
    expect(commit({ tabIndex: 0 }).focusable).toBe(true);
    expect(commit({ tabIndex: -1 }).focusable).toBe(false);
  });

  it('does not send tabIndex itself', () => {
    expect(commit({ tabIndex: 0 }).tabIndex).toBe(undefined);
  });

  it('leaves focusable alone without a tabIndex', () => {
    expect(commit({ focusable: true }).focusable).toBe(true);
    expect(commit({}).focusable).toBe(undefined);
  });
});

report();
