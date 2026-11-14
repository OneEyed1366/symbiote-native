// @vitest-environment happy-dom
// A page has no event for the start of an image load, so the host announces it when the element
// is given a source, after the commit that gave it

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

const IMAGE_VIEW = 'RCTImageView';
const NOOP = (): void => {};

describe('image load start', () => {
  let boot: IWebBoot;
  let surface: ReturnType<typeof createSurface>;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    boot = bootWebHost({ document, container: document.createElement('div') });
    surface = createSurface(boot.rootTag);
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
  });

  function mount(props: Record<string, unknown>): ISymbioteNode {
    const node = createElement(IMAGE_VIEW);
    for (const [name, value] of Object.entries(props))
      routeProp(node, name, value);
    surface.appendChild(node);
    surface.commit();
    // The engine registered its own dispatcher with the surface, the spy takes its place
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    return node;
  }

  const settled = (): Promise<void> => Promise.resolve();

  it('is sent once the first commit gave the image its source', async () => {
    const node = mount({ onLoadStart: NOOP, source: [{ uri: 'a.png' }] });
    await settled();

    expect(calls).toEqual([[node, 'topLoadStart', {}]]);
  });

  it('is sent again when the source changes', async () => {
    const node = mount({ onLoadStart: NOOP, source: [{ uri: 'a.png' }] });
    await settled();
    calls.length = 0;

    routeProp(node, 'source', [{ uri: 'b.png' }]);
    surface.commit();
    await settled();

    expect(calls).toEqual([[node, 'topLoadStart', {}]]);
  });

  it('is not sent when something else about the image changed', async () => {
    const node = mount({ onLoadStart: NOOP, source: [{ uri: 'a.png' }] });
    await settled();
    calls.length = 0;

    routeProp(node, 'resizeMode', 'contain');
    surface.commit();
    await settled();

    expect(calls).toEqual([]);
  });

  it('is not sent to an app that does not listen', async () => {
    mount({ source: [{ uri: 'a.png' }] });
    await settled();

    expect(calls).toEqual([]);
  });

  it('is not sent for an image with no source yet', async () => {
    mount({ onLoadStart: NOOP });
    await settled();

    expect(calls).toEqual([]);
  });
});
