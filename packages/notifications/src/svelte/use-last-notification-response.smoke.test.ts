// Svelte twin of `../react`'s `useLastNotificationResponse` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const {
  getLastNotificationResponse,
  addNotificationResponseReceivedListener,
  addNotificationResponseClearedListener,
} = vi.hoisted(() => ({
  getLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(),
  addNotificationResponseClearedListener: vi.fn(),
}));

vi.mock('../core', async () => {
  const { determineNextResponse } =
    await import('../core/last-notification-response');
  return {
    determineNextResponse,
    getLastNotificationResponse,
    addNotificationResponseReceivedListener,
    addNotificationResponseClearedListener,
  };
});

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_963;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function createResponse(identifier: string): unknown {
  return {
    notification: {
      date: 0,
      request: { identifier, content: {}, trigger: null },
    },
    actionIdentifier: 'default',
  };
}

let harness = createSvelteHarness('notifications-last-response');
let receivedListener: ((response: unknown) => void) | undefined;
let clearedListener: (() => void) | undefined;
let removeReceivedSpy: ReturnType<typeof vi.fn>;
let removeClearedSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('notifications-last-response');
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
  harness.cleanup();
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

const PROBE_APP = `<script lang="ts">
   import { useLastNotificationResponse } from './use-last-notification-response.svelte';
   const lastResponse = useLastNotificationResponse();
   Object.assign(globalThis, { __capturedResponse: () => lastResponse.current });
 </script>`;

function captured(): unknown {
  return (
    globalThis as { __capturedResponse?: () => unknown }
  ).__capturedResponse?.();
}

describe('useLastNotificationResponse (Positive: seeds from native, tracks new responses)', () => {
  it('seeds the native response', async () => {
    const response = createResponse('a');
    getLastNotificationResponse.mockReturnValue(response);

    await mountApp('seed-app', PROBE_APP);

    expect(captured()).toEqual(response);
  });

  it('updates when a new response is received', async () => {
    await mountApp('update-app', PROBE_APP);

    const response = createResponse('a');
    receivedListener?.(response);
    await tick();

    expect(captured()).toEqual(response);
  });

  it('clears to null when the cleared event fires', async () => {
    getLastNotificationResponse.mockReturnValue(createResponse('a'));
    await mountApp('clear-app', PROBE_APP);

    clearedListener?.();
    await tick();

    expect(captured()).toBeNull();
  });

  it('removes both listeners on unmount', async () => {
    await mountApp('cleanup-app', PROBE_APP);

    unmount(ROOT_TAG);

    expect(removeReceivedSpy).toHaveBeenCalledTimes(1);
    expect(removeClearedSpy).toHaveBeenCalledTimes(1);
  });
});
