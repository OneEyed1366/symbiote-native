import type { JSX } from 'solid-js';
import { defineDescriptorComponent } from '@symbiote-native/solid';
import { renderImageBackground } from '../core';
import type { IImageBackgroundProps } from '../core';

export type IImageBackgroundSolidProps = IImageBackgroundProps & {
  children?: JSX.Element;
};

/** Solid twin of `expo-image`'s `ImageBackground`, children paint over the image */
export const ImageBackground =
  defineDescriptorComponent<IImageBackgroundSolidProps>(renderImageBackground);
