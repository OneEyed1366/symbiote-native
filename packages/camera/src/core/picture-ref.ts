import { expoCamera } from './native-module';

/** The native image class, `takePictureAsync({ pictureRef: true })` resolves to an instance */
export const PictureRef = expoCamera.Picture;
