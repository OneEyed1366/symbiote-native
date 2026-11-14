// @vitest-environment happy-dom
// The underlay is a bit the JS hold timer flips, not a prop. It must reach the box and its child
// the way the engine reports it, also long after the first commit

import {
  appendChild,
  createElement,
  createSurface,
  registerHostBehavior,
  routeProp,
  setNodeUnderlayShown,
  setTreeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';

const ROOT_TAG = 9_401;
const HIGHLIGHT = 'touchable-highlight';

registerHostBehavior(HIGHLIGHT, {
  attach() {},
  detach() {},
  ownedListeners: ['press'],
});

describe('DOM host touchable highlight', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;
  let highlight: ISymbioteNode;

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
    highlight = createElement('RCTView', false, HIGHLIGHT);
    appendChild(highlight, createElement('RCTView'));
    routeProp(highlight, 'onPress', () => undefined);
    surface.appendChild(highlight);
    surface.commit();
  });

  const box = (): HTMLElement | undefined => {
    const found = container.firstElementChild?.firstElementChild;
    return found instanceof HTMLElement ? found : undefined;
  };
  const child = (): HTMLElement | undefined => {
    const found = box()?.firstElementChild;
    return found instanceof HTMLElement ? found : undefined;
  };

  it('shows nothing before the press', () => {
    expect(box()?.style.backgroundColor).toBe('');
    expect(child()?.style.opacity).toBe('');
  });

  it('tints the box and dims the child while pressed', () => {
    setNodeUnderlayShown(highlight, true);
    surface.commit();

    expect(box()?.style.backgroundColor).toBe('black');
    expect(child()?.style.opacity).toBe('0.85');
  });

  it('follows the app activeOpacity and underlayColor', () => {
    routeProp(highlight, 'underlayColor', 'gold');
    routeProp(highlight, 'activeOpacity', 0.5);
    setNodeUnderlayShown(highlight, true);
    surface.commit();

    expect(box()?.style.backgroundColor).toBe('gold');
    expect(child()?.style.opacity).toBe('0.5');
  });

  it('clears both once the underlay is hidden', () => {
    setNodeUnderlayShown(highlight, true);
    surface.commit();
    setNodeUnderlayShown(highlight, false);
    surface.commit();

    expect(box()?.style.backgroundColor).toBe('');
    expect(child()?.style.opacity).toBe('');
  });
});
