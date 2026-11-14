// @vitest-environment happy-dom
// Escape is the back gesture of a page: the topmost modal that listens asks to be closed, as
// Android's back button does with `onRequestClose`

import {
  appendChild,
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

const MODAL = 'ModalHostView';

describe('modal in the page', () => {
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

  function mount(...modals: Record<string, unknown>[]): ISymbioteNode[] {
    const surface = createSurface(boot.rootTag);
    const app = createElement('RCTView');
    const nodes = modals.map(props => {
      const node = createElement(MODAL);
      for (const [name, value] of Object.entries(props)) {
        routeProp(node, name, value);
      }
      appendChild(app, node);
      return node;
    });
    surface.appendChild(app);
    surface.commit();
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    return nodes;
  }

  const escape = (): void => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  };

  const closes = (): unknown[] =>
    calls.filter(call => call[1] === 'topRequestClose').map(call => call[0]);

  it('asks a modal that listens to close', () => {
    const [modal] = mount({ onRequestClose: () => undefined });

    escape();

    expect(closes()).toEqual([modal]);
  });

  it('leaves a modal that does not listen alone', () => {
    mount({});

    escape();

    expect(closes()).toEqual([]);
  });

  it('asks only the topmost one when modals stack', () => {
    const [, top] = mount(
      { onRequestClose: () => undefined },
      { onRequestClose: () => undefined },
    );

    escape();

    expect(closes()).toEqual([top]);
  });

  it('ignores other keys', () => {
    mount({ onRequestClose: () => undefined });

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(closes()).toEqual([]);
  });
});
