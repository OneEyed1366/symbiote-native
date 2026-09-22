import { createPermissionHook } from 'expo-modules-core';
import { Platform } from 'react-native';
import { expoMediaLibrary } from './native-module';
import type {
  IGranularPermission,
  IMediaLibraryAlbum,
  IMediaLibraryAlbumRef,
  IMediaLibraryAlbumsOptions,
  IMediaLibraryAsset,
  IMediaLibraryAssetInfo,
  IMediaLibraryAssetInfoQueryOptions,
  IMediaLibraryAssetRef,
  IMediaLibraryAssetsChangeEvent,
  IMediaLibraryAssetsOptions,
  IMediaLibraryMediaTypeObject,
  IMediaLibraryMediaTypeFilter,
  IMediaLibraryPagedInfo,
  IMediaLibraryPermissionResponse,
  IMediaLibrarySortByObject,
  IMediaLibrarySortByValue,
} from './types';

type IInternalSortByValue = `${string} ${'ASC' | 'DESC'}`;

function arrayize<T>(item: T | T[] | undefined): T[] {
  if (Array.isArray(item)) return item;
  return item ? [item] : [];
}

function getId(ref: string | undefined | { id?: string }): string | undefined {
  if (typeof ref === 'string') return ref;
  return ref ? ref.id : undefined;
}

function assertAssetIds(assetIds: unknown[]): asserts assetIds is string[] {
  if (assetIds.some(id => !id || typeof id !== 'string')) {
    throw new Error('Asset ID must be a string!');
  }
}

function assertAlbumIds(albumIds: unknown[]): asserts albumIds is string[] {
  if (albumIds.some(id => !id || typeof id !== 'string')) {
    throw new Error('Album ID must be a string!');
  }
}

function assertMediaType(
  mediaType: unknown,
): asserts mediaType is keyof IMediaLibraryMediaTypeObject {
  if (!(Object.values(MediaType) as string[]).includes(mediaType as string)) {
    throw new Error(`Invalid mediaType: ${String(mediaType)}`);
  }
}

function assertSortByKey(sortBy: unknown): void {
  if (!(Object.values(SortBy) as string[]).includes(sortBy as string)) {
    throw new Error(`Invalid sortBy key: ${String(sortBy)}`);
  }
}

function assertSortBy(
  sortBy: unknown,
): asserts sortBy is IMediaLibrarySortByValue {
  if (Array.isArray(sortBy)) {
    assertSortByKey(sortBy[0]);
    if (typeof sortBy[1] !== 'boolean') {
      throw new Error(
        'Invalid sortBy array argument. Second item must be a boolean!',
      );
    }
  } else {
    assertSortByKey(sortBy);
  }
}

function sortByOptionToString(
  sortBy: IMediaLibrarySortByValue,
): IInternalSortByValue {
  assertSortBy(sortBy);
  if (Array.isArray(sortBy)) {
    return `${sortBy[0]} ${sortBy[1] ? 'ASC' : 'DESC'}`;
  }
  return `${sortBy} DESC`;
}

function dateToNumber(value?: Date | number): number | undefined {
  return value instanceof Date ? value.getTime() : value;
}

export const MediaType: IMediaLibraryMediaTypeObject =
  expoMediaLibrary.MediaType;
export const SortBy: IMediaLibrarySortByObject = expoMediaLibrary.SortBy;

export async function isAvailableAsync(): Promise<boolean> {
  return !!expoMediaLibrary && 'getAssetsAsync' in expoMediaLibrary;
}

/**
 * @param granularPermissions Only has an effect on Android 13+. Defaults to every possible
 * permission — make sure your app manifest requests everything you pass here.
 */
export async function requestPermissionsAsync(
  writeOnly: boolean = false,
  granularPermissions?: IGranularPermission[],
): Promise<IMediaLibraryPermissionResponse> {
  if (Platform.OS === 'android') {
    return expoMediaLibrary.requestPermissionsAsync(
      writeOnly,
      granularPermissions,
    );
  }
  return expoMediaLibrary.requestPermissionsAsync(writeOnly);
}

export async function getPermissionsAsync(
  writeOnly: boolean = false,
  granularPermissions?: IGranularPermission[],
): Promise<IMediaLibraryPermissionResponse> {
  if (Platform.OS === 'android') {
    return expoMediaLibrary.getPermissionsAsync(writeOnly, granularPermissions);
  }
  return expoMediaLibrary.getPermissionsAsync(writeOnly);
}

type IMediaLibraryPermissionHookOptions = {
  writeOnly?: boolean;
  granularPermissions?: IGranularPermission[];
};

export const usePermissions = createPermissionHook<
  IMediaLibraryPermissionResponse,
  IMediaLibraryPermissionHookOptions
>({
  getMethod: (options?: IMediaLibraryPermissionHookOptions) =>
    getPermissionsAsync(options?.writeOnly, options?.granularPermissions),
  requestMethod: (options?: IMediaLibraryPermissionHookOptions) =>
    requestPermissionsAsync(options?.writeOnly, options?.granularPermissions),
});

/**
 * Lets the user update which assets your app has access to. Only a no-op unless the user
 * previously granted `'limited'` access.
 * @platform android 14+
 * @platform ios
 */
export async function presentPermissionsPickerAsync(
  mediaTypes: IMediaLibraryMediaTypeFilter[] = ['photo', 'video'],
): Promise<void> {
  if (Platform.OS === 'android' && Platform.Version >= 34) {
    await expoMediaLibrary.requestPermissionsAsync(
      false,
      mediaTypes as unknown as IGranularPermission[],
    );
    return;
  }
  if (!expoMediaLibrary.presentPermissionsPickerAsync) {
    throw new Error(
      'presentPermissionsPickerAsync is not available on this platform.',
    );
  }
  return expoMediaLibrary.presentPermissionsPickerAsync();
}

/**
 * Creates an asset from an existing local file — the common case is a picture just taken by a
 * camera. Requires write permission.
 * @param localUri Must contain an extension. On Android it must be a local path (`file:///…`).
 * @param album If provided, the asset is added to this album on creation.
 */
export async function createAssetAsync(
  localUri: string,
  album?: IMediaLibraryAlbumRef,
): Promise<IMediaLibraryAsset> {
  if (!localUri || typeof localUri !== 'string') {
    throw new Error('Invalid argument "localUri". It must be a string!');
  }
  const asset = await expoMediaLibrary.createAssetAsync(localUri, getId(album));
  return Array.isArray(asset) ? asset[0] : asset;
}

/**
 * Saves the file at `localUri` to the user's library. Unlike `createAssetAsync`, does not
 * return the created asset. On iOS 11+ this can be called without the read/write permission as
 * long as `Info.plist` carries `NSPhotoLibraryAddUsageDescription`.
 */
export async function saveToLibraryAsync(localUri: string): Promise<void> {
  return expoMediaLibrary.saveToLibraryAsync(localUri);
}

/**
 * On Android, copies assets from their current album into the given one by default — pass
 * `copy: false` to move them instead. Copied assets show up twice in `getAssetsAsync`.
 */
export async function addAssetsToAlbumAsync(
  assets: IMediaLibraryAssetRef[] | IMediaLibraryAssetRef,
  album: IMediaLibraryAlbumRef,
  copy: boolean = true,
): Promise<boolean> {
  const assetIds = arrayize(assets).map(getId);
  const albumId = getId(album);
  assertAssetIds(assetIds);
  if (!albumId || typeof albumId !== 'string') {
    throw new Error('Invalid album ID. It must be a string!');
  }
  if (Platform.OS === 'ios') {
    return expoMediaLibrary.addAssetsToAlbumAsync(assetIds, albumId);
  }
  return expoMediaLibrary.addAssetsToAlbumAsync(assetIds, albumId, !!copy);
}

/** On Android, an empty album is deleted automatically once its last asset is removed. */
export async function removeAssetsFromAlbumAsync(
  assets: IMediaLibraryAssetRef[] | IMediaLibraryAssetRef,
  album: IMediaLibraryAlbumRef,
): Promise<boolean> {
  const assetIds = arrayize(assets).map(getId);
  assertAssetIds(assetIds);
  return expoMediaLibrary.removeAssetsFromAlbumAsync(assetIds, getId(album));
}

/**
 * iOS removes the asset from every album it belongs to (behind a system confirmation dialog);
 * Android keeps other albums' copies (an asset is strictly tied to one album there).
 */
export async function deleteAssetsAsync(
  assets: IMediaLibraryAssetRef[] | IMediaLibraryAssetRef,
): Promise<boolean> {
  const assetIds = arrayize(assets).map(getId);
  assertAssetIds(assetIds);
  return expoMediaLibrary.deleteAssetsAsync(assetIds);
}

/**
 * GPS location, local URI and EXIF metadata. Prefer this only when you need more than the
 * fields already on `Asset` — it costs more than a plain list query.
 */
export async function getAssetInfoAsync(
  asset: IMediaLibraryAssetRef,
  options: IMediaLibraryAssetInfoQueryOptions = {
    shouldDownloadFromNetwork: true,
  },
): Promise<IMediaLibraryAssetInfo> {
  const assetId = getId(asset);
  assertAssetIds([assetId]);
  const info = await expoMediaLibrary.getAssetInfoAsync(
    assetId as string,
    options,
  );
  return Array.isArray(info) ? info[0] : info;
}

/** @platform android */
export async function getAssetContentUriAsync(
  asset: IMediaLibraryAssetRef,
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('getAssetContentUriAsync is only available on Android.');
  }
  const assetId = getId(asset);
  assertAssetIds([assetId]);
  return expoMediaLibrary.getAssetContentUriAsync(assetId as string);
}

/**
 * @return Depending on Android version, the root storage directory may be listed as an album
 * titled `"0"`, or not listed at all.
 */
export async function getAlbumsAsync({
  includeSmartAlbums = false,
}: IMediaLibraryAlbumsOptions = {}): Promise<IMediaLibraryAlbum[]> {
  return expoMediaLibrary.getAlbumsAsync({ includeSmartAlbums });
}

export async function getAlbumAsync(
  title: string,
): Promise<IMediaLibraryAlbum> {
  if (typeof title !== 'string') {
    throw new Error('Album title must be a string!');
  }
  return expoMediaLibrary.getAlbumAsync(title);
}

/**
 * `asset` (or `initialAssetLocalUri`) is required on Android — an empty album cannot be
 * created on that platform.
 */
export async function createAlbumAsync(
  albumName: string,
  asset?: IMediaLibraryAssetRef,
  copyAsset: boolean = true,
  initialAssetLocalUri?: string,
): Promise<IMediaLibraryAlbum> {
  const assetId = getId(asset);

  if (
    Platform.OS === 'android' &&
    (typeof assetId !== 'string' || assetId.length === 0) &&
    !initialAssetLocalUri
  ) {
    throw new Error(
      'createAlbumAsync must be called with an asset or a localUri on Android.',
    );
  }
  if (!albumName || typeof albumName !== 'string') {
    throw new Error('Invalid argument "albumName". It must be a string!');
  }

  if (Platform.OS === 'ios') {
    return expoMediaLibrary.createAlbumAsync(
      albumName,
      assetId,
      initialAssetLocalUri,
    );
  }
  return expoMediaLibrary.createAlbumAsync(
    albumName,
    assetId,
    !!copyAsset,
    initialAssetLocalUri,
  );
}

/**
 * iOS keeps the assets in the main library unless `deleteAssets` is set; Android always drops
 * an album's assets along with it.
 */
export async function deleteAlbumsAsync(
  albums: IMediaLibraryAlbumRef[] | IMediaLibraryAlbumRef,
  deleteAssets: boolean = false,
): Promise<boolean> {
  const albumIds = arrayize(albums).map(getId);
  assertAlbumIds(albumIds);
  if (Platform.OS === 'android') {
    return expoMediaLibrary.deleteAlbumsAsync(albumIds);
  }
  return expoMediaLibrary.deleteAlbumsAsync(albumIds, !!deleteAssets);
}

// UPSTREAM-BUG(expo): legacy/MediaLibrary.ts's own `arrayize()` passes any array through
// unchanged, so a single `[key, ascending]` tuple in `sortBy` is misread as two independent
// sort keys instead of one pair — the caller must double-nest it (`[[key, ascending]]`) to
// sort by one key ascending. Ported verbatim for parity; see media-library.test.ts.
export async function getAssetsAsync(
  assetsOptions: IMediaLibraryAssetsOptions = {},
): Promise<IMediaLibraryPagedInfo<IMediaLibraryAsset>> {
  const {
    first,
    after,
    album,
    sortBy,
    mediaType,
    createdAfter,
    createdBefore,
    mediaSubtypes,
    resolveWithFullInfo,
  } = assetsOptions;

  if (first != null && first < 0) {
    throw new Error('Option "first" must be a positive integer!');
  }
  const afterId = getId(after);
  if (
    after != null &&
    Platform.OS === 'android' &&
    isNaN(parseInt(afterId as string, 10))
  ) {
    throw new Error('Option "after" must be a valid ID!');
  }

  const mediaTypeList = arrayize(mediaType || [MediaType.photo]);
  mediaTypeList.forEach(assertMediaType);

  return expoMediaLibrary.getAssetsAsync({
    first: first == null ? 20 : first,
    after: afterId,
    album: getId(album),
    sortBy: arrayize(sortBy).map(sortByOptionToString),
    mediaType: mediaTypeList,
    mediaSubtypes: arrayize(mediaSubtypes),
    createdAfter: dateToNumber(createdAfter),
    createdBefore: dateToNumber(createdBefore),
    resolveWithFullInfo: resolveWithFullInfo ?? false,
  });
}

/**
 * @param listener Fired on Android with an empty object; on iOS with a real
 * `MediaLibraryAssetsChangeEvent`, and also whenever the user updates per-asset access via
 * `presentPermissionsPickerAsync()`.
 */
export function addListener(
  listener: (event: IMediaLibraryAssetsChangeEvent) => void,
) {
  return expoMediaLibrary.addListener(
    expoMediaLibrary.CHANGE_LISTENER_NAME,
    (event: unknown) => listener(event as IMediaLibraryAssetsChangeEvent),
  );
}

export function removeAllListeners(): void {
  expoMediaLibrary.removeAllListeners(expoMediaLibrary.CHANGE_LISTENER_NAME);
}

/**
 * A "moment" is a group of assets taken around the same place and time.
 * @platform ios
 */
export async function getMomentsAsync(): Promise<IMediaLibraryAlbum[]> {
  return expoMediaLibrary.getMomentsAsync();
}

/**
 * Moves an album's content into the scoped-storage media directories, only where needed
 * (Android R+, and only if the app lacks write permission to the album folder). No-op on iOS,
 * web, and Android below R, or if the app already has write access.
 */
export async function migrateAlbumIfNeededAsync(
  album: IMediaLibraryAlbumRef,
): Promise<void> {
  if (!expoMediaLibrary.migrateAlbumIfNeededAsync) return;
  return expoMediaLibrary.migrateAlbumIfNeededAsync(getId(album));
}

/** Always `false` on iOS, web, and Android below R. */
export async function albumNeedsMigrationAsync(
  album: IMediaLibraryAlbumRef,
): Promise<boolean> {
  if (!expoMediaLibrary.albumNeedsMigrationAsync) return false;
  return expoMediaLibrary.albumNeedsMigrationAsync(getId(album));
}

/** Adds or removes the asset from the system "Favorites" smart album. @platform ios */
export async function setAssetFavoriteAsync(
  asset: IMediaLibraryAssetRef,
  isFavorite: boolean,
): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    throw new Error('setAssetFavoriteAsync is only available on iOS.');
  }
  const assetId = getId(asset);
  assertAssetIds([assetId]);
  return expoMediaLibrary.setAssetFavoriteAsync(assetId as string, isFavorite);
}
