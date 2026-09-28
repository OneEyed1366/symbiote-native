import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyExpoModulesPodfileAutolinking } from './apply-expo-modules-podfile-autolinking.js';

const BASE_PODFILE = `# Resolve react_native_pods.rb with node to allow for hoisting
require Pod::Executable.execute_command('node', ['-p',
  'require.resolve(
    "react-native/scripts/react_native_pods.rb",
    {paths: [process.argv[1]]},
  )', __dir__]).strip

platform :ios, min_ios_version_supported.to_s
prepare_react_native_project!

target 'Canary' do
  config = use_native_modules!

  use_react_native!(
    :path => config[:reactNativePath]
  )
end
`;

describe('applyExpoModulesPodfileAutolinking', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setupApp(podfileContent: string): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-podfile-autolink-'),
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

  // why: `use_native_modules!` only autolinks React Native's own modules — Expo modules need
  // Expo's OWN autolinking, wired by requiring `expo/scripts/autolinking` and calling
  // `use_expo_modules!`, or CocoaPods never sets up ExpoModulesCore's header search path.
  it('requires expo autolinking and calls use_expo_modules! inside the target', () => {
    const root = setupApp(BASE_PODFILE);
    applyExpoModulesPodfileAutolinking(root);
    const podfile = readPodfile(root);
    expect(podfile).toContain(
      `require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")`,
    );
    expect(podfile).toContain('use_expo_modules!');
    // use_expo_modules! must run before use_react_native! (matches examples/expo-react's ordering)
    expect(podfile.indexOf('use_expo_modules!')).toBeLessThan(
      podfile.indexOf('use_react_native!'),
    );
  });

  it('is idempotent — running it twice adds each line exactly once', () => {
    const root = setupApp(BASE_PODFILE);
    applyExpoModulesPodfileAutolinking(root);
    applyExpoModulesPodfileAutolinking(root);
    const podfile = readPodfile(root);
    expect(podfile.split('scripts/autolinking').length - 1).toBe(1);
    expect(podfile.split('use_expo_modules!').length - 1).toBe(1);
  });

  it('leaves a Podfile that already wires use_expo_modules! untouched', () => {
    const already = BASE_PODFILE.replace(
      'config = use_native_modules!',
      'config = use_native_modules!\n\n  use_expo_modules!',
    );
    const root = setupApp(already);
    applyExpoModulesPodfileAutolinking(root);
    const podfile = readPodfile(root);
    expect(podfile.split('use_expo_modules!').length - 1).toBe(1);
  });

  it('does nothing when there is no ios/Podfile', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-podfile-autolink-'),
    );
    tmpDirs.push(root);
    expect(() => applyExpoModulesPodfileAutolinking(root)).not.toThrow();
  });
});
