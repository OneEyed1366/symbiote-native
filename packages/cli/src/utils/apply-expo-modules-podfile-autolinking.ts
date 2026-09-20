import * as fs from 'node:fs';
import * as path from 'node:path';

// `use_native_modules!` only autolinks React Native's own native modules. Expo modules
// (ExpoModulesCore/ExpoModulesJSI) are autolinked by a SEPARATE mechanism that the base Podfile
// template never wires: requiring `expo/scripts/autolinking` and calling `use_expo_modules!`
// inside the target. Without it, `Expo.podspec`'s `defined?(use_expo_modules!)` check is false,
// so it never declares its ExpoModulesCore dependency and CocoaPods never sets up that pod's
// header search path — the build then fails with `'ExpoModulesCore/Platform.h' file not found`
// / `could not build Objective-C module 'Expo'`, real device failure (2026-09-18).
const AUTOLINKING_REQUIRE =
  'require File.join(File.dirname(`node --print "require.resolve(\'expo/package.json\')"`), "scripts/autolinking")';
const NATIVE_MODULES_LINE = 'config = use_native_modules!';

export function applyExpoModulesPodfileAutolinking(root: string): void {
  const podfilePath = path.join(root, 'ios', 'Podfile');
  if (!fs.existsSync(podfilePath)) return;

  let podfile = fs.readFileSync(podfilePath, 'utf8');
  if (podfile.includes('use_expo_modules!')) return;

  if (!podfile.includes(AUTOLINKING_REQUIRE)) {
    podfile = `${AUTOLINKING_REQUIRE}\n\n${podfile}`;
  }
  podfile = podfile.replace(
    NATIVE_MODULES_LINE,
    `${NATIVE_MODULES_LINE}\n\n  use_expo_modules!`,
  );

  fs.writeFileSync(podfilePath, podfile);
}
