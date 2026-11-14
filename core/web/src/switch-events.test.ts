// @vitest-environment happy-dom
// A tap on a Switch is the native toggle: the app hears the value it would move to
// It takes the value by writing `value` back

import {
  createElement,
  createSurface,
  disposeRoot,
  registerHostBehavior,
  routeProp,
  setNodeDispatch,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

const SWITCH = 'switch';

// The real behavior owns `change` through a dispatch on the node
registerHostBehavior(SWITCH, {
  attach(node) {
    setNodeDispatch(node, { names: new Set(['change']), deliver() {} });
  },
  detach(node) {
    setNodeDispatch(node, undefined);
  },
  ownedListeners: ['change'],
});

describe('switch in the page', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    boot = bootWebHost({ document, container });
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
    container.remove();
  });

  function mount(tag: string, props: Record<string, unknown>): HTMLElement {
    const surface = createSurface(boot.rootTag);
    const node = createElement('RCTView', false, tag);
    for (const [name, value] of Object.entries(props)) {
      routeProp(node, name, value);
    }
    surface.appendChild(node);
    surface.commit();
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    const element = container.firstElementChild?.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error('no element');
    return element;
  }

  // The payloads of the change events, apart from the click every element also sends
  const changes = (): unknown[] =>
    calls.filter(call => call[1] === 'topChange').map(call => call[2]);

  it('reports the opposite of its value as topChange when clicked', () => {
    mount(SWITCH, { value: false }).click();

    expect(changes()).toEqual([{ value: true }]);
  });

  it('reports off for a click on a switch that is on', () => {
    mount(SWITCH, { value: true }).click();

    expect(changes()).toEqual([{ value: false }]);
  });

  it('says nothing for a click on a disabled switch', () => {
    mount(SWITCH, { value: false, disabled: true }).click();

    expect(changes()).toEqual([]);
  });

  it('says nothing for a click on a view that is no switch', () => {
    mount('pressable', { value: false }).click();

    expect(changes()).toEqual([]);
  });
});
