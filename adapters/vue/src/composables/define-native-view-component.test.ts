// A Vue component over a package's native view controller: attrs in, handle exposed

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '@symbiote-native/components';
import type { ICreateNativeViewController } from '@symbiote-native/components';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/vue';
import { defineNativeViewComponent } from './define-native-view-component';

const ROOT_TAG = 7201;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IHandle = { ping(): string };

const created = vi.fn();
const disposed = vi.fn();
const createController: ICreateNativeViewController<IHandle> = getNode => {
  created();
  return {
    dispose: disposed,
    handle: { ping: () => (getNode() ? 'mounted' : 'detached') },
    render: props =>
      Reflect.get(props, 'hidden')
        ? null
        : el('view', { testID: String(Reflect.get(props, 'testID')) }),
  };
};

const Probe = defineNativeViewComponent('Probe', createController);

let handle: IHandle | null = null;

function isHandle(value: unknown): value is IHandle {
  return typeof Reflect.get(Object(value), 'ping') === 'function';
}

async function mountProbe(attrs: Record<string, unknown>): Promise<void> {
  const Host = defineComponent(
    () => (): VNode =>
      h(Probe, {
        ...attrs,
        ref: (instance: unknown) => {
          handle = isHandle(instance) ? instance : null;
        },
      }),
  );
  mount(ROOT_TAG, { render: (): VNode => h(Host) });
  await tick();
}

afterEach(() => {
  unmount(ROOT_TAG);
  created.mockClear();
  disposed.mockClear();
  fabric.reset();
  handle = null;
});

describe('defineNativeViewComponent', () => {
  it('paints what the controller renders for the attrs', async () => {
    await mountProbe({ testID: 'vue-probe' });

    expect(
      fabric.find(node => node.props['testID'] === 'vue-probe'),
    ).toBeDefined();
  });

  it('paints nothing when the controller renders null', async () => {
    await mountProbe({ hidden: true, testID: 'vue-hidden' });

    expect(
      fabric.find(node => node.props['testID'] === 'vue-hidden'),
    ).toBeUndefined();
  });

  it('exposes the handle, which sees the host node once painted', async () => {
    await mountProbe({ testID: 'vue-handle' });

    expect(handle?.ping()).toBe('mounted');
  });

  it('disposes the controller once when the component unmounts', async () => {
    await mountProbe({ testID: 'vue-dispose' });
    expect(disposed).not.toHaveBeenCalled();

    unmount(ROOT_TAG);

    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('builds one controller for the whole life of the component', async () => {
    await mountProbe({ testID: 'vue-once' });

    expect(created).toHaveBeenCalledTimes(1);
  });
});
