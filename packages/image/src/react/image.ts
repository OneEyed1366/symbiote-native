import type { ReactElement, Ref } from 'react';
import { useNativeViewController } from '@symbiote-native/react';
import { createImageView } from '../core';
import type { IImageViewHandle, IImageViewProps } from '../core';

export type IImageReactProps = IImageViewProps & {
  ref?: Ref<IImageViewHandle>;
  className?: string;
};

/** React twin of `expo-image`'s `Image` */
export function Image({
  ref,
  ...props
}: IImageReactProps): ReactElement | null {
  return useNativeViewController(ref, createImageView, props);
}
