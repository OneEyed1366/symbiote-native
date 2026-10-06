import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DescriptorOutlet, NativeViewBase } from '@symbiote-native/angular';
import type { IDescriptor } from '@symbiote-native/components';
import { createCameraView } from '../../core';
import type { ICameraViewHandle, ICameraViewProps } from '../../core';

// One list is the inputs of the component and the props it hands to the native view
const CAMERA_VIEW_INPUTS = [
  'facing',
  'flash',
  'zoom',
  'mode',
  'mute',
  'mirror',
  'autofocus',
  'active',
  'videoQuality',
  'videoBitrate',
  'animateShutter',
  'pictureSize',
  'selectedLens',
  'enableTorch',
  'videoStabilizationMode',
  'barcodeScannerSettings',
  'responsiveOrientationWhenOrientationLocked',
  'ratio',
  'onCameraReady',
  'onMountError',
  'onBarcodeScanned',
  'onResponsiveOrientationChanged',
  'onAvailableLensesChanged',
] as const;

/** Angular twin of `expo-camera`'s `CameraView` */
@Component({
  selector: 'CameraView',
  standalone: true,
  imports: [DescriptorOutlet],
  inputs: [...CAMERA_VIEW_INPUTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (descriptor; as node) {
    <symbiote-descriptor-outlet [node]="node" />
  }`,
})
export class CameraView extends NativeViewBase {
  // The inputs are named by `inputs`, these only type them for the template
  declare facing?: ICameraViewProps['facing'];
  declare flash?: ICameraViewProps['flash'];
  declare zoom?: ICameraViewProps['zoom'];
  declare mode?: ICameraViewProps['mode'];
  declare mute?: ICameraViewProps['mute'];
  declare mirror?: ICameraViewProps['mirror'];
  declare autofocus?: ICameraViewProps['autofocus'];
  declare active?: ICameraViewProps['active'];
  declare videoQuality?: ICameraViewProps['videoQuality'];
  declare videoBitrate?: ICameraViewProps['videoBitrate'];
  declare animateShutter?: ICameraViewProps['animateShutter'];
  declare pictureSize?: ICameraViewProps['pictureSize'];
  declare selectedLens?: ICameraViewProps['selectedLens'];
  declare enableTorch?: ICameraViewProps['enableTorch'];
  declare videoStabilizationMode?: ICameraViewProps['videoStabilizationMode'];
  declare barcodeScannerSettings?: ICameraViewProps['barcodeScannerSettings'];
  declare responsiveOrientationWhenOrientationLocked?: ICameraViewProps['responsiveOrientationWhenOrientationLocked'];
  declare ratio?: ICameraViewProps['ratio'];
  declare onCameraReady?: ICameraViewProps['onCameraReady'];
  declare onMountError?: ICameraViewProps['onMountError'];
  declare onBarcodeScanned?: ICameraViewProps['onBarcodeScanned'];
  declare onResponsiveOrientationChanged?: ICameraViewProps['onResponsiveOrientationChanged'];
  declare onAvailableLensesChanged?: ICameraViewProps['onAvailableLensesChanged'];

  private readonly view = createCameraView(() => this.hostNode());

  // The functions of the view are copied onto the component, a `@ViewChild` reaches them
  declare readonly takePictureAsync: ICameraViewHandle['takePictureAsync'];
  declare readonly recordAsync: ICameraViewHandle['recordAsync'];
  declare readonly toggleRecordingAsync: ICameraViewHandle['toggleRecordingAsync'];
  declare readonly stopRecording: ICameraViewHandle['stopRecording'];
  declare readonly pausePreview: ICameraViewHandle['pausePreview'];
  declare readonly resumePreview: ICameraViewHandle['resumePreview'];
  declare readonly getAvailablePictureSizesAsync: ICameraViewHandle['getAvailablePictureSizesAsync'];
  declare readonly getAvailableLensesAsync: ICameraViewHandle['getAvailableLensesAsync'];
  declare readonly getSupportedFeatures: ICameraViewHandle['getSupportedFeatures'];
  declare readonly getHostNode: ICameraViewHandle['getHostNode'];

  constructor() {
    super();
    Object.assign(this, this.view.handle);
  }

  protected override readonly propNames = CAMERA_VIEW_INPUTS;

  protected override renderView(props: object): IDescriptor | null {
    return this.view.render(props);
  }
}
