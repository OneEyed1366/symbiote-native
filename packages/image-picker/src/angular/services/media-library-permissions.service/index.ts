// Angular twin of `../../react`'s `useMediaLibraryPermissions`, `get`/`request` take a `writeOnly` flag

import { Injectable } from '@angular/core';
import { PermissionsServiceBase } from '@symbiote-native/angular';
import {
  getMediaLibraryPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from '../../../core';
import type { IMediaLibraryPermissionResponse } from '../../../core';

@Injectable({ providedIn: 'root' })
export class MediaLibraryPermissionsService extends PermissionsServiceBase<
  IMediaLibraryPermissionResponse,
  boolean
> {
  constructor() {
    super(getMediaLibraryPermissionsAsync, requestMediaLibraryPermissionsAsync);
  }
}
