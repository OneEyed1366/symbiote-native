import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import { getPermissionsAsync, requestPermissionsAsync } from '../../../core';
import type { PermissionResponse } from '../../../core';

@Injectable({ providedIn: 'root' })
export class PermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(getPermissionsAsync, requestPermissionsAsync);
  }
}
