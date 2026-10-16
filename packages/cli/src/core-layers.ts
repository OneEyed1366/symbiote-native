import type { IAddLayerName } from './types.js';

// The hand-named layers, each switched on by one boolean flag of `new` and `add`
// One table feeds the feature prompt, the `add` prompt and the flag-to-layer map
export type ICoreLayerFlag =
  | 'hasNavigation'
  | 'hasExpoModules'
  | 'hasTesting'
  | 'hasSplashScreen'
  | 'hasSlider'
  | 'hasReanimated';

export const CORE_LAYERS = [
  {
    value: 'navigation',
    flag: 'hasNavigation',
    label: 'Navigation',
    hint: '@symbiote-native/navigation',
  },
  {
    value: 'expo-modules',
    flag: 'hasExpoModules',
    label: 'Expo-modules autolinking',
    hint: '@symbiote-native/expo-modules-link',
  },
  {
    value: 'testing',
    flag: 'hasTesting',
    label: 'E2E testing',
    hint: 'Detox',
  },
  {
    value: 'splash-screen',
    flag: 'hasSplashScreen',
    label: 'Splash screen',
    hint: '@symbiote-native/splash-screen',
  },
  {
    value: 'slider',
    flag: 'hasSlider',
    label: 'Slider',
    hint: '@symbiote-native/slider',
  },
  {
    value: 'reanimated',
    flag: 'hasReanimated',
    label: 'Reanimated',
    hint: '@symbiote-native/reanimated',
  },
] as const satisfies ReadonlyArray<{
  readonly value: IAddLayerName;
  readonly flag: ICoreLayerFlag;
  readonly label: string;
  readonly hint: string;
}>;
