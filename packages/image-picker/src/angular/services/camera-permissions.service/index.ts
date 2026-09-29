// Angular twin of `../../react`'s `useCameraPermissions`

import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import {
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
} from '../../../core';
import type { ICameraPermissionResponse } from '../../../core';

@Injectable({ providedIn: 'root' })
export class CameraPermissionsService extends PermissionsServiceBase<ICameraPermissionResponse> {
  constructor() {
    super(getCameraPermissionsAsync, requestCameraPermissionsAsync);
  }
}
