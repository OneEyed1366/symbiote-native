import * as path from 'node:path';
import type { IExpoPackageLayerName } from './expo-package-layers.js';
import { templatesRoot } from './templates-root.js';
import { ANGULAR_FRAMEWORK, type IFramework } from './types.js';
import { applyExpoModulesAndroidManifest } from './utils/apply-expo-modules-manifest.js';
import { applyExpoModulesPodfileAutolinking } from './utils/apply-expo-modules-podfile-autolinking.js';
import { applyExpoModulesPodfilePlatform } from './utils/apply-expo-modules-podfile.js';
import { applyExpoModulesXcodeDeploymentTarget } from './utils/apply-expo-modules-xcode-deployment-target.js';
import { applyReanimatedLayer } from './utils/apply-reanimated-layer.js';
import { mergeLayerFragment } from './utils/merge-layer-fragment.js';
import { renderTemplate } from './utils/render-template.js';

export type IScaffoldLayerOptions = {
  readonly framework: IFramework;
  readonly hasTypescript: boolean;
  readonly hasExpoModules: boolean;
  readonly hasNavigation: boolean;
  readonly hasTesting: boolean;
  readonly hasSplashScreen: boolean;
  readonly hasSlider: boolean;
  readonly hasReanimated: boolean;
  // Optional, so a call site that only knows the hand-named features keeps compiling
  readonly expoPackages?: ReadonlySet<IExpoPackageLayerName>;
};

const layerRoot = (layerName: string) =>
  path.join(templatesRoot, 'layers', layerName);

// The fragment is merged on its own, not the whole layer dir, as the layer also holds an
// `app/<framework>` subtree and copying all of it would land every framework's folder on the root
function applyNavigation(
  root: string,
  jsTemplateDir: string,
  hasTypescript: boolean,
): void {
  mergeLayerFragment(root, 'navigation');
  renderTemplate(
    path.join(layerRoot('navigation'), 'app', jsTemplateDir),
    root,
    {
      hasTypescript,
    },
  );
}

// The base native/ files ship without react-native-bootsplash wired, which keeps it optional
// This overlay swaps in the with-bootsplash MainActivity.kt, AndroidManifest.xml, styles.xml and
// AppDelegate.swift, and the fragment adds the dependency that makes them compile
function applySplashScreen(root: string): void {
  mergeLayerFragment(root, 'splash-screen');
  renderTemplate(path.join(layerRoot('splash-screen'), 'native'), root);
}

// Angular's e2e:build scripts need an `ngc` pass before Detox builds the native binary
// The e2e/ dir is always TypeScript, as a separate ts-jest project with its own tsconfig
function applyTesting(root: string, framework: IFramework): void {
  const testingRoot = layerRoot('testing');
  const fragmentName = framework === ANGULAR_FRAMEWORK ? 'angular' : 'base';
  renderTemplate(
    path.join(
      testingRoot,
      'fragment',
      fragmentName,
      'package.json.fragment.json',
    ),
    path.join(root, 'package.json.fragment.json'),
  );
  renderTemplate(
    path.join(testingRoot, 'detox.config.js'),
    path.join(root, 'detox.config.js'),
  );
  renderTemplate(path.join(testingRoot, 'e2e'), path.join(root, 'e2e'), {
    hasTypescript: true,
  });
}

// Text splices rather than a manifest overlay: a third overlay would lose `--splash-screen`'s
// BootTheme swap, or the other way round, depending on render order
function applyExpoModulesSplices(root: string): void {
  applyExpoModulesAndroidManifest(root);
  // expo's podspec needs iOS 16.4+, and `pod install` fails outright on RN's default 15.1
  applyExpoModulesPodfilePlatform(root);
  // `use_native_modules!` only autolinks RN's own modules, and Expo's need their own wiring
  // Without it the build fails on `'ExpoModulesCore/Platform.h' file not found`
  applyExpoModulesPodfileAutolinking(root);
  // The Podfile's `platform :ios` only sets the CocoaPods target, not the .xcodeproj's own
  applyExpoModulesXcodeDeploymentTarget(root);
}

// The whole expo-modules dir is copied, not just the fragment, to overlay ios/Canary/Info.plist
// with the Face ID, motion and tracking usage strings, which iOS and App Store review require
export function applyScaffoldLayers(
  root: string,
  options: IScaffoldLayerOptions,
  jsTemplateDir: string,
): void {
  // Any Expo-backed package needs the autolinking that `--expo-modules` gives, whoever set the flag
  const packages = options.expoPackages ?? new Set<IExpoPackageLayerName>();
  const hasExpoModules = options.hasExpoModules || packages.size > 0;

  if (options.hasNavigation) {
    applyNavigation(root, jsTemplateDir, options.hasTypescript);
  }
  if (hasExpoModules) renderTemplate(layerRoot('expo-modules'), root);
  if (options.hasSplashScreen) applySplashScreen(root);
  if (options.hasSlider) mergeLayerFragment(root, 'slider');
  if (options.hasReanimated) applyReanimatedLayer(root);
  // Dependency-only like the slider, one fragment each
  for (const layerName of packages) mergeLayerFragment(root, layerName);
  if (options.hasTesting) applyTesting(root, options.framework);
  if (hasExpoModules) applyExpoModulesSplices(root);
}
