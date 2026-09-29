import {
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
} from '@vue/runtime-core';
import { createResourceHook } from '@symbiote-native/vue';
import type { IImageManipulatorContext, IImageRef } from '../core';
import { createImageManipulatorResourceController } from '../core/manipulator-resource-controller';

const useManipulatorResource = createResourceHook(
  createImageManipulatorResourceController,
);

/** Vue twin of `expo-image-manipulator`'s `useImageManipulator` */
export function useImageManipulator(
  source: MaybeRefOrGetter<string | IImageRef>,
): ComputedRef<IImageManipulatorContext> {
  return useManipulatorResource(() => [toValue(source)]);
}
