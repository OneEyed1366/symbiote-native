import {
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import {
  addCalendarListener,
  getCalendars,
  type Calendar,
} from '../../../core';

// Angular twin of React's `useCalendars` hook and Vue's `useCalendars` composable — mirrors
// LocalesService's shape exactly.
//
//   readonly calendars = inject(CalendarsService).connect();
//   // template: {{ calendars() }}
@Injectable({ providedIn: 'root' })
export class CalendarsService {
  private readonly injector = inject(Injector);

  connect(): Signal<Calendar[]> {
    const calendars = signal<Calendar[]>(getCalendars());

    effect(
      onCleanup => {
        const subscription = addCalendarListener(() =>
          calendars.set(getCalendars()),
        );
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return calendars.asReadonly();
  }
}
