// @symbiote-native/localization/react: the React entry over the framework-agnostic core. Locales
// and calendars each get their own lifecycle hook, matching upstream's own useLocales/
// useCalendars being two separate hooks, not one combined hook — mirrors the lifecycle-bucket
// naming convention of adapters/react/src/hooks (never `composables`, that's Vue's term).

export { useLocales } from './hooks/use-locales';
export { useCalendars } from './hooks/use-calendars';
export * from '../core';
