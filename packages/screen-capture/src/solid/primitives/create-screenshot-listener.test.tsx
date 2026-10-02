// Solid twin of `../../react`'s `useScreenshotListener` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { addScreenshotListener } = vi.hoisted(() => ({
  addScreenshotListener: vi.fn(),
}));

vi.mock('../../core', () => ({ addScreenshotListener }));

const { createScreenshotListener } =
  await import('./create-screenshot-listener');

const ROOT_TAG = 1005;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let removeSpy: ReturnType<typeof vi.fn>;

function Probe(props: { listener: () => void }): null {
  createScreenshotListener(props.listener);
  return null;
}

function mountHarness(listener: () => void): void {
  mount(ROOT_TAG, () => <Probe listener={listener} />);
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

describe('createScreenshotListener (Positive: subscribes synchronously, unsubscribes on cleanup)', () => {
  it('subscribes the given listener', async () => {
    const listener = vi.fn();
    mountHarness(listener);
    await tick();

    expect(addScreenshotListener).toHaveBeenCalledWith(listener);
  });

  it('removes the subscription on cleanup', async () => {
    mountHarness(vi.fn());
    await tick();

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
