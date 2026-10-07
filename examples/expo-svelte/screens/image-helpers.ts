import type {
  IImageContentFit,
  IImageLoadEventData,
  ImageRef,
} from '@symbiote-native/image';

export const CACHE_KEY = 'canary-cache-demo';
export const BROKEN_URI = 'https://picsum.photos/this-image-does-not-exist-404';
export const WRITTEN_KEY = 'canary-written-key';
export const BLURHASH_COMPONENTS: [number, number] = [4, 3];
export const HASH_PREVIEW_SIZE = 96;
export const CACHE_DISK_BYTES = 100_000_000;
export const LOAD_MAX_WIDTH = 64;

export const FITS: readonly IImageContentFit[] = [
  'cover',
  'contain',
  'fill',
  'none',
  'scale-down',
];
export const PLAYGROUND_FITS: readonly IImageContentFit[] = [
  'cover',
  'contain',
];
export const POSITIONS = ['center', 'top', 'bottom', 'left', 'right'] as const;
export type IPosition = (typeof POSITIONS)[number];

export const FIT_OPTIONS = PLAYGROUND_FITS.map(item => ({
  label: item,
  value: item,
}));
export const POSITION_OPTIONS = POSITIONS.map(item => ({
  label: item,
  value: item,
}));
export const BLUR_OPTIONS = [0, 8, 24].map(item => ({
  label: String(item),
  value: item,
}));

export function describeLoad(event: IImageLoadEventData): string {
  const { width, height, mediaType } = event.source;
  return `cache: ${event.cacheType}, ${width}x${height}, ${mediaType ?? 'unknown type'}`;
}

// The reference is native memory, so it is described and released at once
export function describeRef(ref: ImageRef | null): string {
  if (ref === null) return 'null: nothing under that key';
  const text = `${ref.width}x${ref.height}, scale ${ref.scale}, ${ref.mediaType ?? 'unknown type'}`;
  ref.release();
  return text;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Runs one call and shows its formatted result, or `failed: …`
export async function showResult<T>(
  task: () => Promise<T>,
  show: (text: string) => void,
  format: (value: T) => string,
): Promise<void> {
  try {
    show(format(await task()));
  } catch (error: unknown) {
    show(`failed: ${messageOf(error)}`);
  }
}
