import type {
  INetworkRequestCompletedEvent,
  INetworkRequestFilter,
  INetworkRequestStartedEvent,
} from './types';

// Field-listed rather than a bare JSON.stringify(filter) so `{ hosts, methods }` and
// `{ methods, hosts }` (the same filter) don't produce different keys
export function filterKeyOf(
  filter: INetworkRequestFilter | null | undefined,
): string {
  return JSON.stringify({
    hosts: filter?.hosts ?? null,
    methods: filter?.methods ?? null,
  });
}

export type INetworkRequestObserverCallbacks = {
  onStarted?: (event: INetworkRequestStartedEvent) => void;
  onCompleted?: (event: INetworkRequestCompletedEvent) => void;
};

export type ISubscribableNetworkRequestObserver = {
  addListener(
    event: 'requestStarted',
    listener: (event: INetworkRequestStartedEvent) => void,
  ): { remove: () => void };
  addListener(
    event: 'requestCompleted',
    listener: (event: INetworkRequestCompletedEvent) => void,
  ): { remove: () => void };
};

// `getCallbacks` is read fresh on every event, so a caller never needs to resubscribe just
// because its own callbacks changed identity between renders
export function subscribeNetworkRequestObserverEvents(
  observer: ISubscribableNetworkRequestObserver,
  getCallbacks: () => INetworkRequestObserverCallbacks,
): () => void {
  const startedSubscription = observer.addListener('requestStarted', event => {
    getCallbacks().onStarted?.(event);
  });
  const completedSubscription = observer.addListener(
    'requestCompleted',
    event => {
      getCallbacks().onCompleted?.(event);
    },
  );
  return () => {
    startedSubscription.remove();
    completedSubscription.remove();
  };
}
