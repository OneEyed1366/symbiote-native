// Angular twin of React's usePermissions hook and Vue's usePermissions composable.
// `connect()` auto-fetches once (no ongoing subscription to clean up, so no Injector/effect
// needed, unlike BatteryStateService) and returns a readonly signal; get()/request() are
// imperative one-shot methods.
//
//   readonly status = inject(PermissionsService).connect();
//   // template: {{ status()?.granted }}
import { Injectable, signal, type Signal } from '@angular/core';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly status = signal<PermissionResponse | null>(null);

  connect(): Signal<PermissionResponse | null> {
    if (this.status() === null) {
      void this.get();
    }
    return this.status.asReadonly();
  }

  async get(): Promise<PermissionResponse> {
    const response = await getPermissionsAsync();
    this.status.set(response);
    return response;
  }

  async request(): Promise<PermissionResponse> {
    const response = await requestPermissionsAsync();
    this.status.set(response);
    return response;
  }
}
