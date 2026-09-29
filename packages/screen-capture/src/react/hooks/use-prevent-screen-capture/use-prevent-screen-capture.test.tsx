// React twin of expo-screen-capture's `usePreventScreenCapture`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 998;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Probe({ preventKey }: { preventKey?: string }): null {
  usePreventScreenCapture(preventKey);
  return null;
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
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('default');
  });

  it('prevents screen capture with a given key on mount', async () => {
    mount(ROOT_TAG, <Probe preventKey="my-key" />);
    await tick();

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });

  it('allows screen capture with the same key on unmount', async () => {
    mount(ROOT_TAG, <Probe preventKey="my-key" />);
    await tick();

    unmount(ROOT_TAG);

    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });
});
