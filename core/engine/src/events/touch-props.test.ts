// `onTouchStart`, `onTouchMove`, `onTouchEnd` and `onTouchCancel` of RN's View, with their
// `Capture` twins: RN's base ViewConfig bubbles `topTouch*` through the tree on any view

import { beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '../index';
import { installEventHandler } from './index';

const fabric = installRecordingFabric();
installEventHandler();

const TOUCH = {
  identifier: 1,
  pageX: 10,
  pageY: 20,
  locationX: 10,
  locationY: 20,
};

function fire(node: ISymbioteNode, type: string, ended = false): void {
  fabric.fireEvent(node, type, {
    touches: ended ? [] : [TOUCH],
    changedTouches: [TOUCH],
    target: 1,
    pageX: TOUCH.pageX,
    pageY: TOUCH.pageY,
  });
}

function mount(): { root: ISymbioteNode; leaf: ISymbioteNode } {
  const surface = createSurface(9_993);
  const root = createElement('RCTView');
  const leaf = createElement('RCTView');
  appendChild(root, leaf);
  surface.appendChild(root);
  surface.commit();
  return { root, leaf };
}

beforeEach(() => fabric.reset());

describe('the touch props of a view', () => {
  it.each([
    ['onTouchStart', 'topTouchStart', false],
    ['onTouchMove', 'topTouchMove', false],
    ['onTouchEnd', 'topTouchEnd', true],
    ['onTouchCancel', 'topTouchCancel', true],
  ])('calls %s on an ancestor of the touched view', (prop, raw, ended) => {
    const { root, leaf } = mount();
    const seen: unknown[] = [];
    routeProp(root, prop, (event: { nativeEvent: unknown }) =>
      seen.push(event.nativeEvent),
    );
    // a move and an end follow a start, as a real gesture does
    fire(leaf, 'topTouchStart');
    seen.length = 0;
    fire(leaf, raw, ended);

    expect(seen).toHaveLength(1);
  });

  it('runs the capture handler from the root before the bubble handler of the target', () => {
    const { root, leaf } = mount();
    const order: string[] = [];
    routeProp(root, 'onTouchStartCapture', () => order.push('root capture'));
    routeProp(leaf, 'onTouchStartCapture', () => order.push('leaf capture'));
    routeProp(leaf, 'onTouchStart', () => order.push('leaf'));
    routeProp(root, 'onTouchStart', () => order.push('root'));

    fire(leaf, 'topTouchStart');

    expect(order).toEqual(['root capture', 'leaf capture', 'leaf', 'root']);
  });

  it('stops the bubble when a capture handler stops propagation', () => {
    const { root, leaf } = mount();
    const seen: string[] = [];
    routeProp(root, 'onTouchStartCapture', (event: ISymbioteEventLike) => {
      seen.push('capture');
      event.stopPropagation();
    });
    routeProp(leaf, 'onTouchStart', () => seen.push('leaf'));

    fire(leaf, 'topTouchStart');

    expect(seen).toEqual(['capture']);
  });
});

type ISymbioteEventLike = { stopPropagation: () => void };
