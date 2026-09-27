import type { PermissionResponse } from 'expo-modules-core';

export type IGranularPermission = 'audio' | 'photo' | 'video';

export type IMediaLibraryMediaTypeValue =
  'audio' | 'photo' | 'video' | 'unknown' | 'pairedVideo';

/** @platform android 14+ */
export type IMediaLibraryMediaTypeFilter = 'photo' | 'video';

export type IMediaLibrarySortByKey =
  | 'default'
  | 'mediaType'
  | 'width'
  | 'height'
  | 'creationTime'
  | 'modificationTime'
  | 'duration';

export type IMediaLibrarySortByValue =
  [IMediaLibrarySortByKey, boolean] | IMediaLibrarySortByKey;

export type IMediaLibraryMediaTypeObject = {
  audio: 'audio';
  photo: 'photo';
  video: 'video';
  unknown: 'unknown';
};

export type IMediaLibrarySortByObject = {
  default: 'default';
  mediaType: 'mediaType';
  width: 'width';
  height: 'height';
  creationTime: 'creationTime';
  modificationTime: 'modificationTime';
  duration: 'duration';
};

/** @platform ios */
export type IMediaLibraryMediaSubtype =
  | 'depthEffect'
  | 'hdr'
  | 'highFrameRate'
  | 'livePhoto'
  | 'panorama'
  | 'screenshot'
  | 'stream'
  | 'timelapse'
  | 'spatialMedia'
  | 'videoCinematic';

export type IMediaLibraryLocation = {
  latitude: number;
  longitude: number;
};

export type IMediaLibraryAsset = {
  id: string;
  filename: string;
  /** `ph://*` (iOS), `file://*` (Android) */
  uri: string;
  mediaType: IMediaLibraryMediaTypeValue;
  /** @platform ios */
  mediaSubtypes?: IMediaLibraryMediaSubtype[];
  width: number;
  height: number;
  creationTime: number;
  modificationTime: number;
  /** Seconds, for audio/video assets. */
  duration: number;
  /** @platform android */
  albumId?: string;
};

export type IMediaLibraryAssetInfo = IMediaLibraryAsset & {
  localUri?: string;
  location?: IMediaLibraryLocation;
  exif?: object;
  /** @platform ios */
  isFavorite?: boolean;
  /** Only set when `shouldDownloadFromNetwork` is `false`. @platform ios */
  isNetworkAsset?: boolean;
  /** 1-8, see the EXIF orientation spec. Only for `mediaType: 'photo'`. @platform ios */
  orientation?: number;
  /** The video paired with a Live Photo. @platform ios */
  pairedVideoAsset?: IMediaLibraryAsset | null;
};

export type IMediaLibraryAssetInfoQueryOptions = {
  /** @default true — iOS iCloud assets only */
  shouldDownloadFromNetwork?: boolean;
};

export type IMediaLibraryAssetsChangeEvent = {
  /** `false` on Android — the platform never reports incremental detail. */
  hasIncrementalChanges: boolean;
  insertedAssets?: IMediaLibraryAsset[];
  deletedAssets?: IMediaLibraryAsset[];
  updatedAssets?: IMediaLibraryAsset[];
};

export type IMediaLibraryAlbumType = 'album' | 'moment' | 'smartAlbum';

export type IMediaLibraryAlbum = {
  id: string;
  title: string;
  assetCount: number;
  /** @platform ios */
  type?: IMediaLibraryAlbumType;
  /** Only for `type: 'moment'`. @platform ios */
  startTime: number;
  /** Only for `type: 'moment'`. @platform ios */
  endTime: number;
  /** Only for `type: 'moment'`. @platform ios */
  approximateLocation?: IMediaLibraryLocation;
  /** Only for `type: 'moment'`. @platform ios */
  locationNames?: string[];
};

export type IMediaLibraryAlbumsOptions = {
  includeSmartAlbums?: boolean;
};

export type IMediaLibraryAssetRef = IMediaLibraryAsset | string;
export type IMediaLibraryAlbumRef = IMediaLibraryAlbum | string;

export type IMediaLibraryAssetsOptions = {
  /** @default 20 */
  first?: number;
  /** Pass the previous page's `endCursor` to fetch the next page. */
  after?: IMediaLibraryAssetRef;
  album?: IMediaLibraryAlbumRef;
  /** All keys sort descending by default; pass `[key, true]` for ascending. */
  sortBy?: IMediaLibrarySortByValue[] | IMediaLibrarySortByValue;
  /** @default MediaType.photo */
  mediaType?: IMediaLibraryMediaTypeValue[] | IMediaLibraryMediaTypeValue;
  /** @platform ios */
  mediaSubtypes?: IMediaLibraryMediaSubtype[] | IMediaLibraryMediaSubtype;
  createdAfter?: Date | number;
  createdBefore?: Date | number;
  /** @default false @platform android */
  resolveWithFullInfo?: boolean;
};

export type IMediaLibraryPagedInfo<T> = {
  assets: T[];
  /** iOS: the ID of the last fetched asset. Android: its index. */
  endCursor: string;
  hasNextPage: boolean;
  totalCount: number;
};

export type IMediaLibraryPermissionResponse = PermissionResponse & {
  /**
   * - `'all'` — full library access
   * - `'limited'` — only selected photos (Android 14+, iOS 14+)
   * - `'none'` — denied or not yet granted
   */
  accessPrivileges?: 'all' | 'limited' | 'none';
};

export type { PermissionResponse };
