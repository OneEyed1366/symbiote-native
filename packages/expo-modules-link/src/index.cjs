'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Every marker is additive-only: the patcher NEVER rewrites or removes an existing line,
// only appends one if the exact string isn't already present. That's what makes it safe to
// run from N independent packages' postinstall scripts, in any order, any number of times,
// without a checksum/conflict-detection layer — there is nothing to conflict with.
const DEPS_MARKER = '// SYMBIOTE-EXPO-LINK:DEPENDENCIES (generated — new lines are appended below, safe to keep)';
const MAP_MARKER = '// SYMBIOTE-EXPO-LINK:MODULES-MAP (generated — new lines are appended below, safe to keep)';

const REACT_ANDROID_ANCHOR = 'implementation("com.facebook.react:react-android")';
const MODULES_MAP_ANCHOR = 'override fun getModulesMap(): Map<Class<out Module>, String?> = mapOf(';

function isDebug() {
  return process.env.DEBUG === '1' || process.env.DEBUG === 'true' || globalThis.__SYMBIOTE_DEBUG__ === true;
}

function dlog(...args) {
  if (isDebug()) console.log('[symbiote-expo-link]', ...args);
}

// npm sets INIT_CWD to wherever `npm install` was originally invoked, inherited by every
// nested lifecycle script — so from inside a dependency's own postinstall (cwd = that
// dependency's package dir), INIT_CWD is the consuming app's root instead.
function findAppRoot() {
  const candidates = [process.env.INIT_CWD, process.cwd()].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'android', 'app', 'build.gradle'))) return candidate;
  }
  return null;
}

function findMainApplicationFile(appRoot) {
  const javaRoot = path.join(appRoot, 'android', 'app', 'src', 'main', 'java');
  if (!fs.existsSync(javaRoot)) return null;
  const stack = [javaRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === 'MainApplication.kt') return full;
    }
  }
  return null;
}

function insertLineAfter(content, anchor, newLine) {
  const anchorIndex = content.indexOf(anchor);
  if (anchorIndex === -1) return null;
  const lineEnd = content.indexOf('\n', anchorIndex);
  const insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
  return content.slice(0, insertAt) + newLine + '\n' + content.slice(insertAt);
}

function patchBuildGradle(appRoot, manifest) {
  const gradlePath = path.join(appRoot, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(gradlePath)) {
    dlog('android/app/build.gradle not found, skipping');
    return;
  }

  const { gradleProjectName } = manifest.android;
  const depLine = `    implementation project(':${gradleProjectName}')`;
  let content = fs.readFileSync(gradlePath, 'utf8');

  if (content.includes(`':${gradleProjectName}'`)) {
    dlog(`${gradleProjectName} already present in build.gradle`);
    return;
  }

  if (!content.includes(DEPS_MARKER)) {
    const withMarker = insertLineAfter(content, REACT_ANDROID_ANCHOR, `    ${DEPS_MARKER}`);
    if (withMarker === null) {
      dlog('react-android anchor not found in build.gradle, skipping');
      return;
    }
    content = withMarker;
  }

  content = insertLineAfter(content, DEPS_MARKER, depLine);
  fs.writeFileSync(gradlePath, content);
  dlog(`added ${gradleProjectName} to ${gradlePath}`);
}

function insertImportIfMissing(content, importPath) {
  const importLine = `import ${importPath}`;
  if (content.includes(importLine)) return content;

  const lines = content.split('\n');
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('import ')) lastImportIndex = i;
  }
  if (lastImportIndex === -1) return content;

  lines.splice(lastImportIndex + 1, 0, importLine);
  return lines.join('\n');
}

function patchMainApplication(appRoot, manifest) {
  const filePath = findMainApplicationFile(appRoot);
  if (!filePath) {
    dlog('MainApplication.kt not found, skipping');
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const module of manifest.android.modules) {
    const withImport = insertImportIfMissing(content, module.importPath);
    if (withImport !== content) {
      content = withImport;
      changed = true;
    }
  }

  if (!content.includes(MODULES_MAP_ANCHOR)) {
    dlog('modules-map anchor not found in MainApplication.kt, skipping map registration');
    if (changed) fs.writeFileSync(filePath, content);
    return;
  }

  if (!content.includes(MAP_MARKER)) {
    const withMarker = insertLineAfter(content, MODULES_MAP_ANCHOR, `    ${MAP_MARKER}`);
    if (withMarker !== null) {
      content = withMarker;
      changed = true;
    }
  }

  for (const module of manifest.android.modules) {
    const entryLine = `    ${module.className}::class.java to "${module.nativeName}",`;
    if (!content.includes(entryLine.trim())) {
      const withEntry = insertLineAfter(content, MAP_MARKER, entryLine);
      if (withEntry !== null) {
        content = withEntry;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    dlog(`updated ${filePath}`);
  }
}

function linkPackage(manifest) {
  if (!manifest || !manifest.android || !Array.isArray(manifest.android.modules) || manifest.android.modules.length === 0) {
    dlog('manifest has no android modules, nothing to link');
    return;
  }

  const appRoot = findAppRoot();
  if (!appRoot) {
    dlog('no android/app project found (not inside a React Native app) — skipping');
    return;
  }

  patchBuildGradle(appRoot, manifest);
  patchMainApplication(appRoot, manifest);
}

module.exports = {
  linkPackage,
  findAppRoot,
  findMainApplicationFile,
  patchBuildGradle,
  patchMainApplication,
};
