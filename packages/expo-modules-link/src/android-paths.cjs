'use strict';

const path = require('node:path');
const { findFileInTree } = require('./common.cjs');

const ANDROID_DIR = 'android';
const MAIN_APPLICATION_FILE = 'MainApplication.kt';

function buildGradlePath(appRoot) {
  return path.join(appRoot, ANDROID_DIR, 'app', 'build.gradle');
}

// Корневой файл Gradle, не `app/`: версии тулчейна живут в его `buildscript.ext`
function rootBuildGradlePath(appRoot) {
  return path.join(appRoot, ANDROID_DIR, 'build.gradle');
}

// Таблицу Kotlin -> KSP ведёт сам Expo, читаем её у установленного `expo-modules-autolinking`
function kspLookupPath(appRoot) {
  return path.join(
    appRoot,
    'node_modules',
    'expo-modules-autolinking',
    'android',
    'expo-gradle-plugin',
    'expo-autolinking-plugin',
    'src',
    'main',
    'kotlin',
    'expo',
    'modules',
    'plugin',
    'KSPLookup.kt',
  );
}

function androidManifestPath(appRoot) {
  return path.join(appRoot, ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
}

// Тот же обход, что у `findInfoPlistFile`, но без каталогов-исключений
function findMainApplicationFile(appRoot) {
  const javaRoot = path.join(appRoot, ANDROID_DIR, 'app', 'src', 'main', 'java');
  return findFileInTree(javaRoot, MAIN_APPLICATION_FILE);
}

module.exports = {
  MAIN_APPLICATION_FILE,
  buildGradlePath,
  rootBuildGradlePath,
  kspLookupPath,
  androidManifestPath,
  findMainApplicationFile,
};
