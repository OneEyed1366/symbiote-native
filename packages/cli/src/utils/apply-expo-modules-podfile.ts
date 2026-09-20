import * as fs from 'node:fs';
import * as path from 'node:path';

// expo's own podspec declares `s.platforms = { :ios => '16.4', ... }` — RN's own Podfile default
// (`platform :ios, min_ios_version_supported.to_s`, currently '15.1') sits below that, so `pod
// install` fails with "could not find compatible versions for pod Expo... required a higher
// minimum deployment target" the moment the expo-modules layer's `expo` dependency lands.
// examples/expo-react/ios/Podfile already carries the fix (`[min_ios_version_supported.to_f,
// 16.4].max.to_s`) — this backports the same one line onto a real app's Podfile, idempotently,
// and never lowers an already-higher explicit version a developer set by hand.
const DEFAULT_PLATFORM_LINE = 'platform :ios, min_ios_version_supported.to_s';
const RAISED_PLATFORM_LINE =
  'platform :ios, [min_ios_version_supported.to_f, 16.4].max.to_s';

export function applyExpoModulesPodfilePlatform(root: string): void {
  const podfilePath = path.join(root, 'ios', 'Podfile');
  if (!fs.existsSync(podfilePath)) return;

  const podfile = fs.readFileSync(podfilePath, 'utf8');
  if (!podfile.includes(DEFAULT_PLATFORM_LINE)) return;

  fs.writeFileSync(
    podfilePath,
    podfile.replace(DEFAULT_PLATFORM_LINE, RAISED_PLATFORM_LINE),
  );
}
