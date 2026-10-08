// RN types `backdropColor` as `ColorValue`, so a `PlatformColor` tints the backdrop too

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal, mount, unmount } from '@symbiote-native/vue';
import {
  childrenOf,
  PlatformColor,
  type IColorValue,
} from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

const ROOT_TAG = 422;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function backdropPayload(
  backdropColor: IColorValue,
): Promise<Record<string, unknown>> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(Modal, { visible: true, backdropColor }, () => h('view')),
    }),
  );
  await tick();
  const host = fabric.find(node => node.viewName === 'ModalHostView');
  const container = host === undefined ? undefined : childrenOf(host.handle)[0];
  if (container === undefined)
    throw new Error('the modal committed no container');
  return payloadOf(container);
}

describe('Vue Modal backdropColor', () => {
  it('passes a PlatformColor to the container background', async () => {
    const color = PlatformColor('systemBackground');

    const payload = await backdropPayload(color);

    expect(payload.backgroundColor).toEqual(color);
  });
});
