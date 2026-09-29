// React twin of expo-sharing's `useIncomingShare`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type {
  IResolvedSharePayload,
  ISharePayload,
  IUseIncomingShareResult,
} from '../core';

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

const ROOT_TAG = 1401;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: IUseIncomingShareResult | undefined;

function Harness(): null {
  captured = useIncomingShare();
  return null;
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
  it('returns the shared payloads on the first render', () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);

    mount(ROOT_TAG, <Harness />);

    expect(captured?.sharedPayloads).toEqual([TEXT_PAYLOAD]);
  });

  it('resolves the payloads after mount', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([RESOLVED_TEXT]);

    mount(ROOT_TAG, <Harness />);
    await tick();
    await tick();

    expect(captured?.resolvedSharedPayloads).toEqual([RESOLVED_TEXT]);
    expect(captured?.isResolving).toBe(false);
  });

  it('picks up new payloads when the app returns to the foreground', async () => {
    mount(ROOT_TAG, <Harness />);
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    appState.emit('active');
    await tick();
    await tick();

    expect(captured?.sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('refreshSharePayloads re-reads the payloads', async () => {
    mount(ROOT_TAG, <Harness />);
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    captured?.refreshSharePayloads();
    await tick();
    await tick();

    expect(captured?.sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('clearSharedPayloads calls the native clear', async () => {
    mount(ROOT_TAG, <Harness />);
    await tick();

    captured?.clearSharedPayloads();

    expect(payloads.clearSharedPayloads).toHaveBeenCalledTimes(1);
  });
});

describe('useIncomingShare (Negative)', () => {
  it('surfaces a resolving failure as `error`', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValue(
      new Error('offline'),
    );

    mount(ROOT_TAG, <Harness />);
    await tick();
    await tick();

    expect(captured?.error?.message).toBe('offline');
    expect(captured?.resolvedSharedPayloads).toEqual([]);
  });
});
