'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEBUG_ENV_VALUES = ['1', 'true'];

// Не `isDebug` движка: это CJS-скрипт postinstall вне бандла, ему нужны `DEBUG=1` и `DEBUG=true`
function isDebug() {
  return DEBUG_ENV_VALUES.includes(process.env.DEBUG) || globalThis.__SYMBIOTE_DEBUG__ === true;
}

function dlog(...args) {
  if (isDebug()) process.stderr.write(`[symbiote-expo-link] ${args.join(' ')}\n`);
}

// В отличие от `dlog` не гейтится: недоступный нативный файл или разошедшееся описание
// требуют действия разработчика, иначе это вскроется только в рантайме
function warn(message) {
  console.warn(`[symbiote-expo-link] ${message}`);
}

// Ctrl-C посреди `writeFileSync` обрезает файл на месте, а это закоммиченные проекты Xcode/Gradle
// Временный файл + rename атомарен на POSIX: файл заменён целиком или не тронут
function writeFileAtomic(filePath, content) {
  const tmpPath = `${filePath}.symbiote-expo-link.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

function applyIfChanged(filePath, content, nextContent) {
  if (nextContent === null || nextContent === content) return;
  writeFileAtomic(filePath, nextContent);
  dlog(`updated ${filePath}`);
}

// `&` или `<` в описании ломают разбор plist, в текстовом узле достаточно этих трёх символов
function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Общий обход для `findInfoPlistFile` и `findMainApplicationFile`
// Возвращает первый файл с таким именем, каталоги по маске `skip` пропускает
function findFileInTree(root, fileName, skip = null) {
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip && skip.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === fileName) return full;
    }
  }
  return null;
}

module.exports = { isDebug, dlog, warn, writeFileAtomic, applyIfChanged, escapeXml, findFileInTree };
