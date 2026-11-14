// @vitest-environment happy-dom
// A press callback wired through the engine reaches the element as focus and role, also when it is
// wired after the first commit. The batch is whatever the engine emits for a registered behavior

import {
  createElement,
  createSurface,
  registerHostBehavior,
  routeProp,
  setTreeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';

const ROOT_TAG = 9_101;
const TOUCHABLE = 'touchable-opacity';

registerHostBehavior(TOUCHABLE, {
  attach() {},
  detach() {},
  ownedListeners: ['press'],
});

describe('DOM host pressable', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;
  let touchable: ISymbioteNode;

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
    touchable = createElement('RCTView', false, TOUCHABLE);
    surface.appendChild(touchable);
  });

  const element = (): Element | null =>
    container.firstElementChild?.firstElementChild ?? null;

  it('keeps a touchable out of the focus order until a press is wired', () => {
    surface.commit();

    expect(element()?.getAttribute('tabindex')).toBe('-1');
    expect(element()?.getAttribute('role')).toBe('button');
  });

  it('puts the touchable in the focus order once the app wires a press', () => {
    routeProp(touchable, 'onPress', () => undefined);
    surface.commit();

    expect(element()?.getAttribute('tabindex')).toBe('0');
  });

  it('follows a press wired after the first commit', () => {
    surface.commit();
    routeProp(touchable, 'onPress', () => undefined);
    surface.commit();

    expect(element()?.getAttribute('tabindex')).toBe('0');
  });
});
