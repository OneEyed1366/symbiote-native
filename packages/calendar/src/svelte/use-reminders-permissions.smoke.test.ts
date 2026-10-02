// Svelte twin of `../react`'s `useRemindersPermissions` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { getRemindersPermissions, requestRemindersPermissions } = vi.hoisted(
  () => ({
    getRemindersPermissions: vi.fn(),
    requestRemindersPermissions: vi.fn(),
  }),
);

vi.mock('../core/calendar', () => ({
  getRemindersPermissions,
  requestRemindersPermissions,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_971;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};
const DENIED = { ...GRANTED, granted: false, status: 'denied' };

let harness = createSvelteHarness('calendar-reminders');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('calendar-reminders');
  getRemindersPermissions.mockResolvedValue(DENIED);
  requestRemindersPermissions.mockResolvedValue(GRANTED);
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
   import { useRemindersPermissions } from './use-reminders-permissions.svelte';
   const permissions = useRemindersPermissions();
   Object.assign(globalThis, {
     __capturedStatus: () => permissions.status,
     __requestPermission: () => permissions.requestPermission(),
   });
 </script>`;

describe('useRemindersPermissions (Positive: resolves and requests reminders permission)', () => {
  it('resolves the current status on mount by default', async () => {
    await mountApp('probe-app', PROBE_APP);
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    expect(getRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(captured?.()).toEqual(DENIED);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    await mountApp('request-app', PROBE_APP);
    const requestPermission = (
      globalThis as { __requestPermission?: () => Promise<unknown> }
    ).__requestPermission;
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    await requestPermission?.();
    await tick();

    expect(requestRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(captured?.()).toEqual(GRANTED);
  });
});
