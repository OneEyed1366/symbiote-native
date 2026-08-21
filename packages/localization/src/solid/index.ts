// @symbiote-native/localization/solid: the Solid entry over the framework-agnostic core. Locales
// and calendars each get their own primitive, matching upstream's own useLocales/useCalendars
// being two separate hooks, not one combined hook — mirrors the lifecycle-bucket naming of
// adapters/solid/src/primitives (never `hooks/`/`composables/`/`runes/`, and `create*` rather
// than `use*`, which Solid reserves for consuming something that already exists).

export { createLocales } from './primitives/create-locales';
export { createCalendars } from './primitives/create-calendars';
export * from '../core';
