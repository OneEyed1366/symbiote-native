// @vitest-environment happy-dom
// A finger on a scroller, and the glide after it, reach the app as the phases a device reports

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

const NOOP = (): void => {};
const PHASE_LISTENERS = [
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
];

describe('scroll phases', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let calls: unknown[][];
  let node: ISymbioteNode;

  beforeEach(() => {
    calls = [];
    container = document.createElement('div');
    boot = bootWebHost({ document, container });
    const surface = createSurface(boot.rootTag);
    node = createElement('RCTScrollView', false, 'scroll-view');
    for (const listener of PHASE_LISTENERS) routeProp(node, listener, NOOP);
    surface.appendChild(node);
    surface.commit();
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
  });

  const scroller = (): HTMLElement => {
    const element = container.firstElementChild?.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error('no scroller');
    return element;
  };

  const touch = (type: 'touchstart' | 'touchend', fingers: number): void => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'touches', { value: { length: fingers } });
    scroller().dispatchEvent(event);
  };

  const scroll = (): void => {
    scroller().dispatchEvent(new Event('scroll'));
  };

  const finish = (): void => {
    scroller().dispatchEvent(new Event('scrollend'));
  };

  const tops = (): unknown[] => calls.map(([, top]) => top);

  it('tells a drag from its first scroll to the finger lifting', () => {
    touch('touchstart', 1);
    scroll();
    scroll();
    touch('touchend', 0);

    expect(tops()).toEqual(['topScrollBeginDrag', 'topScrollEndDrag']);
  });

  it('tells the glide after a lifted finger, from its first scroll to the stop', () => {
    touch('touchstart', 1);
    scroll();
    touch('touchend', 0);
    scroll();
    scroll();
    finish();

    expect(tops()).toEqual([
      'topScrollBeginDrag',
      'topScrollEndDrag',
      'topMomentumScrollBegin',
      'topMomentumScrollEnd',
    ]);
  });

  it('has no glide when the finger lifts at rest', () => {
    touch('touchstart', 1);
    scroll();
    touch('touchend', 0);
    finish();

    expect(tops()).toEqual(['topScrollBeginDrag', 'topScrollEndDrag']);
  });

  it('keeps the drag while another finger stays down', () => {
    touch('touchstart', 2);
    scroll();
    touch('touchend', 1);

    expect(tops()).toEqual(['topScrollBeginDrag']);
  });

  it('calls a scroll with no finger a glide, so a scripted scroll is heard to stop', () => {
    scroll();
    finish();

    expect(tops()).toEqual(['topMomentumScrollBegin', 'topMomentumScrollEnd']);
  });

  it('sends the offset and the sizes with a phase', () => {
    scroller().scrollTop = 40;
    touch('touchstart', 1);
    scroll();

    expect(calls[0]?.[0]).toBe(node);
    expect(calls[0]?.[2]).toMatchObject({ contentOffset: { x: 0, y: 40 } });
  });

  it('stops after dispose', () => {
    const element = scroller();
    boot.dispose();

    element.dispatchEvent(new Event('scroll'));
    element.dispatchEvent(new Event('scrollend'));

    expect(calls).toEqual([]);
  });
});
