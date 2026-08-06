import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from '../../../core';

// Angular twin of React's `useNetworkState` hook and Vue's `useNetworkState` composable.
//
//   readonly networkState = inject(NetworkStateService).connect();
//   // template: {{ networkState().type }}
@Injectable({ providedIn: 'root' })
export class NetworkStateService {
  private readonly injector = inject(Injector);

  connect(): Signal<NetworkState> {
    const networkState = signal<NetworkState>({});

    effect(
      onCleanup => {
        getNetworkStateAsync().then(state => networkState.set(state));
        const subscription = addNetworkStateListener(event => networkState.set(event));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return networkState.asReadonly();
  }
}
