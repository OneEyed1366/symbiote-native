import { createResourceHook } from '@symbiote-native/react';
import type { IImageManipulatorContext, IImageRef } from '../core';
import { createImageManipulatorResourceController } from '../core/manipulator-resource-controller';

const useManipulatorResource = createResourceHook(
  createImageManipulatorResourceController,
);

/** React twin of `expo-image-manipulator`'s `useImageManipulator` */
export function useImageManipulator(
  source: string | IImageRef,
): IImageManipulatorContext {
  return useManipulatorResource(source);
}
