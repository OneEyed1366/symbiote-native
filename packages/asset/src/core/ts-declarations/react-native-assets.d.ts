// RN ships no types for these Flow-only internal modules; upstream expo-asset hand-writes the
// same ambient declarations (src/ts-declarations/react-native-assets.d.ts, sdk-57).
declare module 'react-native/Libraries/Image/AssetSourceResolver' {
  import type { PackagerAsset } from '@react-native/assets-registry/registry';

  export type ResolvedAssetSource = {
    __packager_asset: boolean;
    width?: number | null;
    height?: number | null;
    uri: string;
    scale: number;
  };

  export default class AssetSourceResolver {
    serverUrl: string | null;
    jsbundleUrl: string | null;
    asset: PackagerAsset & { fileHashes?: string[] };

    constructor(
      serverUrl: string | null,
      jsbundleUrl: string | null,
      asset: PackagerAsset,
    );

    isLoadedFromServer(): boolean;
    isLoadedFromFileSystem(): boolean;
    defaultAsset(): ResolvedAssetSource;
    assetServerURL(): ResolvedAssetSource;
    scaledAssetPath(): ResolvedAssetSource;
    scaledAssetURLNearBundle(): ResolvedAssetSource;
    resourceIdentifierWithoutScale(): ResolvedAssetSource;
    drawableFolderInBundle(): ResolvedAssetSource;
    fromSource(source: string): ResolvedAssetSource;

    static pickScale(scales: number[], deviceScale: number): number;
  }
}

declare module 'react-native/Libraries/Image/resolveAssetSource' {
  import type AssetSourceResolver from 'react-native/Libraries/Image/AssetSourceResolver';
  import type { ResolvedAssetSource } from 'react-native/Libraries/Image/AssetSourceResolver';

  export type ICustomSourceTransformer = (
    resolver: AssetSourceResolver,
  ) => ResolvedAssetSource | null | undefined;

  interface IResolveAssetSource {
    (source: unknown): ResolvedAssetSource | null;
    setCustomSourceTransformer?(transformer: ICustomSourceTransformer): void;
  }

  const resolveAssetSource: IResolveAssetSource;
  export default resolveAssetSource;
}

declare module '@react-native/assets-registry/registry' {
  export type PackagerAsset = {
    readonly __packager_asset: boolean;
    readonly fileSystemLocation: string;
    readonly httpServerLocation: string;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly scales: number[];
    readonly hash: string;
    readonly name: string;
    readonly type: string;
  };

  export function registerAsset(asset: PackagerAsset): number;
  // Widened to match upstream's own override — Asset.fromModule's object branch always
  // returns before reaching this call; the extra type only closes a narrowing gap tsc leaves.
  export function getAssetByID(
    assetId: number | { uri: string; width: number; height: number },
  ): PackagerAsset | undefined;
}
