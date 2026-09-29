// Svelte twin of `../react`'s `useIncomingShare` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type {
  IResolvedSharePayload,
  ISharePayload,
  IUseIncomingShareResult,
} from '../core';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const TEXT_PAYLOAD: ISharePayload = {
  value: 'hello',
  shareType: 'text',
  mimeType: 'text/plain',
};
const URL_PAYLOAD: ISharePayload = {
  value: 'https://a.test',
  shareType: 'url',
  mimeType: 'text/plain',
};
const RESOLVED_TEXT: IResolvedSharePayload = {
  ...TEXT_PAYLOAD,
  contentUri: null,
  contentType: 'text',
  contentMimeType: null,
  originalName: null,
  contentSize: null,
};

const payloads = vi.hoisted(() => ({
  getSharedPayloads: vi.fn<() => ISharePayload[]>(),
  getResolvedSharedPayloadsAsync:
    vi.fn<() => Promise<IResolvedSharePayload[]>>(),
  clearSharedPayloads: vi.fn(),
}));

const appState = vi.hoisted(() => {
  let listener: ((status: string) => void) | undefined;
  return {
    addEventListener: vi.fn((_type: string, next: (status: string) => void) => {
      listener = next;
      return { remove: vi.fn() };
    }),
    emit: (status: string) => listener?.(status),
  };
});

vi.mock('../core/sharing', () => payloads);
vi.mock('@symbiote-native/engine', async importOriginal => ({
  ...(await importOriginal<typeof import('@symbiote-native/engine')>()),
  AppState: appState,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 1404;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('incoming-share');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('incoming-share');
  payloads.getSharedPayloads.mockReturnValue([]);
  payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([]);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import { useIncomingShare } from './use-incoming-share.svelte';
   const share = useIncomingShare();
   Object.assign(globalThis, { __share: () => share.current });
 </script>`;

function currentShare(): IUseIncomingShareResult {
  const read: unknown = Reflect.get(globalThis, '__share');
  if (typeof read !== 'function')
    throw new Error('probe app did not publish `__share`');
  return read();
}

async function mountProbe(name: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('useIncomingShare (Positive)', () => {
  it('returns the shared payloads on setup', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);

    await mountProbe('initial-app');

    expect(currentShare().sharedPayloads).toEqual([TEXT_PAYLOAD]);
  });

  it('resolves the payloads after mount', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([RESOLVED_TEXT]);

    await mountProbe('resolve-app');

    expect(currentShare().resolvedSharedPayloads).toEqual([RESOLVED_TEXT]);
    expect(currentShare().isResolving).toBe(false);
  });

  it('picks up new payloads when the app returns to the foreground', async () => {
    await mountProbe('foreground-app');
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    appState.emit('active');
    await tick();
    await tick();

    expect(currentShare().sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('refreshSharePayloads re-reads and clearSharedPayloads calls native', async () => {
    await mountProbe('actions-app');
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    currentShare().refreshSharePayloads();
    await tick();
    await tick();
    currentShare().clearSharedPayloads();

    expect(currentShare().sharedPayloads).toEqual([URL_PAYLOAD]);
    expect(payloads.clearSharedPayloads).toHaveBeenCalledTimes(1);
  });
});

describe('useIncomingShare (Negative)', () => {
  it('surfaces a resolving failure as `error`', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValue(
      new Error('offline'),
    );

    await mountProbe('error-app');

    expect(currentShare().error?.message).toBe('offline');
  });
});
