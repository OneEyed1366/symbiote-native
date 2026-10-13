import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';
import type { IAddLayerName } from './types.js';

// One marker dependency per layer, from its own package.json.fragment.json in templates/layers
// It is the dependency `add` itself would have merged in, and each Expo package is its own marker
const LAYER_MARKER_DEPENDENCY: ReadonlyArray<readonly [IAddLayerName, string]> =
  [
    ['navigation', '@symbiote-native/navigation'],
    ['expo-modules', '@symbiote-native/expo-modules-link'],
    ['testing', 'detox'],
    ['slider', '@symbiote-native/slider'],
    ['splash-screen', '@symbiote-native/splash-screen'],
    ['reanimated', '@symbiote-native/reanimated'],
    ...EXPO_PACKAGE_LAYERS.map((layer): readonly [IAddLayerName, string] => [
      layer.id,
      layer.symbiotePackage,
    ]),
  ];

export function detectAddedLayers(
  dependencies: Readonly<Record<string, string>>,
): ReadonlySet<IAddLayerName> {
  return new Set(
    LAYER_MARKER_DEPENDENCY.filter(
      ([, dependencyName]) => dependencyName in dependencies,
    ).map(([layer]) => layer),
  );
}
