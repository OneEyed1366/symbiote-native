import type { ReactElement, Ref } from 'react';
import { useNativeViewController } from '@symbiote-native/react';
import { createCameraView } from '../core';
import type { ICameraViewHandle, ICameraViewProps } from '../core';

export type ICameraViewReactProps = ICameraViewProps & {
  ref?: Ref<ICameraViewHandle>;
  className?: string;
};

/** React twin of `expo-camera`'s `CameraView` */
export function CameraView({
  ref,
  ...props
}: ICameraViewReactProps): ReactElement | null {
  return useNativeViewController(ref, createCameraView, props);
}
