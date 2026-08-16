// Angular twin of React's usePermissions hook and Vue's usePermissions composable.
// `connect()` auto-fetches once (no ongoing subscription to clean up, so no Injector/effect
// needed, unlike BatteryStateService) and returns a readonly signal; get()/request() are
// imperative one-shot methods.
//
//   readonly status = inject(PermissionsService).connect();
//   // template: {{ status()?.granted }}
//
// The auto-fetch has nobody to reject to, so its failure lands in the `error` signal instead of
// escaping as an unhandled rejection: a null status with a non-null error is how a consumer tells
// "the fetch failed" from "not fetched yet". get()/request() still reject to their direct caller —
// only the automatic call is made safe.
import { Injectable, signal, type Signal } from '@angular/core';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly status = signal<PermissionResponse | null>(null);
  private readonly fetchError = signal<Error | null>(null);
  private isAutoFetchStarted = false;

  /** Why the auto-fetch left `status` at null. Cleared by the next successful get()/request(). */
  readonly error: Signal<Error | null> = this.fetchError.asReadonly();

  connect(): Signal<PermissionResponse | null> {
    // Latched rather than guarded on `status() === null`: a failed fetch leaves status null
    // forever, so the old guard turned every later connect() into another native call — unbounded
    // once connect() is reached from a change-detected expression instead of a field initializer.
    if (!this.isAutoFetchStarted) {
      this.isAutoFetchStarted = true;
      this.get().catch((cause: unknown) => {
        this.fetchError.set(cause instanceof Error ? cause : new Error(String(cause)));
      });
    }
    return this.status.asReadonly();
  }

  async get(): Promise<PermissionResponse> {
    const response = await getTrackingPermissionsAsync();
    this.status.set(response);
    this.fetchError.set(null);
    return response;
  }

  async request(): Promise<PermissionResponse> {
    const response = await requestTrackingPermissionsAsync();
    this.status.set(response);
    this.fetchError.set(null);
    return response;
  }
}
