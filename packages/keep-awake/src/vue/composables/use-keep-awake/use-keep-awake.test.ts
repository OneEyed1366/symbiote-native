// Co-located Vue-driven test (ADR 0025) for useKeepAwake. See battery's
// use-low-power-mode.test.ts for the shared rationale.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useKeepAwake } from './index';

const ROOT_TAG = 9954;

const activateKeepAwakeAsyncMock = vi.fn(async (_tag: string) => undefined);
const addListenerMock = vi.fn();
const deactivateKeepAwakeMock = vi.fn(async (_tag: string) => undefined);

vi.mock('../../../core', () => ({
  activateKeepAwakeAsync: (tag: string) => activateKeepAwakeAsyncMock(tag),
  addListener: (...args: unknown[]) => addListenerMock(...args),
  deactivateKeepAwake: (tag: string) => deactivateKeepAwakeMock(tag),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  activateKeepAwakeAsyncMock.mockClear();
  addListenerMock.mockClear();
  deactivateKeepAwakeMock.mockClear();
  activateKeepAwakeAsyncMock.mockResolvedValue(undefined);
  deactivateKeepAwakeMock.mockResolvedValue(undefined);
});

afterEach(() => unmount(ROOT_TAG));

function mountKeepAwake(tag?: string): void {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        useKeepAwake(tag);
        return () => h('symbiote-text', {}, 'keep-awake');
      },
    }),
  );
}

describe('useKeepAwake (Vue)', () => {
  it('activates a default tag on mount', async () => {
    mountKeepAwake();

    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
    expect(typeof activateKeepAwakeAsyncMock.mock.calls[0][0]).toBe('string');
  });

  it('activates the explicit tag when one is given', async () => {
    mountKeepAwake('custom-tag');

    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledWith('custom-tag'));
  });

  it('deactivates the same tag on unmount', async () => {
    mountKeepAwake('custom-tag');
    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));

    unmount(ROOT_TAG);

    expect(deactivateKeepAwakeMock).toHaveBeenCalledWith('custom-tag');
  });

  it('never touches addListener when no options are given', async () => {
    mountKeepAwake('custom-tag');

    await vi.waitFor(() => expect(activateKeepAwakeAsyncMock).toHaveBeenCalledTimes(1));
    expect(addListenerMock).not.toHaveBeenCalled();
  });
});
