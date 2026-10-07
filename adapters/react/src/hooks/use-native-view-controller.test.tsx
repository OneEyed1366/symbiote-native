import { createElement, createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { el } from '@symbiote-native/components';
import type { ICreateNativeViewController } from '@symbiote-native/components';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { useNativeViewController } from './use-native-view-controller';

const ROOT_TAG = 7101;
const fabric = installRecordingFabric();

type IHandle = { ping(): string };

const created = vi.fn();
const disposed = vi.fn();
const createController: ICreateNativeViewController<IHandle> = getNode => {
  created(getNode);
  return {
    dispose: disposed,
    handle: { ping: () => (getNode() ? 'mounted' : 'detached') },
    render: props =>
      Reflect.get(props, 'hidden') ? null : el('view', { testID: 'probe' }),
  };
};

function Subject(props: {
  hidden?: boolean;
  handle?: { current: IHandle | null };
}) {
  const [, rerender] = useState(0);
  Reflect.set(globalThis, '__rerender', rerender);
  return useNativeViewController(props.handle, createController, {
    hidden: props.hidden,
  });
}

afterEach(() => {
  unmount(ROOT_TAG);
  created.mockClear();
  disposed.mockClear();
  fabric.reset();
});

describe('useNativeViewController', () => {
  it('paints the descriptor the controller renders', () => {
    mount(ROOT_TAG, createElement(Subject));

    expect(fabric.find(node => node.props['testID'] === 'probe')).toBeDefined();
  });

  it('paints nothing when the controller renders null', () => {
    mount(ROOT_TAG, createElement(Subject, { hidden: true }));

    expect(
      fabric.find(node => node.props['testID'] === 'probe'),
    ).toBeUndefined();
  });

  it('gives the ref the handle, which sees the host node once painted', () => {
    const ref = createRef<IHandle>();

    mount(ROOT_TAG, createElement(Subject, { handle: ref }));

    expect(ref.current?.ping()).toBe('mounted');
  });

  it('disposes the controller once when the view unmounts', () => {
    mount(ROOT_TAG, createElement(Subject));
    expect(disposed).not.toHaveBeenCalled();

    unmount(ROOT_TAG);

    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('builds one controller for the whole life of the view', () => {
    mount(ROOT_TAG, createElement(Subject));
    const rerender: unknown = Reflect.get(globalThis, '__rerender');
    if (typeof rerender === 'function') rerender(1);

    expect(created).toHaveBeenCalledTimes(1);
  });
});
