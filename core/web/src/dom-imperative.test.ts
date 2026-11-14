// @vitest-environment happy-dom
// Императивные вызовы ref-а доходят до элемента: прокрутка, фокус, размеры

import { RETAINED_KIND } from '@symbiote-native/engine/retained-visitor';
import { describe, expect, it, vi } from 'vitest';
import { createDomNode, type IDomNode } from './dom-node';
import { createImperative } from './dom-imperative';

const VIEW = 'RCTView';

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return new DOMRect(left, top, width, height);
}

function nodeAt(frame: DOMRect, tagName = ''): IDomNode {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => frame;
  Object.defineProperties(element, {
    offsetLeft: { value: frame.x - 10 },
    offsetTop: { value: frame.y - 20 },
  });
  const node = createDomNode({}, RETAINED_KIND.element, VIEW, element);
  node.tagName = tagName;
  return node;
}

function imperativeOver(
  ...nodes: IDomNode[]
): ReturnType<typeof createImperative> {
  return createImperative(handle => {
    const node = nodes.find(candidate => candidate.handle === handle);
    if (node === undefined) throw new Error('no node');
    return node;
  });
}

describe('imperative calls', () => {
  it('scrolls a vertical scroller to an offset, smoothly unless told not to', () => {
    const node = nodeAt(rect(0, 0, 10, 10), 'scroll-view');
    const scrollTo = vi.fn();
    Object.assign(node.dom ?? {}, { scrollTo });
    const imperative = imperativeOver(node);

    imperative.dispatchCommand(node.handle, 'scrollTo', [5, 120, true]);
    imperative.dispatchCommand(node.handle, 'scrollTo', [0, 0, false]);

    expect(scrollTo).toHaveBeenNthCalledWith(1, {
      left: 5,
      top: 120,
      behavior: 'smooth',
    });
    expect(scrollTo).toHaveBeenNthCalledWith(2, {
      left: 0,
      top: 0,
      behavior: 'instant',
    });
  });

  it('scrolls to the end along the axis of the scroller', () => {
    const vertical = nodeAt(rect(0, 0, 10, 10), 'scroll-view');
    const horizontal = nodeAt(rect(0, 0, 10, 10), 'horizontal-scroll-view');
    const verticalScroll = vi.fn();
    const horizontalScroll = vi.fn();
    Object.defineProperties(vertical.dom, {
      scrollTo: { value: verticalScroll },
      scrollHeight: { value: 900 },
    });
    Object.defineProperties(horizontal.dom, {
      scrollTo: { value: horizontalScroll },
      scrollWidth: { value: 700 },
    });
    const imperative = imperativeOver(vertical, horizontal);

    imperative.dispatchCommand(vertical.handle, 'scrollToEnd', [true]);
    imperative.dispatchCommand(horizontal.handle, 'scrollToEnd', [false]);

    expect(verticalScroll).toHaveBeenCalledWith({
      top: 900,
      behavior: 'smooth',
    });
    expect(horizontalScroll).toHaveBeenCalledWith({
      left: 700,
      behavior: 'instant',
    });
  });

  it('focuses and blurs the element', () => {
    const node = nodeAt(rect(0, 0, 10, 10));
    const focus = vi.fn();
    const blur = vi.fn();
    Object.assign(node.dom ?? {}, { focus, blur });
    const imperative = imperativeOver(node);

    imperative.dispatchCommand(node.handle, 'focus', []);
    imperative.dispatchCommand(node.handle, 'blur', []);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('ignores a command the page has no meaning for', () => {
    const node = nodeAt(rect(0, 0, 10, 10));
    const imperative = imperativeOver(node);

    expect(() =>
      imperative.dispatchCommand(node.handle, 'flashScrollIndicators', []),
    ).not.toThrow();
  });

  it('measures the frame in the parent, with the page offset', () => {
    const node = nodeAt(rect(30, 50, 100, 40));
    const callback = vi.fn();
    Object.defineProperty(window, 'scrollX', { value: 4, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 6, configurable: true });

    imperativeOver(node).measure(node.handle, callback);

    expect(callback).toHaveBeenCalledWith(20, 30, 100, 40, 34, 56);
  });

  it('measures the frame in the window', () => {
    const node = nodeAt(rect(30, 50, 100, 40));
    const callback = vi.fn();

    imperativeOver(node).measureInWindow(node.handle, callback);

    expect(callback).toHaveBeenCalledWith(30, 50, 100, 40);
  });

  it('measures the frame against another node', () => {
    const node = nodeAt(rect(30, 50, 100, 40));
    const other = nodeAt(rect(10, 20, 500, 500));
    const onSuccess = vi.fn();
    const onFail = vi.fn();

    imperativeOver(node, other).measureLayout(
      node.handle,
      other.handle,
      onFail,
      onSuccess,
    );

    expect(onSuccess).toHaveBeenCalledWith(20, 30, 100, 40);
    expect(onFail).not.toHaveBeenCalled();
  });

  it('answers the synchronous rect from the element', () => {
    const node = nodeAt(rect(30, 50, 100, 40));

    expect(
      imperativeOver(node).getBoundingClientRect(node.handle, false),
    ).toEqual({
      x: 30,
      y: 50,
      width: 100,
      height: 40,
    });
  });

  it('moves the focus on an accessibility focus request', () => {
    const node = nodeAt(rect(0, 0, 10, 10));
    const focus = vi.fn();
    Object.assign(node.dom ?? {}, { focus });

    imperativeOver(node).sendAccessibilityEvent(node.handle, 'focus');

    expect(focus).toHaveBeenCalledTimes(1);
  });
});
