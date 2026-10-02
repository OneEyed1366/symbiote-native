import type { Accessor } from 'solid-js';
import { createResourceHook } from '@symbiote-native/solid';
import type { IImageManipulatorContext, IImageRef } from '../core';
import { createImageManipulatorResourceController } from '../core/manipulator-resource-controller';

const useManipulatorResource = createResourceHook(
  createImageManipulatorResourceController,
);

/** Solid twin of `expo-image-manipulator`'s `useImageManipulator` */
export function useImageManipulator(
  source: Accessor<string | IImageRef>,
): Accessor<IImageManipulatorContext> {
  return useManipulatorResource(() => [source()]);
}
