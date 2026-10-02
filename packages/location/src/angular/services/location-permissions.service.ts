import { Injectable } from '@angular/core';
import {
  backgroundPermissionMethods,
  foregroundPermissionMethods,
  motionActivityPermissionMethods,
} from '../../core/location-permission-api';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import type { ILocationPermissionResponse } from '../../core';
import type { PermissionResponse } from 'expo-modules-core';

// Angular twin of `../../react`'s location permission hooks
@Injectable({ providedIn: 'root' })
export class ForegroundPermissionsService extends PermissionsServiceBase<ILocationPermissionResponse> {
  constructor() {
    super(
      foregroundPermissionMethods.getMethod,
      foregroundPermissionMethods.requestMethod,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class BackgroundPermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(
      backgroundPermissionMethods.getMethod,
      backgroundPermissionMethods.requestMethod,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class MotionActivityPermissionsService extends PermissionsServiceBase<PermissionResponse> {
  constructor() {
    super(
      motionActivityPermissionMethods.getMethod,
      motionActivityPermissionMethods.requestMethod,
    );
  }
}
