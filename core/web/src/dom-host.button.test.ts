// @vitest-environment happy-dom
// The label sits two nodes below the button, and its look follows the button's own props. A button
// that changes after the first commit must restyle the label, which the label itself never hears of

import {
  createElement,
  createSurface,
  registerHostBehavior,
  routeProp,
  setTreeHost,
  TEXT_COMPONENT,
  appendChild,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';

const ROOT_TAG = 9_201;
const BUTTON = 'button';
const LABEL = 'button-label-text';

registerHostBehavior(BUTTON, { attach() {}, detach() {} });
registerHostBehavior(LABEL, { attach() {}, detach() {} });

describe('DOM host button label', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;
  let button: ISymbioteNode;

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
    button = createElement('RCTView', false, BUTTON);
    const inner = createElement('RCTView');
    const label = createElement(TEXT_COMPONENT, true, LABEL);
    appendChild(inner, label);
    appendChild(button, inner);
    surface.appendChild(button);
  });

  // The label is the deepest node, so it comes last in document order
  const labelColor = (): string | undefined => {
    const label = [...container.querySelectorAll('*')].at(-1);
    return label instanceof HTMLElement ? label.style.color : undefined;
  };

  it('starts in the system blue', () => {
    surface.commit();

    expect(labelColor()).toBe('#007AFF');
  });

  it('takes the tint the button was given', () => {
    routeProp(button, 'color', 'tomato');
    surface.commit();

    expect(labelColor()).toBe('tomato');
  });

  it('turns grey when the button is disabled after the first commit', () => {
    surface.commit();
    routeProp(button, 'disabled', true);
    surface.commit();

    expect(labelColor()).toBe('#cdcdcd');
  });
});
