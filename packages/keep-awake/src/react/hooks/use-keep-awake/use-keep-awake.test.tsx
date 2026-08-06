// Co-located React-driven test (ADR 0025) for useKeepAwake. See battery's
// use-low-power-mode.test.tsx for the shared rationale (mocks `core`, not expo-modules-core
// internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { useKeepAwake } from './index';

const { activateKeepAwakeAsync, addListener, deactivateKeepAwake } = vi.hoisted(() => ({
  activateKeepAwakeAsync: vi.fn(async (_tag: string) => undefined),
  addListener: vi.fn(),
  deactivateKeepAwake: vi.fn(async (_tag: string) => undefined),
}));

vi.mock('../../../core', () => ({
  activateKeepAwakeAsync,
  addListener,
  deactivateKeepAwake,
}));

const ROOT_TAG = 954;

function Probe({ tag }: { tag?: string }): ReactElement {
  useKeepAwake(tag);
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  activateKeepAwakeAsync.mockResolvedValue(undefined);
  deactivateKeepAwake.mockResolvedValue(undefined);
});

afterEach(() => unmount(ROOT_TAG));

describe('useKeepAwake', () => {
  it('activates a default tag on mount', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1));
    expect(typeof activateKeepAwakeAsync.mock.calls[0][0]).toBe('string');
  });

  it('activates the explicit tag when one is given', async () => {
    mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag' }));

    await vi.waitFor(() => expect(activateKeepAwakeAsync).toHaveBeenCalledWith('custom-tag'));
  });

  it('deactivates the same tag on unmount', async () => {
    mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag' }));
    await vi.waitFor(() => expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1));

    unmount(ROOT_TAG);

    expect(deactivateKeepAwake).toHaveBeenCalledWith('custom-tag');
  });

  it('never touches addListener when no options are given', async () => {
    mount(ROOT_TAG, createElement(Probe, { tag: 'custom-tag' }));

    await vi.waitFor(() => expect(activateKeepAwakeAsync).toHaveBeenCalledTimes(1));
    expect(addListener).not.toHaveBeenCalled();
  });
});
