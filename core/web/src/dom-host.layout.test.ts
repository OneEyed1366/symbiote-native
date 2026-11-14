// @vitest-environment happy-dom
// Узел с `onLayout` наблюдается за размером, остальные нет

import {
  appendChild,
  createElement,
  removeChild,
  createSurface,
  disposeRoot,
  routeProp,
  setTreeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDomHost } from './dom-host';
import type { ILayout } from './layout-watcher';

const ROOT_TAG = 9_101;
const VIEW = 'RCTView';

class FakeObserver {
  static instances: FakeObserver[] = [];
  observed = new Set<Element>();

  constructor(readonly callback: (entries: { target: Element }[]) => void) {
    FakeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }
}

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

describe('DOM host layout', () => {
  let container: HTMLElement;
  let surface: ReturnType<typeof createSurface>;
  let reported: { handle: object; layout: ILayout }[];

  function mount(root: ISymbioteNode): void {
    surface.appendChild(root);
    surface.commit();
  }

  const observed = (): Element[] => [
    ...(FakeObserver.instances[0]?.observed ?? []),
  ];

  beforeEach(() => {
    FakeObserver.instances = [];
    reported = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    const host = createDomHost({
      document,
      observer: FakeObserver,
      onLayout: (handle, layout) => reported.push({ handle, layout }),
    });
    host.registerRoot(ROOT_TAG, container);
    installSlot();
    setTreeHost(host);
    surface = createSurface(ROOT_TAG);
  });

  afterEach(() => {
    container.remove();
    disposeRoot(ROOT_TAG);
  });

  it('watches the element of a node that listens for layout', () => {
    const view = createElement(VIEW);
    routeProp(view, 'onLayout', () => {});
    mount(view);

    expect(observed()).toEqual([
      container.firstElementChild?.firstElementChild,
    ]);
  });

  it('leaves a node without a layout listener unwatched', () => {
    mount(createElement(VIEW));

    expect(observed()).toEqual([]);
  });

  it('lets go of a removed node and keeps a moved one', () => {
    const parent = createElement(VIEW);
    const removed = createElement(VIEW);
    const moved = createElement(VIEW);
    routeProp(removed, 'onLayout', () => {});
    routeProp(moved, 'onLayout', () => {});
    appendChild(parent, removed);
    appendChild(parent, moved);
    mount(parent);

    removeChild(parent, removed);
    removeChild(parent, moved);
    appendChild(parent, moved);
    surface.commit();

    expect(observed()).toHaveLength(1);
  });

  it('stops watching once the listener is removed', () => {
    const view = createElement(VIEW);
    routeProp(view, 'onLayout', () => {});
    mount(view);

    routeProp(view, 'onLayout', undefined);
    surface.commit();

    expect(observed()).toEqual([]);
  });
});
