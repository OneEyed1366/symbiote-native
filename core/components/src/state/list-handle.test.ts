// В RN `getNativeScrollRef` это host-ref скролла, у него есть `measure*`
import { describe, expect, it, vi } from 'vitest';
import { createElement } from '@symbiote-native/engine';
import { buildScrollViewHandle } from '../scroll-view-commands';
import { buildListHandle } from './list-handle';

const node = createElement('RCTScrollView', false, 'scroll-view');

function handleOver(getNode: () => typeof node | null) {
  return buildListHandle({
    dispatch: vi.fn(),
    scrollHandle: buildScrollViewHandle(getNode),
    getNode,
  });
}

describe('buildListHandle native scroll ref', () => {
  it('hands back the scroll node, which measures itself', () => {
    const ref = handleOver(() => node).getNativeScrollRef();

    expect(ref).toBe(node);
    expect(typeof ref?.measure).toBe('function');
    expect(typeof ref?.measureLayout).toBe('function');
    expect(typeof ref?.measureInWindow).toBe('function');
  });

  it('answers null until the scroll tag is committed', () => {
    expect(handleOver(() => null).getNativeScrollRef()).toBeNull();
  });
});
