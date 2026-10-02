import { AppState } from '@symbiote-native/engine';
import type { IEventValueSource } from '@symbiote-native/engine';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
} from './sharing';
import type { IIncomingShareSnapshot, ISharePayload } from './types';

export const INCOMING_SHARE_CHANGE = 'change';

export type IIncomingShareStore = IEventValueSource<
  IIncomingShareSnapshot,
  typeof INCOMING_SHARE_CHANGE
> & {
  getSnapshot: () => IIncomingShareSnapshot;
  refresh: () => Promise<void>;
  clear: () => void;
};

// Multiset comparison, so the same payloads in another order do not trigger a re-resolve
function sharePayloadsAreEqual(
  a: ISharePayload[],
  b: ISharePayload[],
): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  const keyOf = (item: ISharePayload): string =>
    `${item.value}|${item.mimeType}|${item.shareType}`;
  for (const item of a)
    counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  for (const item of b) {
    const count = counts.get(keyOf(item));
    if (!count) return false;
    counts.set(keyOf(item), count - 1);
  }
  return true;
}

function toError(cause: unknown, fallbackMessage: string): Error {
  return cause instanceof Error ? cause : new Error(fallbackMessage);
}

export function createIncomingShareStore(): IIncomingShareStore {
  let snapshot: IIncomingShareSnapshot = {
    sharedPayloads: getSharedPayloads(),
    resolvedSharedPayloads: [],
    isResolving: false,
    error: null,
  };
  // Starts empty, not at the first snapshot, so a first refresh with data always resolves it
  let lastRefreshed: ISharePayload[] = [];
  const listeners = new Set<(next: IIncomingShareSnapshot) => void>();
  let appStateSubscription: { remove: () => void } | null = null;

  function update(patch: Partial<IIncomingShareSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  }

  async function resolvePayloads(): Promise<void> {
    update({ isResolving: true });
    try {
      update({
        resolvedSharedPayloads: await getResolvedSharedPayloadsAsync(),
      });
    } catch (cause) {
      update({
        error: toError(cause, 'Unknown error during shared payload resolution'),
      });
    } finally {
      update({ isResolving: false });
    }
  }

  async function refresh(): Promise<void> {
    try {
      const next = getSharedPayloads();
      // Skip the resolve when nothing changed, it can cost a network round trip
      if (sharePayloadsAreEqual(next, lastRefreshed)) return;
      lastRefreshed = next;
      update({ sharedPayloads: next, resolvedSharedPayloads: [], error: null });
      if (next.length > 0) await resolvePayloads();
    } catch (cause) {
      update({ error: toError(cause, 'Failed to resolve data') });
    }
  }

  function start(): void {
    void refresh();
    appStateSubscription = AppState.addEventListener('change', status => {
      if (status === 'active') void refresh();
    });
  }

  function stop(): void {
    appStateSubscription?.remove();
    appStateSubscription = null;
  }

  return {
    getSnapshot: () => snapshot,
    refresh,
    clear: clearSharedPayloads,
    addListener(_event, listener) {
      const wasIdle = listeners.size === 0;
      listeners.add(listener);
      // After `add`, so the first refresh's synchronous update reaches this listener
      if (wasIdle) start();
      return {
        remove: () => {
          listeners.delete(listener);
          if (listeners.size === 0) stop();
        },
      };
    },
  };
}
