// DescriptorHost: a descriptor root whose own children come first, then the component's content

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { el } from '@symbiote-native/components';
import type { IDescriptor } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { DescriptorHost } from './descriptor-host';

const ROOT_TAG = 905;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const node = signal<IDescriptor>(
  el('view', { testID: 'host' }, [el('image', { testID: 'own' })]),
);

@Component({
  selector: 'descriptor-host-fixture',
  standalone: true,
  imports: [DescriptorHost],
  template: `<symbiote-descriptor-host [node]="node()">
    <view testID="slot"></view>
  </symbiote-descriptor-host>`,
})
class HostFixture {
  readonly node = node;
}

beforeEach(() => {
  fabric.reset();
  node.set(el('view', { testID: 'host' }, [el('image', { testID: 'own' })]));
});
afterEach(() => unmount(ROOT_TAG));

function hostNode() {
  return live.findLive(live.appRoot(), n => n.payload.testID === 'host');
}

describe('DescriptorHost (Positive)', () => {
  it('renders the descriptor own child first and the projected content after it', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();

    expect(hostNode()?.children.map(child => child.payload.testID)).toEqual([
      'own',
      'slot',
    ]);
  });

  it('re-props the same host node when the descriptor changes', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();
    const before = hostNode()?.handle;

    node.set(
      el('view', { testID: 'host', opacity: 0.5 }, [
        el('image', { testID: 'own' }),
      ]),
    );
    await tick();

    expect(hostNode()?.payload.opacity).toBe(0.5);
    expect(hostNode()?.handle).toBe(before);
  });
});
