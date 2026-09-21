// The individually-selectable @symbiote-native/* packages that are thin wrappers over an Expo
// module (expo-modules-core + one expo-<x> package — see each package's own package.json). Every
// one of them is a dependency-only layer, same shape as `slider` (templates/layers/<id>/
// package.json.fragment.json, no native files to overlay — Expo's own autolinking, wired by the
// `expo-modules` layer, does the rest). Kept OUT of `IAddLayerName`'s hand-named layers
// (navigation/testing/splash-screen/slider/expo-modules), which each carry native-file logic this
// list's members don't need.
//
// This table is the single source of truth: cli.ts derives a `--<id>` flag per entry, prompts.ts
// derives a multiselect option per entry, and add-layers.ts's generic dependency-only branch
// already handles any id in here with no per-package code.
export type IExpoPackageLayerName =
  | 'application'
  | 'battery'
  | 'brightness'
  | 'cellular'
  | 'clipboard'
  | 'crypto'
  | 'device'
  | 'haptics'
  | 'keep-awake'
  | 'local-auth'
  | 'localization'
  | 'network'
  | 'screen-orientation'
  | 'secure-store'
  | 'sensors'
  | 'sharing'
  | 'sms'
  | 'standard-web-crypto'
  | 'store-review'
  | 'system-ui'
  | 'tracking-transparency'
  | 'web-browser';

export type IExpoPackageLayer = {
  readonly id: IExpoPackageLayerName;
  readonly label: string;
  readonly symbiotePackage: string;
};

export const EXPO_PACKAGE_LAYERS: readonly IExpoPackageLayer[] = [
  {
    id: 'application',
    label: 'Application info',
    symbiotePackage: '@symbiote-native/application',
  },
  {
    id: 'battery',
    label: 'Battery',
    symbiotePackage: '@symbiote-native/battery',
  },
  {
    id: 'brightness',
    label: 'Brightness',
    symbiotePackage: '@symbiote-native/brightness',
  },
  {
    id: 'cellular',
    label: 'Cellular info',
    symbiotePackage: '@symbiote-native/cellular',
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    symbiotePackage: '@symbiote-native/clipboard',
  },
  { id: 'crypto', label: 'Crypto', symbiotePackage: '@symbiote-native/crypto' },
  {
    id: 'device',
    label: 'Device info',
    symbiotePackage: '@symbiote-native/device',
  },
  {
    id: 'haptics',
    label: 'Haptics',
    symbiotePackage: '@symbiote-native/haptics',
  },
  {
    id: 'keep-awake',
    label: 'Keep awake',
    symbiotePackage: '@symbiote-native/keep-awake',
  },
  {
    id: 'local-auth',
    label: 'Local authentication',
    symbiotePackage: '@symbiote-native/local-auth',
  },
  {
    id: 'localization',
    label: 'Localization',
    symbiotePackage: '@symbiote-native/localization',
  },
  {
    id: 'network',
    label: 'Network info',
    symbiotePackage: '@symbiote-native/network',
  },
  {
    id: 'screen-orientation',
    label: 'Screen orientation',
    symbiotePackage: '@symbiote-native/screen-orientation',
  },
  {
    id: 'secure-store',
    label: 'Secure store',
    symbiotePackage: '@symbiote-native/secure-store',
  },
  {
    id: 'sensors',
    label: 'Sensors',
    symbiotePackage: '@symbiote-native/sensors',
  },
  {
    id: 'sharing',
    label: 'Sharing',
    symbiotePackage: '@symbiote-native/sharing',
  },
  { id: 'sms', label: 'SMS', symbiotePackage: '@symbiote-native/sms' },
  {
    id: 'standard-web-crypto',
    label: 'Web Crypto polyfill',
    symbiotePackage: '@symbiote-native/standard-web-crypto',
  },
  {
    id: 'store-review',
    label: 'Store review prompt',
    symbiotePackage: '@symbiote-native/store-review',
  },
  {
    id: 'system-ui',
    label: 'System UI',
    symbiotePackage: '@symbiote-native/system-ui',
  },
  {
    id: 'tracking-transparency',
    label: 'Tracking transparency',
    symbiotePackage: '@symbiote-native/tracking-transparency',
  },
  {
    id: 'web-browser',
    label: 'Web browser',
    symbiotePackage: '@symbiote-native/web-browser',
  },
];

const EXPO_PACKAGE_LAYER_IDS: ReadonlySet<string> = new Set(
  EXPO_PACKAGE_LAYERS.map(layer => layer.id),
);

export function isExpoPackageLayerName(
  value: string,
): value is IExpoPackageLayerName {
  return EXPO_PACKAGE_LAYER_IDS.has(value);
}
