import { launchImageLibraryAsync } from '@symbiote-native/image-picker/solid';
import type {
  ILivePhotoAsset,
  ILivePhotoContentFit,
} from '@symbiote-native/live-photo/solid';
import {
  getAssetInfoAsync,
  getAssetsAsync,
  requestPermissionsAsync,
} from '@symbiote-native/media-library/legacy';

const MAX_LOG_LINES = 6;
const FITS: readonly ILivePhotoContentFit[] = ['contain', 'cover'];
export const FIT_OPTIONS = FITS.map(item => ({ label: item, value: item }));

export type ILiveResult = { asset: ILivePhotoAsset | null; line: string };

export function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The newest line first, a short tail
export function pushLogLine(
  previous: readonly string[],
  line: string,
): string[] {
  return [`${new Date().toLocaleTimeString()} ${line}`, ...previous].slice(
    0,
    MAX_LOG_LINES,
  );
}

export async function pickLivePhoto(): Promise<ILiveResult> {
  try {
    const result = await launchImageLibraryAsync({
      mediaTypes: ['livePhotos'],
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) {
      return { asset: null, line: 'canceled' };
    }
    const video = asset.pairedVideoAsset;
    if (video === null || video === undefined) {
      return {
        asset: null,
        line: 'that photo has no video part: pick a Live Photo',
      };
    }
    return {
      asset: { photoUri: asset.uri, pairedVideoUri: video.uri },
      line: `picked ${asset.width}x${asset.height}`,
    };
  } catch (error) {
    return { asset: null, line: `failed: ${errorLine(error)}` };
  }
}

async function loadNewest(): Promise<ILiveResult> {
  const permission = await requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('photo library access was not granted');
  }
  const page = await getAssetsAsync({
    first: 1,
    mediaType: 'photo',
    mediaSubtypes: ['livePhoto'],
    sortBy: 'creationTime',
  });
  const newest = page.assets[0];
  if (newest === undefined) {
    throw new Error('no Live Photo in the library');
  }
  const info = await getAssetInfoAsync(newest);
  const videoUri = info.pairedVideoAsset?.uri;
  if (videoUri === undefined) {
    throw new Error('the asset has no paired video');
  }
  return {
    asset: { photoUri: info.localUri ?? info.uri, pairedVideoUri: videoUri },
    line: `loaded ${info.filename}`,
  };
}

export async function findNewestLivePhoto(): Promise<ILiveResult> {
  try {
    return await loadNewest();
  } catch (error) {
    return { asset: null, line: `failed: ${errorLine(error)}` };
  }
}
