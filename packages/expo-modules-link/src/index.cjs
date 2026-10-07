'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dlog, warn } = require('./common.cjs');
const { buildGradlePath, findMainApplicationFile } = require('./android-paths.cjs');
const { patchBuildGradle, patchRootBuildGradle, patchMainApplication } = require('./android-regions.cjs');
const {
  patchAndroidManifest,
  patchAndroidManifestPermissions,
  patchAndroidManifestServices,
  patchMainActivityConfigChanges,
} = require('./android-manifest.cjs');
const {
  findInfoPlistFile,
  patchInfoPlist,
  patchInfoPlistArrays,
  patchInfoPlistBooleans,
  patchEntitlements,
} = require('./ios-plist.cjs');

// Один процесс на приложение, не postinstall каждого пакета: параллельный read-modify-write
// над одним build.gradle теряет записи, а корректный lock на голом `fs` недостижим
// Полная история в README, раздел "Why an aggregator"
const MANIFEST_FILENAME = 'native-link.json';

// `cwd` это корень приложения для postinstall, `INIT_CWD` запасной вариант для вложенного скрипта
// Вверх по дереву поиск не идёт, из подкаталога приложения ничего не найдётся
function findAppRoot() {
  const candidates = [process.cwd(), process.env.INIT_CWD].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(buildGradlePath(candidate))) return candidate;
    if (findInfoPlistFile(candidate)) return candidate;
  }
  return null;
}

function readManifest(packageDir, packageName) {
  const manifestPath = path.join(packageDir, MANIFEST_FILENAME);
  // `existsSync` идёт по симлинкам, а node_modules у pnpm и workspace-ссылка это они и есть
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return { packageName, manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) };
  } catch (error) {
    warn(`skipping ${packageName}: its ${MANIFEST_FILENAME} is not valid JSON (${error.message})`);
    return null;
  }
}

// Пакеты внутри `@scope`: имя собирается из каталога скоупа и пакета
function readScopedManifests(modulesRoot, scopeName) {
  const scopeDir = path.join(modulesRoot, scopeName);
  return fs
    .readdirSync(scopeDir, { withFileTypes: true })
    .map((scoped) => readManifest(path.join(scopeDir, scoped.name), `${scopeName}/${scoped.name}`));
}

// Не `localeCompare`: его порядок зависит от локали машины
function comparePackageNames(a, b) {
  if (a.packageName < b.packageName) return -1;
  return a.packageName > b.packageName ? 1 : 0;
}

// Сортировка по имени пакета, чтобы блоки были байт-в-байт одинаковы на разных машинах:
// порядок `readdir` плавает, а блоки лежат в закоммиченных нативных файлах
function collectManifests(appRoot) {
  const modulesRoot = path.join(appRoot, 'node_modules');
  if (!fs.existsSync(modulesRoot)) {
    warn(`no node_modules in ${appRoot}, nothing to link`);
    return [];
  }

  const found = fs
    .readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.'))
    .flatMap((entry) =>
      entry.name.startsWith('@')
        ? readScopedManifests(modulesRoot, entry.name)
        : [readManifest(path.join(modulesRoot, entry.name), entry.name)],
    )
    .filter(Boolean);

  found.sort(comparePackageNames);
  dlog(`found ${found.length} linkable package(s): ${found.map((f) => f.packageName).join(', ')}`);
  return found;
}

// Безопасно запускать сколько угодно раз и после удаления пакета
function linkApp(explicitAppRoot) {
  const appRoot = explicitAppRoot || findAppRoot();
  if (!appRoot) {
    warn('no React Native app here (no android/app/build.gradle, no ios/**/Info.plist), skipping');
    return;
  }

  const entries = collectManifests(appRoot);
  patchBuildGradle(appRoot, entries);
  patchRootBuildGradle(appRoot, entries);
  patchMainApplication(appRoot, entries);
  patchAndroidManifest(appRoot, entries);
  patchAndroidManifestPermissions(appRoot, entries);
  patchAndroidManifestServices(appRoot, entries);
  patchMainActivityConfigChanges(appRoot, entries);
  patchInfoPlist(appRoot, entries);
  patchInfoPlistArrays(appRoot, entries);
  patchInfoPlistBooleans(appRoot, entries);
  patchEntitlements(appRoot, entries);
}

module.exports = {
  linkApp,
  collectManifests,
  findAppRoot,
  findInfoPlistFile,
  findMainApplicationFile,
  patchBuildGradle,
  patchRootBuildGradle,
  patchMainApplication,
  patchAndroidManifest,
  patchAndroidManifestPermissions,
  patchAndroidManifestServices,
  patchMainActivityConfigChanges,
  patchInfoPlist,
  patchInfoPlistArrays,
  patchInfoPlistBooleans,
  patchEntitlements,
};
