import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';
import type { IAddLayerName } from './types.js';

// One marker dependency per layer, taken from that layer's own package.json.fragment.json
// (templates/layers/<name>) — the same dependency `add` itself would just have merged in. Every
// EXPO_PACKAGE_LAYERS entry folds in here too — each one's own symbiotePackage IS its marker.
const LAYER_MARKER_DEPENDENCY: ReadonlyArray<readonly [IAddLayerName, string]> =
  [
    ['navigation', '@symbiote-native/navigation'],
    ['expo-modules', '@symbiote-native/expo-modules-link'],
    ['testing', 'detox'],
    ['slider', '@symbiote-native/slider'],
    ['splash-screen', '@symbiote-native/splash-screen'],
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
