'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  linkApp,
  collectManifests,
  patchBuildGradle,
  patchMainApplication,
  patchInfoPlist,
} = require('./index.cjs');

// Trimmed to exercise every anchor: the react-android dependency line, the last import, the
// ModulesProvider mapOf, and the closing </dict>.
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
  ios: { infoPlistKeys: { NSFaceIDUsageDescription: 'CanaryExpo uses Face ID to demo local-auth.' } },
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

const GRADLE_PATH = ['android', 'app', 'build.gradle'];
const MAIN_APP_PATH = ['android', 'app', 'src', 'main', 'java', 'com', 'canaryexpo', 'MainApplication.kt'];
const PLIST_PATH = ['ios', 'CanaryExpo', 'Info.plist'];

function makeAppRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-expo-link-test-'));
  fs.mkdirSync(path.join(root, ...MAIN_APP_PATH.slice(0, -1)), { recursive: true });
  fs.writeFileSync(path.join(root, ...GRADLE_PATH), BUILD_GRADLE_FIXTURE);
  fs.writeFileSync(path.join(root, ...MAIN_APP_PATH), MAIN_APPLICATION_FIXTURE);
  fs.mkdirSync(path.join(root, ...PLIST_PATH.slice(0, -1)), { recursive: true });
  fs.writeFileSync(path.join(root, ...PLIST_PATH), INFO_PLIST_FIXTURE);
  return root;
}

// Materialises a manifest the way a package manager would, so collectManifests and linkApp run
// against a real directory layout rather than a stubbed list.
function installPackage(appRoot, packageName, manifest) {
  const packageDir = path.join(appRoot, 'node_modules', ...packageName.split('/'));
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'native-link.json'), JSON.stringify(manifest));
  return packageDir;
}

function read(appRoot, segments) {
  return fs.readFileSync(path.join(appRoot, ...segments), 'utf8');
}

function entriesOf(...manifests) {
  return manifests.map((manifest, i) => ({ packageName: `pkg-${i}`, manifest }));
}

test('collectManifests finds scoped and unscoped packages, sorted, ignoring the rest', () => {
  const appRoot = makeAppRoot();
  installPackage(appRoot, '@symbiote-native/sensors', SENSORS_MANIFEST);
  installPackage(appRoot, '@symbiote-native/local-auth', LOCAL_AUTH_MANIFEST);
  installPackage(appRoot, 'legacy-native-wrapper', SENSORS_MANIFEST);
  fs.mkdirSync(path.join(appRoot, 'node_modules', 'react'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'node_modules', '.bin'), { recursive: true });

  const found = collectManifests(appRoot);

  assert.deepEqual(
    found.map((entry) => entry.packageName),
    ['@symbiote-native/local-auth', '@symbiote-native/sensors', 'legacy-native-wrapper'],
    'sorted by package name, and packages without a native-link.json are skipped',
  );
});

test('collectManifests skips a package whose manifest is malformed instead of throwing', () => {
  const appRoot = makeAppRoot();
  const brokenDir = installPackage(appRoot, '@symbiote-native/broken', SENSORS_MANIFEST);
  fs.writeFileSync(path.join(brokenDir, 'native-link.json'), '{ not json');
  installPackage(appRoot, '@symbiote-native/local-auth', LOCAL_AUTH_MANIFEST);

  const found = collectManifests(appRoot);

  assert.deepEqual(found.map((entry) => entry.packageName), ['@symbiote-native/local-auth']);
});

test('patchBuildGradle generates a sorted dependency region and is byte-stable on re-run', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(SENSORS_MANIFEST, LOCAL_AUTH_MANIFEST);

  patchBuildGradle(appRoot, entries);
  const afterFirst = read(appRoot, GRADLE_PATH);

  assert.match(afterFirst, /implementation project\(':expo-local-authentication'\)/);
  assert.match(afterFirst, /implementation project\(':expo-sensors'\)/);
  assert.ok(
    afterFirst.indexOf('expo-local-authentication') < afterFirst.indexOf("':expo-sensors'"),
    'entries are emitted in sorted order regardless of manifest order',
  );
  assert.match(afterFirst, /hermesEnabled\.toBoolean\(\)/, 'must not touch unrelated existing content');

  patchBuildGradle(appRoot, entries);
  assert.equal(read(appRoot, GRADLE_PATH), afterFirst, 're-running must be a no-op');
});

// The point of owning a region instead of appending: a leftover `implementation project(...)`
// for an uninstalled package fails the Gradle build.
test('patchBuildGradle drops the entry of a package that is no longer installed', () => {
  const appRoot = makeAppRoot();

  patchBuildGradle(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));
  assert.match(read(appRoot, GRADLE_PATH), /expo-sensors/);

  patchBuildGradle(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  const after = read(appRoot, GRADLE_PATH);

  assert.doesNotMatch(after, /expo-sensors/, 'the removed package must disappear from the region');
  assert.match(after, /expo-local-authentication/, 'the remaining package stays');
});

test('patchMainApplication generates both regions, sorted, and is byte-stable on re-run', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(SENSORS_MANIFEST, LOCAL_AUTH_MANIFEST);

  patchMainApplication(appRoot, entries);
  const afterFirst = read(appRoot, MAIN_APP_PATH);

  assert.match(afterFirst, /^import expo\.modules\.localauthentication\.LocalAuthenticationModule$/m);
  assert.match(afterFirst, /^import expo\.modules\.sensors\.modules\.AccelerometerModule$/m);
  assert.match(afterFirst, /AccelerometerModule::class\.java to "ExponentAccelerometer",/);
  assert.match(afterFirst, /LocalAuthenticationModule::class\.java to "ExpoLocalAuthentication",/);
  assert.match(afterFirst, /import expo\.modules\.kotlin\.ModulesProvider/, 'pre-existing imports survive');
  assert.ok(
    afterFirst.indexOf('AccelerometerModule::class') < afterFirst.indexOf('BarometerModule::class'),
    'map entries are sorted',
  );

  patchMainApplication(appRoot, entries);
  assert.equal(read(appRoot, MAIN_APP_PATH), afterFirst, 're-running must be a no-op');
});

test('patchMainApplication drops the import and map entry of an uninstalled package', () => {
  const appRoot = makeAppRoot();

  patchMainApplication(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));
  assert.match(read(appRoot, MAIN_APP_PATH), /AccelerometerModule/);

  patchMainApplication(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  const after = read(appRoot, MAIN_APP_PATH);

  assert.doesNotMatch(after, /AccelerometerModule/);
  assert.match(after, /LocalAuthenticationModule::class\.java to "ExpoLocalAuthentication",/);
});

// The marker pair is the contract: everything outside it belongs to the developer.
test('patchMainApplication leaves hand-written code above and below the regions untouched', () => {
  const appRoot = makeAppRoot();
  const filePath = path.join(appRoot, ...MAIN_APP_PATH);
  fs.writeFileSync(
    filePath,
    MAIN_APPLICATION_FIXTURE.replace(
      '  override fun getModulesMap',
      '  private val handWritten = "keep me"\n\n  override fun getModulesMap',
    ).replace('import android.app.Application', 'import android.app.Application\nimport com.example.HandPicked'),
  );

  patchMainApplication(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  patchMainApplication(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));
  const content = fs.readFileSync(filePath, 'utf8');

  assert.match(content, /private val handWritten = "keep me"/);
  assert.match(content, /^import com\.example\.HandPicked$/m);
});

test('a BEGIN marker with its END deleted by hand is refused, not guessed at', () => {
  const appRoot = makeAppRoot();
  patchBuildGradle(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));

  const gradlePath = path.join(appRoot, ...GRADLE_PATH);
  const mutilated = fs
    .readFileSync(gradlePath, 'utf8')
    .split('\n')
    .filter((line) => !line.includes('SYMBIOTE-EXPO-LINK:END'))
    .join('\n');
  fs.writeFileSync(gradlePath, mutilated);

  patchBuildGradle(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));

  assert.equal(fs.readFileSync(gradlePath, 'utf8'), mutilated, 'must not touch a file with a broken region');
});

test('patchInfoPlist inserts each permission string once, inside the outer dict', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(LOCAL_AUTH_MANIFEST, {
    ios: { infoPlistKeys: { NSMotionUsageDescription: 'reads motion data' } },
  });

  patchInfoPlist(appRoot, entries);
  const afterFirst = read(appRoot, PLIST_PATH);

  assert.match(afterFirst, /<key>NSFaceIDUsageDescription<\/key>/);
  assert.match(afterFirst, /<key>NSMotionUsageDescription<\/key>/);
  assert.match(afterFirst, /<key>CFBundleDisplayName<\/key>/, 'pre-existing keys survive');
  assert.ok(
    afterFirst.indexOf('NSFaceIDUsageDescription') > afterFirst.indexOf('NSAllowsArbitraryLoads'),
    'lands in the OUTER dict, after the nested NSAppTransportSecurity dict closes',
  );

  patchInfoPlist(appRoot, entries);
  assert.equal(read(appRoot, PLIST_PATH), afterFirst, 're-running must be a no-op');
});

// An unescaped `&` or `<` produces a plist no parser will read, and it surfaces as an opaque
// build error far from its cause.
test('patchInfoPlist escapes XML metacharacters in a description', () => {
  const appRoot = makeAppRoot();

  patchInfoPlist(appRoot, entriesOf({
    ios: { infoPlistKeys: { NSCameraUsageDescription: 'Scan R&D badges <fast> & often' } },
  }));
  const content = read(appRoot, PLIST_PATH);

  assert.match(content, /<string>Scan R&amp;D badges &lt;fast&gt; &amp; often<\/string>/);
  assert.doesNotMatch(content, /<string>Scan R&D/, 'the raw ampersand must not survive');
});

// Deliberate policy, not an oversight: a permission description is user-facing App Store copy,
// so a hand-edit outranks a package default. Drift is reported rather than silently applied.
test('patchInfoPlist keeps a hand-edited description instead of overwriting it', () => {
  const appRoot = makeAppRoot();
  const plistPath = path.join(appRoot, ...PLIST_PATH);

  patchInfoPlist(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  fs.writeFileSync(
    plistPath,
    fs.readFileSync(plistPath, 'utf8').replace(
      '<string>CanaryExpo uses Face ID to demo local-auth.</string>',
      '<string>Hand-written copy the store approved.</string>',
    ),
  );

  patchInfoPlist(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  const content = fs.readFileSync(plistPath, 'utf8');

  assert.match(content, /<string>Hand-written copy the store approved\.<\/string>/);
  assert.doesNotMatch(content, /demo local-auth/);
});

test('linkApp wires every installed package end to end from one scan', () => {
  const appRoot = makeAppRoot();
  installPackage(appRoot, '@symbiote-native/local-auth', LOCAL_AUTH_MANIFEST);
  installPackage(appRoot, '@symbiote-native/sensors', SENSORS_MANIFEST);

  linkApp(appRoot);

  assert.match(read(appRoot, GRADLE_PATH), /implementation project\(':expo-sensors'\)/);
  assert.match(read(appRoot, MAIN_APP_PATH), /BarometerModule::class\.java to "ExpoBarometer",/);
  assert.match(read(appRoot, PLIST_PATH), /<key>NSFaceIDUsageDescription<\/key>/);

  const snapshot = [GRADLE_PATH, MAIN_APP_PATH, PLIST_PATH].map((segments) => read(appRoot, segments));
  linkApp(appRoot);
  assert.deepEqual(
    [GRADLE_PATH, MAIN_APP_PATH, PLIST_PATH].map((segments) => read(appRoot, segments)),
    snapshot,
    'a second full run changes nothing',
  );
});

test('linkApp on an app with no linkable packages leaves empty regions, not junk', () => {
  const appRoot = makeAppRoot();
  fs.mkdirSync(path.join(appRoot, 'node_modules'), { recursive: true });

  linkApp(appRoot);
  const gradle = read(appRoot, GRADLE_PATH);

  assert.match(gradle, /SYMBIOTE-EXPO-LINK:BEGIN DEPENDENCIES/);
  assert.match(gradle, /SYMBIOTE-EXPO-LINK:END DEPENDENCIES/);
  assert.doesNotMatch(gradle, /implementation project/);
  assert.match(gradle, /hermesEnabled\.toBoolean\(\)/);
});
