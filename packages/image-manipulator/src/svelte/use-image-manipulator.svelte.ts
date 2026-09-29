// Svelte twin of `expo-image-manipulator`'s `useImageManipulator`

import { createResourceHook } from '@symbiote-native/svelte/runes/create-resource-hook';
import type { IImageManipulatorContext, IImageRef } from '../core';
import { createImageManipulatorResourceController } from '../core/manipulator-resource-controller';

export type IUseImageManipulatorResult = {
  readonly current: IImageManipulatorContext;
};

const useManipulatorResource = createResourceHook(
  createImageManipulatorResourceController,
);

export function useImageManipulator(
  getSource: () => string | IImageRef,
): IUseImageManipulatorResult {
  return useManipulatorResource(() => [getSource()]);
}
