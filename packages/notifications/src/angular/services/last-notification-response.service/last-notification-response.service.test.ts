// Angular twin of `../../../react`'s `useLastNotificationResponse`

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { LastNotificationResponseService } from './index';
import type {
  IMaybeNotificationResponse,
  INotificationResponse,
} from '../../../core';

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

const ROOT_TAG = 1013;
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

let capturedResponse: Signal<IMaybeNotificationResponse> | undefined;
let receivedListener: ((response: INotificationResponse) => void) | undefined;
let clearedListener: (() => void) | undefined;
let removeReceivedSpy: ReturnType<typeof vi.fn>;
let removeClearedSpy: ReturnType<typeof vi.fn>;

@Component({
  selector: 'last-notification-response-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(LastNotificationResponseService);
  readonly response = this.service.connect();
  constructor() {
    capturedResponse = this.response;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedResponse = undefined;
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

describe('LastNotificationResponseService.connect (Positive: seeds from native, tracks new responses)', () => {
  it('seeds the native response', async () => {
    const response = createResponse('a');
    getLastNotificationResponse.mockReturnValue(response);

    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedResponse?.()).toEqual(response);
  });

  it('updates when a new response is received', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    const response = createResponse('a');
    receivedListener?.(response);
    await tick();

    expect(capturedResponse?.()).toEqual(response);
  });

  it('clears to null when the cleared event fires', async () => {
    getLastNotificationResponse.mockReturnValue(createResponse('a'));
    mount(ROOT_TAG, Host);
    await tick();

    clearedListener?.();
    await tick();

    expect(capturedResponse?.()).toBeNull();
  });

  it('removes both listeners on destroy', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    unmount(ROOT_TAG);

    expect(removeReceivedSpy).toHaveBeenCalledTimes(1);
    expect(removeClearedSpy).toHaveBeenCalledTimes(1);
  });
});
