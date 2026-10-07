// `defineDescriptorComponent` turns a render function into a component that takes children

import { createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { defineDescriptorComponent } from './define-descriptor-component';
import { descriptorToSolid } from './descriptor-to-solid';
import { mount, unmount } from './render';

const ROOT_TAG = 812;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type ICardProps = { testID?: string; opacity?: number; children?: JSX.Element };

const Card = defineDescriptorComponent<ICardProps>(props => el('view', props));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function cardNode() {
  return live.findLive(live.appRoot(), node => node.payload.testID === 'card');
}

describe('defineDescriptorComponent (Positive)', () => {
  it('paints the render function result and holds the children inside it', async () => {
    mount(ROOT_TAG, () =>
      Card({
        testID: 'card',
        children: descriptorToSolid(() => el('view', { testID: 'kid' })),
      }),
    );
    await tick();

    expect(cardNode()?.children.map(child => child.payload.testID)).toEqual([
      'kid',
    ]);
  });

  it('keeps children out of the props the render function sees', async () => {
    const seen: string[][] = [];
    const Probe = defineDescriptorComponent<ICardProps>(props => {
      seen.push(Object.keys(props));
      return el('view', { testID: 'card' });
    });

    mount(ROOT_TAG, () =>
      Probe({
        testID: 'card',
        children: descriptorToSolid(() => el('view')),
      }),
    );
    await tick();

    expect(seen.flat()).not.toContain('children');
  });

  it('re-props the same node when a prop signal changes', async () => {
    const [opacity, setOpacity] = createSignal(0.5);
    mount(ROOT_TAG, () =>
      Card({
        testID: 'card',
        get opacity() {
          return opacity();
        },
      }),
    );
    await tick();
    const before = cardNode()?.handle;

    setOpacity(0.25);
    await tick();

    expect(cardNode()?.payload.opacity).toBe(0.25);
    expect(cardNode()?.handle).toBe(before);
  });
});
