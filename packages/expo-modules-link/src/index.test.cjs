'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { patchBuildGradle, patchMainApplication, patchInfoPlist } = require('./index.cjs');

// Trimmed-down fixtures mirroring the real shape of examples/expo-react's android files —
// enough to exercise both anchors (react-android dependency line, ModulesProvider mapOf),
// without the full app boilerplate.
const BUILD_GRADLE_FIXTURE = `dependencies {
    implementation("com.facebook.react:react-android")

    if (hermesEnabled.toBoolean()) {
        implementation("com.facebook.react:hermes-android")
    }
}
`;

const MAIN_APPLICATION_FIXTURE = `package com.canaryexpo

import android.app.Application
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module

private class ExpoModulesProvider : ModulesProvider {
  override fun getModulesMap(): Map<Class<out Module>, String?> = mapOf(
  )
}
`;

// Trimmed to the keys relevant here — real RN Info.plist also has CFBundle*/UI* boilerplate,
// irrelevant to this patcher, which only ever appends before the final closing </dict>.
const INFO_PLIST_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>CanaryExpo</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<false/>
	</dict>
</dict>
</plist>
`;

function makeAppRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-expo-link-test-'));
  fs.mkdirSync(path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'canaryexpo'), {
    recursive: true,
  });
  fs.writeFileSync(path.join(root, 'android', 'app', 'build.gradle'), BUILD_GRADLE_FIXTURE);
  fs.writeFileSync(
    path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'canaryexpo', 'MainApplication.kt'),
    MAIN_APPLICATION_FIXTURE,
  );
  fs.mkdirSync(path.join(root, 'ios', 'CanaryExpo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ios', 'CanaryExpo', 'Info.plist'), INFO_PLIST_FIXTURE);
  return root;
}

const LOCAL_AUTH_MANIFEST = {
  android: {
    gradleProjectName: 'expo-local-authentication',
    modules: [
      {
        importPath: 'expo.modules.localauthentication.LocalAuthenticationModule',
        className: 'LocalAuthenticationModule',
        nativeName: 'ExpoLocalAuthentication',
      },
    ],
  },
};

const SENSORS_MANIFEST = {
  android: {
    gradleProjectName: 'expo-sensors',
    modules: [
      {
        importPath: 'expo.modules.sensors.modules.AccelerometerModule',
        className: 'AccelerometerModule',
        nativeName: 'ExponentAccelerometer',
      },
      {
        importPath: 'expo.modules.sensors.modules.BarometerModule',
        className: 'BarometerModule',
        nativeName: 'ExpoBarometer',
      },
    ],
  },
};

test('patchBuildGradle inserts the dependency line once and is idempotent', () => {
  const appRoot = makeAppRoot();
  const gradlePath = path.join(appRoot, 'android', 'app', 'build.gradle');

  patchBuildGradle(appRoot, LOCAL_AUTH_MANIFEST);
  const afterFirst = fs.readFileSync(gradlePath, 'utf8');
  assert.match(afterFirst, /implementation project\(':expo-local-authentication'\)/);
  assert.equal((afterFirst.match(/expo-local-authentication/g) || []).length, 1);

  patchBuildGradle(appRoot, LOCAL_AUTH_MANIFEST);
  const afterSecond = fs.readFileSync(gradlePath, 'utf8');
  assert.equal(afterSecond, afterFirst, 're-running must be a no-op');
});

test('patchBuildGradle preserves existing content and supports multiple packages', () => {
  const appRoot = makeAppRoot();
  const gradlePath = path.join(appRoot, 'android', 'app', 'build.gradle');

  patchBuildGradle(appRoot, LOCAL_AUTH_MANIFEST);
  patchBuildGradle(appRoot, SENSORS_MANIFEST);
  const content = fs.readFileSync(gradlePath, 'utf8');

  assert.match(content, /expo-local-authentication/);
  assert.match(content, /expo-sensors/);
  assert.match(content, /hermesEnabled\.toBoolean\(\)/, 'must not touch unrelated existing content');
});

test('patchMainApplication adds import + map entry and is idempotent', () => {
  const appRoot = makeAppRoot();
  const filePath = path.join(
    appRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'canaryexpo',
    'MainApplication.kt',
  );

  patchMainApplication(appRoot, LOCAL_AUTH_MANIFEST);
  const afterFirst = fs.readFileSync(filePath, 'utf8');
  assert.match(afterFirst, /import expo\.modules\.localauthentication\.LocalAuthenticationModule/);
  assert.match(
    afterFirst,
    /LocalAuthenticationModule::class\.java to "ExpoLocalAuthentication",/,
  );

  patchMainApplication(appRoot, LOCAL_AUTH_MANIFEST);
  const afterSecond = fs.readFileSync(filePath, 'utf8');
  assert.equal(afterSecond, afterFirst, 're-running must be a no-op');
});

test('patchInfoPlist inserts the permission string once and is idempotent', () => {
  const appRoot = makeAppRoot();
  const plistPath = path.join(appRoot, 'ios', 'CanaryExpo', 'Info.plist');
  const manifest = {
    ios: { infoPlistKeys: { NSFaceIDUsageDescription: 'CanaryExpo uses Face ID to demo @symbiote-native/local-auth.' } },
  };

  patchInfoPlist(appRoot, manifest);
  const afterFirst = fs.readFileSync(plistPath, 'utf8');
  assert.match(afterFirst, /<key>NSFaceIDUsageDescription<\/key>/);
  assert.match(afterFirst, /<string>CanaryExpo uses Face ID to demo @symbiote-native\/local-auth\.<\/string>/);
  // Must land inside the OUTER dict, after the nested NSAppTransportSecurity dict closes.
  assert.ok(afterFirst.indexOf('NSFaceIDUsageDescription') > afterFirst.indexOf('NSAllowsArbitraryLoads'));

  patchInfoPlist(appRoot, manifest);
  const afterSecond = fs.readFileSync(plistPath, 'utf8');
  assert.equal(afterSecond, afterFirst, 're-running must be a no-op');
});

test('patchInfoPlist supports multiple packages and preserves existing keys', () => {
  const appRoot = makeAppRoot();
  const plistPath = path.join(appRoot, 'ios', 'CanaryExpo', 'Info.plist');

  patchInfoPlist(appRoot, {
    ios: { infoPlistKeys: { NSFaceIDUsageDescription: 'uses Face ID' } },
  });
  patchInfoPlist(appRoot, {
    ios: { infoPlistKeys: { NSMotionUsageDescription: 'reads motion data' } },
  });

  const content = fs.readFileSync(plistPath, 'utf8');
  assert.match(content, /<key>NSFaceIDUsageDescription<\/key>/);
  assert.match(content, /<key>NSMotionUsageDescription<\/key>/);
  assert.match(content, /<key>CFBundleDisplayName<\/key>/, 'must preserve pre-existing keys');
});

test('patchMainApplication supports multiple modules from the same package and preserves existing imports', () => {
  const appRoot = makeAppRoot();
  const filePath = path.join(
    appRoot,
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'canaryexpo',
    'MainApplication.kt',
  );

  patchMainApplication(appRoot, SENSORS_MANIFEST);
  const content = fs.readFileSync(filePath, 'utf8');

  assert.match(content, /import expo\.modules\.sensors\.modules\.AccelerometerModule/);
  assert.match(content, /import expo\.modules\.sensors\.modules\.BarometerModule/);
  assert.match(content, /AccelerometerModule::class\.java to "ExponentAccelerometer",/);
  assert.match(content, /BarometerModule::class\.java to "ExpoBarometer",/);
  assert.match(content, /import expo\.modules\.kotlin\.ModulesProvider/, 'must preserve pre-existing imports');
});

function patchInSubprocess(appRoot, manifest) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, 'test-fixtures', 'patch-child.cjs'), appRoot, JSON.stringify(manifest)],
      { stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`patch-child exited ${code}`))));
  });
}

// Reproduces the real npm failure mode: N sibling packages' postinstall scripts run as N
// separate OS processes, all racing to patch the same build.gradle/MainApplication.kt. Without
// the file lock in index.cjs, this reliably lost entries (2 of 6 packages missing on a real
// `npm install`, see the symbiote-expo-native-module skill's write-up of the incident).
test('concurrent patches from separate processes do not lose entries', async () => {
  const appRoot = makeAppRoot();
  const gradlePath = path.join(appRoot, 'android', 'app', 'build.gradle');
  const mainApplicationPath = path.join(
    appRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'canaryexpo', 'MainApplication.kt',
  );

  const manifests = Array.from({ length: 8 }, (_, i) => ({
    android: {
      gradleProjectName: `expo-concurrent-${i}`,
      modules: [
        {
          importPath: `expo.modules.concurrent${i}.Concurrent${i}Module`,
          className: `Concurrent${i}Module`,
          nativeName: `ExpoConcurrent${i}`,
        },
      ],
    },
  }));

  await Promise.all(manifests.map((manifest) => patchInSubprocess(appRoot, manifest)));

  const gradleContent = fs.readFileSync(gradlePath, 'utf8');
  const mainApplicationContent = fs.readFileSync(mainApplicationPath, 'utf8');

  for (let i = 0; i < manifests.length; i += 1) {
    assert.match(
      gradleContent,
      new RegExp(`implementation project\\(':expo-concurrent-${i}'\\)`),
      `build.gradle is missing package ${i} — a concurrent write clobbered it`,
    );
    assert.match(
      mainApplicationContent,
      new RegExp(`Concurrent${i}Module::class\\.java to "ExpoConcurrent${i}",`),
      `MainApplication.kt is missing package ${i} — a concurrent write clobbered it`,
    );
  }
});
