// The rest of RN's ScrollView ref surface (`ScrollView.js:856-1076`), on the node a tag hands out
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendChild,
  createElement,
  createSurface,
  Keyboard,
  Platform,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { installRecordingFabric } from '../../test-utils/src/index';
import {
  seedWindowDimensions,
  TEST_WINDOW,
} from '../../test-utils/src/window-dimensions';
import { registerScrollViewBehavior } from './behaviors/scroll-view';

registerScrollViewBehavior();
const fabric = installRecordingFabric();
let nextRootTag = 9_900;
const originalOs = Platform.OS;

function setOs(os: string): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function mountScrollNode(): ISymbioteNode {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = createElement('RCTScrollView', false, 'scroll-view');
  appendChild(root, node);
  surface.commit();
  return node;
}

function commandsOf(name: string): readonly unknown[][] {
  return fabric.commands
    .filter(entry => entry.commandName === name)
    .map(entry => [...entry.args]);
}

beforeEach(() => {
  vi.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  seedWindowDimensions();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setOs(originalOs);
  fabric.reset();
});

describe('the accessors RN hangs on a ScrollView ref', () => {
  it('hands back the scroller itself for the responder and native refs', () => {
    const node = mountScrollNode();

    expect(node.getScrollResponder()).toBe(node);
    expect(node.getNativeScrollRef()).toBe(node);
    expect(node.getScrollableNode()).toBe(node);
  });

  it('hands back the content node for the inner view', () => {
    const node = mountScrollNode();

    expect(node.getInnerViewRef()).toBe(node.childHost);
    expect(node.getInnerViewNode()).toBe(node.childHost);
  });
});

describe('scrollResponderZoomTo', () => {
  it('sends zoomToRect with the animated flag defaulting on', () => {
    setOs('ios');
    const node = mountScrollNode();
    node.scrollResponderZoomTo({ x: 1, y: 2, width: 30, height: 40 });

    expect(commandsOf('zoomToRect')).toEqual([
      [{ x: 1, y: 2, width: 30, height: 40 }, true],
    ]);
  });

  // `ScrollView.js:1007-1020`: only the second argument decides, `rect.animated` is dropped
  it('strips animated from the rect and reads the second argument', () => {
    setOs('ios');
    const node = mountScrollNode();
    node.scrollResponderZoomTo(
      { x: 0, y: 0, width: 5, height: 5, animated: false },
      false,
    );

    expect(commandsOf('zoomToRect')).toEqual([
      [{ x: 0, y: 0, width: 5, height: 5 }, false],
    ]);
  });

  it('throws off iOS, as upstream invariant does', () => {
    setOs('android');
    const node = mountScrollNode();

    expect(() =>
      node.scrollResponderZoomTo({ x: 0, y: 0, width: 1, height: 1 }),
    ).toThrow('zoomToRect is not implemented');
  });
});

describe('scrollResponderScrollNativeHandleToKeyboard', () => {
  const INPUT_TOP = 800;
  const INPUT_HEIGHT = 50;
  const EXTRA = 10;

  function targetMeasuring(top: number): ISymbioteNode {
    const target = createElement('RCTView');
    target.measureLayout = (_relative, onSuccess) =>
      onSuccess(0, top, 100, INPUT_HEIGHT);
    return target;
  }

  // The keyboard is unknown, so the scroll waits one macrotask and falls back to the window bottom
  it('scrolls the input above the window bottom once the metrics settle', () => {
    const node = mountScrollNode();
    node.scrollResponderScrollNativeHandleToKeyboard(
      targetMeasuring(INPUT_TOP),
      EXTRA,
    );

    expect(commandsOf('scrollTo')).toEqual([]);
    vi.advanceTimersByTime(0);
    const expectedY = INPUT_TOP - TEST_WINDOW.height + INPUT_HEIGHT + EXTRA;
    expect(commandsOf('scrollTo')).toEqual([[0, expectedY, true]]);
  });

  it('lets the offset go negative unless the caller prevents it', () => {
    const node = mountScrollNode();
    const top = 100;
    node.scrollResponderScrollNativeHandleToKeyboard(targetMeasuring(top));
    vi.advanceTimersByTime(0);
    node.scrollResponderScrollNativeHandleToKeyboard(
      targetMeasuring(top),
      0,
      true,
    );
    vi.advanceTimersByTime(0);

    expect(commandsOf('scrollTo')).toEqual([
      [0, top - TEST_WINDOW.height + INPUT_HEIGHT, true],
      [0, 0, true],
    ]);
  });
});
