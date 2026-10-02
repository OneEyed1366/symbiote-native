// Solid twin of `../../react`'s `usePreventScreenCapture` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const { preventScreenCaptureAsync, allowScreenCaptureAsync } = vi.hoisted(
  () => ({
    preventScreenCaptureAsync: vi.fn(),
    allowScreenCaptureAsync: vi.fn(),
  }),
);

vi.mock('../../core', () => ({
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
}));

const { createPreventScreenCapture } =
  await import('./create-prevent-screen-capture');

const ROOT_TAG = 1004;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function Probe(props: { preventKey?: string }): null {
  createPreventScreenCapture(props.preventKey);
  return null;
}

function mountHarness(preventKey?: string): void {
  mount(ROOT_TAG, () => <Probe preventKey={preventKey} />);
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

describe('createPreventScreenCapture (Positive: prevents on mount, allows on cleanup)', () => {
  it('prevents screen capture with the default key', async () => {
    mountHarness();
    await tick();

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('default');
  });

  it('allows screen capture with the same key on cleanup', async () => {
    mountHarness('my-key');
    await tick();

    unmount(ROOT_TAG);

    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });
});
