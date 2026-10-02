// Vue twin of `../../../react`'s `useScreenshotListener` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { addScreenshotListener } = vi.hoisted(() => ({
  addScreenshotListener: vi.fn(),
}));

vi.mock('../../../core', () => ({ addScreenshotListener }));

const { useScreenshotListener } = await import('./index');

const ROOT_TAG = 1002;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let removeSpy: ReturnType<typeof vi.fn>;

function mountHarness(listener: () => void): void {
  const Probe = defineComponent(() => {
    useScreenshotListener(listener);
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  removeSpy = vi.fn();
  addScreenshotListener.mockReturnValue({ remove: removeSpy });
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useScreenshotListener (Positive: subscribes on mount, unsubscribes on unmount)', () => {
  it('subscribes the given listener on mount', async () => {
    const listener = vi.fn();
    mountHarness(listener);
    await tick();

    expect(addScreenshotListener).toHaveBeenCalledWith(listener);
  });

  it('removes the subscription on unmount', async () => {
    mountHarness(vi.fn());
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
