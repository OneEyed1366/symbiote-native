// A node with an `@media` class survives the narrowed teardown walk of the real C++ engine
// Without `OP_SET_RELEASE_MARK` the plain holder and its card are never visited, so the card keeps
// following the window while it is out of the tree

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { IMediaEnvironment } from '../../../src/style-registry/media-evaluate';
import {
  applyMediaEnvironment,
  resetMediaSubscriptions,
} from '../../../src/style-registry/media-subscriptions';
import { getPublishedStyle } from '../../../src/node-style';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function environmentAt(width: number): IMediaEnvironment {
  return {
    width,
    height: 800,
    resolution: 2,
    orientation: 'portrait',
    'prefers-color-scheme': 'light',
    'prefers-reduced-motion': 'no-preference',
    'prefers-contrast': 'no-preference',
    'prefers-reduced-transparency': 'no-preference',
    platform: 'ios',
    dir: 'ltr',
  };
}

function classStyleOf(node: ISymbioteNode): unknown {
  return getPublishedStyle(node)[0];
}

describe('a removed node and the window size, in the real engine', () => {
  it('is not restyled while it is out of the tree, and catches up when put back', () => {
    clearGlobalStyles();
    resetMediaSubscriptions();
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
      ],
      [['>=', 'width', 600]],
    );
    applyMediaEnvironment(environmentAt(400));

    const surface = createSurface(ROOT_TAG);
    const holder = createElement('RCTView');
    const card = createElement('RCTView');
    routeProp(card, 'class', 'card');
    appendChild(holder, card);
    surface.appendChild(holder);
    surface.commit();
    mounted();

    surface.removeChild(holder);
    surface.commit();
    mounted();
    applyMediaEnvironment(environmentAt(700));
    expect(classStyleOf(card)).toEqual({ padding: 4 });

    surface.appendChild(holder);
    expect(classStyleOf(card)).toEqual({ padding: 8 });
    applyMediaEnvironment(environmentAt(400));
    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });
});

report();
