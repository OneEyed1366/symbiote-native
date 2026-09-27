import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type {
  AssetField,
  IAssetFieldValueMap,
  IAssetInfo,
  IAssetMetadata,
  ISortDescriptor,
} from './types';

// `declare class` (matching upstream's own ExpoMediaLibraryNext.ts pattern), not a flat object
// type with a self-referential `new(...): T` construct signature — the latter makes TypeScript
// report spurious `override` errors on the JS classes that `extends` these
// (packages/file-system/src/next/native-module.ts carries the same note, found the hard way there).

// Every chained filter method returns `this`, not the concrete `NativeMediaLibraryQuery` type
// upstream's own ambient declaration uses (harmless for them - they never subclass `Query`).
// Our own `Query` (query.ts) DOES subclass it to override `exe()`, and a `this`-typed return is
// what lets that override survive a chain: `new Query().orderBy(...).limit(...)` would otherwise
// statically widen back to the base `NativeMediaLibraryQuery` after the first chained call,
// silently routing `.exe()` to the base implementation instead of our override.
export declare class NativeMediaLibraryQuery {
  constructor();
  eq<T extends AssetField>(field: T, value: IAssetFieldValueMap[T]): this;
  within<T extends AssetField>(field: T, value: IAssetFieldValueMap[T][]): this;
  gt(field: AssetField, value: number): this;
  gte(field: AssetField, value: number): this;
  lt(field: AssetField, value: number): this;
  lte(field: AssetField, value: number): this;
  limit(limit: number): this;
  offset(offset: number): this;
  orderBy(sortDescriptors: ISortDescriptor | AssetField): this;
  album(album: NativeMediaLibraryAlbum): this;
  exe(): Promise<NativeMediaLibraryAsset[]>;
  exeForMetadata(): Promise<IAssetMetadata[]>;
}

export declare class NativeMediaLibraryAsset {
  constructor(id: string);
  id: string;
  getCreationTime(): Promise<number | null>;
  getDuration(): Promise<number | null>;
  getFilename(): Promise<string>;
  getHeight(): Promise<number>;
  getMediaType(): Promise<string>;
  getMediaSubtypes(): Promise<string[]>;
  getLivePhotoVideoUri(): Promise<string | null>;
  getIsInCloud(): Promise<boolean>;
  getOrientation(): Promise<number | null>;
  getModificationTime(): Promise<number | null>;
  getShape(): Promise<{ width: number; height: number } | null>;
  getUri(): Promise<string>;
  getWidth(): Promise<number>;
  getInfo(): Promise<IAssetInfo>;
  getAlbums(): Promise<NativeMediaLibraryAlbum[]>;
  getLocation(): Promise<{ latitude: number; longitude: number } | null>;
  getExif(): Promise<Record<string, unknown>>;
  delete(): Promise<void>;
  getFavorite(): Promise<boolean>;
  setFavorite(isFavorite: boolean): Promise<void>;
  static create(
    filePath: string,
    album?: NativeMediaLibraryAlbum,
  ): Promise<NativeMediaLibraryAsset>;
  static delete(assets: NativeMediaLibraryAsset[]): Promise<void>;
}

export declare class NativeMediaLibraryAlbum {
  constructor(id: string);
  id: string;
  getAssets(): Promise<NativeMediaLibraryAsset[]>;
  getTitle(): Promise<string>;
  delete(): Promise<void>;
  add(
    assets: NativeMediaLibraryAsset | NativeMediaLibraryAsset[],
  ): Promise<void>;
  removeAssets(assets: NativeMediaLibraryAsset[]): Promise<void>;
  static create(
    name: string,
    assetsRefs: string[] | NativeMediaLibraryAsset[],
    moveAssets?: boolean,
  ): Promise<NativeMediaLibraryAlbum>;
  static delete(
    albums: NativeMediaLibraryAlbum[],
    deleteAssets?: boolean,
  ): Promise<void>;
  static get(title: string): Promise<NativeMediaLibraryAlbum | null>;
  static getAll(): Promise<NativeMediaLibraryAlbum[]>;
}

export type INativeMediaLibraryNextModule = {
  Query: typeof NativeMediaLibraryQuery;
  Asset: typeof NativeMediaLibraryAsset;
  Album: typeof NativeMediaLibraryAlbum;
  getPermissionsAsync(
    writeOnly?: boolean,
    granularPermissions?: string[],
  ): Promise<import('expo-modules-core').PermissionResponse>;
  requestPermissionsAsync(
    writeOnly?: boolean,
    granularPermissions?: string[],
  ): Promise<import('expo-modules-core').PermissionResponse>;
  presentPermissionsPicker(mediaTypes?: string[]): Promise<void>;
  addListener(
    eventName: 'mediaLibraryDidChange',
    listener: (event: {
      hasIncrementalChanges: boolean;
      insertedAssets?: string[];
      deletedAssets?: string[];
      updatedAssets?: string[];
    }) => void,
  ): EventSubscription;
  removeAllListeners(eventName: 'mediaLibraryDidChange'): void;
};

export const expoMediaLibraryNext =
  requireNativeModule<INativeMediaLibraryNextModule>('ExpoMediaLibraryNext');
