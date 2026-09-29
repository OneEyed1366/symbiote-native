// Vue twin of `../../../react`'s `usePreventScreenCapture` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { preventScreenCaptureAsync, allowScreenCaptureAsync } = vi.hoisted(
  () => ({
    preventScreenCaptureAsync: vi.fn(),
    allowScreenCaptureAsync: vi.fn(),
  }),
);

vi.mock('../../../core', () => ({
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
}));

const { usePreventScreenCapture } = await import('./index');

const ROOT_TAG = 1001;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function mountHarness(key?: string): void {
  const Probe = defineComponent(() => {
    usePreventScreenCapture(key);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  preventScreenCaptureAsync.mockResolvedValue(undefined);
  allowScreenCaptureAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('usePreventScreenCapture (Positive: prevents on mount, allows on unmount)', () => {
  it('prevents screen capture with the default key on mount', async () => {
    mountHarness();
    await tick();

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('default');
  });

  it('allows screen capture with the same key on unmount', async () => {
    mountHarness('my-key');
    await tick();

    unmount(ROOT_TAG);

    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });
});
