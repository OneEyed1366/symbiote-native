import * as fs from 'node:fs';
import * as path from 'node:path';

// CocoaPods' `platform :ios` line only sets the deployment target CocoaPods generates FOR PODS —
// the app's own .xcodeproj target keeps whatever IPHONEOS_DEPLOYMENT_TARGET RN's template set
// (15.1), independent of the Podfile. Real device failure (2026-09-18): `xcodebuild` fails with
// "compiling for iOS 15.1, but module 'ExpoModulesCore' has a minimum deployment target of iOS
// 16.4" even after the Podfile fix, because the APP target itself still targets 15.1.
// examples/expo-react/ios/CanaryExpo.xcodeproj already carries 16.4 in all 4 build configs.
const MIN_EXPO_IOS_VERSION = 16.4;
const DEPLOYMENT_TARGET_LINE = /IPHONEOS_DEPLOYMENT_TARGET = (\d+(?:\.\d+)?);/g;

function findPbxprojPath(root: string): string | undefined {
  const iosDir = path.join(root, 'ios');
  if (!fs.existsSync(iosDir)) return undefined;
  const xcodeproj = fs
    .readdirSync(iosDir)
    .find(entry => entry.endsWith('.xcodeproj'));
  if (!xcodeproj) return undefined;
  const pbxprojPath = path.join(iosDir, xcodeproj, 'project.pbxproj');
  return fs.existsSync(pbxprojPath) ? pbxprojPath : undefined;
}

export function applyExpoModulesXcodeDeploymentTarget(root: string): void {
  const pbxprojPath = findPbxprojPath(root);
  if (!pbxprojPath) return;

  const pbxproj = fs.readFileSync(pbxprojPath, 'utf8');
  const raised = pbxproj.replace(
    DEPLOYMENT_TARGET_LINE,
    (line, version: string) =>
      Number.parseFloat(version) < MIN_EXPO_IOS_VERSION
        ? `IPHONEOS_DEPLOYMENT_TARGET = ${MIN_EXPO_IOS_VERSION};`
        : line,
  );
  if (raised !== pbxproj) fs.writeFileSync(pbxprojPath, raised);
}
