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
  document: ['android', 'ios', 'reviewedNonIntrospectableMods'],
  android: [
    'gradleProjectName',
    'modules',
    'manifestApplicationAttributes',
    'manifestPermissions',
    'manifestServices',
    'optionalManifestBundles',
    'mainActivityConfigChanges',
    'services',
  ],
  ios: ['infoPlistKeys', 'infoPlistArrayKeys'],
  module: ['importPath', 'className', 'nativeName', 'internal'],
  // Distinct from `manifestServices` above (an AndroidManifest.xml <service> element) - this is
  // an AppContext ServicesRegistry entry, see index.d.ts's ISymbioteExpoLinkAndroidService.
  service: ['importPath', 'className', 'gradleProjectName'],
  reviewedNonIntrospectableModEntry: ['mod', 'note'],
};

// `internal` is an optional boolean marker, not a required string field, but SCHEMA.module still
// needs to list it or reportUnknownKeys(moduleNode, 'module') would flag it as unknown.
const REQUIRED_MODULE_FIELDS = ['importPath', 'className', 'nativeName'];

// Matches audit-expo-mod-drift.mjs's own "needs manual review - non-introspectable mod: ..." line,
// since a human copies that string verbatim into this field.
const NON_INTROSPECTABLE_MOD_PATTERN = /^(android|ios)\.[a-zA-Z]+$/;

// generate-native-link-draft.mjs's sentinel prefix on an unreworded infoPlistKeys string or an
// unread reviewedNonIntrospectableMods note - a `problem`, not a warning, so it can't go unnoticed.
const TODO_PATTERN = /^TODO:/;

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

// Every name the package's own JS could pass to requireNativeModule() or its optional twin,
// requireOptionalNativeModule() (expo-modules-core, used for a legacy module that may not be
// present — e.g. file-system's ExponentFileSystem). Both spellings the repo uses reach it: the
// literal inline, and the `const EXPO_X_MODULE_NAME = 'ExpoX'` a call site references. Reading
// every quoted identifier out of those files keeps the check permissive on purpose — it exists to
// catch a typo, and a rule that cries wolf gets disabled.
function declaredNativeNames(packageDir) {
  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) return undefined;
  const names = new Set();
  for (const file of collectTypeScript(srcDir)) {
    const source = readFileSync(file, 'utf8');
    if (
      !source.includes('requireNativeModule') &&
      !source.includes('requireOptionalNativeModule')
    )
      continue;
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
      invalidReviewEntry:
        '"reviewedNonIntrospectableMods" entries must be {mod, note} - "mod" matching ' +
        '"<android|ios>.<modName>" (e.g. "android.dangerous", copied verbatim from audit-expo-' +
        'mod-drift.mjs\'s own "needs manual review" line) and a non-empty "note" explaining ' +
        'what was actually read and why it needs no native-link.json entry.',
      unresolvedDraft:
        '"{{field}}" is still a generate-native-link-draft.mjs placeholder ("{{value}}") - a ' +
        'human has to {{action}} before this file is real, not just plugin-generated.',
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

      for (const field of REQUIRED_MODULE_FIELDS) {
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
      const internalMember = memberOf(moduleNode, 'internal');
      // Some modules exist only for another native module's own ModuleRegistry.getModule() lookup
      // (e.g. expo-notifications' AndroidXNotificationsChannelsProvider) - our JS never calls
      // requireNativeModule() with that name, so `"internal": true` opts out of the check below.
      const isInternal =
        internalMember?.value.type === 'Boolean' &&
        internalMember.value.value === true;
      if (nativeNames && !isInternal && !nativeNames.has(nativeName)) {
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

      const servicesMember = memberOf(androidNode, 'services');
      if (servicesMember && servicesMember.value.type === 'Array') {
        for (const element of servicesMember.value.elements)
          checkService(element.value);
      }
    }

    // Distinct from checkModule: no nativeName cross-check (a service is looked up by class via
    // AppContext.service(), never by string name from JS). gradleProjectName here can legitimately
    // differ from the block-level one above (see index.d.ts's ISymbioteExpoLinkAndroidService).
    function checkService(serviceNode) {
      if (serviceNode.type !== 'Object') return;
      reportUnknownKeys(serviceNode, 'service');

      for (const field of SCHEMA.service) {
        if (stringValueOf(serviceNode, field)) continue;
        context.report({
          loc: serviceNode.loc,
          messageId: 'missingField',
          data: {
            scope: 'service entry',
            field,
            consequence: 'the generated Kotlin would reference undefined',
          },
        });
        return;
      }

      const importPath = stringValueOf(serviceNode, 'importPath');
      const className = stringValueOf(serviceNode, 'className');
      const tail = importPath.slice(importPath.lastIndexOf('.') + 1);
      if (tail !== className) {
        context.report({
          loc: memberOf(serviceNode, 'className').loc,
          messageId: 'classMismatch',
          data: { className, tail },
        });
      }

      const gradleProjectName = stringValueOf(serviceNode, 'gradleProjectName');
      if (!isDependency(packageDir, gradleProjectName)) {
        context.report({
          loc: memberOf(serviceNode, 'gradleProjectName').loc,
          messageId: 'gradleProjectNotADependency',
          data: { name: gradleProjectName },
        });
      }
    }

    function checkReviewedNonIntrospectableMods(member) {
      if (member.value.type !== 'Array') {
        context.report({ loc: member.loc, messageId: 'invalidReviewEntry' });
        return;
      }
      for (const element of member.value.elements) {
        const entryNode = element.value;
        const mod = stringValueOf(entryNode, 'mod');
        const note = stringValueOf(entryNode, 'note');
        if (
          entryNode.type !== 'Object' ||
          !mod ||
          !NON_INTROSPECTABLE_MOD_PATTERN.test(mod) ||
          !note
        ) {
          context.report({
            loc: entryNode.loc,
            messageId: 'invalidReviewEntry',
          });
          continue;
        }
        if (entryNode.type === 'Object')
          reportUnknownKeys(entryNode, 'reviewedNonIntrospectableModEntry');
        if (TODO_PATTERN.test(note)) {
          context.report({
            loc: memberOf(entryNode, 'note').loc,
            messageId: 'unresolvedDraft',
            data: {
              field: `reviewedNonIntrospectableMods[].note (${mod})`,
              value: note,
              action: "read the plugin's mod body",
            },
          });
        }
      }
    }

    function checkInfoPlistKeys(iosNode) {
      const keysMember = memberOf(iosNode, 'infoPlistKeys');
      if (!keysMember || keysMember.value.type !== 'Object') return;
      for (const member of keysMember.value.members) {
        if (member.value.type !== 'String') continue;
        const value = member.value.value;
        if (TODO_PATTERN.test(value)) {
          context.report({
            loc: member.value.loc,
            messageId: 'unresolvedDraft',
            data: {
              field: `ios.infoPlistKeys.${member.name.value}`,
              value,
              action: 'write real, branded wording',
            },
          });
        }
      }
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
        if (ios && ios.value.type === 'Object') {
          reportUnknownKeys(ios.value, 'ios');
          checkInfoPlistKeys(ios.value);
        }

        const reviewed = memberOf(root, 'reviewedNonIntrospectableMods');
        if (reviewed) checkReviewedNonIntrospectableMods(reviewed);
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
