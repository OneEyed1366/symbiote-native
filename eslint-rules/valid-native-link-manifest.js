import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// native-link.json is what @symbiote-native/expo-modules-link reads at app postinstall to
// regenerate build.gradle, MainApplication.kt, AndroidManifest.xml and Info.plist.
//
// It ignores whatever it does not recognise. A misspelled key, a module entry short one field, a
// nativeName matching no real module — none of it throws; the package just never registers, and
// the first symptom is `Unresolved reference` at :app:compileDebugKotlin or `Cannot find native
// module 'X'` on a device.

const SCHEMA = {
  document: ['android', 'ios'],
  android: ['gradleProjectName', 'modules', 'manifestApplicationAttributes'],
  ios: ['infoPlistKeys'],
  module: ['importPath', 'className', 'nativeName'],
};

function memberOf(objectNode, name) {
  if (!objectNode || objectNode.type !== 'Object') return undefined;
  return objectNode.members.find(member => member.name.value === name);
}

function stringValueOf(objectNode, name) {
  const member = memberOf(objectNode, name);
  if (!member || member.value.type !== 'String') return undefined;
  return member.value.value.trim() === '' ? undefined : member.value.value;
}

function collectTypeScript(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTypeScript(full, found);
    else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.'))
      found.push(full);
  }
  return found;
}

// Every name the package's own JS could pass to requireNativeModule(). Both spellings the repo
// uses reach it: the literal inline, and the `const EXPO_X_MODULE_NAME = 'ExpoX'` a call site
// references. Reading every quoted identifier out of those files keeps the check permissive on
// purpose — it exists to catch a typo, and a rule that cries wolf gets disabled.
function declaredNativeNames(packageDir) {
  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) return undefined;
  const names = new Set();
  for (const file of collectTypeScript(srcDir)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('requireNativeModule')) continue;
    for (const [, literal] of source.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g))
      names.add(literal);
  }
  return names;
}

export default {
  meta: {
    type: 'problem',
    languages: ['json/json'],
    docs: {
      description:
        'validate the native-link.json manifest expo-modules-link consumes',
      recommended: true,
    },
    messages: {
      unknownKey:
        'Unknown key "{{key}}" in {{scope}}. expo-modules-link ignores what it does not ' +
        'recognise, so a typo here disables the setting silently. Known keys: {{known}}.',
      emptyDocument:
        'Manifest declares neither "android" nor "ios", so it links nothing.',
      missingField:
        'Android {{scope}} is missing "{{field}}" ({{consequence}}).',
      emptyModules:
        '"android.modules" is empty. Without an entry the module never reaches ' +
        'MainApplication.kt, so requireNativeModule() throws at import on Android.',
      classMismatch:
        '"className" is "{{className}}" but "importPath" ends in "{{tail}}". The generated ' +
        'Kotlin imports importPath and then references className, so these must agree.',
      unknownNativeName:
        '"{{nativeName}}" is passed to no requireNativeModule() call in src/. The name is ' +
        'resolved at runtime, so a mismatch survives every headless test and fails only on a device.',
      gradleProjectNotADependency:
        '"{{name}}" is not a dependency of this package, so Gradle has no such subproject to ' +
        'link. It must name the wrapped expo-* package.',
    },
    schema: [],
  },
  create(context) {
    const packageDir = dirname(context.filename);

    function reportUnknownKeys(objectNode, scope) {
      const known = SCHEMA[scope];
      for (const member of objectNode.members) {
        if (known.includes(member.name.value)) continue;
        context.report({
          loc: member.name.loc,
          messageId: 'unknownKey',
          data: { key: member.name.value, scope, known: known.join(', ') },
        });
      }
    }

    function checkModule(moduleNode, nativeNames) {
      if (moduleNode.type !== 'Object') return;
      reportUnknownKeys(moduleNode, 'module');

      for (const field of SCHEMA.module) {
        if (stringValueOf(moduleNode, field)) continue;
        context.report({
          loc: moduleNode.loc,
          messageId: 'missingField',
          data: {
            scope: 'module entry',
            field,
            consequence: 'the generated Kotlin would reference undefined',
          },
        });
        return;
      }

      const importPath = stringValueOf(moduleNode, 'importPath');
      const className = stringValueOf(moduleNode, 'className');
      const tail = importPath.slice(importPath.lastIndexOf('.') + 1);
      if (tail !== className) {
        context.report({
          loc: memberOf(moduleNode, 'className').loc,
          messageId: 'classMismatch',
          data: { className, tail },
        });
      }

      const nativeName = stringValueOf(moduleNode, 'nativeName');
      if (nativeNames && !nativeNames.has(nativeName)) {
        context.report({
          loc: memberOf(moduleNode, 'nativeName').loc,
          messageId: 'unknownNativeName',
          data: { nativeName },
        });
      }
    }

    function checkAndroid(androidNode) {
      if (androidNode.type !== 'Object') return;
      reportUnknownKeys(androidNode, 'android');

      const gradleProjectName = stringValueOf(androidNode, 'gradleProjectName');
      if (!gradleProjectName) {
        context.report({
          loc: androidNode.loc,
          messageId: 'missingField',
          data: {
            scope: 'block',
            field: 'gradleProjectName',
            consequence:
              "no `implementation project(':…')` line reaches app/build.gradle, so " +
              'Kotlin fails to resolve the module class it was just told to import',
          },
        });
      } else if (!isDependency(packageDir, gradleProjectName)) {
        context.report({
          loc: memberOf(androidNode, 'gradleProjectName').loc,
          messageId: 'gradleProjectNotADependency',
          data: { name: gradleProjectName },
        });
      }

      const modulesMember = memberOf(androidNode, 'modules');
      if (!modulesMember || modulesMember.value.type !== 'Array') {
        context.report({
          loc: androidNode.loc,
          messageId: 'missingField',
          data: {
            scope: 'block',
            field: 'modules',
            consequence: 'nothing is registered in MainApplication.kt',
          },
        });
        return;
      }
      if (modulesMember.value.elements.length === 0) {
        context.report({ loc: modulesMember.loc, messageId: 'emptyModules' });
        return;
      }

      const nativeNames = declaredNativeNames(packageDir);
      for (const element of modulesMember.value.elements)
        checkModule(element.value, nativeNames);
    }

    return {
      Document(node) {
        const root = node.body;
        if (root.type !== 'Object') return;

        reportUnknownKeys(root, 'document');

        const android = memberOf(root, 'android');
        const ios = memberOf(root, 'ios');
        if (!android && !ios) {
          context.report({ loc: root.loc, messageId: 'emptyDocument' });
          return;
        }

        if (android) checkAndroid(android.value);
        if (ios && ios.value.type === 'Object')
          reportUnknownKeys(ios.value, 'ios');
      },
    };
  },
};

function isDependency(packageDir, name) {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) return true;
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Boolean(pkg.dependencies?.[name] ?? pkg.peerDependencies?.[name]);
}
