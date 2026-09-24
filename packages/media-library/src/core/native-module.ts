import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type {
  IGranularPermission,
  IMediaLibraryAlbum,
  IMediaLibraryAlbumsOptions,
  IMediaLibraryAsset,
  IMediaLibraryAssetInfo,
  IMediaLibraryAssetInfoQueryOptions,
  IMediaLibraryMediaTypeObject,
  IMediaLibraryPagedInfo,
  IMediaLibraryPermissionResponse,
  IMediaLibrarySortByObject,
} from './types';

const EXPO_MEDIA_LIBRARY_MODULE_NAME = 'ExpoMediaLibrary';

export type INativeMediaLibraryModule = {
  MediaType: IMediaLibraryMediaTypeObject;
  SortBy: IMediaLibrarySortByObject;
  CHANGE_LISTENER_NAME: string;
  addListener(
    eventName: string,
    listener: (event: unknown) => void,
  ): EventSubscription;
  removeAllListeners(eventName: string): void;
  requestPermissionsAsync(
    writeOnly: boolean,
    granularPermissions?: IGranularPermission[],
  ): Promise<IMediaLibraryPermissionResponse>;
  getPermissionsAsync(
    writeOnly: boolean,
    granularPermissions?: IGranularPermission[],
  ): Promise<IMediaLibraryPermissionResponse>;
  presentPermissionsPickerAsync?(): Promise<void>;
  createAssetAsync(
    localUri: string,
    albumId?: string,
  ): Promise<IMediaLibraryAsset | IMediaLibraryAsset[]>;
  saveToLibraryAsync(localUri: string): Promise<void>;
  addAssetsToAlbumAsync(
    assetIds: string[],
    albumId: string,
    copy?: boolean,
  ): Promise<boolean>;
  removeAssetsFromAlbumAsync(
    assetIds: string[],
    albumId: string | undefined,
  ): Promise<boolean>;
  deleteAssetsAsync(assetIds: string[]): Promise<boolean>;
  getAssetInfoAsync(
    assetId: string,
    options: IMediaLibraryAssetInfoQueryOptions,
  ): Promise<IMediaLibraryAssetInfo | IMediaLibraryAssetInfo[]>;
  getAssetContentUriAsync(assetId: string): Promise<string>;
  getAlbumsAsync(
    options: IMediaLibraryAlbumsOptions,
  ): Promise<IMediaLibraryAlbum[]>;
  getAlbumAsync(title: string): Promise<IMediaLibraryAlbum>;
  createAlbumAsync(
    albumName: string,
    assetId: string | undefined,
    copyOrInitialUri?: boolean | string,
    initialAssetLocalUri?: string,
  ): Promise<IMediaLibraryAlbum>;
  deleteAlbumsAsync(
    albumIds: string[],
    deleteAssets?: boolean,
  ): Promise<boolean>;
  getAssetsAsync(
    options: Record<string, unknown>,
  ): Promise<IMediaLibraryPagedInfo<IMediaLibraryAsset>>;
  getMomentsAsync(): Promise<IMediaLibraryAlbum[]>;
  migrateAlbumIfNeededAsync?(albumId: string | undefined): Promise<void>;
  albumNeedsMigrationAsync?(albumId: string | undefined): Promise<boolean>;
  setAssetFavoriteAsync(assetId: string, isFavorite: boolean): Promise<boolean>;
};

export const expoMediaLibrary = requireNativeModule<INativeMediaLibraryModule>(
  EXPO_MEDIA_LIBRARY_MODULE_NAME,
);
