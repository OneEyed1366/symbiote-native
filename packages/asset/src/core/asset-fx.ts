// Ported from expo-asset/src/Asset.fx.ts (sdk-57). Overrides RN's own Image asset resolution
// for a classic-updates/Expo-Go env — a no-op import in a bare app (IS_ENV_WITH_LOCAL_ASSETS
// is false), imported for its side effect from core/index.ts, matching upstream's own index.ts.
import resolveAssetSource, {
  type ICustomSourceTransformer,
} from 'react-native/Libraries/Image/resolveAssetSource';

import { Asset, ANDROID_EMBEDDED_URL_BASE_RESOURCE } from './asset';
import { IS_ENV_WITH_LOCAL_ASSETS } from './platform-utils';

const expoAssetTransformer: ICustomSourceTransformer = resolver => {
  try {
    if ('fileHashes' in resolver.asset && resolver.asset.fileHashes) {
      const asset = Asset.fromMetadata(resolver.asset);
      if (asset.uri.startsWith(ANDROID_EMBEDDED_URL_BASE_RESOURCE)) {
        return resolver.resourceIdentifierWithoutScale();
      }
      return resolver.fromSource(
        asset.downloaded && asset.localUri ? asset.localUri : asset.uri,
      );
    }
    return resolver.defaultAsset();
  } catch {
    return resolver.defaultAsset();
  }
};

if (IS_ENV_WITH_LOCAL_ASSETS) {
  resolveAssetSource.setCustomSourceTransformer?.(expoAssetTransformer);
}
