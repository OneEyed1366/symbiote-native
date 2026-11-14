// @vitest-environment happy-dom
// DOM input becomes the Fabric events the engine already understands. The engine registers one
// handler and every event is addressed to the node the gesture started on, as on a device

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

type ICall = {
  target: unknown;
  type: string;
  nativeEvent: Record<string, unknown>;
};

function pointer(
  type: string,
  init: PointerEventInit & { pageX?: number; pageY?: number } = {},
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 5,
    clientY: 7,
    ...init,
  });
}

function elementByTestId(root: Element, testId: string): Element {
  const found = root.querySelector(`[data-testid="${testId}"]`);
  if (found === null) throw new Error(`no element with testID ${testId}`);
  return found;
}

describe('DOM events', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let calls: ICall[];
  let outer: ISymbioteNode;
  let inner: ISymbioteNode;
  let outerElement: Element;
  let innerElement: Element;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    boot = bootWebHost({ document, container });
    calls = [];
    const surface = createSurface(boot.rootTag);
    // After the surface, as the engine registers its own dispatcher with the first one
    globalThis.nativeFabricUIManager?.registerEventHandler(
      (target, type, nativeEvent) => calls.push({ target, type, nativeEvent }),
    );
    outer = createElement('RCTView');
    inner = createElement('RCTView');
    routeProp(outer, 'testID', 'outer');
    routeProp(inner, 'testID', 'inner');
    appendChild(outer, inner);
    surface.appendChild(outer);
    surface.commit();
    outerElement = elementByTestId(container, 'outer');
    innerElement = elementByTestId(container, 'inner');
  });

  // A surface the engine still lists is named by every later commit, in a host that never saw it
  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
  });

  describe('touch', () => {
    it('starts a touch on the node under the pointer, with the page position', () => {
      innerElement.dispatchEvent(pointer('pointerdown'));

      expect(calls).toHaveLength(1);
      expect(calls[0]?.target).toBe(inner);
      expect(calls[0]?.type).toBe('topTouchStart');
      expect(calls[0]?.nativeEvent.changedTouches).toEqual([
        expect.objectContaining({ identifier: 0, pageX: 5, pageY: 7 }),
      ]);
      expect(calls[0]?.nativeEvent.touches).toHaveLength(1);
    });

    it('sends the move and the end to the node the touch started on', () => {
      innerElement.dispatchEvent(pointer('pointerdown'));
      outerElement.dispatchEvent(pointer('pointermove', { clientX: 9 }));
      outerElement.dispatchEvent(pointer('pointerup', { clientX: 9 }));

      expect(calls.map(call => [call.type, call.target])).toEqual([
        ['topTouchStart', inner],
        ['topTouchMove', inner],
        ['topTouchEnd', inner],
      ]);
      expect(calls[2]?.nativeEvent.touches).toEqual([]);
    });

    it('ignores a pointer that moves with no button down', () => {
      innerElement.dispatchEvent(pointer('pointermove'));

      expect(calls).toEqual([]);
    });

    it('cancels the touch when the pointer is cancelled', () => {
      innerElement.dispatchEvent(pointer('pointerdown'));
      innerElement.dispatchEvent(pointer('pointercancel'));

      expect(calls.map(call => call.type)).toEqual([
        'topTouchStart',
        'topTouchCancel',
      ]);
    });

    it('numbers two pointers apart and lists both while both are down', () => {
      innerElement.dispatchEvent(pointer('pointerdown', { pointerId: 1 }));
      innerElement.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));

      const second = calls[1]?.nativeEvent;
      expect(second?.touches).toHaveLength(2);
      expect(second?.changedTouches).toEqual([
        expect.objectContaining({ identifier: 1 }),
      ]);
    });
  });

  describe('click', () => {
    it('sends topClick to the node, marked as a pointer click when it has a detail', () => {
      innerElement.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );

      expect(calls).toHaveLength(1);
      expect(calls[0]?.target).toBe(inner);
      expect(calls[0]?.type).toBe('topClick');
      expect(calls[0]?.nativeEvent.pointerType).toBe('mouse');
    });

    it('leaves the marker out of a click with no detail, which a keyboard or assistive tech sent', () => {
      innerElement.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 0 }),
      );

      expect(calls[0]?.nativeEvent).not.toHaveProperty('pointerType');
    });
  });

  describe('outside the tree', () => {
    it('forwards nothing for an event on an element no node owns', () => {
      const stray = document.createElement('div');
      container.appendChild(stray);
      stray.dispatchEvent(pointer('pointerdown'));

      expect(calls).toEqual([]);
    });

    it('stops forwarding after dispose', () => {
      boot.dispose();
      innerElement.dispatchEvent(pointer('pointerdown'));

      expect(calls).toEqual([]);
    });
  });
});
