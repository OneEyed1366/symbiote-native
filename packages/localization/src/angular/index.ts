// LocalesService/CalendarsService are the Angular-only lifecycle half; the free functions and
// event subscription plumbing all live in core, shared with React/Vue. Two separate services
// (not one combined service), matching upstream's own useLocales/useCalendars being two separate
// hooks.
export { LocalesService } from './services/locales.service';
export { CalendarsService } from './services/calendars.service';
export {
  getLocales,
  getCalendars,
  addLocaleListener,
  addCalendarListener,
  Weekday,
  CalendarIdentifier,
  type Locale,
  type Calendar,
  type EventSubscription,
} from '../core';
