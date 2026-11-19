// A node that left the tree stops following the window, and follows it again once it returns

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import {
  appendChild,
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  type ISymbioteNode,
} from '../index';
import { resetMediaEnvironment } from '../media-environment';
import { getPublishedStyle } from '../node-style';
import { Dimensions } from '../react-native-host';
import { clearGlobalStyles, registerRules } from '../style-registry';
import { resetMediaSubscriptions } from '../style-registry/media-subscriptions';

installRecordingFabric();
let lastRootTag = 8_300;

function newRootTag(): number {
  lastRootTag += 1;
  return lastRootTag;
}

function windowAt(width: number): void {
  Dimensions.set({ window: { width, height: 800, scale: 2, fontScale: 1 } });
}

function classStyleOf(node: ISymbioteNode): unknown {
  return getPublishedStyle(node)[0];
}

function cardNode(): ISymbioteNode {
  const node = createElement('RCTView');
  routeProp(node, 'class', 'card');
  return node;
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  windowAt(400);
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
});

afterEach(() => {
  clearGlobalStyles();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

describe('a removed node and the window size', () => {
  it('is not restyled while it is out of the tree, and catches up when put back', () => {
    const surface = createSurface(newRootTag());
    const holder = createElement('RCTView');
    const card = cardNode();
    appendChild(holder, card);
    surface.appendChild(holder);
    surface.commit();

    surface.removeChild(holder);
    surface.commit();
    windowAt(700);
    expect(classStyleOf(card)).toEqual({ padding: 4 });

    surface.appendChild(holder);
    expect(classStyleOf(card)).toEqual({ padding: 8 });
    windowAt(400);
    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });

  it('stays out of the restyle walk after its surface is disposed', () => {
    const rootTag = newRootTag();
    const surface = createSurface(rootTag);
    const card = cardNode();
    surface.appendChild(card);
    surface.commit();

    surface.teardown();
    disposeRoot(rootTag);
    windowAt(700);
    expect(classStyleOf(card)).toEqual({ padding: 4 });
  });
});
