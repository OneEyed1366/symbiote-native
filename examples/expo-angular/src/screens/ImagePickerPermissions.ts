import { Component, inject } from '@angular/core';
import {
  CameraPermissionsService,
  MediaLibraryPermissionsService,
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from '@symbiote-native/image-picker/angular';
import { Card } from '../components/Card';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { ImagePickerPermissionBlock } from './ImagePickerPermissionBlock';

@Component({
  selector: 'ImagePickerPermissions',
  standalone: true,
  imports: [Card, ImagePickerPermissionBlock],
  template: `
    <Card testID="image-picker-permissions-card" title="Permissions">
      <ImagePickerPermissionBlock
        prefix="image-picker-camera"
        title="Camera"
        [color]="color"
        [hookResponse]="camera()"
        [hookRequest]="requestCamera"
        [directGet]="getCamera"
        [directRequest]="requestCameraDirect"
      />
      <ImagePickerPermissionBlock
        prefix="image-picker-library"
        title="Media library"
        [color]="color"
        [hookResponse]="library()"
        [hookRequest]="requestLibrary"
        [directGet]="getLibrary"
        [directRequest]="requestLibraryDirect"
      />
    </Card>
  `,
})
export class ImagePickerPermissions {
  readonly color = lineColorOf(ROUTE_NAME.ImagePicker);

  private readonly cameraService = inject(CameraPermissionsService);
  private readonly libraryService = inject(MediaLibraryPermissionsService);
  readonly camera = this.cameraService.connect();
  readonly library = this.libraryService.connect();

  readonly requestCamera = () => this.cameraService.request();
  readonly requestLibrary = () => this.libraryService.request();
  readonly getCamera = getCameraPermissionsAsync;
  readonly requestCameraDirect = requestCameraPermissionsAsync;
  readonly getLibrary = () => getMediaLibraryPermissionsAsync();
  readonly requestLibraryDirect = () => requestMediaLibraryPermissionsAsync();
}
