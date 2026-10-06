import {
  defineNativeViewComponent,
  defineOptionalDescriptorComponent,
} from '@symbiote-native/solid';
import { createVideoView, renderVideoAirPlayButton } from '../core';
import type {
  IVideoAirPlayButtonProps,
  IVideoViewHandle,
  IVideoViewProps,
} from '../core';

/** Solid twin of `expo-video`'s `VideoView`, `ref` gets the handle of the view */
export const VideoView = defineNativeViewComponent<
  IVideoViewHandle,
  IVideoViewProps
>(createVideoView);

/** Solid twin of `expo-video`'s `VideoAirPlayButton`, a plain view off iOS */
export const VideoAirPlayButton =
  defineOptionalDescriptorComponent<IVideoAirPlayButtonProps>(
    renderVideoAirPlayButton,
  );
