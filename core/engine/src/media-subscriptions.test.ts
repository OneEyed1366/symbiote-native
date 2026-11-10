// A node styled by a class with an `@media` rule restyles when its condition flips, and only then

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Dimensions } from './dimensions';
import { resetMediaEnvironment } from './media-environment';
import {
  releaseMediaNode,
  resetMediaSubscriptions,
  restoreMediaNode,
} from './style-registry/media-subscriptions';
import { resetMutationBuffer } from './mutation-buffer';
import { createElement, routeProp } from './node';
import { getPublishedStyle } from './node-style';
import { clearGlobalStyles, registerRules } from './style-registry';

function windowAt(width: number): void {
  Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
}

function classStyleOf(node: ReturnType<typeof createElement>): unknown {
  return getPublishedStyle(node)[0];
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  resetMutationBuffer();
  windowAt(400);
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 4 } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: 8 }, cond: 0 },
    ],
    [['>=', 'width', 600]],
  );
});

afterEach(() => {
  clearGlobalStyles();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

describe('a node restyles when its media condition flips', () => {
  it('applies the conditional rule once the window is wide enough', () => {
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    expect(classStyleOf(node)).toEqual({ padding: 4 });

    windowAt(700);
    expect(classStyleOf(node)).toEqual({ padding: 8 });

    windowAt(500);
    expect(classStyleOf(node)).toEqual({ padding: 4 });
  });

  it('keeps the standing style object when a resize crosses no breakpoint', () => {
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    windowAt(700);
    const standing = classStyleOf(node);

    windowAt(800);
    expect(classStyleOf(node)).toBe(standing);
  });

  it('styles a node that gets its class after the window is known', () => {
    windowAt(700);
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');
    expect(classStyleOf(node)).toEqual({ padding: 8 });
  });

  it('leaves a node alone while it is released and restyles it on return', () => {
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');

    releaseMediaNode(node);
    windowAt(700);
    expect(classStyleOf(node)).toEqual({ padding: 4 });

    restoreMediaNode(node);
    expect(classStyleOf(node)).toEqual({ padding: 8 });
    windowAt(400);
    expect(classStyleOf(node)).toEqual({ padding: 4 });
  });

  it('drops the subscription when the class changes to one without conditions', () => {
    const node = createElement('RCTView');
    routeProp(node, 'class', 'card');

    routeProp(node, 'class', 'other');
    windowAt(700);
    expect(classStyleOf(node)).toEqual({});
  });
});
