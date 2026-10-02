// Angular twin of React's `usePermissions`: `inject(PermissionsService).connect()` gives a signal

import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
  type PermissionResponse,
} from '../../../core';

@Injectable({ providedIn: 'root' })
export class PermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(getPermissionsAsync, requestPermissionsAsync);
  }
}
