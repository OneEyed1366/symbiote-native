// @symbiote-native/localization/vue: the Vue entry over the framework-agnostic core. Locales and
// calendars each get their own lifecycle composable, matching upstream's own useLocales/
// useCalendars being two separate hooks, not one combined hook — mirrors the lifecycle-bucket
// naming convention of adapters/vue/src/composables (never `hooks`, that's React's term).

export { useLocales } from './composables/use-locales';
export { useCalendars } from './composables/use-calendars';
export * from '../core';
