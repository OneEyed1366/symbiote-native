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
  patchAndroidManifest,
  patchAndroidManifestPermissions,
  patchAndroidManifestServices,
  patchMainActivityConfigChanges,
  patchInfoPlist,
  patchInfoPlistArrays,
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

// The "${usesCleartextTraffic}" attribute is RN's own template and deliberately kept: it is why
// the opening tag is scanned for an unquoted ">" instead of matched with a regex.
const ANDROID_MANIFEST_FIXTURE = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />

  <application
    android:name=".MainApplication"
    android:allowBackup="false"
    android:usesCleartextTraffic="\${usesCleartextTraffic}">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>
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

const TASK_MANAGER_MANIFEST = {
  android: {
    gradleProjectName: 'expo-task-manager',
    modules: [
      {
        importPath: 'expo.modules.taskManager.TaskManagerModule',
        className: 'TaskManagerModule',
        nativeName: 'ExpoTaskManager',
      },
    ],
    services: [
      {
        importPath: 'expo.modules.constants.ConstantsService',
        className: 'ConstantsService',
        gradleProjectName: 'expo-constants',
      },
    ],
  },
};

const SECURE_STORE_MANIFEST = {
  android: {
    gradleProjectName: 'expo-secure-store',
    modules: [
      {
        importPath: 'expo.modules.securestore.SecureStoreModule',
        className: 'SecureStoreModule',
        nativeName: 'ExpoSecureStore',
      },
    ],
    manifestApplicationAttributes: {
      'android:dataExtractionRules': '@xml/secure_store_data_extraction_rules',
      'android:fullBackupContent': '@xml/secure_store_backup_rules',
    },
  },
};

const GRADLE_PATH = ['android', 'app', 'build.gradle'];
const MAIN_APP_PATH = ['android', 'app', 'src', 'main', 'java', 'com', 'canaryexpo', 'MainApplication.kt'];
const ANDROID_MANIFEST_PATH = ['android', 'app', 'src', 'main', 'AndroidManifest.xml'];
const PLIST_PATH = ['ios', 'CanaryExpo', 'Info.plist'];

function makeAppRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-expo-link-test-'));
  fs.mkdirSync(path.join(root, ...MAIN_APP_PATH.slice(0, -1)), { recursive: true });
  fs.writeFileSync(path.join(root, ...GRADLE_PATH), BUILD_GRADLE_FIXTURE);
  fs.writeFileSync(path.join(root, ...MAIN_APP_PATH), MAIN_APPLICATION_FIXTURE);
  fs.writeFileSync(path.join(root, ...ANDROID_MANIFEST_PATH), ANDROID_MANIFEST_FIXTURE);
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

test('patchBuildGradle also includes a services entry\'s own gradleProjectName', () => {
  const appRoot = makeAppRoot();

  patchBuildGradle(appRoot, entriesOf(TASK_MANAGER_MANIFEST));
  const content = read(appRoot, GRADLE_PATH);

  assert.match(content, /implementation project\(':expo-task-manager'\)/, 'the primary project still lands');
  assert.match(content, /implementation project\(':expo-constants'\)/, 'the service\'s backing project lands too');
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

test('patchMainApplication generates getServices() with its own import, and is byte-stable on re-run', () => {
  const appRoot = makeAppRoot();

  patchMainApplication(appRoot, entriesOf(TASK_MANAGER_MANIFEST));
  const afterFirst = read(appRoot, MAIN_APP_PATH);

  assert.match(afterFirst, /^import expo\.modules\.constants\.ConstantsService$/m);
  assert.match(afterFirst, /^import expo\.modules\.kotlin\.services\.Service$/m, 'the return type\'s own import lands too');
  assert.match(
    afterFirst,
    /override fun getServices\(\): List<Class<out Service>> = listOf\(\n\s+ConstantsService::class\.java,\n\s*\)/,
  );
  assert.ok(
    afterFirst.indexOf(': ModulesProvider {') < afterFirst.indexOf('getModulesMap'),
    'getServices() is generated above getModulesMap(), inside the class',
  );

  patchMainApplication(appRoot, entriesOf(TASK_MANAGER_MANIFEST));
  assert.equal(read(appRoot, MAIN_APP_PATH), afterFirst, 're-running must be a no-op');
});

test('patchMainApplication regenerates an empty getServices() when no package declares any', () => {
  const appRoot = makeAppRoot();

  patchMainApplication(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  const content = read(appRoot, MAIN_APP_PATH);

  assert.match(content, /override fun getServices\(\): List<Class<out Service>> = listOf\(\n\s*\)/);
});

test('patchMainApplication drops a service\'s import and entry once its package is uninstalled', () => {
  const appRoot = makeAppRoot();

  patchMainApplication(appRoot, entriesOf(TASK_MANAGER_MANIFEST, LOCAL_AUTH_MANIFEST));
  assert.match(read(appRoot, MAIN_APP_PATH), /ConstantsService/);

  patchMainApplication(appRoot, entriesOf(LOCAL_AUTH_MANIFEST));
  const after = read(appRoot, MAIN_APP_PATH);

  assert.doesNotMatch(after, /ConstantsService/);
  assert.match(after, /LocalAuthenticationModule::class\.java to "ExpoLocalAuthentication",/, 'unrelated entries survive');
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

test('patchAndroidManifest adds the application attributes once, keeping the tag intact', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(SECURE_STORE_MANIFEST, LOCAL_AUTH_MANIFEST);

  patchAndroidManifest(appRoot, entries);
  const afterFirst = read(appRoot, ANDROID_MANIFEST_PATH);

  assert.match(afterFirst, /android:fullBackupContent="@xml\/secure_store_backup_rules"/);
  assert.match(afterFirst, /android:dataExtractionRules="@xml\/secure_store_data_extraction_rules"/);
  assert.match(afterFirst, /android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/, 'existing attributes survive');
  assert.match(afterFirst, /<activity android:name="\.MainActivity"/, 'the element body is untouched');
  assert.match(afterFirst, /^    android:fullBackupContent=/m, "follows the tag's own indentation");

  patchAndroidManifest(appRoot, entries);
  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), afterFirst, 're-running must be a no-op');
});

// Same policy as a permission description: the app's own backup rules outrank a package default,
// because overwriting them would silently change what the app backs up.
test('patchAndroidManifest keeps an attribute the app already set', () => {
  const appRoot = makeAppRoot();
  const manifestPath = path.join(appRoot, ...ANDROID_MANIFEST_PATH);
  fs.writeFileSync(
    manifestPath,
    ANDROID_MANIFEST_FIXTURE.replace('android:allowBackup="false"', 'android:fullBackupContent="@xml/my_own_rules"'),
  );

  patchAndroidManifest(appRoot, entriesOf(SECURE_STORE_MANIFEST));
  const content = fs.readFileSync(manifestPath, 'utf8');

  assert.match(content, /android:fullBackupContent="@xml\/my_own_rules"/);
  assert.doesNotMatch(content, /secure_store_backup_rules/);
  assert.match(content, /android:dataExtractionRules="@xml\/secure_store_data_extraction_rules"/, 'the other attribute still lands');
});

test('patchAndroidManifest escapes a quote in a value instead of closing it early', () => {
  const appRoot = makeAppRoot();

  patchAndroidManifest(appRoot, entriesOf({
    android: { manifestApplicationAttributes: { 'android:label': 'The "Best" App' } },
  }));

  assert.match(read(appRoot, ANDROID_MANIFEST_PATH), /android:label="The &quot;Best&quot; App"/);
});

test('patchMainActivityConfigChanges adds the attribute fresh when MainActivity has none', () => {
  const appRoot = makeAppRoot();

  patchMainActivityConfigChanges(appRoot, entriesOf({ android: { mainActivityConfigChanges: ['locale', 'layoutDirection'] } }));
  const afterFirst = read(appRoot, ANDROID_MANIFEST_PATH);

  assert.match(afterFirst, /<activity android:name="\.MainActivity" android:exported="true" android:configChanges="layoutDirection\|locale" \/>/);

  patchMainActivityConfigChanges(appRoot, entriesOf({ android: { mainActivityConfigChanges: ['locale', 'layoutDirection'] } }));
  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), afterFirst, 're-running must be a no-op');
});

test('patchMainActivityConfigChanges unions new tokens into an existing value without duplicating shared ones', () => {
  const appRoot = makeAppRoot();
  const manifestPath = path.join(appRoot, ...ANDROID_MANIFEST_PATH);
  fs.writeFileSync(
    manifestPath,
    ANDROID_MANIFEST_FIXTURE.replace(
      '<activity android:name=".MainActivity" android:exported="true" />',
      '<activity android:name=".MainActivity" android:exported="true" android:configChanges="keyboard|orientation|uiMode" />',
    ),
  );

  patchMainActivityConfigChanges(appRoot, entriesOf({ android: { mainActivityConfigChanges: ['uiMode', 'locale'] } }));
  const content = fs.readFileSync(manifestPath, 'utf8');

  assert.match(content, /android:configChanges="keyboard\|orientation\|uiMode\|locale"/, 'existing tokens survive in order, new one appended');
  assert.equal((content.match(/uiMode/g) || []).length, 1, 'a token already present is not duplicated');
});

test('patchMainActivityConfigChanges does nothing when no package declares any', () => {
  const appRoot = makeAppRoot();
  const before = read(appRoot, ANDROID_MANIFEST_PATH);

  patchMainActivityConfigChanges(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));

  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), before, 'no entry sets mainActivityConfigChanges');
});

test('patchAndroidManifestPermissions unions permissions from every package once, right after <manifest>', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(
    { android: { manifestPermissions: ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_LOCATION'] } },
    { android: { manifestPermissions: ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'] } },
  );

  patchAndroidManifestPermissions(appRoot, entries);
  const afterFirst = read(appRoot, ANDROID_MANIFEST_PATH);

  assert.match(afterFirst, /<uses-permission android:name="android.permission.FOREGROUND_SERVICE" \/>/);
  assert.match(afterFirst, /<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" \/>/);
  assert.match(afterFirst, /<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" \/>/);
  assert.match(afterFirst, /<uses-permission android:name="android.permission.INTERNET" \/>/, 'pre-existing permissions survive');
  assert.ok(
    afterFirst.indexOf('FOREGROUND_SERVICE"') < afterFirst.indexOf('INTERNET'),
    'lands right after <manifest> opens, ahead of whatever was already there',
  );
  assert.equal(
    (afterFirst.match(/FOREGROUND_SERVICE"/g) || []).length,
    1,
    'the permission both entries share is added only once',
  );

  patchAndroidManifestPermissions(appRoot, entries);
  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), afterFirst, 're-running must be a no-op');
});

test('patchAndroidManifestPermissions does nothing when no package declares any', () => {
  const appRoot = makeAppRoot();
  const before = read(appRoot, ANDROID_MANIFEST_PATH);

  patchAndroidManifestPermissions(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));

  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), before, 'no entry sets manifestPermissions');
});

test('patchAndroidManifestPermissions keeps a permission the app already declared', () => {
  const appRoot = makeAppRoot();
  const manifestPath = path.join(appRoot, ...ANDROID_MANIFEST_PATH);
  fs.writeFileSync(
    manifestPath,
    ANDROID_MANIFEST_FIXTURE.replace(
      '<uses-permission android:name="android.permission.INTERNET" />',
      '<uses-permission android:name="android.permission.INTERNET" />\n  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    ),
  );

  patchAndroidManifestPermissions(
    appRoot,
    entriesOf({ android: { manifestPermissions: ['android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_LOCATION'] } }),
  );
  const content = fs.readFileSync(manifestPath, 'utf8');

  assert.equal(
    (content.match(/FOREGROUND_SERVICE"/g) || []).length,
    1,
    'the already-declared permission is not duplicated',
  );
  assert.match(content, /<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" \/>/, 'the missing one still lands');
});

const AUDIO_SERVICE_MANIFEST = {
  android: {
    manifestServices: [
      {
        name: 'expo.modules.audio.service.AudioControlsService',
        foregroundServiceType: 'mediaPlayback',
        intentFilterActions: ['androidx.media3.session.MediaSessionService'],
      },
    ],
  },
};

test('patchAndroidManifestServices adds a service with its intent-filter once, inside <application>', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(AUDIO_SERVICE_MANIFEST);

  patchAndroidManifestServices(appRoot, entries);
  const afterFirst = read(appRoot, ANDROID_MANIFEST_PATH);

  assert.match(
    afterFirst,
    /<service android:name="expo\.modules\.audio\.service\.AudioControlsService" android:exported="false" android:foregroundServiceType="mediaPlayback">/,
  );
  assert.match(
    afterFirst,
    /<action android:name="androidx\.media3\.session\.MediaSessionService" \/>/,
  );
  assert.match(afterFirst, /<activity android:name="\.MainActivity"/, 'the element body already there survives');

  patchAndroidManifestServices(appRoot, entries);
  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), afterFirst, 're-running must be a no-op');
});

test('patchAndroidManifestServices adds a service with no intent-filter as a self-closing tag', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf({
    android: {
      manifestServices: [
        { name: 'expo.modules.audio.service.AudioRecordingService', foregroundServiceType: 'microphone' },
      ],
    },
  });

  patchAndroidManifestServices(appRoot, entries);

  assert.match(
    read(appRoot, ANDROID_MANIFEST_PATH),
    /<service android:name="expo\.modules\.audio\.service\.AudioRecordingService" android:exported="false" android:foregroundServiceType="microphone" \/>/,
  );
});

test('patchAndroidManifestServices does nothing when no package declares any', () => {
  const appRoot = makeAppRoot();
  const before = read(appRoot, ANDROID_MANIFEST_PATH);

  patchAndroidManifestServices(appRoot, entriesOf(LOCAL_AUTH_MANIFEST, SENSORS_MANIFEST));

  assert.equal(read(appRoot, ANDROID_MANIFEST_PATH), before, 'no entry sets manifestServices');
});

test('patchAndroidManifestServices skips a service the app already declared under the same name', () => {
  const appRoot = makeAppRoot();
  const manifestPath = path.join(appRoot, ...ANDROID_MANIFEST_PATH);
  fs.writeFileSync(
    manifestPath,
    ANDROID_MANIFEST_FIXTURE.replace(
      '<activity android:name=".MainActivity" android:exported="true" />',
      '<service android:name="expo.modules.audio.service.AudioControlsService" android:exported="true" />\n    <activity android:name=".MainActivity" android:exported="true" />',
    ),
  );

  patchAndroidManifestServices(appRoot, entriesOf(AUDIO_SERVICE_MANIFEST));
  const content = fs.readFileSync(manifestPath, 'utf8');

  assert.equal(
    (content.match(/AudioControlsService"/g) || []).length,
    1,
    'the hand-written service is not duplicated, even though its attributes differ',
  );
  assert.match(content, /android:exported="true"/, "the app's own version is left untouched");
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

const BACKGROUND_TASK_MANIFEST = {
  android: {
    gradleProjectName: 'expo-background-task',
    modules: [
      {
        importPath: 'expo.modules.backgroundtask.BackgroundTaskModule',
        className: 'BackgroundTaskModule',
        nativeName: 'ExpoBackgroundTask',
      },
    ],
  },
  ios: {
    infoPlistArrayKeys: {
      UIBackgroundModes: ['processing'],
      BGTaskSchedulerPermittedIdentifiers: ['com.expo.modules.backgroundtask.processing'],
    },
  },
};

const BACKGROUND_FETCH_MANIFEST = {
  ios: { infoPlistArrayKeys: { UIBackgroundModes: ['fetch'] } },
};

test('patchInfoPlistArrays creates a new array key in the outer dict', () => {
  const appRoot = makeAppRoot();

  patchInfoPlistArrays(appRoot, entriesOf(BACKGROUND_TASK_MANIFEST));
  const content = read(appRoot, PLIST_PATH);

  assert.match(content, /<key>BGTaskSchedulerPermittedIdentifiers<\/key>\s*<array>\s*<string>com\.expo\.modules\.backgroundtask\.processing<\/string>\s*<\/array>/);
  assert.match(content, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>processing<\/string>\s*<\/array>/);
  assert.match(content, /<key>CFBundleDisplayName<\/key>/, 'pre-existing keys survive');
});

// background-fetch and background-task both want an entry under the SAME UIBackgroundModes
// array — the point of the feature is that both land in one array, not one overwriting the
// other.
test('patchInfoPlistArrays merges items from multiple packages into one array', () => {
  const appRoot = makeAppRoot();

  patchInfoPlistArrays(appRoot, entriesOf(BACKGROUND_TASK_MANIFEST, BACKGROUND_FETCH_MANIFEST));
  const content = read(appRoot, PLIST_PATH);

  const arrayMatch = /<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(content);
  assert.ok(arrayMatch, 'UIBackgroundModes array must exist');
  assert.match(arrayMatch[1], /<string>processing<\/string>/);
  assert.match(arrayMatch[1], /<string>fetch<\/string>/);
});

test('patchInfoPlistArrays appends a missing item to an array the app already declares, keeping the existing one', () => {
  const appRoot = makeAppRoot();
  const plistPath = path.join(appRoot, ...PLIST_PATH);
  fs.writeFileSync(
    plistPath,
    INFO_PLIST_FIXTURE.replace(
      '<key>CFBundleDisplayName</key>',
      '<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>remote-notification</string>\n\t</array>\n\t<key>CFBundleDisplayName</key>',
    ),
  );

  patchInfoPlistArrays(appRoot, entriesOf(BACKGROUND_FETCH_MANIFEST));
  const content = fs.readFileSync(plistPath, 'utf8');

  const arrayMatch = /<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(content);
  assert.match(arrayMatch[1], /<string>remote-notification<\/string>/, 'the app-declared entry survives');
  assert.match(arrayMatch[1], /<string>fetch<\/string>/, 'the package entry is appended');
});

test('patchInfoPlistArrays does not duplicate an item the array already has', () => {
  const appRoot = makeAppRoot();
  const plistPath = path.join(appRoot, ...PLIST_PATH);
  fs.writeFileSync(
    plistPath,
    INFO_PLIST_FIXTURE.replace(
      '<key>CFBundleDisplayName</key>',
      '<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>fetch</string>\n\t</array>\n\t<key>CFBundleDisplayName</key>',
    ),
  );

  patchInfoPlistArrays(appRoot, entriesOf(BACKGROUND_FETCH_MANIFEST));
  const content = fs.readFileSync(plistPath, 'utf8');

  assert.equal((content.match(/<string>fetch<\/string>/g) || []).length, 1);
});

test('patchInfoPlistArrays escapes XML metacharacters in an item', () => {
  const appRoot = makeAppRoot();

  patchInfoPlistArrays(appRoot, entriesOf({
    ios: { infoPlistArrayKeys: { LSApplicationQueriesSchemes: ['a&b'] } },
  }));
  const content = read(appRoot, PLIST_PATH);

  assert.match(content, /<string>a&amp;b<\/string>/);
  assert.doesNotMatch(content, /<string>a&b<\/string>/);
});

test('patchInfoPlistArrays is byte-stable on re-run', () => {
  const appRoot = makeAppRoot();
  const entries = entriesOf(BACKGROUND_TASK_MANIFEST, BACKGROUND_FETCH_MANIFEST);

  patchInfoPlistArrays(appRoot, entries);
  const afterFirst = read(appRoot, PLIST_PATH);

  patchInfoPlistArrays(appRoot, entries);
  assert.equal(read(appRoot, PLIST_PATH), afterFirst, 're-running must be a no-op');
});

test('linkApp wires every installed package end to end from one scan', () => {
  const appRoot = makeAppRoot();
  installPackage(appRoot, '@symbiote-native/local-auth', LOCAL_AUTH_MANIFEST);
  installPackage(appRoot, '@symbiote-native/sensors', SENSORS_MANIFEST);
  installPackage(appRoot, '@symbiote-native/secure-store', SECURE_STORE_MANIFEST);

  const touched = [GRADLE_PATH, MAIN_APP_PATH, ANDROID_MANIFEST_PATH, PLIST_PATH];
  linkApp(appRoot);

  assert.match(read(appRoot, GRADLE_PATH), /implementation project\(':expo-sensors'\)/);
  assert.match(read(appRoot, MAIN_APP_PATH), /BarometerModule::class\.java to "ExpoBarometer",/);
  assert.match(read(appRoot, ANDROID_MANIFEST_PATH), /android:fullBackupContent="@xml\/secure_store_backup_rules"/);
  assert.match(read(appRoot, PLIST_PATH), /<key>NSFaceIDUsageDescription<\/key>/);

  const snapshot = touched.map((segments) => read(appRoot, segments));
  linkApp(appRoot);
  assert.deepEqual(
    touched.map((segments) => read(appRoot, segments)),
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
