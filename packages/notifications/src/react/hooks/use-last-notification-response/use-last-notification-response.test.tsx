// React twin of expo-notifications' `useLastNotificationResponse`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { INotificationResponse } from '../../../core';

const {
  getLastNotificationResponse,
  addNotificationResponseReceivedListener,
  addNotificationResponseClearedListener,
} = vi.hoisted(() => ({
  getLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  addNotificationResponseClearedListener: vi.fn(),
}));

vi.mock('../../../core', async () => {
  const { determineNextResponse } =
    await import('../../../core/last-notification-response');
  return {
    determineNextResponse,
    getLastNotificationResponse,
    addNotificationResponseReceivedListener,
    addNotificationResponseClearedListener,
  };
});

const { useLastNotificationResponse } = await import('./index');

const ROOT_TAG = 1010;
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

let captured: ReturnType<typeof useLastNotificationResponse> | undefined;
let receivedListener: ((response: INotificationResponse) => void) | undefined;
let clearedListener: (() => void) | undefined;
let removeReceivedSpy: ReturnType<typeof vi.fn>;
let removeClearedSpy: ReturnType<typeof vi.fn>;

function Probe(): null {
  captured = useLastNotificationResponse();
  return null;
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

describe('useLastNotificationResponse (Positive: seeds from native, tracks new responses)', () => {
  it('seeds null when no response was received yet', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(captured).toBeNull();
  });

  it('seeds the native response when one already exists', async () => {
    const response = createResponse('a');
    getLastNotificationResponse.mockReturnValue(response);

    mount(ROOT_TAG, <Probe />);

    await vi.waitFor(() => expect(captured).toEqual(response));
  });

  it('updates when a new response is received', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    const response = createResponse('a');
    receivedListener?.(response);

    await vi.waitFor(() => expect(captured).toEqual(response));
  });

  it('clears to null when the cleared event fires', async () => {
    getLastNotificationResponse.mockReturnValue(createResponse('a'));
    mount(ROOT_TAG, <Probe />);
    await tick();

    clearedListener?.();

    await vi.waitFor(() => expect(captured).toBeNull());
  });

  it('removes both listeners on unmount', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    unmount(ROOT_TAG);

    expect(removeReceivedSpy).toHaveBeenCalledTimes(1);
    expect(removeClearedSpy).toHaveBeenCalledTimes(1);
  });
});
