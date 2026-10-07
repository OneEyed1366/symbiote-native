import { expoVideo } from './native-module';
import type { VideoThumbnail as IVideoThumbnailInstance } from './player-types';

/** The native class of a thumbnail, `generateThumbnailsAsync` resolves to instances of it */
export const VideoThumbnail = expoVideo.VideoThumbnail;

export type VideoThumbnail = IVideoThumbnailInstance;
