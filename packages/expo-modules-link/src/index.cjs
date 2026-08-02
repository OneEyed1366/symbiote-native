'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Every marker is additive-only: the patcher NEVER rewrites or removes an existing line,
// only appends one if the exact string isn't already present. That, plus the file lock below
// making each read-modify-write atomic across the N concurrent postinstall processes, is what
// makes it safe to run from N independent packages' postinstall scripts, in any order, any
// number of times.
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

// npm runs sibling dependencies' postinstall scripts concurrently, as separate OS processes —
// so N packages linking the same app's build.gradle/MainApplication.kt/Info.plist race on a
// plain read-modify-write: two processes can both read the file before either writes, each
// compute a version with only their own line added, and whichever writes last silently drops
// the other's addition. `fs.mkdirSync` is atomic (EEXIST if the dir already exists), which
// makes an empty directory a dependency-free mutex — every patch* function below acquires one
// keyed to the file it's about to read+write, for the full read-check-modify-write cycle, not
// just the write.
const LOCK_STALE_MS = 30_000;
const LOCK_MAX_WAIT_MS = 15_000;
const LOCK_POLL_MS = 50;

function sleepSync(ms) {
  // No setTimeout-based sleep is synchronous in Node; Atomics.wait on a throwaway
  // SharedArrayBuffer is the standard dependency-free way to block the current turn.
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

function withFileLock(filePath, fn) {
  const lockPath = `${filePath}.symbiote-expo-link.lock`;
  const start = Date.now();
  let acquired = false;

  while (!acquired) {
    try {
      fs.mkdirSync(lockPath);
      acquired = true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // A process that crashed mid-patch could leave the lock dir behind forever — reclaim
      // it once it's older than a real patch cycle could ever take.
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          fs.rmdirSync(lockPath);
          continue;
        }
      } catch {
        continue; // lock vanished between the failed mkdir and this stat — just retry
      }
      if (Date.now() - start > LOCK_MAX_WAIT_MS) {
        dlog(`gave up waiting for lock on ${filePath} after ${LOCK_MAX_WAIT_MS}ms, proceeding unlocked`);
        break;
      }
      sleepSync(LOCK_POLL_MS);
    }
  }

  try {
    return fn();
  } finally {
    if (acquired) {
      try {
        fs.rmdirSync(lockPath);
      } catch {
        // already gone (e.g. reclaimed as stale by another process) — nothing to clean up
      }
    }
  }
}

// npm sets INIT_CWD to wherever `npm install` was originally invoked, inherited by every
// nested lifecycle script — so from inside a dependency's own postinstall (cwd = that
// dependency's package dir), INIT_CWD is the consuming app's root instead.
function findAppRoot() {
  const candidates = [process.env.INIT_CWD, process.cwd()].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'android', 'app', 'build.gradle'))) return candidate;
    if (findInfoPlistFile(candidate)) return candidate;
  }
  return null;
}

// The app's own Info.plist, never a Pod's/framework's/test target's — those all carry the
// same filename. RN's default template puts it at ios/<AppName>/Info.plist; excluding Pods/
// build/DerivedData/*Tests* leaves exactly that one in every app this package has seen.
function findInfoPlistFile(appRoot) {
  const iosRoot = path.join(appRoot, 'ios');
  if (!fs.existsSync(iosRoot)) return null;
  const skip = /Pods|build|DerivedData|Tests/i;
  const stack = [iosRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === 'Info.plist') return full;
    }
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

  withFileLock(gradlePath, () => {
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
  });
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

  withFileLock(filePath, () => {
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
  });
}

// Every Info.plist key is uniquely named, so — unlike the Android map/deps blocks — no
// marker is needed: presence of the exact `<key>NAME</key>` is itself the idempotency check.
function patchInfoPlist(appRoot, manifest) {
  const infoPlistKeys = manifest.ios && manifest.ios.infoPlistKeys;
  if (!infoPlistKeys || Object.keys(infoPlistKeys).length === 0) return;

  const plistPath = findInfoPlistFile(appRoot);
  if (!plistPath) {
    dlog('Info.plist not found, skipping iOS permission strings');
    return;
  }

  withFileLock(plistPath, () => {
    let content = fs.readFileSync(plistPath, 'utf8');
    let changed = false;

    for (const [key, description] of Object.entries(infoPlistKeys)) {
      if (content.includes(`<key>${key}</key>`)) continue;

      const plistCloseIndex = content.lastIndexOf('</plist>');
      const dictCloseIndex = content.lastIndexOf('</dict>', plistCloseIndex === -1 ? undefined : plistCloseIndex);
      if (dictCloseIndex === -1) {
        dlog(`Info.plist has no closing </dict>, skipping ${key}`);
        continue;
      }

      const entry = `\t<key>${key}</key>\n\t<string>${description}</string>\n`;
      content = content.slice(0, dictCloseIndex) + entry + content.slice(dictCloseIndex);
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(plistPath, content);
      dlog(`updated ${plistPath}`);
    }
  });
}

function linkPackage(manifest) {
  const hasAndroidModules =
    manifest && manifest.android && Array.isArray(manifest.android.modules) && manifest.android.modules.length > 0;
  const hasIosKeys = manifest && manifest.ios && manifest.ios.infoPlistKeys;

  if (!hasAndroidModules && !hasIosKeys) {
    dlog('manifest has nothing to link');
    return;
  }

  const appRoot = findAppRoot();
  if (!appRoot) {
    dlog('no React Native app found — skipping');
    return;
  }

  if (hasAndroidModules) {
    patchBuildGradle(appRoot, manifest);
    patchMainApplication(appRoot, manifest);
  }
  if (hasIosKeys) patchInfoPlist(appRoot, manifest);
}

module.exports = {
  linkPackage,
  findAppRoot,
  findInfoPlistFile,
  findMainApplicationFile,
  patchBuildGradle,
  patchMainApplication,
  patchInfoPlist,
};
