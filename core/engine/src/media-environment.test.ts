// The `@media` snapshot is built from the runtime modules on the first conditional class

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetMediaEnvironment } from './media-environment';
import { createElement, routeProp } from './node';
import { getPublishedStyle } from './node-style';
import { Dimensions } from './react-native-host';
import { clearGlobalStyles, registerRules } from './style-registry';
import { resetMediaSubscriptions } from './style-registry/media-subscriptions';

function windowOf(width: number, height: number): void {
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });
}

function classStyleOf(node: ReturnType<typeof createElement>): unknown {
  return getPublishedStyle(node)[0];
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  registerRules(
    [
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 4 },
      },
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 1,
        style: { padding: 8 },
        cond: 0,
      },
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 2,
        style: { margin: 2 },
        cond: 1,
      },
    ],
    [
      ['>=', 'width', 600],
      ['=', 'orientation', 'landscape'],
    ],
  );
});

afterEach(() => {
  clearGlobalStyles();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

describe('the window drives width and orientation', () => {
  it('resolves the first conditional class against the current window', () => {
    windowOf(700, 800);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    expect(classStyleOf(node)).toEqual({ padding: 8 });
  });

  it('restyles a mounted node when the window is resized across a breakpoint', () => {
    windowOf(400, 800);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    expect(classStyleOf(node)).toEqual({ padding: 4 });

    windowOf(700, 800);
    expect(classStyleOf(node)).toEqual({ padding: 8 });
  });

  it('follows a rotation to landscape', () => {
    windowOf(400, 800);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');

    windowOf(800, 400);
    expect(classStyleOf(node)).toEqual({ padding: 8, margin: 2 });
  });
});
