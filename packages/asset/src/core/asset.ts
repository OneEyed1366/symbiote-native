// Ported from expo-asset/src/Asset.ts (sdk-57), native-only, no Expo Go/expo-updates.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./ts-declarations/react-native-assets.d.ts" />
import { getAssetByID } from '@react-native/assets-registry/registry';
import { Platform } from 'expo-modules-core';
import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';

import { type AssetMetadata, selectAssetSource } from './asset-sources';
import { getFileExtension } from './asset-uris';
import { getLocalAssetUri } from './local-assets';
import { expoAsset } from './native-module';
import { IS_ENV_WITH_LOCAL_ASSETS } from './platform-utils';

export const ANDROID_EMBEDDED_URL_BASE_RESOURCE = 'file:///android_res/';

export type AssetDescriptor = {
  name: string;
  type: string;
  hash?: string | null;
  uri: string;
  width?: number | null;
  height?: number | null;
};

type IDownloadPromiseCallbacks = {
  resolve: () => void;
  reject: (error: Error) => void;
};

/** A locally- or remotely-sourced asset: metadata plus loading/caching facilities. */
export class Asset {
  private static byHash: Record<string, Asset | undefined> = {};
  private static byUri: Record<string, Asset | undefined> = {};

  public name: string;
  public readonly type: string;
  public readonly hash: string | null = null;
  public readonly uri: string;
  public localUri: string | null = null;
  public width: number | null = null;
  public height: number | null = null;
  public downloaded: boolean = false;

  private downloading: boolean = false;
  private downloadCallbacks: IDownloadPromiseCallbacks[] = [];

  constructor({
    name,
    type,
    hash = null,
    uri,
    width,
    height,
  }: AssetDescriptor) {
    this.name = name;
    this.type = type;
    this.hash = hash;
    this.uri = uri;

    if (typeof width === 'number') this.width = width;
    if (typeof height === 'number') this.height = height;

    if (hash) {
      this.localUri = getLocalAssetUri(hash, type);
      if (this.localUri?.startsWith(ANDROID_EMBEDDED_URL_BASE_RESOURCE)) {
        this.uri = this.localUri;
        this.localUri = null;
      } else if (this.localUri) {
        this.downloaded = true;
      }
    }
  }

  static loadAsync(
    moduleId: number | number[] | string | string[],
  ): Promise<Asset[]> {
    const moduleIds = Array.isArray(moduleId) ? moduleId : [moduleId];
    return Promise.all(
      moduleIds.map(id => Asset.fromModule(id).downloadAsync()),
    );
  }

  static fromModule(
    virtualAssetModule:
      number | string | { uri: string; width: number; height: number },
  ): Asset {
    if (typeof virtualAssetModule === 'string') {
      return Asset.fromURI(virtualAssetModule);
    }
    if (
      typeof virtualAssetModule === 'object' &&
      'uri' in virtualAssetModule &&
      typeof virtualAssetModule.uri === 'string'
    ) {
      const extension = getFileExtension(virtualAssetModule.uri);
      return new Asset({
        name: '',
        type: extension.startsWith('.') ? extension.substring(1) : extension,
        hash: null,
        uri: virtualAssetModule.uri,
        width: virtualAssetModule.width,
        height: virtualAssetModule.height,
      });
    }

    const meta = getAssetByID(virtualAssetModule);
    if (!meta) {
      throw new Error(
        `Module "${virtualAssetModule}" is missing from the asset registry`,
      );
    }

    // Outside a managed (Expo Go / expo-updates) env, the moduleId is needed because
    // resolveAssetSource depends on it — a classic-updates env resolves by hash instead.
    if (!IS_ENV_WITH_LOCAL_ASSETS) {
      const resolved = resolveAssetSource(virtualAssetModule);
      if (!resolved) {
        throw new Error(
          `Module "${virtualAssetModule}" could not be resolved to an asset source`,
        );
      }

      const asset = new Asset({
        name: meta.name,
        type: meta.type,
        hash: meta.hash,
        uri: resolved.uri,
        width: meta.width,
        height: meta.height,
      });

      // Android drawable resource names (no scheme) are already usable directly, same as RN's
      // own Image component backward-compat handling.
      if (
        Platform.OS === 'android' &&
        !resolved.uri.includes(':') &&
        (meta.width || meta.height)
      ) {
        asset.localUri = asset.uri;
        asset.downloaded = true;
      }

      Asset.byHash[meta.hash] = asset;
      return asset;
    }

    return Asset.fromMetadata(meta);
  }

  static fromMetadata(meta: AssetMetadata): Asset {
    const existing = Asset.byHash[meta.hash];
    if (existing) return existing;

    const { uri, hash } = selectAssetSource(meta);
    const asset = new Asset({
      name: meta.name,
      type: meta.type,
      hash,
      uri,
      width: meta.width,
      height: meta.height,
    });
    Asset.byHash[meta.hash] = asset;
    return asset;
  }

  static fromURI(uri: string): Asset {
    const existing = Asset.byUri[uri];
    if (existing) return existing;

    let type: string;
    if (uri.indexOf(';base64') > -1) {
      type = uri.split(';')[0]?.split('/')[1] ?? '';
    } else {
      const extension = getFileExtension(uri);
      type = extension.startsWith('.') ? extension.substring(1) : extension;
    }

    const asset = new Asset({ name: '', type, hash: null, uri });
    Asset.byUri[uri] = asset;
    return asset;
  }

  async downloadAsync(): Promise<this> {
    if (this.downloaded) return this;
    if (this.downloading) {
      await new Promise<void>((resolve, reject) => {
        this.downloadCallbacks.push({ resolve, reject });
      });
      return this;
    }
    this.downloading = true;

    try {
      this.localUri = await expoAsset.downloadAsync(
        this.uri,
        this.hash,
        this.type,
      );
      this.downloaded = true;
      this.downloadCallbacks.forEach(({ resolve }) => resolve());
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      this.downloadCallbacks.forEach(({ reject }) => reject(reason));
      throw reason;
    } finally {
      this.downloading = false;
      this.downloadCallbacks = [];
    }
    return this;
  }
}
