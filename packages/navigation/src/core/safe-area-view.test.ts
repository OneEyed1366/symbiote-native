// The safe area view around the content of a screen, which iOS 26 lays out under the header

import { describe, expect, it } from 'vitest';
import type { IScreenOptions } from './navigator-props';
import { resolveScreenRenderPlan } from './render-stack';

function safeAreaOf(options: IScreenOptions, isIOS26OrHigher = true) {
  return resolveScreenRenderPlan({
    screenId: 'a',
    index: 0,
    routeCount: 1,
    options,
    platform: {
      defaultHeaderBackTitleVisible: true,
      headerBarButtonsAvailable: true,
      isIOS26OrHigher,
    },
    isAndroid: false,
    screenPassthrough: {},
  }).safeAreaHost;
}

const NO_EDGES = { top: false, right: false, bottom: false, left: false };

describe('safe area view of a screen', () => {
  it('is left out below iOS 26', () => {
    expect(safeAreaOf({}, false)).toBeUndefined();
  });

  it('insets the content from the top under an opaque visible header', () => {
    const host = safeAreaOf({});

    expect(host?.viewName).toBe('RNSSafeAreaView');
    expect(host?.props.edges).toEqual({ ...NO_EDGES, top: true });
    expect(host?.props.style).toEqual({ flex: 1 });
  });

  it('keeps the content under a translucent or a hidden header', () => {
    expect(safeAreaOf({ headerTranslucent: true })?.props.edges).toEqual(
      NO_EDGES,
    );
    expect(safeAreaOf({ headerShown: false })?.props.edges).toEqual(NO_EDGES);
  });

  it('lets safeAreaEdges override only the edges it sets', () => {
    const edges = safeAreaOf({
      safeAreaEdges: { top: false, bottom: true, left: undefined },
    })?.props.edges;

    expect(edges).toEqual({ ...NO_EDGES, bottom: true });
  });
});
