// Ported from expo-asset/src/AssetSources.ts (sdk-57) — full parity, manifest2 branch included.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./ts-declarations/react-native-assets.d.ts" />
import type { PackagerAsset } from '@react-native/assets-registry/registry';
import { Platform } from 'expo-modules-core';
import { NativeModules, PixelRatio } from 'react-native';
import AssetSourceResolver from 'react-native/Libraries/Image/AssetSourceResolver';

import { getManifest2, manifestBaseUrl } from './platform-utils';

export type AssetMetadata = Pick<
  PackagerAsset,
  | 'httpServerLocation'
  | 'name'
  | 'hash'
  | 'type'
  | 'scales'
  | 'width'
  | 'height'
> & {
  uri?: string;
  fileHashes?: string[];
  fileUris?: string[];
};

export type AssetSource = { uri: string; hash: string };

/** Resolves a relative asset URI against the classic-updates manifest base, if any. */
export function resolveUri(uri: string): string {
  return manifestBaseUrl ? new URL(uri, manifestBaseUrl).href : uri;
}

export function selectAssetSource(meta: AssetMetadata): AssetSource {
  const scale = AssetSourceResolver.pickScale(meta.scales, PixelRatio.get());
  const index = meta.scales.findIndex(s => s === scale);
  const hash = meta.fileHashes?.[index] ?? meta.fileHashes?.[0] ?? meta.hash;

  const uri = meta.fileUris
    ? (meta.fileUris[index] ?? meta.fileUris[0])
    : meta.uri;
  if (uri) {
    return { uri: resolveUri(uri), hash };
  }

  const fileScale = scale === 1 ? '' : `@${scale}x`;
  const fileExtension = meta.type ? `.${encodeURIComponent(meta.type)}` : '';
  const suffix = `/${encodeURIComponent(meta.name)}${fileScale}${fileExtension}`;
  const params = new URLSearchParams({
    platform: Platform.OS,
    hash: meta.hash,
  });

  if (/^https?:\/\//.test(meta.httpServerLocation)) {
    return { uri: meta.httpServerLocation + suffix + '?' + params, hash };
  }

  const manifest2 = getManifest2();
  const scheme = manifestBaseUrl?.startsWith('https://')
    ? 'https://'
    : 'http://';
  const devServerUrl = manifest2?.extra?.expoGo?.developer
    ? scheme + manifest2.extra.expoGo.debuggerHost
    : null;
  if (devServerUrl) {
    const baseUrl = new URL(meta.httpServerLocation + suffix, devServerUrl);
    baseUrl.searchParams.set('platform', Platform.OS);
    baseUrl.searchParams.set('hash', meta.hash);
    return { uri: baseUrl.href, hash };
  }

  if (NativeModules['ExponentKernel']) {
    return {
      uri: `https://classic-assets.eascdn.net/~assets/${encodeURIComponent(hash)}`,
      hash,
    };
  }

  // Locally available on disk (classic-updates embedded asset): no remote URL to build.
  return { uri: '', hash };
}
