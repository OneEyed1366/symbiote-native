// Vue twin of `../react`'s `useIncomingShare` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IResolvedSharePayload, ISharePayload } from '../core';

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

const { useIncomingShare } = await import('./use-incoming-share');

const ROOT_TAG = 1402;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useIncomingShare> | undefined;

function mountHarness(): void {
  const Probe = defineComponent(() => {
    captured = useIncomingShare();
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  payloads.getSharedPayloads.mockReturnValue([]);
  payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([]);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useIncomingShare (Positive)', () => {
  it('returns the shared payloads on setup', () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);

    mountHarness();

    expect(captured?.value.sharedPayloads).toEqual([TEXT_PAYLOAD]);
  });

  it('resolves the payloads after mount', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([RESOLVED_TEXT]);

    mountHarness();
    await tick();
    await tick();

    expect(captured?.value.resolvedSharedPayloads).toEqual([RESOLVED_TEXT]);
    expect(captured?.value.isResolving).toBe(false);
  });

  it('picks up new payloads when the app returns to the foreground', async () => {
    mountHarness();
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    appState.emit('active');
    await tick();
    await tick();

    expect(captured?.value.sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('refreshSharePayloads re-reads and clearSharedPayloads calls native', async () => {
    mountHarness();
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    captured?.value.refreshSharePayloads();
    await tick();
    await tick();
    captured?.value.clearSharedPayloads();

    expect(captured?.value.sharedPayloads).toEqual([URL_PAYLOAD]);
    expect(payloads.clearSharedPayloads).toHaveBeenCalledTimes(1);
  });
});

describe('useIncomingShare (Negative)', () => {
  it('surfaces a resolving failure as `error`', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValue(
      new Error('offline'),
    );

    mountHarness();
    await tick();
    await tick();

    expect(captured?.value.error?.message).toBe('offline');
  });
});
