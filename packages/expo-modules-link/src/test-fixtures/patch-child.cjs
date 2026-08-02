'use strict';

// Standalone entry point for the concurrency test in index.test.cjs: run as a real, separate
// OS process (not just an async call in the same process) so the file-lock in index.cjs is
// actually exercised the way npm exercises it — N sibling packages' postinstall scripts as N
// independent Node processes racing on the same build.gradle/MainApplication.kt.
const { patchBuildGradle, patchMainApplication } = require('../index.cjs');

const [, , appRoot, manifestJson] = process.argv;
const manifest = JSON.parse(manifestJson);

patchBuildGradle(appRoot, manifest);
patchMainApplication(appRoot, manifest);
