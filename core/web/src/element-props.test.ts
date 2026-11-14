// @vitest-environment happy-dom
// An element is brought to a node's spec by the difference from what it already shows, so a prop
// that did not change costs no DOM write

import { beforeEach, describe, expect, it } from 'vitest';
import { applySpec } from './element-props';
import type { IDomSpec } from './dom-spec';

function spec(partial: Partial<IDomSpec>): IDomSpec {
  return { classNames: [], css: {}, attributes: {}, ...partial };
}

describe('applying a spec to an element', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  it('writes the classes, the inline css and the attributes of a first spec', () => {
    applySpec(
      element,
      undefined,
      spec({
        classNames: ['a', 'b'],
        css: { width: '10px', 'z-index': '2' },
        attributes: { 'data-testid': 'x' },
      }),
    );

    expect(element.className).toBe('a b');
    expect(element.style.width).toBe('10px');
    expect(element.style.zIndex).toBe('2');
    expect(element.getAttribute('data-testid')).toBe('x');
  });

  it('removes what the new spec no longer has', () => {
    const first = spec({
      css: { width: '10px', height: '5px' },
      attributes: { id: 'a', role: 'button' },
    });
    applySpec(element, undefined, first);
    applySpec(
      element,
      first,
      spec({ css: { height: '5px' }, attributes: { role: 'button' } }),
    );

    expect(element.style.width).toBe('');
    expect(element.style.height).toBe('5px');
    expect(element.hasAttribute('id')).toBe(false);
    expect(element.getAttribute('role')).toBe('button');
  });

  it('rewrites a value that changed and leaves one that did not alone', () => {
    const first = spec({ css: { width: '10px', height: '5px' } });
    applySpec(element, undefined, first);
    element.style.height = '99px';
    applySpec(element, first, spec({ css: { width: '20px', height: '5px' } }));

    expect(element.style.width).toBe('20px');
    expect(element.style.height).toBe('99px');
  });

  it('writes a custom property through setProperty so a dash survives', () => {
    applySpec(element, undefined, spec({ css: { 'padding-left': '4px' } }));

    expect(element.style.paddingLeft).toBe('4px');
  });

  it('does not touch the class list when the classes are the same', () => {
    const first = spec({ classNames: ['a'] });
    applySpec(element, undefined, first);
    element.classList.add('added-by-someone-else');
    applySpec(element, first, spec({ classNames: ['a'] }));

    expect(element.className).toBe('a added-by-someone-else');
  });
});
