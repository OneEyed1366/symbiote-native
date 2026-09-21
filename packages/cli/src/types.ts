import type { IExpoPackageLayerName } from './expo-package-layers.js';

export type IFramework = 'react' | 'vue' | 'angular' | 'solid' | 'svelte';

// Vue has two real JS flavors in templates/js/ (vue-tsx / vue-sfc) — a separate axis from
// IFramework, only meaningful when framework === 'vue'.
export type IVueFlavor = 'tsx' | 'sfc';

export type IPackageManager = 'npm' | 'pnpm' | 'yarn';

// How the scaffolded App styles itself. 'css'/'scss'/'less'/'stylus' are one code shape (an
// external stylesheet + a plain class name) that differs only by file extension — scss/less/
// stylus are handled as a post-render rename + import-path rewrite in generate.ts rather than
// separate template files, since a single flat rule is byte-identical across all four languages.
// 'css-modules' and 'stylesheet' are genuinely different code (scoped class object / StyleSheet.
// create) and get their own template overrides under templates/styling/js/<framework>/<option>/
// — kept OUTSIDE templates/js/<framework> so the base layer's recursive copy never ships them.
export type IStylingOption =
  'css' | 'scss' | 'less' | 'stylus' | 'css-modules' | 'stylesheet';

// The optional layers `add` can extend an EXISTING @symbiote-native/* app with — the same set
// `new` offers. IExpoPackageLayerName (application/battery/sensors/…) folds in here too — each
// one is a dependency-only layer exactly like `slider`, just Expo-backed.
export type IAddLayerName =
  | 'expo-modules'
  | 'navigation'
  | 'testing'
  | 'slider'
  | 'splash-screen'
  | IExpoPackageLayerName;
