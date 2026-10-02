export type IVideoThumbnailsResult = {
  uri: string;
  width: number;
  height: number;
};

export type IVideoThumbnailsOptions = {
  /** `0.0`-`1.0`. `1` is no compression (highest quality). */
  quality?: number;
  /** Milliseconds into the video to grab the frame from. */
  time?: number;
  /** Sent with the network request when `sourceFilename` is a remote URI. */
  headers?: Record<string, string>;
};
