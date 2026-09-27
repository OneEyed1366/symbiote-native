import type { PermissionResponse } from 'expo-modules-core';

export enum AssetField {
  CREATION_TIME = 'creationTime',
  MODIFICATION_TIME = 'modificationTime',
  MEDIA_TYPE = 'mediaType',
  WIDTH = 'width',
  HEIGHT = 'height',
  DURATION = 'duration',
  IS_FAVORITE = 'isFavorite',
}

export enum MediaType {
  UNKNOWN = 'unknown',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
}

export enum MediaSubtype {
  DEPTH_EFFECT = 'depthEffect',
  HDR = 'hdr',
  HIGH_FRAME_RATE = 'highFrameRate',
  LIVE_PHOTO = 'livePhoto',
  PANORAMA = 'panorama',
  SCREENSHOT = 'screenshot',
  STREAM = 'stream',
  TIME_LAPSE = 'timelapse',
  SPATIAL_MEDIA = 'spatialMedia',
  VIDEO_CINEMATIC = 'videoCinematic',
}

export type IAssetFieldValueMap = {
  [AssetField.CREATION_TIME]: number;
  [AssetField.MODIFICATION_TIME]: number;
  [AssetField.MEDIA_TYPE]: MediaType;
  [AssetField.WIDTH]: number;
  [AssetField.HEIGHT]: number;
  [AssetField.DURATION]: number;
  [AssetField.IS_FAVORITE]: boolean;
};

export type ISortDescriptor = {
  key: AssetField;
  ascending?: boolean;
};

export type IShape = {
  width: number;
  height: number;
};

export type ILocation = {
  latitude: number;
  longitude: number;
};

export type IAssetInfo = {
  id: string;
  filename: string;
  uri: string;
  mediaType: MediaType;
  width: number;
  height: number;
  duration: number | null;
  creationTime: number | null;
  modificationTime: number | null;
  isFavorite: boolean;
};

export type IAssetMetadata = {
  id: string;
  filename: string | null;
  mediaType: MediaType;
  width: number | null;
  height: number | null;
  duration: number | null;
  creationTime: number | null;
  modificationTime: number | null;
  isFavorite: boolean;
};

export type IGranularPermission = 'audio' | 'photo' | 'video';

export type IMediaTypeFilter = 'photo' | 'video';

export type IMediaLibraryAssetsChangeEvent = {
  hasIncrementalChanges: boolean;
  insertedAssets?: string[];
  deletedAssets?: string[];
  updatedAssets?: string[];
};

export type IPermissionHookOptions = {
  writeOnly?: boolean;
  granularPermissions?: IGranularPermission[];
};

export type IMediaLibraryNextPermissionResponse = PermissionResponse & {
  /**
   * - `'all'` — full library access
   * - `'limited'` — only selected photos (Android 14+, iOS 14+)
   * - `'none'` — denied or not yet granted
   */
  accessPrivileges?: 'all' | 'limited' | 'none';
};
