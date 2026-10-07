import type { ReactElement, Ref } from 'react';
import {
  descriptorToReact,
  useNativeViewController,
} from '@symbiote-native/react';
import { createVideoView, renderVideoAirPlayButton } from '../core';
import type {
  IVideoAirPlayButtonProps,
  IVideoViewHandle,
  IVideoViewProps,
} from '../core';

export type IVideoViewReactProps = IVideoViewProps & {
  ref?: Ref<IVideoViewHandle>;
  className?: string;
};

export type IVideoAirPlayButtonReactProps = IVideoAirPlayButtonProps & {
  className?: string;
};

/** React twin of `expo-video`'s `VideoView` */
export function VideoView({
  ref,
  ...props
}: IVideoViewReactProps): ReactElement | null {
  return useNativeViewController(ref, createVideoView, props);
}

/** React twin of `expo-video`'s `VideoAirPlayButton`, a plain view off iOS */
export function VideoAirPlayButton(
  props: IVideoAirPlayButtonReactProps,
): ReactElement {
  return descriptorToReact(renderVideoAirPlayButton(props));
}
