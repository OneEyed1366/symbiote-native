// @vitest-environment happy-dom
// События элемента без всплытия (прокрутка, загрузка картинки) доходят до приложения как `top*`

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

const SCROLL_VIEW = 'RCTScrollView';
const SCROLL_TAG = 'scroll-view';
const IMAGE_VIEW = 'RCTImageView';
const NOOP = (): void => {};

describe('direct events', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    container = document.createElement('div');
    boot = bootWebHost({ document, container });
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
  });

  function mount(
    viewName: string,
    tag: string,
    listeners: readonly string[],
  ): ISymbioteNode {
    const surface = createSurface(boot.rootTag);
    const node = createElement(viewName, false, tag);
    for (const listener of listeners) routeProp(node, listener, NOOP);
    surface.appendChild(node);
    surface.commit();
    // The engine registered its own dispatcher with the surface, the spy takes its place
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    return node;
  }

  function elementOf(): HTMLElement {
    const element = container.firstElementChild?.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error('no element');
    return element;
  }

  describe('scroll', () => {
    function scroller(): HTMLElement {
      const element = elementOf();
      Object.defineProperties(element, {
        scrollWidth: { value: 300 },
        scrollHeight: { value: 900 },
        clientWidth: { value: 300 },
        clientHeight: { value: 400 },
      });
      element.scrollTop = 40;
      return element;
    }

    it('sends the offset and the sizes of a scroller whose app listens', () => {
      const node = mount(SCROLL_VIEW, SCROLL_TAG, ['onScroll']);

      scroller().dispatchEvent(new Event('scroll'));

      expect(calls).toEqual([
        [
          node,
          'topScroll',
          {
            contentOffset: { x: 0, y: 40 },
            contentSize: { width: 300, height: 900 },
            layoutMeasurement: { width: 300, height: 400 },
            contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
            zoomScale: 1,
          },
        ],
      ]);
    });

    it('stays silent for a scroller nobody listens to', () => {
      mount(SCROLL_VIEW, SCROLL_TAG, []);

      scroller().dispatchEvent(new Event('scroll'));

      expect(calls).toEqual([]);
    });

    it('stops after dispose', () => {
      mount(SCROLL_VIEW, SCROLL_TAG, ['onScroll']);
      const element = scroller();
      boot.dispose();

      element.dispatchEvent(new Event('scroll'));

      expect(calls).toEqual([]);
    });
  });

  describe('image', () => {
    function image(): HTMLElement {
      const element = elementOf();
      Object.defineProperties(element, {
        currentSrc: { value: 'a.png' },
        naturalWidth: { value: 30 },
        naturalHeight: { value: 20 },
      });
      return element;
    }

    it('sends the loaded source, then the end of loading', () => {
      const node = mount(IMAGE_VIEW, '', ['onLoad', 'onLoadEnd']);

      image().dispatchEvent(new Event('load'));

      expect(calls).toEqual([
        [node, 'topLoad', { source: { uri: 'a.png', width: 30, height: 20 } }],
        [node, 'topLoadEnd', {}],
      ]);
    });

    it('sends the error, then the end of loading', () => {
      const node = mount(IMAGE_VIEW, '', ['onError', 'onLoadEnd']);

      image().dispatchEvent(new Event('error'));

      expect(calls).toEqual([
        [node, 'topError', { error: 'Failed to load a.png' }],
        [node, 'topLoadEnd', {}],
      ]);
    });

    it('sends only what the app listens to', () => {
      const node = mount(IMAGE_VIEW, '', ['onError']);

      image().dispatchEvent(new Event('load'));
      image().dispatchEvent(new Event('error'));

      expect(calls).toEqual([
        [node, 'topError', { error: 'Failed to load a.png' }],
      ]);
    });
  });
});
