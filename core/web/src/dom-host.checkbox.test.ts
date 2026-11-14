// @vitest-environment happy-dom
// The check mark sits below the checkbox and shows while its owner is checked. A value written
// after the first commit must reach the mark, which never hears of it itself

import {
  appendChild,
  createElement,
  createSurface,
  registerHostBehavior,
  routeProp,
  setTreeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';

const ROOT_TAG = 9_301;
const CHECKBOX = 'checkbox';
const MARK = 'checkbox-mark';

registerHostBehavior(CHECKBOX, { attach() {}, detach() {} });
registerHostBehavior(MARK, { attach() {}, detach() {} });

describe('DOM host checkbox', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;
  let checkbox: ISymbioteNode;

  beforeEach(() => {
    container = document.createElement('div');
    const host = createDomHost({ document });
    host.registerRoot(ROOT_TAG, container);
    Object.assign(globalThis, {
      nativeFabricUIManager: {
        registerEventHandler(): void {},
        dispatchCommand(): void {},
        setIsJSResponder(): void {},
        sendAccessibilityEvent(): void {},
        configureNextLayoutAnimation(): void {},
        measure(): void {},
        measureInWindow(): void {},
        measureLayout(): void {},
      },
    });
    setTreeHost(host);
    surface = createSurface(ROOT_TAG);
    checkbox = createElement('RCTView', false, CHECKBOX);
    appendChild(checkbox, createElement('RCTView', false, MARK));
    surface.appendChild(checkbox);
  });

  // The mark is the deepest node, so it comes last in document order
  const mark = (): HTMLElement | undefined => {
    const last = [...container.querySelectorAll('*')].at(-1);
    return last instanceof HTMLElement ? last : undefined;
  };

  it('hides the mark of an unchecked box', () => {
    surface.commit();

    expect(mark()?.style.display).toBe('none');
  });

  it('shows the mark of a box checked from the start', () => {
    routeProp(checkbox, 'value', true);
    surface.commit();

    expect(mark()?.style.display).toBe('');
  });

  it('shows the mark once the box is checked after the first commit', () => {
    surface.commit();
    routeProp(checkbox, 'value', true);
    surface.commit();

    expect(mark()?.style.display).toBe('');
  });
});
