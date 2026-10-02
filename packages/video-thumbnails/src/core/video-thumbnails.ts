import { expoVideoThumbnails } from './native-module';
import type { IVideoThumbnailsOptions, IVideoThumbnailsResult } from './types';

/** Grabs a still frame from `sourceFilename` (local or remote) as a new image file. */
export async function getThumbnailAsync(
  sourceFilename: string,
  options: IVideoThumbnailsOptions = {},
): Promise<IVideoThumbnailsResult> {
  return await expoVideoThumbnails.getThumbnail(sourceFilename, options);
}
