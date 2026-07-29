'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { patchBuildGradle, patchMainApplication } = require('./index.cjs');

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
