const reactNativeFlatConfig = require('@react-native/eslint-config/flat');

// Replaces the legacy `.eslintrc.js` (`extends: '@react-native'`) — with no local flat config,
// ESLint 8.57+'s CLI autodetects flat config by walking UP from cwd, finds the monorepo root's
// eslint.config.js, and that config's own `ignores: ['examples/**']` (examples own their lint via
// this file, on purpose) then silently swallows every file in this app. A local eslint.config.js
// stops the climb before it reaches root — same fix already applied to every non-expo example.
module.exports = [...reactNativeFlatConfig];
