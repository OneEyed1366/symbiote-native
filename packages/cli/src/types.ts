import type { IExpoPackageLayerName } from './expo-package-layers.js';

export type IFramework = 'react' | 'vue' | 'angular' | 'solid' | 'svelte';

// Angular is the one framework the CLI treats apart: it has no plain-JS mode and its own template
export const ANGULAR_FRAMEWORK = 'angular' satisfies IFramework;

// Vue is the one framework with a flavor to ask about
export const VUE_FRAMEWORK = 'vue' satisfies IFramework;

// Vue has two JS flavors in templates/js/ (vue-tsx, vue-sfc), an axis apart from `IFramework`
export type IVueFlavor = 'tsx' | 'sfc';

export type IPackageManager = 'npm' | 'pnpm' | 'yarn';

// How the scaffolded App styles itself
// `css`, `scss`, `less`, `stylus` share one code shape: generate.ts renames the file and import

// `css-modules` and `stylesheet` are other code, overlaid from templates/styling/js/<fw>/<option>/
// That folder sits outside templates/js/<fw>, so the base copy never ships them
export type IStylingOption =
  'css' | 'scss' | 'less' | 'stylus' | 'css-modules' | 'stylesheet';

// The optional layers `add` can extend an app with, the same set `new` offers
// `IExpoPackageLayerName` folds in too: each is a dependency-only layer like `slider`, Expo-backed
export type IAddLayerName =
  | 'expo-modules'
  | 'navigation'
  | 'testing'
  | 'slider'
  | 'splash-screen'
  | 'reanimated'
  | IExpoPackageLayerName;
