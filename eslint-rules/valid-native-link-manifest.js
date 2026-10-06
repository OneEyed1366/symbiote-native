import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// native-link.json читает expo-modules-link при postinstall приложения, неизвестное он молча
// игнорирует: опечатка в ключе ничего не бросает, а симптом виден только в Gradle или на устройстве

const SCHEMA = {
  document: ['android', 'ios', 'reviewedNonIntrospectableMods'],
  android: [
    'gradleProjectName',
    'requiresKsp',
    'modules',
    'manifestApplicationAttributes',
    'manifestPermissions',
    'manifestServices',
    'optionalManifestBundles',
    'mainActivityConfigChanges',
    'services',
  ],
  ios: [
    'infoPlistKeys',
    'infoPlistArrayKeys',
    'infoPlistBooleanKeys',
    'entitlements',
    'upstreamPackage',
  ],
  module: ['importPath', 'className', 'nativeName', 'internal'],
  // Не `manifestServices` (элемент <service> в AndroidManifest.xml), а запись ServicesRegistry
  // в AppContext, см. ISymbioteExpoLinkAndroidService в index.d.ts
  service: ['importPath', 'className', 'gradleProjectName'],
  reviewedNonIntrospectableModEntry: ['mod', 'note'],
};

// `internal` необязательный булев маркер, но как известный ключ он обязан быть в SCHEMA.module
const REQUIRED_MODULE_FIELDS = ['importPath', 'className', 'nativeName'];

// Совпадает со строкой "needs manual review - non-introspectable mod: ..." из
// audit-expo-mod-drift.mjs, человек копирует её в это поле дословно
const NON_INTROSPECTABLE_MOD_PATTERN = /^(android|ios)\.[a-zA-Z]+$/;

// Префикс-заглушка generate-native-link-draft.mjs на непереписанной строке `infoPlistKeys`
// или непрочитанной заметке `reviewedNonIntrospectableMods`: это `problem`, а не предупреждение
const TODO_PATTERN = /^TODO:/;

// Вьюшные пакеты ищут нативный модуль через `requireNativeViewManager`, а не `requireNativeModule`
const NATIVE_LOOKUP_PATTERN = /require(Optional)?Native(Module|ViewManager)/;

const MISSING_FIELD = 'missingField';
const GENERATED_KOTLIN_CONSEQUENCE =
  'the generated Kotlin would reference undefined';

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

// Имена, которые JS пакета передаёт в `requireNativeModule()` или `requireOptionalNativeModule()`
// Читаются все строки в кавычках: проверка намеренно мягкая, она ловит опечатку,
// а правило, которое кричит зря, отключают
function declaredNativeNames(packageDir) {
  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) return undefined;
  const names = new Set();
  for (const file of collectTypeScript(srcDir)) {
    const source = readFileSync(file, 'utf8');
    if (!NATIVE_LOOKUP_PATTERN.test(source)) continue;
    for (const [, literal] of source.matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g))
      names.add(literal);
  }
  return names;
}

function isDependency(packageDir, name) {
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) return true;
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
  });
  // Autolinking выводит Gradle-проект скоупного пакета, отбрасывая `@` и `/`
  return declared.some(
    dep => dep === name || dep.replace(/^@/, '').replace('/', '-') === name,
  );
}

function reportUnknownKeys(context, objectNode, scope) {
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

function reportMissingField(context, loc, data) {
  context.report({ loc, messageId: MISSING_FIELD, data });
}

// Kotlin импортирует `importPath` и ссылается на `className`, поэтому хвост пути совпадает
function checkClassName(context, node) {
  const importPath = stringValueOf(node, 'importPath');
  const className = stringValueOf(node, 'className');
  const tail = importPath.slice(importPath.lastIndexOf('.') + 1);
  if (tail === className) return;
  context.report({
    loc: memberOf(node, 'className').loc,
    messageId: 'classMismatch',
    data: { className, tail },
  });
}

function checkGradleProject(context, ownerNode, packageDir) {
  const name = stringValueOf(ownerNode, 'gradleProjectName');
  if (isDependency(packageDir, name)) return;
  context.report({
    loc: memberOf(ownerNode, 'gradleProjectName').loc,
    messageId: 'gradleProjectNotADependency',
    data: { name },
  });
}

// Некоторые модули нужны только для `ModuleRegistry.getModule()` другого нативного модуля
// (AndroidXNotificationsChannelsProvider), наш JS не зовёт для них `requireNativeModule()`,
// и `"internal": true` отключает проверку имени
function isInternalModule(moduleNode) {
  const internalMember = memberOf(moduleNode, 'internal');
  return (
    internalMember?.value.type === 'Boolean' &&
    internalMember.value.value === true
  );
}

function checkModule(context, moduleNode, nativeNames) {
  if (moduleNode.type !== 'Object') return;
  reportUnknownKeys(context, moduleNode, 'module');

  for (const field of REQUIRED_MODULE_FIELDS) {
    if (stringValueOf(moduleNode, field)) continue;
    reportMissingField(context, moduleNode.loc, {
      scope: 'module entry',
      field,
      consequence: GENERATED_KOTLIN_CONSEQUENCE,
    });
    return;
  }

  checkClassName(context, moduleNode);

  const nativeName = stringValueOf(moduleNode, 'nativeName');
  if (
    nativeNames &&
    !isInternalModule(moduleNode) &&
    !nativeNames.has(nativeName)
  ) {
    context.report({
      loc: memberOf(moduleNode, 'nativeName').loc,
      messageId: 'unknownNativeName',
      data: { nativeName },
    });
  }
}

// В отличие от `checkModule` без сверки `nativeName`: сервис ищется по классу через
// `AppContext.service()`, а его `gradleProjectName` вправе отличаться от блочного
function checkService(context, serviceNode, packageDir) {
  if (serviceNode.type !== 'Object') return;
  reportUnknownKeys(context, serviceNode, 'service');

  for (const field of SCHEMA.service) {
    if (stringValueOf(serviceNode, field)) continue;
    reportMissingField(context, serviceNode.loc, {
      scope: 'service entry',
      field,
      consequence: GENERATED_KOTLIN_CONSEQUENCE,
    });
    return;
  }

  checkClassName(context, serviceNode);
  checkGradleProject(context, serviceNode, packageDir);
}

function checkBlockGradleProject(context, androidNode, packageDir) {
  if (stringValueOf(androidNode, 'gradleProjectName')) {
    checkGradleProject(context, androidNode, packageDir);
    return;
  }
  reportMissingField(context, androidNode.loc, {
    scope: 'block',
    field: 'gradleProjectName',
    consequence:
      "no `implementation project(':…')` line reaches app/build.gradle, so " +
      'Kotlin fails to resolve the module class it was just told to import',
  });
}

function checkAndroid(context, androidNode, packageDir) {
  if (androidNode.type !== 'Object') return;
  reportUnknownKeys(context, androidNode, 'android');
  checkBlockGradleProject(context, androidNode, packageDir);

  const modulesMember = memberOf(androidNode, 'modules');
  if (!modulesMember || modulesMember.value.type !== 'Array') {
    reportMissingField(context, androidNode.loc, {
      scope: 'block',
      field: 'modules',
      consequence: 'nothing is registered in MainApplication.kt',
    });
    return;
  }
  if (modulesMember.value.elements.length === 0) {
    context.report({ loc: modulesMember.loc, messageId: 'emptyModules' });
    return;
  }

  const nativeNames = declaredNativeNames(packageDir);
  for (const element of modulesMember.value.elements)
    checkModule(context, element.value, nativeNames);

  const servicesMember = memberOf(androidNode, 'services');
  if (servicesMember && servicesMember.value.type === 'Array') {
    for (const element of servicesMember.value.elements)
      checkService(context, element.value, packageDir);
  }
}

function isValidReviewEntry(entryNode) {
  const mod = stringValueOf(entryNode, 'mod');
  const note = stringValueOf(entryNode, 'note');
  return (
    entryNode.type === 'Object' &&
    !!mod &&
    NON_INTROSPECTABLE_MOD_PATTERN.test(mod) &&
    !!note
  );
}

function checkReviewEntry(context, entryNode) {
  if (!isValidReviewEntry(entryNode)) {
    context.report({ loc: entryNode.loc, messageId: 'invalidReviewEntry' });
    return;
  }
  reportUnknownKeys(context, entryNode, 'reviewedNonIntrospectableModEntry');
  const note = stringValueOf(entryNode, 'note');
  if (!TODO_PATTERN.test(note)) return;
  context.report({
    loc: memberOf(entryNode, 'note').loc,
    messageId: 'unresolvedDraft',
    data: {
      field: `reviewedNonIntrospectableMods[].note (${stringValueOf(entryNode, 'mod')})`,
      value: note,
      action: "read the plugin's mod body",
    },
  });
}

function checkReviewedNonIntrospectableMods(context, member) {
  if (member.value.type !== 'Array') {
    context.report({ loc: member.loc, messageId: 'invalidReviewEntry' });
    return;
  }
  for (const element of member.value.elements)
    checkReviewEntry(context, element.value);
}

function checkInfoPlistKeys(context, iosNode) {
  const keysMember = memberOf(iosNode, 'infoPlistKeys');
  if (!keysMember || keysMember.value.type !== 'Object') return;
  for (const member of keysMember.value.members) {
    if (member.value.type !== 'String') continue;
    const value = member.value.value;
    if (!TODO_PATTERN.test(value)) continue;
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

function checkDocument(context, root, packageDir) {
  reportUnknownKeys(context, root, 'document');

  const android = memberOf(root, 'android');
  const ios = memberOf(root, 'ios');
  if (!android && !ios) {
    context.report({ loc: root.loc, messageId: 'emptyDocument' });
    return;
  }

  if (android) checkAndroid(context, android.value, packageDir);
  if (ios && ios.value.type === 'Object') {
    reportUnknownKeys(context, ios.value, 'ios');
    checkInfoPlistKeys(context, ios.value);
  }

  const reviewed = memberOf(root, 'reviewedNonIntrospectableMods');
  if (reviewed) checkReviewedNonIntrospectableMods(context, reviewed);
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
    return {
      Document(node) {
        if (node.body.type === 'Object')
          checkDocument(context, node.body, packageDir);
      },
    };
  },
};
