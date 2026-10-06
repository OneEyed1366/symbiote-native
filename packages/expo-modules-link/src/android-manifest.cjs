'use strict';

const fs = require('node:fs');
const { dlog, warn, applyIfChanged, escapeXml } = require('./common.cjs');
const { androidManifestPath } = require('./android-paths.cjs');

const CONFIG_CHANGES_ATTRIBUTE = 'android:configChanges';

// Внутри атрибута в двойных кавычках кавычка тоже экранируется, иначе она закроет значение раньше
function escapeXmlAttribute(value) {
  return escapeXml(value).replace(/"/g, '&quot;');
}

// Индекс первого `>` вне кавычек: в шаблоне RN атрибут содержит "${usesCleartextTraffic}",
// а манифест вправе держать `>` внутри значения, поэтому регулярка не годится
function scanTagEnd(content, from) {
  let quote = null;
  for (let i = from; i < content.length; i += 1) {
    const char = content[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return i;
    }
  }
  return -1;
}

function findTag(content, tagName) {
  const match = new RegExp(`<${tagName}(?=[\\s>/])`).exec(content);
  if (!match) return null;
  const end = scanTagEnd(content, match.index);
  return end === -1 ? null : { start: match.index, end };
}

function findApplicationTag(content) {
  return findTag(content, 'application');
}

// Тот же поиск границ, но все совпадения: `<activity>` бывает несколько, нужна только MainActivity
function findAllTags(content, tagName) {
  const tags = [];
  const re = new RegExp(`<${tagName}(?=[\\s>/])`, 'g');
  let match = re.exec(content);
  while (match) {
    const end = scanTagEnd(content, match.index);
    if (end !== -1) {
      tags.push({ start: match.index, end });
      re.lastIndex = end + 1;
    }
    match = re.exec(content);
  }
  return tags;
}

function readXmlAttribute(tagText, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tagText);
  return match ? match[1] : null;
}

function findMainActivityTag(content) {
  for (const tag of findAllTags(content, 'activity')) {
    const name = readXmlAttribute(content.slice(tag.start, tag.end), 'android:name');
    if (name && /(^|\.)MainActivity$/.test(name)) return tag;
  }
  return null;
}

// Разделитель перед новым атрибутом повторяет отступ последнего, чтобы тег сохранил свою форму
function attributeSeparator(tagText) {
  const lastNewline = tagText.lastIndexOf('\n');
  return lastNewline === -1 ? ' ' : `\n${/^[ \t]*/.exec(tagText.slice(lastNewline + 1))[0]}`;
}

function appendAttribute(content, tag, name, escapedValue) {
  const separator = attributeSeparator(content.slice(tag.start, tag.end));
  const insertAt = content[tag.end - 1] === '/' ? tag.end - 1 : tag.end;
  return `${content.slice(0, insertAt)}${separator}${name}="${escapedValue}"${content.slice(insertAt)}`;
}

// Значения поля `android` из всех пакетов одним списком
function androidListOf(entries, field) {
  return entries.flatMap((entry) => (entry.manifest.android && entry.manifest.android[field]) || []);
}

// Чтение отдельно от записи: пишет всегда `applyIfChanged`, а он через `writeFileAtomic`
function loadAndroidManifest(appRoot, skipLabel) {
  const manifestPath = androidManifestPath(appRoot);
  if (!fs.existsSync(manifestPath)) {
    dlog(`AndroidManifest.xml not found, skipping ${skipLabel}`);
    return null;
  }
  return { manifestPath, content: fs.readFileSync(manifestPath, 'utf8') };
}

function wantedApplicationAttributes(entries) {
  const wanted = new Map();
  for (const entry of entries) {
    const attributes = entry.manifest.android && entry.manifest.android.manifestApplicationAttributes;
    for (const [name, value] of Object.entries(attributes || {})) {
      if (!wanted.has(name)) wanted.set(name, value);
    }
  }
  return [...wanted].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// Сообщает о расхождении и ничего не меняет: правка вручную важнее дефолта пакета
function warnOnAttributeDrift(manifestPath, name, existing, value) {
  warn(
    `${name} in ${manifestPath} reads "${existing}" but the package manifest says ` +
      `"${value}". Keeping the file as-is; edit it by hand if you want the manifest's.`,
  );
}

// Атрибуты собственного `<application>` для пакетов, которым это нужно (исключения Auto Backup
// у secure-store), только аддитивно: атрибут уникален в элементе, значит наличие и есть
// проверка идемпотентности, а регион с комментариями внутри тега не создать
function patchAndroidManifest(appRoot, entries) {
  const wanted = wantedApplicationAttributes(entries);
  if (wanted.length === 0) return;

  const loaded = loadAndroidManifest(appRoot, 'application attributes');
  if (!loaded) return;
  const { manifestPath, content } = loaded;
  let next = content;

  for (const [name, value] of wanted) {
    // Метасимвол в имени проскочил бы мимо `readXmlAttribute`, и дописался бы дубль атрибута,
    // а это ошибка разбора XML, а не плохое значение
    if (!/^[\w.:-]+$/.test(name)) {
      warn(`skipping the manifest attribute "${name}": not a plain XML attribute name`);
      continue;
    }

    const tag = findApplicationTag(next);
    if (!tag) {
      warn(`${manifestPath} has no <application> element, skipping ${name}`);
      return;
    }

    const escaped = escapeXmlAttribute(value);
    const existing = readXmlAttribute(next.slice(tag.start, tag.end), name);
    if (existing === null) next = appendAttribute(next, tag, name, escaped);
    else if (existing !== escaped) warnOnAttributeDrift(manifestPath, name, existing, value);
  }

  applyIfChanged(manifestPath, content, next);
}

function replaceConfigChangesValue(content, tag, merged) {
  const tagText = content.slice(tag.start, tag.end);
  const valueMatch = new RegExp(`${CONFIG_CHANGES_ATTRIBUTE}\\s*=\\s*"`).exec(tagText);
  const valueStart = valueMatch.index + valueMatch[0].length;
  const valueEnd = tagText.indexOf('"', valueStart);
  const nextTagText = tagText.slice(0, valueStart) + merged + tagText.slice(valueEnd);
  return content.slice(0, tag.start) + nextTagText + content.slice(tag.end);
}

// У самозакрывающегося тега пробел перед `/` задвоился бы с ведущим пробелом разделителя,
// поэтому перед `/>` возвращается ровно один
function addConfigChangesAttribute(content, tag, merged) {
  const selfClosing = content[tag.end - 1] === '/';
  const insertAt = selfClosing ? tag.end - 1 : tag.end;
  const separator = attributeSeparator(content.slice(tag.start, tag.end));
  const before = content.slice(0, insertAt).replace(/[ \t]+$/, '');
  const trailer = selfClosing ? ' ' : '';
  return `${before}${separator}${CONFIG_CHANGES_ATTRIBUTE}="${merged}"${trailer}${content.slice(insertAt)}`;
}

// Значение у MainActivity дополняется, а не пропускается: шаблон RN уже несёт базовое
// Нужно плагину localization, чтобы смена локали вызывала `onConfigurationChanged`,
// а не перезапуск Activity
function patchMainActivityConfigChanges(appRoot, entries) {
  const wanted = new Set(androidListOf(entries, 'mainActivityConfigChanges'));
  if (wanted.size === 0) return;

  const loaded = loadAndroidManifest(appRoot, 'MainActivity configChanges');
  if (!loaded) return;
  const { manifestPath, content } = loaded;
  const tag = findMainActivityTag(content);
  if (!tag) {
    warn(`${manifestPath} has no MainActivity <activity> element, skipping configChanges`);
    return;
  }

  const existingValue = readXmlAttribute(content.slice(tag.start, tag.end), CONFIG_CHANGES_ATTRIBUTE);
  const existingTokens = existingValue ? existingValue.split('|').map((token) => token.trim()).filter(Boolean) : [];
  const missing = [...wanted].filter((token) => !existingTokens.includes(token)).sort();
  if (missing.length === 0) return;

  const merged = [...existingTokens, ...missing].join('|');
  const next = existingValue !== null
    ? replaceConfigChangesValue(content, tag, merged)
    : addConfigChangesAttribute(content, tag, merged);
  applyIfChanged(manifestPath, content, next);
}

function readManifestPermissions(content) {
  return new Set([...content.matchAll(/<uses-permission\s[^>]*android:name="([^"]+)"/g)].map((match) => match[1]));
}

// Корневые `<uses-permission>`, только добавление отсутствующих сразу после открытия `<manifest>`
// Манифест самого пакета их намеренно не несёт: запрос запускает проверку Play Console
// у каждого потребителя, остальное приложение добавляет вручную (см. README пакета)
function patchAndroidManifestPermissions(appRoot, entries) {
  const wanted = new Set(androidListOf(entries, 'manifestPermissions'));
  if (wanted.size === 0) return;

  const loaded = loadAndroidManifest(appRoot, 'permissions');
  if (!loaded) return;
  const { manifestPath, content } = loaded;
  const existing = readManifestPermissions(content);
  const missing = [...wanted].filter((permission) => !existing.has(permission)).sort();
  if (missing.length === 0) return;

  const tag = findTag(content, 'manifest');
  if (!tag) {
    warn(`${manifestPath} has no <manifest> element, skipping permissions`);
    return;
  }

  const lines = missing.map((permission) => `  <uses-permission android:name="${permission}" />`).join('\n');
  applyIfChanged(manifestPath, content, `${content.slice(0, tag.end + 1)}\n${lines}${content.slice(tag.end + 1)}`);
}

function readManifestServiceNames(content) {
  return new Set([...content.matchAll(/<service\s[^>]*android:name="([^"]+)"/g)].map((match) => match[1]));
}

function buildServiceXml(service, indent) {
  const attrs = [
    `android:name="${escapeXmlAttribute(service.name)}"`,
    `android:exported="${service.exported === true ? 'true' : 'false'}"`,
  ];
  if (service.foregroundServiceType) {
    attrs.push(`android:foregroundServiceType="${escapeXmlAttribute(service.foregroundServiceType)}"`);
  }
  const openTag = `${indent}<service ${attrs.join(' ')}`;
  if (!service.intentFilterActions || service.intentFilterActions.length === 0) {
    return `${openTag} />`;
  }
  const actions = service.intentFilterActions
    .map((action) => `${indent}    <action android:name="${escapeXmlAttribute(action)}" />`)
    .join('\n');
  return `${openTag}>\n${indent}  <intent-filter>\n${actions}\n${indent}  </intent-filter>\n${indent}</service>`;
}

// Целый элемент `<service>`: класс сервиса переднего плана часто не объявлен в манифесте пакета,
// его добавляет config-plugin при `expo prebuild` (`AudioControlsService` в expo-audio)
// Аддитивно по наличию `android:name`
function patchAndroidManifestServices(appRoot, entries) {
  const declared = androidListOf(entries, 'manifestServices');
  if (declared.length === 0) return;

  const loaded = loadAndroidManifest(appRoot, 'services');
  if (!loaded) return;
  const { manifestPath, content } = loaded;
  const existing = readManifestServiceNames(content);
  const missing = [...new Map(declared.map((service) => [service.name, service])).values()]
    .filter((service) => !existing.has(service.name))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  if (missing.length === 0) return;

  const tag = findApplicationTag(content);
  if (!tag) {
    warn(`${manifestPath} has no <application> element, skipping services`);
    return;
  }
  if (content[tag.end - 1] === '/') {
    warn(`${manifestPath}'s <application> is self-closing, skipping services`);
    return;
  }

  const lastNewline = content.lastIndexOf('\n', tag.start);
  const tagIndent = /^[ \t]*/.exec(content.slice(lastNewline + 1, tag.start))[0];
  const blocks = missing.map((service) => buildServiceXml(service, `${tagIndent}  `)).join('\n');
  const insertAt = tag.end + 1;
  applyIfChanged(manifestPath, content, `${content.slice(0, insertAt)}\n${blocks}${content.slice(insertAt)}`);
}

module.exports = {
  patchAndroidManifest,
  patchAndroidManifestPermissions,
  patchAndroidManifestServices,
  patchMainActivityConfigChanges,
};
