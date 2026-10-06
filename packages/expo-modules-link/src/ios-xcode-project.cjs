'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { dlog, warn, writeFileAtomic } = require('./common.cjs');

const XCODEPROJ_SUFFIX = '.xcodeproj';
const PODS_PROJECT = 'Pods.xcodeproj';
const PBXPROJ = 'project.pbxproj';
const OBJECT_ID_LENGTH = 24;
const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Имя объекта в проекте Xcode подписано в комментарии после id
function pbxLabel(name) {
  return ['/*', name, '*/'].join(' ');
}

// Пути в проекте всегда с `/` и относительно каталога с `.xcodeproj`
function projectRelative(iosDir, filePath) {
  return path.relative(iosDir, filePath).split(path.sep).join('/');
}

function findAppPbxproj(iosDir) {
  if (!fs.existsSync(iosDir)) return null;
  const project = fs.readdirSync(iosDir).find((name) => name.endsWith(XCODEPROJ_SUFFIX) && name !== PODS_PROJECT);
  return project ? path.join(iosDir, project, PBXPROJ) : null;
}

// Xcode хранит 24 hex-символа, от пути id стабилен между запусками и не совпадает с чужим
function newObjectId(content, seed) {
  for (let salt = 0; ; salt += 1) {
    const hash = crypto.createHash('sha1').update(`${seed}:${salt}`).digest('hex');
    const id = hash.slice(0, OBJECT_ID_LENGTH).toUpperCase();
    if (!content.includes(id)) return id;
  }
}

// Только настройки таргета приложения: по `INFOPLIST_FILE` он отличается от таргета тестов
function withSigningSetting(content, plistRef, entitlementsRef) {
  const settings = new RegExp(`^(\\t+)INFOPLIST_FILE = "?${escapeRegExp(plistRef)}"?;\\n`, 'gm');
  if (!settings.test(content)) return null;
  return content.replace(settings, (line, indent, offset) => {
    const block = content.slice(content.lastIndexOf('buildSettings', offset), offset);
    return block.includes('CODE_SIGN_ENTITLEMENTS') ? line : `${indent}CODE_SIGN_ENTITLEMENTS = ${entitlementsRef};\n${line}`;
  });
}

// Ссылка на файл и строка в группе приложения, следом за ссылкой на его Info.plist
function withFileReference(content, plistRef, entitlementsRef) {
  const plistLine = new RegExp(
    `^(\\t+)(\\w+) /\\* ([^*]+) \\*/ = \\{isa = PBXFileReference;[^\\n]*path = "?${escapeRegExp(plistRef)}"?;[^\\n]*\\n`,
    'm',
  );
  const plist = plistLine.exec(content);
  if (!plist) return null;
  const [line, indent, plistId, plistName] = plist;
  const fileName = path.posix.basename(entitlementsRef);
  const label = pbxLabel(fileName);
  const id = newObjectId(content, entitlementsRef);
  const attributes = `isa = PBXFileReference; fileEncoding = 4; lastKnownFileType = text.plist.entitlements; name = ${fileName}; path = ${entitlementsRef}; sourceTree = "<group>";`;
  const withReference = content.replace(line, () => `${line}${indent}${id} ${label} = {${attributes} };\n`);
  const child = new RegExp(`^(\\t+)${plistId} ${escapeRegExp(pbxLabel(plistName))},\\n`, 'm');
  const inGroup = child.exec(withReference);
  if (!inGroup) return null;
  return withReference.replace(inGroup[0], () => `${inGroup[0]}${inGroup[1]}${id} ${label},\n`);
}

function addEntitlementsToProject(content, plistRef, entitlementsRef) {
  const withSigning = withSigningSetting(content, plistRef, entitlementsRef);
  return withSigning === null ? null : withFileReference(withSigning, plistRef, entitlementsRef);
}

// Создаёт `<App>/<App>.entitlements` рядом с Info.plist и подключает его к таргету приложения
// Без якорей в проекте файл не создаётся: им ничего не подписано
function createEntitlementsFile(appRoot, plistPath) {
  const iosDir = path.join(appRoot, 'ios');
  const pbxprojPath = findAppPbxproj(iosDir);
  if (!pbxprojPath) {
    dlog('no Xcode project found, not creating an .entitlements file');
    return null;
  }
  const appName = path.basename(path.dirname(plistPath));
  const filePath = path.join(path.dirname(plistPath), `${appName}.entitlements`);
  const content = fs.readFileSync(pbxprojPath, 'utf8');
  const next = addEntitlementsToProject(content, projectRelative(iosDir, plistPath), projectRelative(iosDir, filePath));
  if (next === null) {
    warn(`could not wire an .entitlements file into ${pbxprojPath}, add one and set CODE_SIGN_ENTITLEMENTS by hand`);
    return null;
  }
  writeFileAtomic(pbxprojPath, next);
  writeFileAtomic(filePath, EMPTY_ENTITLEMENTS);
  dlog(`created ${filePath} and wired it into ${pbxprojPath}`);
  return filePath;
}

module.exports = { createEntitlementsFile };
