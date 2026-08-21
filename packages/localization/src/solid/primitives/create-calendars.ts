// Solid lifecycle wiring over the framework-agnostic core (core/localization.ts) — mirrors
// create-locales' shape exactly, including why no seed-vs-event guard is needed here.
import { createSignal, onCleanup, type Accessor } from 'solid-js';
import {
  addCalendarListener,
  getCalendars,
  type Calendar,
  type EventSubscription,
} from '../../core';

export function createCalendars(): Accessor<Calendar[]> {
  const [calendars, setCalendars] = createSignal<Calendar[]>(getCalendars());

  const subscription: EventSubscription = addCalendarListener(() => {
    setCalendars(getCalendars());
  });

  onCleanup(() => {
    subscription.remove();
  });

  return calendars;
}
