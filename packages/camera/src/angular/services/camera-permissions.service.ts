import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import {
  cameraPermissionMethods,
  microphonePermissionMethods,
} from '../../core/camera-api';
import type { PermissionResponse } from 'expo-modules-core';

// Angular twin of `../../react`'s camera permission hooks
@Injectable({ providedIn: 'root' })
export class CameraPermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(
      cameraPermissionMethods.getMethod,
      cameraPermissionMethods.requestMethod,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class MicrophonePermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(
      microphonePermissionMethods.getMethod,
      microphonePermissionMethods.requestMethod,
    );
  }
}
