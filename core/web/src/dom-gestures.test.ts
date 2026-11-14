// @vitest-environment happy-dom
// While the app owns a gesture and asked the native side to stay out, the page must not pan. Only
// a cancelled `touchmove` stops a pan, so the host cancels it for as long as the claim stands

import {
  createElement,
  createSurface,
  disposeRoot,
  treeHost,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

describe('gesture claim', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let handle: object;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    boot = bootWebHost({ document, container });
    const surface = createSurface(boot.rootTag);
    const node = createElement('RCTView');
    surface.appendChild(node);
    surface.commit();
    handle = node;
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
    container.remove();
  });

  function move(): TouchEvent {
    const event = new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
    });
    container.firstElementChild?.dispatchEvent(event);
    return event;
  }

  function claim({
    isResponder,
    blockNative,
  }: {
    isResponder: boolean;
    blockNative: boolean;
  }): void {
    treeHost()?.setIsJSResponder(handle, isResponder, blockNative);
  }

  it('lets the page pan when nobody claimed the gesture', () => {
    expect(move().defaultPrevented).toBe(false);
  });

  it('cancels the pan while the app claims the gesture and blocks native', () => {
    claim({ isResponder: true, blockNative: true });

    expect(move().defaultPrevented).toBe(true);
  });

  it('lets the page pan again once the claim is released', () => {
    claim({ isResponder: true, blockNative: true });
    claim({ isResponder: false, blockNative: false });

    expect(move().defaultPrevented).toBe(false);
  });

  it('leaves the pan alone when the claim does not block native', () => {
    claim({ isResponder: true, blockNative: false });

    expect(move().defaultPrevented).toBe(false);
  });
});
