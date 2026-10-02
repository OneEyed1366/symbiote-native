// Port of `useIncomingShare`'s refresh logic onto a framework-agnostic store

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResolvedSharePayload, ISharePayload } from './types';

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
  const remove = vi.fn();
  return {
    addEventListener: vi.fn((_type: string, next: (status: string) => void) => {
      listener = next;
      return { remove };
    }),
    remove,
    emit: (status: string) => listener?.(status),
  };
});

vi.mock('./sharing', () => payloads);
vi.mock('@symbiote-native/engine', () => ({ AppState: appState }));

const { createIncomingShareStore } = await import('./incoming-share-store');

const settle = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  payloads.getSharedPayloads.mockReturnValue([]);
  payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createIncomingShareStore (Positive)', () => {
  it('reads the shared payloads synchronously for the first snapshot', () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);

    const store = createIncomingShareStore();

    expect(store.getSnapshot()).toEqual({
      sharedPayloads: [TEXT_PAYLOAD],
      resolvedSharedPayloads: [],
      isResolving: false,
      error: null,
    });
  });

  it('resolves payloads once a listener attaches and reports isResolving on the way', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([RESOLVED_TEXT]);
    const store = createIncomingShareStore();
    const seen: boolean[] = [];

    store.addListener('change', snapshot => seen.push(snapshot.isResolving));
    await settle();

    expect(seen).toContain(true);
    expect(store.getSnapshot().isResolving).toBe(false);
    expect(store.getSnapshot().resolvedSharedPayloads).toEqual([RESOLVED_TEXT]);
  });

  it('skips resolving when the payloads did not change', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    const store = createIncomingShareStore();
    store.addListener('change', () => {});
    await settle();

    await store.refresh();

    expect(payloads.getResolvedSharedPayloadsAsync).toHaveBeenCalledTimes(1);
  });

  it('treats the same payloads in another order as unchanged', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD, URL_PAYLOAD]);
    const store = createIncomingShareStore();
    store.addListener('change', () => {});
    await settle();

    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD, TEXT_PAYLOAD]);
    await store.refresh();

    expect(payloads.getResolvedSharedPayloadsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not resolve an empty payload list', async () => {
    const store = createIncomingShareStore();
    store.addListener('change', () => {});
    await settle();

    expect(payloads.getResolvedSharedPayloadsAsync).not.toHaveBeenCalled();
  });

  it('refreshes when the app returns to the foreground and ignores other states', async () => {
    const store = createIncomingShareStore();
    store.addListener('change', () => {});
    await settle();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    appState.emit('background');
    await settle();
    expect(store.getSnapshot().sharedPayloads).toEqual([]);

    appState.emit('active');
    await settle();
    expect(store.getSnapshot().sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('stops listening to AppState once the last listener is removed', () => {
    const store = createIncomingShareStore();
    const first = store.addListener('change', () => {});
    const second = store.addListener('change', () => {});

    first.remove();
    expect(appState.remove).not.toHaveBeenCalled();
    second.remove();

    expect(appState.remove).toHaveBeenCalledTimes(1);
    expect(appState.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('exposes the native clear function', () => {
    createIncomingShareStore().clear();

    expect(payloads.clearSharedPayloads).toHaveBeenCalledTimes(1);
  });
});

describe('createIncomingShareStore (Negative)', () => {
  it('reports a resolving failure as `error` and empties the resolved list', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValue(
      new Error('offline'),
    );
    const store = createIncomingShareStore();

    store.addListener('change', () => {});
    await settle();

    expect(store.getSnapshot().error?.message).toBe('offline');
    expect(store.getSnapshot().resolvedSharedPayloads).toEqual([]);
    expect(store.getSnapshot().isResolving).toBe(false);
  });

  it('wraps a non-Error rejection in a generic Error', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValue('boom');
    const store = createIncomingShareStore();

    store.addListener('change', () => {});
    await settle();

    expect(store.getSnapshot().error?.message).toBe(
      'Unknown error during shared payload resolution',
    );
  });

  it('reports a failing `getSharedPayloads` during refresh as `error`', async () => {
    const store = createIncomingShareStore();
    store.addListener('change', () => {});
    await settle();
    payloads.getSharedPayloads.mockImplementation(() => {
      throw new Error('native gone');
    });

    await store.refresh();

    expect(store.getSnapshot().error?.message).toBe('native gone');
  });

  it('clears a stale error when the payloads change again', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValueOnce(
      new Error('offline'),
    );
    const store = createIncomingShareStore();
    store.addListener('change', () => {});
    await settle();

    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);
    await store.refresh();

    expect(store.getSnapshot().error).toBeNull();
  });
});
