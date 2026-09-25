import * as fs from 'node:fs';
import * as path from 'node:path';

// `use_native_modules!` only autolinks React Native's own modules. Expo modules need a SEPARATE
// mechanism the base Podfile never wires: requiring `expo/scripts/autolinking` and calling
// `use_expo_modules!`, or CocoaPods never sets up ExpoModulesCore's header search path.
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
