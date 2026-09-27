import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractNativeName, buildAndroidModules, buildDraft } from './generate-native-link-draft.mjs';

test('extractNativeName reads a direct string literal', () => {
  const source = 'class X : Module() {\n  override fun definition() = ModuleDefinition {\n    Name("ExpoX")\n  }\n}';
  assert.equal(extractNativeName(source), 'ExpoX');
});

test('extractNativeName resolves a const val indirection in the same file', () => {
  const source = 'const val ProviderName = "NotificationsChannelsProvider"\nclass X { fun f() = ModuleDefinition { Name(ProviderName) } }';
  assert.equal(extractNativeName(source), 'NotificationsChannelsProvider');
});

test('extractNativeName returns null when neither shape matches', () => {
  assert.equal(extractNativeName('class X : Module() { override fun definition() = ModuleDefinition {} }'), null);
});

test('buildAndroidModules reads expo-module.config.json and each class\'s Name(...)', () => {
  const pkgDir = mkdtempSync(join(tmpdir(), 'nl-gen-test-'));
  writeFileSync(
    join(pkgDir, 'expo-module.config.json'),
    JSON.stringify({ android: { modules: ['expo.modules.x.XModule'] } }),
  );
  mkdirSync(join(pkgDir, 'android/src/main/java/expo/modules/x'), { recursive: true });
  writeFileSync(
    join(pkgDir, 'android/src/main/java/expo/modules/x/XModule.kt'),
    'class XModule : Module() { override fun definition() = ModuleDefinition { Name("ExpoX") } }',
  );

  const warnings = [];
  const modules = buildAndroidModules(pkgDir, warnings);

  assert.deepEqual(modules, [{ importPath: 'expo.modules.x.XModule', className: 'XModule', nativeName: 'ExpoX' }]);
  assert.deepEqual(warnings, []);
  rmSync(pkgDir, { recursive: true, force: true });
});

test('buildAndroidModules warns and stubs a TODO when the source file is missing', () => {
  const pkgDir = mkdtempSync(join(tmpdir(), 'nl-gen-test-'));
  writeFileSync(
    join(pkgDir, 'expo-module.config.json'),
    JSON.stringify({ android: { modules: ['expo.modules.x.MissingModule'] } }),
  );

  const warnings = [];
  const modules = buildAndroidModules(pkgDir, warnings);

  assert.equal(modules[0].importPath, 'expo.modules.x.MissingModule');
  assert.match(modules[0].nativeName, /^TODO:/);
  assert.equal(warnings.length, 1);
  rmSync(pkgDir, { recursive: true, force: true });
});

test('buildAndroidModules warns when expo-module.config.json is absent', () => {
  const pkgDir = mkdtempSync(join(tmpdir(), 'nl-gen-test-'));
  const warnings = [];
  const modules = buildAndroidModules(pkgDir, warnings);
  assert.deepEqual(modules, []);
  assert.equal(warnings.length, 1);
  rmSync(pkgDir, { recursive: true, force: true });
});

test('buildDraft marks ios.infoPlistKeys string diffs as unresolved TODOs, arrays as real values', () => {
  const diffs = [
    { path: 'ios.infoPlist.NSFooUsageDescription', before: undefined, after: 'Allow $(PRODUCT_NAME) to access foo' },
    { path: 'ios.infoPlist.UIBackgroundModes', before: undefined, after: ['fetch'] },
  ];
  const pkgDir = mkdtempSync(join(tmpdir(), 'nl-gen-test-'));
  const draft = buildDraft(diffs, [], 'expo-x', pkgDir, []);

  assert.match(draft.ios.infoPlistKeys.NSFooUsageDescription, /^TODO:/);
  assert.deepEqual(draft.ios.infoPlistArrayKeys.UIBackgroundModes, ['fetch']);
  rmSync(pkgDir, { recursive: true, force: true });
});

test('buildDraft marks each non-introspectable mod as an unreviewed TODO', () => {
  const pkgDir = mkdtempSync(join(tmpdir(), 'nl-gen-test-'));
  const draft = buildDraft([], ['android.dangerous'], 'expo-x', pkgDir, []);

  assert.deepEqual(draft.reviewedNonIntrospectableMods, [
    { mod: 'android.dangerous', note: "TODO: read the plugin's mod body and confirm what it does with default props" },
  ]);
  rmSync(pkgDir, { recursive: true, force: true });
});
