import type { ReactElement, ReactNode } from 'react';
import { descriptorToReactWithChildren } from '@symbiote-native/react';
import { renderImageBackground } from '../core';
import type { IImageBackgroundProps } from '../core';

export type IImageBackgroundReactProps = IImageBackgroundProps & {
  children?: ReactNode;
};

/** React twin of `expo-image`'s `ImageBackground`, children paint over the image */
export function ImageBackground(
  props: IImageBackgroundReactProps,
): ReactElement {
  const { children, ...rest } = props;
  return descriptorToReactWithChildren(renderImageBackground(rest), children);
}
