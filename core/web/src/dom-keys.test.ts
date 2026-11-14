// @vitest-environment happy-dom
// A div with the role of a button or a link is no native control, so the page gives it no click
// from the keyboard. The host answers Enter, and Space for a button, as a native control would

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

describe('keyboard activation', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let calls: unknown[][];
  let target: Element;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    boot = bootWebHost({ document, container });
    calls = [];
    const surface = createSurface(boot.rootTag);
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    const node = createElement('RCTView');
    routeProp(node, 'testID', 'target');
    routeProp(node, 'onClick', () => undefined);
    surface.appendChild(node);
    surface.commit();
    const found = container.querySelector('[data-testid="target"]');
    if (found === null) throw new Error('no target');
    target = found;
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
    container.remove();
  });

  function key(type: 'keydown' | 'keyup', name: string): KeyboardEvent {
    const event = new KeyboardEvent(type, {
      key: name,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  }

  const clicks = (): string[] => calls.map(call => String(call[1]));

  it('clicks a button on Enter, with no pointer marker', () => {
    target.setAttribute('role', 'button');

    key('keydown', 'Enter');

    expect(calls.map(call => [call[1], call[2]])).toEqual([['topClick', {}]]);
  });

  it('clicks a button on the release of Space, not on the press', () => {
    target.setAttribute('role', 'button');

    const press = key('keydown', ' ');
    expect(clicks()).toEqual([]);
    expect(press.defaultPrevented).toBe(true);
    key('keyup', ' ');

    expect(clicks()).toEqual(['topClick']);
  });

  it('clicks a switch on the release of Space but not on Enter', () => {
    target.setAttribute('role', 'switch');

    key('keydown', 'Enter');
    expect(clicks()).toEqual([]);
    key('keydown', ' ');
    key('keyup', ' ');

    expect(clicks()).toEqual(['topClick']);
  });

  it('clicks a link on Enter but not on Space', () => {
    target.setAttribute('role', 'link');

    key('keydown', ' ');
    key('keyup', ' ');
    expect(clicks()).toEqual([]);
    key('keydown', 'Enter');

    expect(clicks()).toEqual(['topClick']);
  });

  it('leaves an element without the role of a control alone', () => {
    key('keydown', 'Enter');
    key('keyup', ' ');

    expect(clicks()).toEqual([]);
  });
});
