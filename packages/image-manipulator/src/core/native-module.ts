import {
  requireNativeModule,
  SharedObject,
  SharedRef,
} from 'expo-modules-core';
import type { IImageResult, ISaveOptions } from './types';

const EXPO_IMAGE_MANIPULATOR_MODULE_NAME = 'ExpoImageManipulator';

export declare class NativeImageRef extends SharedRef<'image'> {
  width: number;
  height: number;
  saveAsync(options?: ISaveOptions): Promise<IImageResult>;
}

export declare class NativeImageManipulatorContext extends SharedObject {
  resize(size: {
    width?: number | null;
    height?: number | null;
  }): NativeImageManipulatorContext;
  rotate(degrees: number): NativeImageManipulatorContext;
  flip(flipType: 'vertical' | 'horizontal'): NativeImageManipulatorContext;
  crop(rect: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  }): NativeImageManipulatorContext;
  reset(): NativeImageManipulatorContext;
  renderAsync(): Promise<NativeImageRef>;
}

export type INativeImageManipulatorModule = {
  manipulate(source: string | NativeImageRef): NativeImageManipulatorContext;
};

export const expoImageManipulator =
  requireNativeModule<INativeImageManipulatorModule>(
    EXPO_IMAGE_MANIPULATOR_MODULE_NAME,
  );
