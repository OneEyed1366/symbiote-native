// Vue lifecycle wiring over the framework-agnostic core — mirrors use-locales' shape exactly.
import { onMounted, onUnmounted, ref, type Ref } from '@vue/runtime-core';
import {
  addCalendarListener,
  getCalendars,
  type Calendar,
  type EventSubscription,
} from '../../../core';

export function useCalendars(): Ref<Calendar[]> {
  const calendars = ref<Calendar[]>(getCalendars());
  let subscription: EventSubscription | undefined;

  onMounted(() => {
    subscription = addCalendarListener(() => {
      calendars.value = getCalendars();
    });
  });

  onUnmounted(() => {
    subscription?.remove();
  });

  return calendars;
}
