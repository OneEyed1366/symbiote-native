// Angular twin of `../react`'s `useTrackingPermissions`: `inject(...).connect()` gives a signal

import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import { trackingPermissionMethods } from '../core/tracking-permission-api';
import type { PermissionResponse } from '../core';

@Injectable({ providedIn: 'root' })
export class TrackingPermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(
      trackingPermissionMethods.getMethod,
      trackingPermissionMethods.requestMethod,
    );
  }
}
