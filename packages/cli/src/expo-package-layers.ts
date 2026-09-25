import type { ISymbioteExpoLinkOptionalBundle } from '@symbiote-native/expo-modules-link';

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
  | 'asset'
  | 'audio'
  | 'background-fetch'
  | 'background-task'
  | 'battery'
  | 'brightness'
  | 'cellular'
  | 'clipboard'
  | 'crypto'
  | 'device'
  | 'document-picker'
  | 'file-system'
  | 'font'
  | 'haptics'
  | 'image-manipulator'
  | 'image-picker'
  | 'keep-awake'
  | 'local-auth'
  | 'localization'
  | 'location'
  | 'mail-composer'
  | 'media-library'
  | 'network'
  | 'notifications'
  | 'print'
  | 'screen-orientation'
  | 'secure-store'
  | 'sensors'
  | 'sharing'
  | 'sms'
  | 'sqlite'
  | 'standard-web-crypto'
  | 'store-review'
  | 'system-ui'
  | 'task-manager'
  | 'tracking-transparency'
  | 'web-browser';

export type IExpoPackageLayer = {
  readonly id: IExpoPackageLayerName;
  readonly label: string;
  readonly symbiotePackage: string;
  // Mirrors the wrapped package's own native-link.json `android.optionalManifestBundles` —
  // policy-sensitive permissions/services the developer opts into, never applied automatically.
  // Duplicated here (not read from node_modules) because `add`/`new` offer to grant it BEFORE the
  // package is even installed — `applyBundle` only needs the bundle data and the app's own
  // AndroidManifest.xml, neither of which requires node_modules to exist yet. Cross-checked
  // byte-for-byte against the real file in expo-package-layers.test.ts, so this can't silently
  // drift once a package's own bundle changes.
  readonly optionalManifestBundles?: readonly ISymbioteExpoLinkOptionalBundle[];
};

export const EXPO_PACKAGE_LAYERS: readonly IExpoPackageLayer[] = [
  {
    id: 'application',
    label: 'Application info',
    symbiotePackage: '@symbiote-native/application',
  },
  { id: 'asset', label: 'Asset', symbiotePackage: '@symbiote-native/asset' },
  {
    id: 'audio',
    label: 'Audio',
    symbiotePackage: '@symbiote-native/audio',
    optionalManifestBundles: [
      {
        id: 'recording',
        label: 'Background audio recording',
        warning:
          'Requesting FOREGROUND_SERVICE_MICROPHONE triggers Play Console policy review — Google requires a clear, prominent in-app disclosure and justification before you can publish.',
        nextSteps:
          'Pass `allowsBackgroundRecording: true` to setAudioModeAsync so recording keeps running with the app backgrounded.',
        manifestPermissions: [
          'android.permission.FOREGROUND_SERVICE_MICROPHONE',
          'android.permission.POST_NOTIFICATIONS',
        ],
        manifestServices: [
          {
            name: 'expo.modules.audio.service.AudioRecordingService',
            foregroundServiceType: 'microphone',
          },
        ],
      },
    ],
  },
  {
    id: 'background-fetch',
    label: 'Background fetch',
    symbiotePackage: '@symbiote-native/background-fetch',
  },
  {
    id: 'background-task',
    label: 'Background task',
    symbiotePackage: '@symbiote-native/background-task',
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
    id: 'document-picker',
    label: 'Document picker',
    symbiotePackage: '@symbiote-native/document-picker',
  },
  {
    id: 'file-system',
    label: 'File system',
    symbiotePackage: '@symbiote-native/file-system',
  },
  { id: 'font', label: 'Font', symbiotePackage: '@symbiote-native/font' },
  {
    id: 'haptics',
    label: 'Haptics',
    symbiotePackage: '@symbiote-native/haptics',
  },
  {
    id: 'image-manipulator',
    label: 'Image manipulator',
    symbiotePackage: '@symbiote-native/image-manipulator',
  },
  {
    id: 'image-picker',
    label: 'Image picker',
    symbiotePackage: '@symbiote-native/image-picker',
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
    id: 'location',
    label: 'Location',
    symbiotePackage: '@symbiote-native/location',
    optionalManifestBundles: [
      {
        id: 'background',
        label: 'Background location tracking',
        warning:
          'Requesting ACCESS_BACKGROUND_LOCATION and the location foreground-service permissions triggers Play Console policy review — Google requires a clear, prominent in-app disclosure and justification before you can publish.',
        nextSteps:
          "Pass a `foregroundService` option to `startLocationUpdatesAsync` (notification title/body) so the OS keeps tracking alive outside the app. expo-location's own LocationTaskService is already declared in its AndroidManifest.xml and merges automatically — this only adds the permissions it needs.",
        manifestPermissions: [
          'android.permission.ACCESS_BACKGROUND_LOCATION',
          'android.permission.FOREGROUND_SERVICE',
          'android.permission.FOREGROUND_SERVICE_LOCATION',
        ],
      },
    ],
  },
  {
    id: 'mail-composer',
    label: 'Mail composer',
    symbiotePackage: '@symbiote-native/mail-composer',
  },
  {
    id: 'media-library',
    label: 'Media library',
    symbiotePackage: '@symbiote-native/media-library',
  },
  {
    id: 'network',
    label: 'Network info',
    symbiotePackage: '@symbiote-native/network',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    symbiotePackage: '@symbiote-native/notifications',
  },
  {
    id: 'print',
    label: 'Print',
    symbiotePackage: '@symbiote-native/print',
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
  { id: 'sqlite', label: 'SQLite', symbiotePackage: '@symbiote-native/sqlite' },
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
    id: 'task-manager',
    label: 'Task manager',
    symbiotePackage: '@symbiote-native/task-manager',
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

// `new`/`add`'s post-install hint: of the packages just installed, which ones have something to
// `grant` — so the developer hears about it right there instead of having to already know the
// command exists.
export function expoPackagesWithOptionalManifestBundles(
  selected: ReadonlySet<IExpoPackageLayerName> | Iterable<string>,
): IExpoPackageLayer[] {
  const ids = selected instanceof Set ? selected : new Set(selected);
  return EXPO_PACKAGE_LAYERS.filter(
    layer =>
      (layer.optionalManifestBundles?.length ?? 0) > 0 && ids.has(layer.id),
  );
}
