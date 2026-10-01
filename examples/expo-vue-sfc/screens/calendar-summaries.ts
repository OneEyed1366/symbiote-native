import type {
  ExpoCalendar,
  ExpoCalendarEvent,
  ExpoCalendarReminder,
} from '@symbiote-native/calendar/vue';

export const DAY_MS = 86_400_000;

export type IIds = { calendarId: string; eventId: string; reminderId: string };
export type ISetIds = (patch: Partial<IIds>) => void;

export function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first, create or list one above`);
  }
  return text.trim();
}

export function calendarSummary(calendar: ExpoCalendar) {
  return {
    id: calendar.id,
    title: calendar.title,
    type: calendar.type,
    entityType: calendar.entityType,
    allowsModifications: calendar.allowsModifications,
    source: calendar.source?.name,
    isPrimary: calendar.isPrimary,
  };
}

export function eventSummary(event: ExpoCalendarEvent) {
  return {
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.allDay,
    recurrence: event.recurrenceRule?.frequency,
    availability: event.availability,
    status: event.status,
  };
}

export function reminderSummary(reminder: ExpoCalendarReminder) {
  return {
    id: reminder.id,
    title: reminder.title,
    dueDate: reminder.dueDate,
    completed: reminder.completed,
  };
}
