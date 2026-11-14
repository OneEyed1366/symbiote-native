// @vitest-environment happy-dom
// Booting is what an adapter's web entry does before it mounts, and mounting goes through the
// engine's own surface API as every adapter does

import {
  appendChild,
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost } from './boot';

describe('booting the web host', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  // A surface outlives its test and the next host would be told about its nodes
  afterEach(() => {
    for (let tag = 1; tag < 50; tag += 1) disposeRoot(tag);
  });

  it('renders what an adapter mounts on the returned root tag into the container', () => {
    const { rootTag } = bootWebHost({ document, container });

    const surface = createSurface(rootTag);
    const root = createElement('RCTView');
    routeProp(root, 'testID', 'app');
    appendChild(root, createElement('RCTView'));
    surface.appendChild(root);
    surface.commit();

    expect(container.querySelector('[data-testid="app"]')).not.toBeNull();
    expect(container.querySelectorAll('div').length).toBeGreaterThan(2);
  });

  it('gives each boot its own root tag so two containers do not share a surface', () => {
    const first = bootWebHost({ document, container });
    const second = bootWebHost({
      document,
      container: document.createElement('div'),
    });

    expect(second.rootTag).not.toBe(first.rootTag);
  });

  it('does not hand the next host a write that was meant for the one it replaces', () => {
    const first = bootWebHost({ document, container });
    const staleSurface = createSurface(first.rootTag);
    const stale = createElement('RCTView');
    staleSurface.appendChild(stale);
    staleSurface.commit();
    disposeRoot(first.rootTag);
    routeProp(stale, 'testID', 'late');

    const second = bootWebHost({
      document,
      container: document.createElement('div'),
    });
    const surface = createSurface(second.rootTag);
    surface.appendChild(createElement('RCTView'));

    expect(() => surface.commit()).not.toThrow();
  });

  it('installs the Fabric global the engine binds on its first surface', () => {
    bootWebHost({ document, container });

    expect(typeof globalThis.nativeFabricUIManager?.registerEventHandler).toBe(
      'function',
    );
  });

  it('delivers a resize of an element that listens for layout as topLayout', () => {
    let resized: (entries: { target: Element }[]) => void = () => {};
    class Observer {
      constructor(callback: typeof resized) {
        resized = callback;
      }
      observe(): void {}
      unobserve(): void {}
    }
    const { rootTag, fabric } = bootWebHost({
      document,
      container,
      observer: Observer,
    });
    const surface = createSurface(rootTag);
    const view = createElement('RCTView');
    routeProp(view, 'onLayout', () => {});
    surface.appendChild(view);
    surface.commit();
    const calls: unknown[][] = [];
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    document.body.appendChild(container);
    const element = container.firstElementChild?.firstElementChild;

    resized(
      element === undefined || element === null ? [] : [{ target: element }],
    );

    expect(calls).toEqual([
      [view, 'topLayout', { layout: { x: 0, y: 0, width: 0, height: 0 } }],
    ]);
    expect(fabric.eventHandler()).toBeDefined();
    container.remove();
  });

  it('keeps the handler the engine registers, for the event layer to call', () => {
    const { fabric } = bootWebHost({ document, container });
    const handler = (): void => {};

    globalThis.nativeFabricUIManager?.registerEventHandler(handler);

    expect(fabric.eventHandler()).toBe(handler);
  });
});
