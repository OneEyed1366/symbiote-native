// Solid twin of `../../react`'s `useLastNotificationResponse` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INotificationResponse } from '../../core';

const {
  getLastNotificationResponse,
  addNotificationResponseReceivedListener,
  addNotificationResponseClearedListener,
} = vi.hoisted(() => ({
  getLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  addNotificationResponseClearedListener: vi.fn(),
}));

vi.mock('../../core', async () => {
  const { determineNextResponse } =
    await import('../../core/last-notification-response');
  return {
    determineNextResponse,
    getLastNotificationResponse,
    addNotificationResponseReceivedListener,
    addNotificationResponseClearedListener,
  };
});

const { createLastNotificationResponse } =
  await import('./create-last-notification-response');

const ROOT_TAG = 1012;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createResponse(identifier: string): INotificationResponse {
  return {
    notification: {
      date: 0,
      request: { identifier, content: {}, trigger: null },
    },
    actionIdentifier: 'default',
  } as unknown as INotificationResponse;
}

let captured: ReturnType<typeof createLastNotificationResponse> | undefined;
let receivedListener: ((response: INotificationResponse) => void) | undefined;
let clearedListener: (() => void) | undefined;
let removeReceivedSpy: ReturnType<typeof vi.fn>;
let removeClearedSpy: ReturnType<typeof vi.fn>;

function Probe(): null {
  captured = createLastNotificationResponse();
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  removeReceivedSpy = vi.fn();
  removeClearedSpy = vi.fn();
  getLastNotificationResponse.mockReturnValue(null);
  addNotificationResponseReceivedListener.mockImplementation(
    (listener: typeof receivedListener) => {
      receivedListener = listener;
      return { remove: removeReceivedSpy };
    },
  );
  addNotificationResponseClearedListener.mockImplementation(
    (listener: typeof clearedListener) => {
      clearedListener = listener;
      return { remove: removeClearedSpy };
    },
  );
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createLastNotificationResponse (Positive: seeds from native, tracks new responses)', () => {
  it('seeds the native response synchronously', async () => {
    const response = createResponse('a');
    getLastNotificationResponse.mockReturnValue(response);

    mountHarness();
    await tick();

    expect(captured?.()).toEqual(response);
  });

  it('updates when a new response is received', async () => {
    mountHarness();
    await tick();

    const response = createResponse('a');
    receivedListener?.(response);
    await tick();

    expect(captured?.()).toEqual(response);
  });

  it('clears to null when the cleared event fires', async () => {
    getLastNotificationResponse.mockReturnValue(createResponse('a'));
    mountHarness();
    await tick();

    clearedListener?.();
    await tick();

    expect(captured?.()).toBeNull();
  });

  it('removes both listeners on cleanup', async () => {
    mountHarness();
    await tick();

    unmount(ROOT_TAG);

    expect(removeReceivedSpy).toHaveBeenCalledTimes(1);
    expect(removeClearedSpy).toHaveBeenCalledTimes(1);
  });
});
