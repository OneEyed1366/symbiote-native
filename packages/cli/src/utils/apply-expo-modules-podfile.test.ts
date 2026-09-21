import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyExpoModulesPodfilePlatform } from './apply-expo-modules-podfile.js';

const BASE_PODFILE = `require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")

platform :ios, min_ios_version_supported.to_s

target 'RealApp' do
  use_expo_modules!
end
`;

describe('applyExpoModulesPodfilePlatform', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setupApp(podfileContent: string): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-podfile-'),
    );
    tmpDirs.push(root);
    const iosDir = path.join(root, 'ios');
    fs.mkdirSync(iosDir, { recursive: true });
    fs.writeFileSync(path.join(iosDir, 'Podfile'), podfileContent);
    return root;
  }

  function readPodfile(root: string): string {
    return fs.readFileSync(path.join(root, 'ios', 'Podfile'), 'utf8');
  }

  // why: expo's own podspec (`Expo.podspec`) declares `s.platforms = { :ios => '16.4', ... }` —
  // real-device bug (2026-09-18), `pod install` on a scaffolded app with --expo-modules fails
  // with "CocoaPods could not find compatible versions for pod Expo... required a higher minimum
  // deployment target", because RN's own default (`min_ios_version_supported` = '15.1') is below
  // it and nothing in the expo-modules layer ever raises it. examples/expo-react/ios/Podfile
  // already carries the fix — this backports the same one line to a real app's Podfile.
  it('raises platform :ios to the max of the RN default and 16.4', () => {
    const root = setupApp(BASE_PODFILE);
    applyExpoModulesPodfilePlatform(root);
    expect(readPodfile(root)).toContain(
      'platform :ios, [min_ios_version_supported.to_f, 16.4].max.to_s',
    );
    expect(readPodfile(root)).not.toContain(
      'platform :ios, min_ios_version_supported.to_s',
    );
  });

  it('is idempotent — running it twice leaves exactly one platform line', () => {
    const root = setupApp(BASE_PODFILE);
    applyExpoModulesPodfilePlatform(root);
    applyExpoModulesPodfilePlatform(root);
    expect(readPodfile(root).split('platform :ios').length - 1).toBe(1);
  });

  // A Podfile someone already hand-raised past 16.4 (e.g. for an unrelated pod) must keep ITS
  // number, not get silently lowered back to 16.4.
  it('leaves an already-higher explicit platform version untouched', () => {
    const higher = BASE_PODFILE.replace(
      'platform :ios, min_ios_version_supported.to_s',
      "platform :ios, '18.0'",
    );
    const root = setupApp(higher);
    applyExpoModulesPodfilePlatform(root);
    expect(readPodfile(root)).toContain("platform :ios, '18.0'");
  });

  it('does nothing when there is no ios/Podfile', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-podfile-'),
    );
    tmpDirs.push(root);
    expect(() => applyExpoModulesPodfilePlatform(root)).not.toThrow();
  });
});
