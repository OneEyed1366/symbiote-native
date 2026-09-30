// Ground-truth check for named/scoped slots.

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 725;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('named and scoped slots', () => {
  it('renders a named slot and passes scope data through a scoped slot', async () => {
    const Card = defineComponent({
      setup(_props, { slots }) {
        return () => [
          slots.header ? slots.header() : undefined,
          slots.default?.({ label: 'scoped' }),
        ];
      },
    });
    const App = defineComponent({
      render(): VNode {
        return h(
          Card,
          {},
          {
            header: () => h('text', null, 'header'),
            default: (scope: { label: string }) => h('text', null, scope.label),
          },
        );
      },
    });
    mount(ROOT_TAG, App);
    await tick();
    expect(live.texts(live.appRoot())).toEqual(['header', 'scoped']);
  });
});
