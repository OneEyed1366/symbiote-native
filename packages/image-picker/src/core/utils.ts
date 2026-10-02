import { MediaTypeOptions } from './types';
import type { IImagePickerOptions, IMediaType } from './types';

const DEPRECATED_MEDIA_TYPE_MAP: Record<MediaTypeOptions, IMediaType[]> = {
  [MediaTypeOptions.Images]: ['images'],
  [MediaTypeOptions.Videos]: ['videos'],
  [MediaTypeOptions.All]: ['images', 'videos'],
};

export function parseMediaTypes(
  mediaTypes: MediaTypeOptions | IMediaType | IMediaType[],
): IMediaType[] {
  if (
    mediaTypes === MediaTypeOptions.Images ||
    mediaTypes === MediaTypeOptions.Videos ||
    mediaTypes === MediaTypeOptions.All
  ) {
    console.warn(
      '[image-picker] `MediaTypeOptions` is deprecated. Use `IMediaType` or an array of it instead.',
    );
    return DEPRECATED_MEDIA_TYPE_MAP[mediaTypes];
  }
  if (typeof mediaTypes === 'string') {
    return [mediaTypes];
  }
  return mediaTypes;
}

export function mapDeprecatedOptions(
  options: IImagePickerOptions,
): IImagePickerOptions {
  if (!options.mediaTypes) {
    return options;
  }
  return { ...options, mediaTypes: parseMediaTypes(options.mediaTypes) };
}
