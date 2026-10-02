import type { SharedObject } from 'expo-modules-core';
import type {
  INetworkRequestFilter,
  INetworkRequestObserverEvents,
} from './types';

// Ambient shape only, matching upstream's own declaration - the real class is a native
// SharedObject subclass exposed as `NetworkRequestObserver` on the native module, constructed
// from JS with `new NetworkRequestObserver(filter)` and released like any other SharedObject
export declare class NetworkRequestObserver extends SharedObject<INetworkRequestObserverEvents> {
  constructor(filter?: INetworkRequestFilter | null);

  /** Applies atomically, in-flight events are emitted under either the old or new filter */
  setFilter(filter: INetworkRequestFilter | null): void;
}
