// `onKeyDown` / `onKeyUp` и их `Capture`-двойники из base ViewConfig Android (RN 0.84, #54308)
// Нативная сторона шлёт их только за флагом `enableKeyEvents`, поэтому на iOS они инертны

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

const KEY_PAYLOAD = {
  key: 'a',
  code: 'KeyA',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

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

describe('key events of the base view', () => {
  it.each([
    ['KeyDown', 'topKeyDown'],
    ['KeyUp', 'topKeyUp'],
  ])('delivers on%s with the key payload to the target', (name, raw) => {
    const { leaf } = mount();
    const received: unknown[] = [];
    routeProp(leaf, `on${name}`, (event: { nativeEvent: unknown }) =>
      received.push(event.nativeEvent),
    );

    fabric.fireEvent(leaf, raw, KEY_PAYLOAD);

    expect(received).toEqual([KEY_PAYLOAD]);
  });

  it.each([
    ['KeyDown', 'topKeyDown'],
    ['KeyUp', 'topKeyUp'],
  ])('runs on%sCapture on the root before the target handler', (name, raw) => {
    const { root, leaf } = mount();
    const order: string[] = [];
    routeProp(root, `on${name}Capture`, () => order.push('root capture'));
    routeProp(leaf, `on${name}`, () => order.push('leaf'));

    fabric.fireEvent(leaf, raw, KEY_PAYLOAD);

    expect(order).toEqual(['root capture', 'leaf']);
  });

  it('bubbles a key event to an ancestor handler', () => {
    const { root, leaf } = mount();
    const order: string[] = [];
    routeProp(root, 'onKeyDown', () => order.push('root'));

    fabric.fireEvent(leaf, 'topKeyDown', KEY_PAYLOAD);

    expect(order).toEqual(['root']);
  });
});
