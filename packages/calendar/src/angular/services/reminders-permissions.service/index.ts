// Angular twin of `../../react`'s `useRemindersPermissions`

import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import {
  getRemindersPermissions,
  requestRemindersPermissions,
} from '../../../core/calendar';
import type { PermissionResponse } from 'expo-modules-core';

@Injectable({ providedIn: 'root' })
export class RemindersPermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(getRemindersPermissions, requestRemindersPermissions);
  }
}
