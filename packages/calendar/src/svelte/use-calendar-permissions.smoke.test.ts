// Svelte twin of `../react`'s `useCalendarPermissions` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { getCalendarPermissions, requestCalendarPermissions } = vi.hoisted(
  () => ({
    getCalendarPermissions: vi.fn(),
    requestCalendarPermissions: vi.fn(),
  }),
);

vi.mock('../core/calendar', () => ({
  getCalendarPermissions,
  requestCalendarPermissions,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_970;
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

let harness = createSvelteHarness('calendar-permissions');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('calendar-permissions');
  getCalendarPermissions.mockResolvedValue(DENIED);
  requestCalendarPermissions.mockResolvedValue(GRANTED);
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

describe('useCalendarPermissions (Positive: resolves, requests, forwards writeOnly)', () => {
  it('resolves the current status on mount by default', async () => {
    await mountApp(
      'probe-app',
      `<script lang="ts">
         import { useCalendarPermissions } from './use-calendar-permissions.svelte';
         const permissions = useCalendarPermissions();
         Object.assign(globalThis, { __capturedStatus: () => permissions.status });
       </script>`,
    );
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    expect(getCalendarPermissions).toHaveBeenCalledWith(undefined);
    expect(captured?.()).toEqual(DENIED);
  });

  it('forwards writeOnly to the dispatched method on mount', async () => {
    await mountApp(
      'write-only-app',
      `<script lang="ts">
         import { useCalendarPermissions } from './use-calendar-permissions.svelte';
         useCalendarPermissions({ writeOnly: true });
       </script>`,
    );

    expect(getCalendarPermissions).toHaveBeenCalledWith(true);
  });
});
