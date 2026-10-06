import { describe, expect, it } from 'vitest';
import { createElement } from '@symbiote-native/engine';
import { el } from './descriptor';
import { createHostNodeHolder } from './host-node-holder';

function refOf(props: Record<string, unknown>): (host: unknown) => void {
  const ref: unknown = props['ref'];
  if (typeof ref !== 'function') throw new Error('no ref prop');
  return host => ref(host);
}

describe('createHostNodeHolder (Positive)', () => {
  it('has no node until the painted element mounts', () => {
    expect(createHostNodeHolder().getNode()).toBeNull();
  });

  it('holds the host node the ref of the captured descriptor receives', () => {
    const holder = createHostNodeHolder();
    const node = createElement('RCTView');

    refOf(holder.capture(el('view')).props)(node);

    expect(holder.getNode()).toBe(node);
  });

  it('keeps the props of the descriptor and leaves the original untouched', () => {
    const holder = createHostNodeHolder();
    const original = el('view', { testID: 'a' });

    const captured = holder.capture(original);

    expect(captured.props).toMatchObject({ testID: 'a' });
    expect(original.props).not.toHaveProperty('ref');
  });

  it('hands out one ref for every capture, so a prop diff sees no change', () => {
    const holder = createHostNodeHolder();

    const first = holder.capture(el('view')).props['ref'];
    const second = holder.capture(el('view')).props['ref'];

    expect(first).toBe(second);
  });

  it('lets the node go when the element unmounts', () => {
    const holder = createHostNodeHolder();
    const ref = refOf(holder.capture(el('view')).props);

    ref(createElement('RCTView'));
    ref(null);

    expect(holder.getNode()).toBeNull();
  });
});

describe('createHostNodeHolder (Negative)', () => {
  it('does not hold something that is not a host node', () => {
    const holder = createHostNodeHolder();

    refOf(holder.capture(el('view')).props)({ not: 'a node' });

    expect(holder.getNode()).toBeNull();
  });
});
