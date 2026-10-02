// Solid twin of `../react`'s `useIncomingShare` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
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

const ROOT_TAG = 1403;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof useIncomingShare> | undefined;

function Probe(): null {
  captured = useIncomingShare();
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
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

    expect(captured?.().sharedPayloads).toEqual([TEXT_PAYLOAD]);
  });

  it('resolves the payloads after mount', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([RESOLVED_TEXT]);

    mountHarness();
    await tick();
    await tick();

    expect(captured?.().resolvedSharedPayloads).toEqual([RESOLVED_TEXT]);
    expect(captured?.().isResolving).toBe(false);
  });

  it('picks up new payloads when the app returns to the foreground', async () => {
    mountHarness();
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    appState.emit('active');
    await tick();
    await tick();

    expect(captured?.().sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('refreshSharePayloads re-reads and clearSharedPayloads calls native', async () => {
    mountHarness();
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    captured?.().refreshSharePayloads();
    await tick();
    await tick();
    captured?.().clearSharedPayloads();

    expect(captured?.().sharedPayloads).toEqual([URL_PAYLOAD]);
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

    expect(captured?.().error?.message).toBe('offline');
  });
});
