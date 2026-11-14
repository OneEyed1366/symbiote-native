// @vitest-environment happy-dom
// A ScrollView starts where `contentOffset` says and is left alone by a later change of the prop,
// as the user may have scrolled since

import {
  createElement,
  createSurface,
  registerHostBehavior,
  routeProp,
  setTreeHost,
} from '@symbiote-native/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';

const ROOT_TAG = 9_401;
const SCROLL_VIEW = 'scroll-view';

registerHostBehavior(SCROLL_VIEW, { attach() {}, detach() {} });

describe('DOM host scroll offset', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;

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
  });

  function mount(props: Record<string, unknown>) {
    const view = createElement('RCTScrollView', false, SCROLL_VIEW);
    for (const [name, value] of Object.entries(props)) {
      routeProp(view, name, value);
    }
    surface.appendChild(view);
    surface.commit();
    return view;
  }

  const scroller = (): HTMLElement => {
    const element = container.firstElementChild?.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error('no scroller');
    return element;
  };

  it('starts scrolled to the offset of the app', () => {
    mount({ contentOffset: { x: 5, y: 40 } });

    expect([scroller().scrollLeft, scroller().scrollTop]).toEqual([5, 40]);
  });

  it('keeps the place of the user when the prop changes later', () => {
    const view = mount({ contentOffset: { x: 0, y: 40 } });
    scroller().scrollTop = 90;

    routeProp(view, 'contentOffset', { x: 0, y: 10 });
    surface.commit();

    expect(scroller().scrollTop).toBe(90);
  });
});
