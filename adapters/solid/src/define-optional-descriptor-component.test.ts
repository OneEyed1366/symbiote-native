// `defineOptionalDescriptorComponent` makes a component of a render function that may answer `null`

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { defineOptionalDescriptorComponent } from './define-optional-descriptor-component';
import { mount, unmount } from './render';

const ROOT_TAG = 813;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IBadgeProps = { testID?: string; count?: number; hidden?: boolean };

function renderBadge(props: object): IDescriptor | null {
  if (Reflect.get(props, 'hidden') === true) return null;
  return el('view', Object.fromEntries(Object.entries(props)));
}

const Badge = defineOptionalDescriptorComponent<IBadgeProps>(renderBadge);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function badgeNode() {
  return live.findLive(live.appRoot(), node => node.payload.testID === 'badge');
}

describe('defineOptionalDescriptorComponent (Positive)', () => {
  it('paints the render function result', async () => {
    mount(ROOT_TAG, () => Badge({ testID: 'badge', count: 1 }));
    await tick();

    expect(badgeNode()?.payload.count).toBe(1);
  });

  it('follows a reactive prop without recreating the node', async () => {
    const [count, setCount] = createSignal(1);
    // Getter props, as JSX compiles them: a plain `count: count()` would be read once
    mount(ROOT_TAG, () =>
      Badge({
        testID: 'badge',
        get count() {
          return count();
        },
      }),
    );
    await tick();

    setCount(2);
    await tick();

    expect(badgeNode()?.payload.count).toBe(2);
    expect(fabric.findAll(node => node.props.testID === 'badge')).toHaveLength(
      1,
    );
  });
});

describe('defineOptionalDescriptorComponent (Negative)', () => {
  it('renders nothing when the render function answers null at mount', async () => {
    mount(ROOT_TAG, () => Badge({ testID: 'badge', hidden: true }));
    await tick();

    expect(fabric.find(node => node.props.testID === 'badge')).toBeUndefined();
  });
});
