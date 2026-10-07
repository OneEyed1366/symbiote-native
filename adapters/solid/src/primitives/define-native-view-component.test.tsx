// A Solid component over a package's native view controller: props in, handle to `ref`

import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '@symbiote-native/components';
import type { ICreateNativeViewController } from '@symbiote-native/components';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/solid';
import { defineNativeViewComponent } from './define-native-view-component';

const ROOT_TAG = 7301;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IHandle = { ping(): string };
type IProps = { hidden?: boolean; label?: string };

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
        : el('view', { testID: String(Reflect.get(props, 'label')) }),
  };
};

const Probe = defineNativeViewComponent<IHandle, IProps>(createController);

afterEach(() => {
  unmount(ROOT_TAG);
  created.mockClear();
  disposed.mockClear();
  fabric.reset();
});

function labelled(label: string) {
  return fabric.find(node => node.props['testID'] === label);
}

describe('defineNativeViewComponent', () => {
  it('paints what the controller renders for the props', async () => {
    mount(ROOT_TAG, () => <Probe label="solid-probe" />);
    await tick();

    expect(labelled('solid-probe')).toBeDefined();
  });

  it('paints nothing when the controller renders null', async () => {
    mount(ROOT_TAG, () => <Probe hidden label="solid-hidden" />);
    await tick();

    expect(labelled('solid-hidden')).toBeUndefined();
  });

  it('follows a reactive prop without recreating the node', async () => {
    const [label, setLabel] = createSignal('solid-before');
    mount(ROOT_TAG, () => <Probe label={label()} />);
    await tick();
    const before = labelled('solid-before')?.handle;

    setLabel('solid-after');
    await tick();

    expect(labelled('solid-after')?.handle).toBe(before);
  });

  it('hands the ref the handle, which sees the host node once painted', async () => {
    const received: { handle: IHandle | null } = { handle: null };
    mount(ROOT_TAG, () => (
      <Probe
        label="solid-ref"
        ref={(value: IHandle) => {
          received.handle = value;
        }}
      />
    ));
    await tick();

    expect(received.handle?.ping()).toBe('mounted');
  });

  it('disposes the controller once when the owner is disposed', async () => {
    mount(ROOT_TAG, () => <Probe label="solid-dispose" />);
    await tick();
    expect(disposed).not.toHaveBeenCalled();

    unmount(ROOT_TAG);

    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('builds one controller for the whole life of the component', async () => {
    mount(ROOT_TAG, () => <Probe label="solid-once" />);
    await tick();

    expect(created).toHaveBeenCalledTimes(1);
  });
});
