// Angular twin of `../../react`'s `useCalendarPermissions`, `get`/`request` take `writeOnly`

import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import {
  getCalendarPermissions,
  requestCalendarPermissions,
} from '../../../core/calendar';
import type { PermissionResponse } from 'expo-modules-core';

@Injectable({ providedIn: 'root' })
export class CalendarPermissionsService extends PermissionsServiceBase<
  PermissionResponse,
  boolean
> {
  constructor() {
    super(getCalendarPermissions, requestCalendarPermissions);
  }
}
