import type { ReactElement, Ref } from 'react';
import { useNativeViewController } from '@symbiote-native/react';
import { createGLView } from '../core';
import type { IGLViewHandle, IGLViewProps } from '../core';

export type IGLViewReactProps = IGLViewProps & {
  ref?: Ref<IGLViewHandle>;
  className?: string;
};

/** React twin of `expo-gl`'s `GLView` */
export function GLView({
  ref,
  ...props
}: IGLViewReactProps): ReactElement | null {
  return useNativeViewController(ref, createGLView, props);
}
