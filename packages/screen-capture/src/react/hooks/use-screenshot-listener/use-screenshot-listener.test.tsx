// React twin of expo-screen-capture's `useScreenshotListener`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { addScreenshotListener } = vi.hoisted(() => ({
  addScreenshotListener: vi.fn(),
}));

vi.mock('../../../core', () => ({ addScreenshotListener }));

const { useScreenshotListener } = await import('./index');

const ROOT_TAG = 999;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let removeSpy: ReturnType<typeof vi.fn>;

function Probe({ listener }: { listener: () => void }): null {
  useScreenshotListener(listener);
  return null;
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
    mount(ROOT_TAG, <Probe listener={listener} />);
    await tick();

    expect(addScreenshotListener).toHaveBeenCalledWith(listener);
  });

  it('removes the subscription on unmount', async () => {
    mount(ROOT_TAG, <Probe listener={vi.fn()} />);
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
