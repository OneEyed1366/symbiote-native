// @symbiote-native/localization/svelte: the Svelte entry over the framework-agnostic core. Locales
// and calendars each get their own lifecycle rune, matching upstream's own useLocales/
// useCalendars being two separate hooks, not one combined hook — mirrors the lifecycle-bucket
// naming convention of adapters/svelte/src/runes (never `hooks`/`composables`, those are React's
// and Vue's terms).

export { useLocales } from './runes/use-locales.svelte';
export { useCalendars } from './runes/use-calendars.svelte';
export * from '../core';
