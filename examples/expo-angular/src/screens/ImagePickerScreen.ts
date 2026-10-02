import { Component, signal } from '@angular/core';
import { Explorer } from '../components/Explorer';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { INITIAL_FORM } from './image-picker-form';
import type { IForm } from './image-picker-form';
import { ImagePickerLaunch } from './ImagePickerLaunch';
import { ImagePickerOptions } from './ImagePickerOptions';
import { ImagePickerPermissions } from './ImagePickerPermissions';

@Component({
  selector: 'ImagePickerScreen',
  standalone: true,
  imports: [
    Explorer,
    ImagePickerLaunch,
    ImagePickerOptions,
    ImagePickerPermissions,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="image-picker-scroll"
      title="Image Picker"
      body="Let users pick photos and videos from the library or shoot them with the camera, with optional cropping, several selections and video presets."
    >
      <ImagePickerLaunch [form]="form()" [color]="color" />
      <Explorer testID="image-picker-explorer" [color]="color">
        <ng-template>
          <ImagePickerPermissions />
          <ImagePickerOptions [(form)]="form" [color]="color" />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class ImagePickerScreen {
  readonly route = ROUTE_NAME.ImagePicker;
  readonly color = lineColorOf(ROUTE_NAME.ImagePicker);
  readonly form = signal<IForm>({ ...INITIAL_FORM });
}
