// @vitest-environment happy-dom
// The Svelte adapter swaps the page globals `Node` and `Element` for its own shim classes. Events
// of the real page must still reach the app, so none of the forwarding may test against a global

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

class ShimClass {}

describe('events while the page globals are replaced', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let types: string[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    boot = bootWebHost({ document, container });
    types = [];
    const surface = createSurface(boot.rootTag);
    globalThis.nativeFabricUIManager?.registerEventHandler((_target, type) =>
      types.push(type),
    );
    const field = createElement('RCTSinglelineTextInputView');
    routeProp(field, 'testID', 'field');
    routeProp(field, 'onChange', () => undefined);
    routeProp(field, 'onClick', () => undefined);
    surface.appendChild(field);
    surface.commit();
    vi.stubGlobal('Node', ShimClass);
    vi.stubGlobal('Element', ShimClass);
    vi.stubGlobal('HTMLElement', ShimClass);
    vi.stubGlobal('HTMLImageElement', ShimClass);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    boot.dispose();
    disposeRoot(boot.rootTag);
  });

  it('delivers a click', () => {
    const target = container.querySelector('[data-testid="field"]');

    target?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    );

    expect(types).toContain('topClick');
  });

  it('delivers the input of a text field', () => {
    const target = container.querySelector('[data-testid="field"]');

    target?.dispatchEvent(new Event('input', { bubbles: true }));

    expect(types).toContain('topChange');
  });
});
