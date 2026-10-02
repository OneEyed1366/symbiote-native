import { Component, computed, inject } from '@angular/core';
import {
  CalendarPermissionsService,
  RemindersPermissionsService,
  getCalendarPermissions,
  getRemindersPermissions,
  requestCalendarPermissions,
  requestRemindersPermissions,
} from '@symbiote-native/calendar/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const LOADING = 'loading…';

@Component({
  selector: 'CalendarPermissions',
  standalone: true,
  imports: [CallConsole, Card, ResultRow],
  template: `
    <Card testID="calendar-hooks-card" title="Permission hooks">
      <ResultRow
        testID="calendar-hook-calendar"
        label="useCalendarPermissions"
        [value]="calendarStatus()"
      />
      <ResultRow
        testID="calendar-hook-reminders"
        label="useRemindersPermissions"
        [value]="remindersStatus()"
      />
    </Card>
    <CallConsole
      prefix="calendar-permissions"
      title="Permission calls"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class CalendarPermissions {
  readonly color = lineColorOf(ROUTE_NAME.Calendar);

  private readonly calendarService = inject(CalendarPermissionsService);
  private readonly remindersService = inject(RemindersPermissionsService);
  private readonly calendarState = this.calendarService.connect();
  private readonly remindersState = this.remindersService.connect();

  readonly calendarStatus = computed(
    () => this.calendarState()?.status ?? LOADING,
  );
  readonly remindersStatus = computed(
    () => this.remindersState()?.status ?? LOADING,
  );

  readonly calls: ICall[] = [
    { label: 'getCalendarPermissions', run: () => getCalendarPermissions() },
    {
      label: 'getCalendarPermissions(writeOnly)',
      run: () => getCalendarPermissions(true),
    },
    {
      label: 'requestCalendarPermissions',
      run: () => requestCalendarPermissions(),
    },
    {
      label: 'requestCalendarPermissions(writeOnly)',
      run: () => requestCalendarPermissions(true),
    },
    { label: 'getRemindersPermissions', run: () => getRemindersPermissions() },
    {
      label: 'requestRemindersPermissions',
      run: () => requestRemindersPermissions(),
    },
    {
      label: 'hook request (calendar)',
      run: () => this.calendarService.request(),
    },
    {
      label: 'hook request (reminders)',
      run: () => this.remindersService.request(),
    },
  ];
}
