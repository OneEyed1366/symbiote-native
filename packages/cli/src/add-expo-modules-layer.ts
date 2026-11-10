import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyExpoModulesAndroidManifest } from './utils/apply-expo-modules-manifest.js';
import { applyExpoModulesInfoPlist } from './utils/apply-expo-modules-plist.js';
import { applyExpoModulesPodfileAutolinking } from './utils/apply-expo-modules-podfile-autolinking.js';
import { applyExpoModulesPodfilePlatform } from './utils/apply-expo-modules-podfile.js';
import { applyExpoModulesXcodeDeploymentTarget } from './utils/apply-expo-modules-xcode-deployment-target.js';
import { mergeLayerFragment } from './utils/merge-layer-fragment.js';

// A layer with native files to reconcile against a real, possibly customized app
// Every `apply-expo-modules-*` util is an idempotent text splice, never a whole-file overlay
// Each is guarded by existence, so an app with no ios/ or android/ tree is left alone
export function applyExpoModulesLayer(root: string): void {
  mergeLayerFragment(root, 'expo-modules');
  if (
    fs.existsSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'))
  ) {
    applyExpoModulesAndroidManifest(root);
  }
  if (fs.existsSync(path.join(root, 'ios'))) {
    applyExpoModulesInfoPlist(root);
    applyExpoModulesPodfilePlatform(root);
    applyExpoModulesPodfileAutolinking(root);
    applyExpoModulesXcodeDeploymentTarget(root);
  }
}
