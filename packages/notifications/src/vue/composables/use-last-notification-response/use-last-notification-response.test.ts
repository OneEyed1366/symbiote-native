// Vue twin of `../../../react`'s `useLastNotificationResponse` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 1011;
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

function mountHarness(): void {
  const Probe = defineComponent(() => {
    captured = useLastNotificationResponse();
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
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
    mountHarness();
    await tick();

    expect(captured?.value).toBeNull();
  });

  it('seeds the native response when one already exists', async () => {
    const response = createResponse('a');
    getLastNotificationResponse.mockReturnValue(response);

    mountHarness();
    await tick();

    expect(captured?.value).toEqual(response);
  });

  it('updates when a new response is received', async () => {
    mountHarness();
    await tick();

    const response = createResponse('a');
    receivedListener?.(response);
    await tick();

    expect(captured?.value).toEqual(response);
  });

  it('clears to null when the cleared event fires', async () => {
    getLastNotificationResponse.mockReturnValue(createResponse('a'));
    mountHarness();
    await tick();

    clearedListener?.();
    await tick();

    expect(captured?.value).toBeNull();
  });

  it('removes both listeners on unmount', async () => {
    mountHarness();
    await tick();

    unmount(ROOT_TAG);

    expect(removeReceivedSpy).toHaveBeenCalledTimes(1);
    expect(removeClearedSpy).toHaveBeenCalledTimes(1);
  });
});
