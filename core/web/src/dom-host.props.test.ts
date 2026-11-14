// @vitest-environment happy-dom
// Props written through the engine's own node API reach the document. Nothing here builds ops by
// hand: the batch is whatever the engine emits, so the test reads the path an adapter takes

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  routeProp,
  setTreeHost,
  TEXT_COMPONENT,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';
import { CLASS_NAMES } from './reset-sheet';

const ROOT_TAG = 9_001;
const VIEW = 'RCTView';

function installSlot(): void {
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
}

describe('DOM host props', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;

  function mount(root: ISymbioteNode): void {
    surface.appendChild(root);
    surface.commit();
  }

  // The surface root is the container's only child, the app root sits under it
  const appElement = (): Element | null =>
    container.firstElementChild?.firstElementChild ?? null;

  beforeEach(() => {
    container = document.createElement('div');
    const host = createDomHost({ document });
    host.registerRoot(ROOT_TAG, container);
    installSlot();
    setTreeHost(host);
    surface = createSurface(ROOT_TAG);
  });

  it('writes style as inline css and testID as an attribute', () => {
    const view = createElement(VIEW);
    routeProp(view, 'style', { width: 10, backgroundColor: 'red' });
    routeProp(view, 'testID', 'box');
    mount(view);

    const element = appElement();
    expect(element?.getAttribute('data-testid')).toBe('box');
    expect(element?.getAttribute('style')).toContain('width: 10px');
    expect(element?.getAttribute('style')).toContain('background-color: red');
  });

  it('starts every view from the reset class, even with no prop at all', () => {
    mount(createElement(VIEW));

    expect(appElement()?.className).toBe(CLASS_NAMES.view);
  });

  it('gives a text its text class and keeps the raw text inside', () => {
    const text = createElement(TEXT_COMPONENT, true);
    appendChild(text, createRawText('hello'));
    mount(text);

    expect(appElement()?.className).toBe(CLASS_NAMES.text);
    expect(appElement()?.textContent).toBe('hello');
  });

  it('writes a later change and clears a removed prop on the next commit', () => {
    const view = createElement(VIEW);
    routeProp(view, 'style', { width: 10, height: 5 });
    routeProp(view, 'testID', 'box');
    mount(view);

    routeProp(view, 'style', { width: 20 });
    routeProp(view, 'testID', undefined);
    surface.commit();

    const element = appElement();
    expect(element?.getAttribute('style')).toContain('width: 20px');
    expect(element?.getAttribute('style')).not.toContain('height');
    expect(element?.hasAttribute('data-testid')).toBe(false);
  });

  it('turns pointerEvents into a class', () => {
    const view = createElement(VIEW);
    routeProp(view, 'pointerEvents', 'box-none');
    mount(view);

    expect(appElement()?.classList.contains(CLASS_NAMES.pointerBoxNone)).toBe(
      true,
    );
  });
});
