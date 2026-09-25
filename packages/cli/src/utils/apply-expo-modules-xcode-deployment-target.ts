import * as fs from 'node:fs';
import * as path from 'node:path';

// CocoaPods' `platform :ios` line only sets the deployment target FOR PODS — the app's own
// .xcodeproj target keeps whatever IPHONEOS_DEPLOYMENT_TARGET RN's template set, independent of
// the Podfile, so `xcodebuild` fails against ExpoModulesCore's higher minimum unless raised here.
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
