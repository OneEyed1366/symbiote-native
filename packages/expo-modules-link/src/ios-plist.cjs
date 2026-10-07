'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { dlog, warn, applyIfChanged, escapeXml, findFileInTree } = require('./common.cjs');
const { createEntitlementsFile } = require('./ios-xcode-project.cjs');

const INFO_PLIST = 'Info.plist';
const NON_APP_DIRS = /Pods|build|DerivedData|Tests/i;

// Plist самого приложения, а не Pod-а или тестового таргета, у них то же имя файла
// RN кладёт его в `ios/<AppName>/`, исключения Pods/build/DerivedData/Tests оставляют один
function findInfoPlistFile(appRoot) {
  return findFileInTree(path.join(appRoot, 'ios'), INFO_PLIST, NON_APP_DIRS);
}

// Файл `*.entitlements` рядом с `Info.plist`
function findEntitlementsFile(appRoot) {
  const plistPath = findInfoPlistFile(appRoot);
  if (!plistPath) return null;
  const dir = path.dirname(plistPath);
  const name = fs.readdirSync(dir).find((file) => file.endsWith('.entitlements'));
  return name ? path.join(dir, name) : null;
}

function readPlistString(content, key) {
  const keyIndex = content.indexOf(`<key>${key}</key>`);
  if (keyIndex === -1) return null;
  const match = /<string>([\s\S]*?)<\/string>/.exec(content.slice(keyIndex));
  return match ? match[1] : null;
}

// Пара `<key>NAME</key>` + `<array>` для ключа-массива: элементы как в файле и позиция закрытия,
// чтобы дописывать недостающие, не трогая остальные
function readPlistArray(content, key) {
  const keyTag = `<key>${key}</key>`;
  const keyIndex = content.indexOf(keyTag);
  if (keyIndex === -1) return null;
  const arrayOpenIndex = content.indexOf('<array>', keyIndex + keyTag.length);
  const arrayCloseIndex = arrayOpenIndex === -1 ? -1 : content.indexOf('</array>', arrayOpenIndex);
  if (arrayOpenIndex === -1 || arrayCloseIndex === -1) return null;
  const inner = content.slice(arrayOpenIndex + '<array>'.length, arrayCloseIndex);
  const items = [...inner.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((match) => match[1]);
  return { arrayCloseIndex, items };
}

// Единственная точка вставки ключа: перед закрытием внешнего dict
// Пустой словарь Xcode пишет как `<dict/>`, его сначала раскрываем
function insertPlistKey(source, plistPath, key, valueXml) {
  const content = source.replace(/<dict\/>(\s*<\/plist>)/, (_, tail) => `<dict>\n</dict>${tail}`);
  const plistCloseIndex = content.lastIndexOf('</plist>');
  const dictCloseIndex = content.lastIndexOf('</dict>', plistCloseIndex === -1 ? undefined : plistCloseIndex);
  if (dictCloseIndex === -1) {
    warn(`${plistPath} has no closing </dict>, skipping ${key}`);
    return content;
  }
  const block = `\t<key>${key}</key>\n${valueXml}\n`;
  return content.slice(0, dictCloseIndex) + block + content.slice(dictCloseIndex);
}

// Создаёт массив или дописывает только недостающие элементы, существующие не трогает
function mergePlistArray(content, plistPath, key, items) {
  const existing = readPlistArray(content, key);
  if (existing === null) {
    const itemLines = items.map((item) => `\t\t<string>${escapeXml(item)}</string>`).join('\n');
    return insertPlistKey(content, plistPath, key, `\t<array>\n${itemLines}\n\t</array>`);
  }
  const missing = items.filter((item) => !existing.items.includes(item));
  if (missing.length === 0) return content;
  const missingLines = missing.map((item) => `\t\t<string>${escapeXml(item)}</string>\n`).join('');
  return content.slice(0, existing.arrayCloseIndex) + missingLines + content.slice(existing.arrayCloseIndex);
}

function scalarXml(value) {
  return typeof value === 'boolean' ? `\t<${value}/>` : `\t<string>${escapeXml(value)}</string>`;
}

// Описание это текст для пользователя, ручная правка важнее дефолта пакета,
// поэтому расхождение только сообщаем и файл не трогаем
function warnOnStringDrift(content, plistPath, key, value) {
  const existing = readPlistString(content, key);
  if (typeof value !== 'string' || existing === null || existing === escapeXml(value)) return;
  warn(
    `${key} in ${plistPath} reads "${existing}" but the package manifest says ` +
      `"${value}". Keeping the file as-is; edit it by hand if you want the manifest's.`,
  );
}

function applyKey(content, plistPath, key, value) {
  if (value instanceof Set) return mergePlistArray(content, plistPath, key, [...value]);
  if (content.includes(`<key>${key}</key>`)) {
    warnOnStringDrift(content, plistPath, key, value);
    return content;
  }
  return insertPlistKey(content, plistPath, key, scalarXml(value));
}

// Массивы всех пакетов сливаются в один набор на ключ, скаляр берётся от первого
function addWanted(wanted, key, value) {
  if (Array.isArray(value)) {
    wanted.set(key, new Set([...(wanted.get(key) || []), ...value]));
    return;
  }
  if (!wanted.has(key)) wanted.set(key, value);
}

// Сортировка по ключу, чтобы файл не зависел от порядка обхода пакетов
function wantedKeys(entries, field) {
  const wanted = new Map();
  const declaredPerPackage = entries.map((entry) => entry.manifest.ios && entry.manifest.ios[field]);
  for (const declared of declaredPerPackage) {
    for (const [key, value] of Object.entries(declared || {})) addWanted(wanted, key, value);
  }
  return [...wanted].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function patchPlistFile(filePath, wanted) {
  const content = fs.readFileSync(filePath, 'utf8');
  const next = wanted.reduce((acc, [key, value]) => applyKey(acc, filePath, key, value), content);
  applyIfChanged(filePath, content, next);
}

// Региона с маркерами, как у Android, тут нет: Xcode переписывает эти файлы своим сериализатором
// и теряет комментарии, потерянный END дал бы второй блок и дубли ключей
// Поэтому только аддитивно, идемпотентность по наличию `<key>NAME</key>`
function patchInfoPlistField(appRoot, entries, field) {
  const wanted = wantedKeys(entries, field);
  if (wanted.length === 0) return;
  const plistPath = findInfoPlistFile(appRoot);
  if (!plistPath) {
    dlog(`${INFO_PLIST} not found, skipping iOS ${field}`);
    return;
  }
  patchPlistFile(plistPath, wanted);
}

function patchInfoPlist(appRoot, entries) {
  patchInfoPlistField(appRoot, entries, 'infoPlistKeys');
}

// Ключ-массив (`UIBackgroundModes`), который строка `<string>` превратила бы в битый plist
function patchInfoPlistArrays(appRoot, entries) {
  patchInfoPlistField(appRoot, entries, 'infoPlistArrayKeys');
}

// Булевы ключи вроде `CFBundleAllowMixedLocalizations`
function patchInfoPlistBooleans(appRoot, entries) {
  patchInfoPlistField(appRoot, entries, 'infoPlistBooleanKeys');
}

// Entitlements вроде `com.apple.developer.applesignin` в файл самого приложения,
// которого может не быть: тогда он создаётся и подключается к проекту
function patchEntitlements(appRoot, entries) {
  const wanted = wantedKeys(entries, 'entitlements');
  if (wanted.length === 0) return;
  const plistPath = findInfoPlistFile(appRoot);
  if (!plistPath) {
    dlog(`${INFO_PLIST} not found, skipping iOS entitlements`);
    return;
  }
  const filePath = findEntitlementsFile(appRoot) || createEntitlementsFile(appRoot, plistPath);
  if (!filePath) {
    warn(`no .entitlements file next to ${INFO_PLIST}, add one to enable ${wanted.map(([key]) => key).join(', ')}`);
    return;
  }
  patchPlistFile(filePath, wanted);
}

module.exports = {
  findInfoPlistFile,
  patchInfoPlist,
  patchInfoPlistArrays,
  patchInfoPlistBooleans,
  patchEntitlements,
};
