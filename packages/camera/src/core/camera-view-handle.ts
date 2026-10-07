import { Platform, requireNativeModule } from 'expo-modules-core';
import { defineExpoViewMethods, getNativeTag } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { CAMERA_MODULE_NAME } from './constants';
import { expoCamera } from './native-module';
import type { ICameraPictureRef } from './native-module';
import {
  ensurePictureOptions,
  ensureRecordingOptions,
} from './picture-options';
import type {
  ICameraCapturedPicture,
  ICameraPictureOptions,
  ICameraRecordingOptions,
  ICameraSupportedFeatures,
} from './types';

export type ICameraViewHandle = {
  /** Waits for `onCameraReady` first. With `pictureRef` it resolves to a native image reference */
  takePictureAsync(
    options: ICameraPictureOptions & { pictureRef: true },
  ): Promise<ICameraPictureRef | undefined>;
  takePictureAsync(
    options?: ICameraPictureOptions,
  ): Promise<ICameraCapturedPicture | undefined>;
  /** Resolves when `stopRecording` runs, a limit is reached or the preview stops */
  recordAsync(
    options?: ICameraRecordingOptions,
  ): Promise<{ uri: string } | undefined>;
  /** Pauses or resumes the recording, iOS 18 and later on iOS */
  toggleRecordingAsync(): Promise<void>;
  stopRecording(): void;
  pausePreview(): Promise<void>;
  resumePreview(): Promise<void>;
  getAvailablePictureSizesAsync(): Promise<string[]>;
  /** Lenses exist on iOS only */
  getAvailableLensesAsync(): Promise<string[]>;
  getSupportedFeatures(): ICameraSupportedFeatures;
  /** The host node of the mounted view, `createCameraTextureAsync` of a GL view takes it */
  getHostNode(): ISymbioteNode | null;
};

const callViewFunction = defineExpoViewMethods(
  requireNativeModule,
  CAMERA_MODULE_NAME,
);

export function createCameraViewHandle(
  getNode: () => ISymbioteNode | null | undefined,
): ICameraViewHandle {
  // Like upstream's `ref.current?.`, a view that has not committed yet answers nothing
  function call<TResult>(
    method: string,
    args: readonly unknown[] = [],
  ): TResult | undefined {
    const node = getNode();
    if (!node || getNativeTag(node) === undefined) return undefined;
    return callViewFunction<TResult>(node, method, args);
  }

  async function takePictureAsync(
    options: ICameraPictureOptions & { pictureRef: true },
  ): Promise<ICameraPictureRef | undefined>;
  async function takePictureAsync(
    options?: ICameraPictureOptions,
  ): Promise<ICameraCapturedPicture | undefined>;
  async function takePictureAsync(options?: ICameraPictureOptions) {
    const pictureOptions = ensurePictureOptions(options);
    // The picture ref is an iOS feature, Android answers a plain picture
    if (
      Platform.select({ ios: Boolean(options?.pictureRef), default: false })
    ) {
      return call<Promise<ICameraPictureRef>>('takePictureRef', [
        pictureOptions,
      ]);
    }
    return call<Promise<ICameraCapturedPicture>>('takePicture', [
      pictureOptions,
    ]);
  }

  return {
    takePictureAsync,
    recordAsync: async options =>
      call<Promise<{ uri: string }>>('record', [
        ensureRecordingOptions(options),
      ]),
    toggleRecordingAsync: async () => call<Promise<void>>('toggleRecording'),
    stopRecording: () => {
      call('stopRecording');
    },
    pausePreview: async () => call<Promise<void>>('pausePreview'),
    resumePreview: async () => call<Promise<void>>('resumePreview'),
    getAvailablePictureSizesAsync: async () =>
      (await call<Promise<string[]>>('getAvailablePictureSizes')) ?? [],
    getAvailableLensesAsync: async () =>
      (await call<Promise<string[]>>('getAvailableLenses')) ?? [],
    getSupportedFeatures: () => ({
      isModernBarcodeScannerAvailable:
        expoCamera.isModernBarcodeScannerAvailable,
      toggleRecordingAsyncAvailable: expoCamera.toggleRecordingAsyncAvailable,
    }),
    getHostNode: () => getNode() ?? null,
  };
}
